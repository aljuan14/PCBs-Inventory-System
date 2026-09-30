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
 * from .env.local.
 */
import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { countCompanyData, purgeCompanyData } from '@/lib/company-purge';
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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl) fail('Variabel Supabase tidak ditemukan di .env.local.');
if (!supabaseKey) fail('SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env.local (anon key tidak bisa menulis sejak login diwajibkan).');
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const fmt = (n: number) => n.toLocaleString('id-ID');

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

  const data = await countCompanyData(supabase, company.id);
  const { inventory, inventoryTotal, batches: batchCount, sessions: sessionCount, storagePaths } = data;

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
  let lastTable = '';
  const storageFailures = await purgeCompanyData(supabase, company.id, data, (table, deleted, total) => {
    if (lastTable && table !== lastTable) process.stdout.write('\n');
    lastTable = table;
    process.stdout.write(`\r  … ${table === 'storage' ? 'Storage' : table}: ${fmt(deleted)} / ${fmt(total)}`);
  });
  if (lastTable) process.stdout.write('\n');
  if (storageFailures > 0) console.warn(`  ! ${fmt(storageFailures)} berkas Storage gagal dihapus.`);

  const remaining = (await Promise.all(INVENTORY_CATEGORIES.map(async ({ key }) => {
    const { count, error: countError } = await supabase.from(key).select('id', { count: 'exact', head: true }).eq('company_id', company.id);
    if (countError) fail(`Gagal menghitung ${key}: ${countError.message}`);
    return count ?? 0;
  }))).reduce((a, b) => a + b, 0);
  console.log(`\nSelesai. Sisa baris inventaris ${company.nama_perusahaan}: ${fmt(remaining)}`);
  if (remaining > 0 || storageFailures > 0) process.exitCode = 1;
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
