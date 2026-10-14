/**
 * npm run data:to-cloud            (check only: what would be copied)
 * npm run data:to-cloud -- --yes   (copy)
 *
 * One-off move to Supabase Cloud, so the web on Vercel runs on the full data
 * like the offline app (NEXT_PUBLIC_DATA_MODE unset): the reverse of
 * data:from-cloud. From then on the data is edited on the web only, and the
 * laptops' copies stop being the source.
 *
 * 1. The cloud's tables must match the local ones column for column (every
 *    migration run there); otherwise nothing happens and the gaps are listed.
 * 2. The cloud's data is saved with pg_dump under Data-inventaris/backup-cloud/.
 * 3. In one transaction, every synced public table of the cloud is emptied and
 *    filled with the local rows (triggers off: the stats table is copied as
 *    is); the web summary tables are emptied. Login accounts are added, never
 *    removed or overwritten: an account that only the cloud has (the web's
 *    own) keeps working, and so do the roles it already has.
 * 4. The files in Storage (uploaded workbooks, statement letters) are copied
 *    when .env.web also holds the cloud's API URL and service role key:
 *      SUPABASE_CLOUD_URL=https://<ref>.supabase.co
 *      SUPABASE_CLOUD_SERVICE_ROLE_KEY=<service_role key, Project Settings → API>
 *    Without them the rows are copied and the files skipped; an old upload
 *    then cannot be opened again on the web.
 *
 * The database connection comes from WEB_DATABASE_URL (.env.web), as for
 * web:publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { OfflineError, ROOT, copyOut, ensureDatabase, ensureDocker, log, main, query, step, syncedTables, tableColumns } from './lib.mjs';
import { WEB_ENV_FILE, cloud, cloudQuery, webDatabaseUrl } from './web-publish.mjs';

const { loadEnvConfig } = nextEnv;
const BACKUP_DIR = path.join(ROOT, 'Data-inventaris', 'backup-cloud');
const SUMMARY_TABLES = ['summary_map_cells', 'summary_brand_counts', 'summary_company_status'];
const BUCKETS = ['pcbs-files', 'surat-pernyataan'];
// Roles are merged, not replaced: the cloud's own accounts keep theirs.
const MERGED = new Set(['public.user_access']);
const qi = (name) => `"${name.replaceAll('"', '""')}"`;
const qt = (table) => table.split('.').map(qi).join('.');
const fmt = (value) => Number(value).toLocaleString('id-ID');

function webEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  if (!fs.existsSync(WEB_ENV_FILE)) return null;
  const line = fs.readFileSync(WEB_ENV_FILE, 'utf8').split(/\r?\n/).find((entry) => entry.trim().startsWith(`${name}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || null;
}

/** "COPY table (columns) FROM STDIN" with the local rows. */
async function copyBlock(table, columns, target = table) {
  const csv = await copyOut(`select ${columns.map(qi).join(', ')} from ${qt(table)}`);
  const body = csv.slice(csv.indexOf('\n') + 1);
  return `COPY ${qt(target)} (${columns.map(qi).join(', ')}) FROM STDIN WITH (FORMAT csv);\n${body}${body.endsWith('\n') || body === '' ? '' : '\n'}\\.\n`;
}

async function cloudColumns(url, table) {
  const [schema, name] = table.split('.');
  const rows = await cloudQuery(url, `select column_name from information_schema.columns where table_schema = '${schema}' and table_name = '${name}' and is_generated = 'NEVER' and identity_generation is distinct from 'ALWAYS' order by ordinal_position;`);
  return rows.map(([column]) => column);
}

