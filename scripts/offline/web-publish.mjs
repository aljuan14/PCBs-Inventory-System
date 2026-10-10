/**
 * npm run web:publish            (also run at the end of "npm run data:push")
 * npm run web:publish -- --reset (the first time: back up and empty the cloud)
 *
 * Send the dashboard summary of the local data to Supabase Cloud, which the
 * web on Vercel shows (NEXT_PUBLIC_DATA_MODE=summary): the companies (id and
 * name only), inventory_stats_parts and the summary_* tables of migration
 * 20261010000003. The inventory rows themselves never leave the laptops.
 *
 * The cloud database is replaced in one transaction: "TRUNCATE companies
 * CASCADE" empties every table that refers to a company (inventory rows,
 * import batches, upload sessions, send log). While the cloud still holds
 * inventory rows, --reset is required and the cloud data is first saved with
 * pg_dump under Data-inventaris/backup-cloud/.
 *
 * The connection string comes from WEB_DATABASE_URL, in the environment or
 * in .env.web (gitignored), e.g.
 *   WEB_DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
 * Use the "Session pooler" string from the Supabase dashboard (Connect).
 * It is handed to psql through the environment, so error messages never
 * print the password.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DB_CONTAINER, OfflineError, ROOT, copyOut, ensureDatabase, ensureDocker, log, main, query, run, step } from './lib.mjs';

export const WEB_ENV_FILE = path.join(ROOT, '.env.web');
const BACKUP_DIR = path.join(ROOT, 'Data-inventaris', 'backup-cloud');
const INVENTORY_TABLES = ['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'];
const SUMMARY_TABLES = ['summary_map_cells', 'summary_brand_counts'];

/** WEB_DATABASE_URL from the environment or .env.web; null when not set up. */
export function webDatabaseUrl() {
  if (process.env.WEB_DATABASE_URL) return process.env.WEB_DATABASE_URL.trim();
  if (!fs.existsSync(WEB_ENV_FILE)) return null;
  const line = fs.readFileSync(WEB_ENV_FILE, 'utf8').split(/\r?\n/).find((entry) => entry.trim().startsWith('WEB_DATABASE_URL='));
  const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  return value || null;
}

/** psql (or pg_dump) in the local DB container against the cloud, the URL passed by environment. */
function cloud(url, command, { input, capture = true } = {}) {
  return run('docker', ['exec', '-i', '-e', 'WEB_DATABASE_URL', DB_CONTAINER, 'sh', '-c', command], { env: { WEB_DATABASE_URL: url }, input, capture });
}

/** A query on the cloud, rows split on "|". */
async function cloudQuery(url, sql) {
  const { stdout } = await cloud(url, 'psql "$WEB_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1', { input: sql });
  return stdout.split('\n').filter((line) => line !== '').map((line) => line.split('|'));
}

const columnsOf = async (table) => (await query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = '${table}' and is_generated = 'NEVER' order by ordinal_position`)).map(([name]) => name);

/** "COPY table (columns) FROM STDIN" with the CSV data of a local SELECT. */
async function copyBlock(table, columns, select) {
  const csv = await copyOut(select);
  const body = csv.slice(csv.indexOf('\n') + 1); // without the header
  return `COPY public.${table} (${columns.map((name) => `"${name}"`).join(', ')}) FROM STDIN WITH (FORMAT csv);\n${body}${body.endsWith('\n') || body === '' ? '' : '\n'}\\.\n`;
}

export async function publish({ reset = false } = {}) {
  const url = webDatabaseUrl();
  if (!url) {
    throw new OfflineError(`WEB_DATABASE_URL belum diatur. Buat file ${path.basename(WEB_ENV_FILE)} berisi:\n  WEB_DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres\n(connection string "Session pooler" dari dashboard Supabase).`);
  }
  await ensureDocker();
  await ensureDatabase();

  step('Memeriksa database web (Supabase Cloud)');
  const [[ready]] = await cloudQuery(url, "select to_regclass('public.summary_map_cells') is not null and to_regprocedure('public.summary_cells(integer, double precision, double precision, double precision, double precision, text[], uuid, text)') is not null;");
  if (ready !== 't') throw new OfflineError('Database web belum punya tabel ringkasan. Jalankan migrasi 20261010000003_web_summary.sql di SQL Editor Supabase dulu.');
  const [[rows]] = await cloudQuery(url, `select ${INVENTORY_TABLES.map((table) => `(select count(*) from public.${table})`).join(' + ')};`);
  if (Number(rows) > 0) {
    if (!reset) {
      throw new OfflineError(`Database web masih berisi ${Number(rows).toLocaleString('id-ID')} baris inventaris. Jalankan sekali "npm run web:publish -- --reset": datanya dicadangkan dulu ke Data-inventaris/backup-cloud/, lalu dikosongkan.`);
    }
    step('Mencadangkan data web sebelum dikosongkan');
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `cloud-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.sql`);
    const { stdout } = await cloud(url, 'pg_dump "$WEB_DATABASE_URL" --data-only --schema=public --no-owner');
    fs.writeFileSync(file, stdout);
    log(`Cadangan: ${path.relative(ROOT, file)} (${(Buffer.byteLength(stdout) / 1e6).toFixed(1)} MB)`);
  }

  step('Menyusun ringkasan dari data lokal');
  await query('select public.summary_build()');
  const parts = await columnsOf('inventory_stats_parts');
  const script = [
    'BEGIN;',
    // Empties every table referring to a company, inventory rows included; their
    // TRUNCATE triggers clear inventory_stats_parts, filled again below.
    'TRUNCATE public.companies CASCADE;',
    'DELETE FROM public.inventory_stats_parts;',
    `TRUNCATE ${SUMMARY_TABLES.map((table) => `public.${table}`).join(', ')};`,
    await copyBlock('companies', ['id', 'nama_perusahaan', 'created_at'], 'select id, nama_perusahaan, created_at from public.companies'),
    await copyBlock('inventory_stats_parts', parts, `select ${parts.map((name) => `"${name}"`).join(', ')} from public.inventory_stats_parts`),
    ...await Promise.all(SUMMARY_TABLES.map(async (table) => {
      const columns = await columnsOf(table);
      return copyBlock(table, columns, `select ${columns.map((name) => `"${name}"`).join(', ')} from public.${table}`);
    })),
    'INSERT INTO public.summary_meta (id, built_at) SELECT 1, now() ON CONFLICT (id) DO UPDATE SET built_at = EXCLUDED.built_at;',
    'COMMIT;',
  ].join('\n');

  step(`Mengirim ringkasan ke web (${(Buffer.byteLength(script) / 1e6).toFixed(1)} MB)`);
  await cloud(url, 'psql "$WEB_DATABASE_URL" -X -q -v ON_ERROR_STOP=1', { input: script });
  const [[companies, cells]] = await cloudQuery(url, 'select (select count(*) from public.companies), (select count(*) from public.summary_map_cells);');
  log(`Selesai: web menampilkan ringkasan ${Number(companies).toLocaleString('id-ID')} perusahaan (${Number(cells).toLocaleString('id-ID')} sel peta).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(() => publish({ reset: process.argv.includes('--reset') }));
}
