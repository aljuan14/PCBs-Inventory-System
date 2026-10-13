/**
 * npm run simpel:load [-- path/to/_Company_….csv]
 *
 * Load the PILAR company list (CSV export of its "Company" table) into
 * simpel_companies, replacing what is there. Without a path, the newest .csv
 * in Data-inventaris/id_simpel is used. The links already picked on the
 * "ID SIMPEL" page (companies.pilar_company_id) are kept; a link whose record
 * is gone from the new list is reported.
 *
 * The file goes to Postgres as it is (COPY … CSV HEADER) into a staging table
 * named after its header, so quoted addresses with commas or line breaks
 * need no parsing here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DB_CONTAINER, OfflineError, ROOT, ensureDatabase, ensureDocker, log, main, query, run, step } from './lib.mjs';

const DEFAULT_DIR = path.join(ROOT, 'Data-inventaris', 'id_simpel');
// Columns of the export this table needs; the others are ignored.
const REQUIRED = ['id', 'name', 'npwp', 'nib', 'alamatKantor', 'bidangUsaha', 'idCompanySimpel', 'idPerusahaanInduk'];

function csvFile() {
  const given = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
  if (given) return path.resolve(given);
  const files = fs.existsSync(DEFAULT_DIR) ? fs.readdirSync(DEFAULT_DIR).filter((name) => name.toLowerCase().endsWith('.csv')) : [];
  if (files.length === 0) throw new OfflineError(`Tidak ada berkas .csv di ${path.relative(ROOT, DEFAULT_DIR)}. Sebutkan path-nya: npm run simpel:load -- berkas.csv`);
  return files.map((name) => path.join(DEFAULT_DIR, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

main(async () => {
  const file = csvFile();
  if (!fs.existsSync(file)) throw new OfflineError(`Berkas tidak ditemukan: ${file}`);
  // Windows line ends mixed with bare ones (inside addresses) trip COPY.
  const content = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const header = content.slice(0, content.indexOf('\n')).trim().split(',').map((name) => name.replace(/^"|"$/g, ''));
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length) throw new OfflineError(`Kolom berikut tidak ada di ${path.basename(file)}: ${missing.join(', ')}. Pastikan ini ekspor tabel Company dari PILAR.`);

  await ensureDocker();
  await ensureDatabase();

  step(`Memuat daftar perusahaan PILAR dari ${path.relative(ROOT, file)}`);
  const col = (name) => `"${name}"`;
  const text = (name) => `NULLIF(btrim(s.${col(name)}), '')`;
  // Addresses carry HTML line breaks (&#13;&#10;) and &amp; from PILAR's forms: read as plain text.
  const cleanText = (name) => `NULLIF(btrim(regexp_replace(replace(regexp_replace(s.${col(name)}, '&#[0-9]+;', ' ', 'g'), '&amp;', '&'), '\\s+', ' ', 'g')), '')`;
  const script = [
    'BEGIN;',
    `CREATE TEMP TABLE staging (${header.map((name) => `${col(name)} text`).join(', ')}) ON COMMIT DROP;`,
    'COPY staging FROM STDIN WITH (FORMAT csv, HEADER);',
    `${content.replace(/\n+$/, '')}\n\\.`,
    'DELETE FROM public.simpel_companies;',
    `INSERT INTO public.simpel_companies (id, id_simpel, nama, npwp, nib, alamat, bidang_usaha, id_perusahaan_induk)
     SELECT DISTINCT ON (s.id) s.id::uuid, ${text('idCompanySimpel')}, btrim(regexp_replace(replace(s.name, '&amp;', '&'), '\\s+', ' ', 'g')), ${text('npwp')}, ${text('nib')}, ${cleanText('alamatKantor')}, ${text('bidangUsaha')}, ${text('idPerusahaanInduk')}::uuid
     FROM staging s WHERE s.id IS NOT NULL AND btrim(coalesce(s.name, '')) <> '';`,
    'COMMIT;',
  ].join('\n');
  await run('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: script });

  const [[total, withId, linked, lost]] = await query(`select
    (select count(*) from public.simpel_companies),
    (select count(*) from public.simpel_companies where id_simpel is not null),
    (select count(*) from public.companies where pilar_company_id is not null),
    (select count(*) from public.companies c where c.pilar_company_id is not null and not exists (select 1 from public.simpel_companies s where s.id = c.pilar_company_id))`);
  log(`Selesai: ${Number(total).toLocaleString('id-ID')} perusahaan PILAR, ${Number(withId).toLocaleString('id-ID')} dengan ID SIMPEL.`);
  log(`Perusahaan inventaris yang sudah terhubung: ${Number(linked).toLocaleString('id-ID')}.`);
  if (Number(lost) > 0) log(`Perhatian: ${lost} perusahaan terhubung ke data PILAR yang tidak ada lagi di daftar baru. Periksa di halaman ID SIMPEL.`);
});