async function copyFiles() {
  // The project URL alone: the API path ("/rest/v1/") copied along with it is dropped.
  const cloudUrl = webEnv('SUPABASE_CLOUD_URL')?.replace(/\/(rest|auth|storage)\/v1\/?$/, '').replace(/\/$/, '');
  const cloudKey = webEnv('SUPABASE_CLOUD_SERVICE_ROLE_KEY');
  if (!cloudUrl || !cloudKey) {
    log(`Berkas di Storage dilewati: isi SUPABASE_CLOUD_URL dan SUPABASE_CLOUD_SERVICE_ROLE_KEY di ${path.basename(WEB_ENV_FILE)} untuk ikut menyalinnya (jalankan lagi dengan --yes --files-only).`);
    return;
  }
  loadEnvConfig(ROOT);
  const local = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const remote = createClient(cloudUrl, cloudKey, { auth: { persistSession: false } });
  for (const bucket of BUCKETS) {
    const objects = await query(`select name, coalesce(metadata->>'mimetype', 'application/octet-stream') from storage.objects where bucket_id = '${bucket}' order by name`);
    let copied = 0;
    let failed = 0;
    for (const [name, type] of objects) {
      const { data, error } = await local.storage.from(bucket).download(name);
      if (error || !data) { failed++; continue; }
      const { error: uploadError } = await remote.storage.from(bucket).upload(name, data, { contentType: type, upsert: true });
      if (uploadError) failed++;
      else copied++;
      if ((copied + failed) % 25 === 0) process.stdout.write(`\r  ${bucket}: ${fmt(copied + failed)} / ${fmt(objects.length)}`);
    }
    process.stdout.write('\n');
    log(`  ${bucket}: ${fmt(copied)} berkas tersalin${failed ? `, ${fmt(failed)} gagal` : ''}.`);
  }
}

