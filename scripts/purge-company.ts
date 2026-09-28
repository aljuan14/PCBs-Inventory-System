/**
 * Removes every imported record of one company so its data can be imported
 * again from scratch: the inventory rows in all category tables, the import
 * batches, the upload sessions (which also forgets the file hashes that make
 * import-folder.ts skip identical workbooks) and the workbooks in Storage.
 * The company itself is kept, so its id and name stay the same.
 *
 *   npx tsx scripts/purge-company.ts --company "PT PLN (Persero)" [--commit]
 *
 * Dry run by default: only counts what would be removed. Add --commit to
 * delete. Safe to re-run if it stops halfway. Uses SUPABASE_SERVICE_ROLE_KEY
 * from .env.local when present, otherwise the anon key.
 */
import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCategoryLabel, INVENTORY_CATEGORIES } from '@/lib/inventory';
import { STORAGE_BUCKET } from '@/lib/upload-store';

// ---------------------------------------------------------------------------
// Arguments

const args = process.argv.slice(2);
let companyName = '';
let commit = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--commit') commit = true;
  else if (arg === '--company') companyName = args[++i] ?? '';
  else fail(`Opsi tidak dikenal: ${arg}`);
}
if (!companyName.trim()) fail('Pemakaian: npx tsx scripts/purge-company.ts --company "Nama Perusahaan" [--commit]');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Database

loadEnvConfig(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) fail('Variabel Supabase tidak ditemukan di .env.local.');
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const fmt = (n: number) => n.toLocaleString('id-ID');
// Ids per delete request; `id=in.(…)` travels in the URL, so keep it short.
const DELETE_CHUNK = 200;
const PAGE_SIZE = 1000;

async function countRows(table: string, companyId: string) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
  if (error) fail(`Gagal menghitung ${table}: ${error.message}`);
  return count ?? 0;
}

/** Every value of `column` in this company's rows of `table`, paged. */
async function selectAll(table: string, column: string, companyId: string) {
  const values: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(column).eq('company_id', companyId).order('id').range(from, from + PAGE_SIZE - 1);
    if (error) fail(`Gagal membaca ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, string | null>[];
    for (const row of rows) if (row[column]) values.push(row[column] as string);
    if (rows.length < PAGE_SIZE) break;
  }
  return values;
}

/**
 * Deletes this company's rows of `table` a page at a time. One large DELETE
 * could hit the statement timeout on hundreds of thousands of rows.
 */
async function deleteAll(table: string, companyId: string, total: number) {
  let deleted = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select('id').eq('company_id', companyId).limit(PAGE_SIZE);
    if (error) fail(`Gagal membaca ${table}: ${error.message}`);
    const ids = (data ?? []).map((row) => row.id as string);
    if (ids.length === 0) break;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += DELETE_CHUNK) chunks.push(ids.slice(i, i + DELETE_CHUNK));
    const results = await Promise.all(chunks.map((chunk) => supabase.from(table).delete().in('id', chunk)));
    const failed = results.find((result) => result.error);
    if (failed?.error) fail(`Gagal menghapus ${table}: ${failed.error.message}`);
    deleted += ids.length;
    process.stdout.write(`\r  … ${table}: ${fmt(deleted)} / ${fmt(total)}`);
  }
  if (deleted > 0) process.stdout.write('\n');
  return deleted;
}

// ---------------------------------------------------------------------------
// Purge

async function main() {
  const { data: companies, error } = await supabase.from('companies').select('id, nama_perusahaan').ilike('nama_perusahaan', companyName.trim());
  if (error) fail(`Gagal membaca perusahaan: ${error.message}`);
  if (!companies || companies.length === 0) fail(`Perusahaan "${companyName}" tidak ditemukan.`);
  if (companies.length > 1) fail(`Lebih dari satu perusahaan cocok dengan "${companyName}": ${companies.map((c) => c.nama_perusahaan).join(', ')}`);
  const company = companies[0] as { id: string; nama_perusahaan: string };

  console.log(commit ? 'HAPUS' : 'DRY RUN (tidak ada yang dihapus; tambahkan --commit untuk menghapus)');
  console.log(`Perusahaan: ${company.nama_perusahaan} (${company.id})\n`);

  const inventory = await Promise.all(INVENTORY_CATEGORIES.map(async ({ key }) => ({ table: key, total: await countRows(key, company.id) })));
  const batchCount = await countRows('import_batches', company.id);
  const sessionCount = await countRows('upload_sessions', company.id);
  const storagePaths = [...new Set([
    ...(await selectAll('upload_sessions', 'storage_path', company.id)),
    ...(await selectAll('import_batches', 'file_storage_path', company.id)),
  ])];

  const inventoryTotal = inventory.reduce((sum, { total }) => sum + total, 0);
  console.log(`Baris inventaris: ${fmt(inventoryTotal)}`);
  for (const { table, total } of inventory) console.log(`  - ${getCategoryLabel(table)}: ${fmt(total)}`);
  console.log(`Batch impor: ${fmt(batchCount)}`);
  console.log(`Sesi unggah: ${fmt(sessionCount)}`);
  console.log(`Berkas di Storage (${STORAGE_BUCKET}): ${fmt(storagePaths.length)}`);

  if (!commit) return;
  if (inventoryTotal + batchCount + sessionCount + storagePaths.length === 0) {
    console.log('\nTidak ada data untuk dihapus.');
    return;
  }

  console.log('');
  // Rows first: their import_batch_id is ON DELETE SET NULL, so removing the
  // batches alone would leave the rows behind.
  for (const { table, total } of inventory) if (total > 0) await deleteAll(table, company.id, total);
  if (batchCount > 0) await deleteAll('import_batches', company.id, batchCount);

  let storageFailures = 0;
  for (let i = 0; i < storagePaths.length; i += 100) {
    const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths.slice(i, i + 100));
    if (storageError) {
      storageFailures += Math.min(100, storagePaths.length - i);
      console.warn(`  ! Gagal menghapus sebagian berkas Storage: ${storageError.message}`);
    }
  }
  if (storagePaths.length > 0) console.log(`  … Storage: ${fmt(storagePaths.length - storageFailures)} / ${fmt(storagePaths.length)} berkas`);

  // Sessions last: they hold the file hashes, so a failure above can be
  // retried without import-folder.ts treating the files as already imported.
  if (sessionCount > 0) await deleteAll('upload_sessions', company.id, sessionCount);

  const remaining = (await Promise.all(INVENTORY_CATEGORIES.map(({ key }) => countRows(key, company.id)))).reduce((a, b) => a + b, 0);
  console.log(`\nSelesai. Sisa baris inventaris ${company.nama_perusahaan}: ${fmt(remaining)}`);
  if (remaining > 0 || storageFailures > 0) process.exitCode = 1;
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