main(async () => {
  const yes = process.argv.includes('--yes');
  const filesOnly = process.argv.includes('--files-only');
  const url = webDatabaseUrl();
  if (!url) throw new OfflineError(`WEB_DATABASE_URL belum diatur di ${path.basename(WEB_ENV_FILE)} (connection string "Session pooler" Supabase).`);
  await ensureDocker();
  await ensureDatabase();

  if (filesOnly) {
    if (!yes) throw new OfflineError('Tambahkan --yes untuk menyalin berkas.');
    step('Menyalin berkas Storage ke cloud');
    await copyFiles();
    return;
  }

  step('Mencocokkan struktur tabel lokal dan cloud');
  const tables = (await syncedTables()).filter((table) => table.startsWith('public.'));
  const plan = [];
  const problems = [];
  for (const table of tables) {
    const columns = await tableColumns(table);
    const remote = new Set(await cloudColumns(url, table));
    if (!remote.size) { problems.push(`${table}: tidak ada di cloud`); continue; }
    const missing = columns.filter((column) => !remote.has(column));
    if (missing.length) problems.push(`${table}: kolom tidak ada di cloud: ${missing.join(', ')}`);
    const [[rows]] = await query(`select count(*) from ${qt(table)}`);
    plan.push({ table, columns, rows: Number(rows) });
  }
  if (problems.length) {
    throw new OfflineError(`Struktur cloud belum sama dengan lokal. Jalankan migrasi yang belum ada di SQL Editor Supabase, lalu coba lagi:\n  ${problems.join('\n  ')}`);
  }
  const [[cloudRows]] = await cloudQuery(url, `select ${plan.filter(({ table }) => /transformator_|kapasitor|minyak_/.test(table) && !table.endsWith('_legacy')).map(({ table }) => `(select count(*) from ${qt(table)})`).join(' + ')};`);
  const [[localUsers]] = await query('select count(*) from auth.users');
  const [[remoteUsers]] = await cloudQuery(url, 'select count(*) from auth.users;');
  for (const { table, rows } of plan) if (rows) log(`  ${table.padEnd(38)} ${fmt(rows).padStart(8)} baris`);
  log(`  Akun: ${fmt(localUsers)} di laptop, ${fmt(remoteUsers)} di cloud (akun cloud tetap ada).`);
  log(`  Cloud sekarang berisi ${fmt(cloudRows)} baris inventaris; semuanya diganti dengan data laptop.`);
  if (!yes) {
    log('\nBelum ada yang diubah. Jalankan "npm run data:to-cloud -- --yes" untuk menyalin.');
    return;
  }

  step('Mencadangkan isi cloud');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `cloud-sebelum-to-cloud-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.sql`);
  const { stdout } = await cloud(url, 'pg_dump "$WEB_DATABASE_URL" --data-only --schema=public --no-owner');
  fs.writeFileSync(file, stdout);
  log(`Cadangan: ${path.relative(ROOT, file)} (${(Buffer.byteLength(stdout) / 1e6).toFixed(1)} MB)`);

  step('Menyusun salinan');
  const replaced = plan.filter(({ table }) => !MERGED.has(table));
  const parts = [
    'BEGIN;',
    // Triggers off: the stats rows are copied, not recounted; foreign keys hold since the source is consistent.
    'SET session_replication_role = replica;',
    `TRUNCATE ${[...replaced.map(({ table }) => qt(table)), ...SUMMARY_TABLES.map((table) => `public.${qi(table)}`)].join(', ')};`,
  ];
  for (const { table, columns } of replaced) parts.push(await copyBlock(table, columns));
  // Accounts and their sign-in identities: added when new, a cloud account with the same id is left as it is.
  for (const table of ['auth.users', 'auth.identities']) {
    const remote = new Set(await cloudColumns(url, table));
    const columns = (await tableColumns(table)).filter((column) => remote.has(column));
    const staging = `staging_${table.split('.')[1]}`;
    parts.push(`CREATE TEMP TABLE ${staging} (LIKE ${table} INCLUDING DEFAULTS) ON COMMIT DROP;`);
    parts.push(await copyBlock(table, columns, staging));
    parts.push(`INSERT INTO ${table} (${columns.map(qi).join(', ')}) SELECT ${columns.map(qi).join(', ')} FROM ${staging} ON CONFLICT DO NOTHING;`);
  }
  for (const table of MERGED) {
    const { columns } = plan.find((entry) => entry.table === table);
    parts.push('CREATE TEMP TABLE staging_access (LIKE public.user_access INCLUDING DEFAULTS) ON COMMIT DROP;');
    parts.push(await copyBlock(table, columns, 'staging_access'));
    parts.push(`INSERT INTO ${table} (${columns.map(qi).join(', ')}) SELECT ${columns.map(qi).join(', ')} FROM staging_access WHERE user_id IN (SELECT id FROM auth.users) ON CONFLICT (user_id) DO NOTHING;`);
  }
  // Every cloud account has a role; one without becomes admin, as migration 20261013000011 did.
  parts.push("INSERT INTO public.user_access (user_id, peran) SELECT id, 'admin' FROM auth.users ON CONFLICT (user_id) DO NOTHING;");
  parts.push('COMMIT;');
  const script = parts.join('\n');

  step(`Mengirim ke cloud (${(Buffer.byteLength(script) / 1e6).toFixed(1)} MB, satu transaksi)`);
  await cloud(url, 'psql "$WEB_DATABASE_URL" -X -q -v ON_ERROR_STOP=1', { input: script });

  step('Memeriksa hasil');
  let mismatch = 0;
  for (const { table, rows } of replaced) {
    const [[remote]] = await cloudQuery(url, `select count(*) from ${qt(table)};`);
    if (Number(remote) !== rows) { mismatch++; log(`  ${table}: lokal ${fmt(rows)}, cloud ${fmt(remote)}`); }
  }
  log(mismatch ? `${mismatch} tabel berbeda jumlah barisnya, periksa di atas.` : 'Semua tabel sama jumlah barisnya dengan laptop.');

  step('Menyalin berkas Storage');
  await copyFiles();

  log('\nSelesai. Langkah berikutnya: hapus NEXT_PUBLIC_DATA_MODE di Vercel lalu redeploy, dan mulai sekarang ubah data hanya lewat web.');
});
