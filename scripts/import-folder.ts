/**
 * Bulk import of a folder of workbooks for one company (e.g. every PLN unit
 * report), using the same scan → mapping → transform → insert steps as the
 * web upload. Each file is stored in Supabase Storage with its own upload
 * session and one import batch per sheet, so it shows up (and can be filtered
 * or removed) exactly like a file uploaded through the web.
 *
 *   npx tsx scripts/import-folder.ts <folder-or-file> [...] --company "PT PLN (Persero)" [options]
 *
 * Options:
 *   --commit        write to the database (default is a dry run that writes nothing)
 *   --only <text>   only files whose path contains <text> (e.g. --only Bali), repeatable
 *   --report <file> also write the summary as JSON
 *
 * Safe to re-run: a file whose identical content was already imported for the
 * company is skipped, and rows already in the database or repeated in the file
 * are skipped as duplicates.
  * Needs migrations up to 20260928000003. Uses SUPABASE_SERVICE_ROLE_KEY from
 * .env.local when present (required once row level security is tightened),
 * otherwise the anon key.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping } from '@/lib/import-profiles';
import { scanWorkbook } from '@/lib/import-scan';
import { buildCheckReport, checkMappings, fetchExistingFingerprints, insertBatchRows, transformRows } from '@/lib/import-transform';
import { getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import { findImportedUpload, sha256, STORAGE_BUCKET } from '@/lib/upload-store';

// ---------------------------------------------------------------------------
// Arguments

const args = process.argv.slice(2);
const targets: string[] = [];
const only: string[] = [];
let companyName = '';
let commit = false;
let reportPath: string | null = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--commit') commit = true;
  else if (arg === '--company') companyName = args[++i] ?? '';
  else if (arg === '--only') only.push((args[++i] ?? '').toLowerCase());
  else if (arg === '--report') reportPath = args[++i] ?? null;
  else if (arg.startsWith('--')) fail(`Opsi tidak dikenal: ${arg}`);
  else targets.push(arg);
}
if (targets.length === 0 || !companyName.trim()) {
  fail('Pemakaian: npx tsx scripts/import-folder.ts <folder-atau-berkas> [...] --company "Nama Perusahaan" [--commit] [--only teks] [--report hasil.json]');
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const listWorkbooks = (target: string): string[] => {
  const stat = fs.statSync(target);
  if (stat.isFile()) return /\.xlsx?$/i.test(target) && !path.basename(target).startsWith('.~lock') ? [target] : [];
  return fs.readdirSync(target).sort((a, b) => a.localeCompare(b, 'id', { numeric: true })).flatMap((entry) => listWorkbooks(path.join(target, entry)));
};

const files = targets
  .flatMap(listWorkbooks)
  .filter((file) => only.length === 0 || only.some((text) => file.toLowerCase().includes(text)));
if (files.length === 0) fail('Tidak ada berkas Excel yang cocok.');

// ---------------------------------------------------------------------------
// Database

loadEnvConfig(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) fail('Variabel Supabase tidak ditemukan di .env.local.');
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function checkSchema() {
  const checks: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
    ['20260927000001_upload_storage', supabase.from('import_batches').select('upload_id, sheet_name').limit(1)],
    ['20260928000001_units_and_asset_code', supabase.from('inventory_items').select('unit, sub_unit, kode_alat').limit(1)],
    ['20260928000001_units_and_asset_code', supabase.from('upload_sessions').select('file_sha256').limit(1)],
    ['20260928000003_data_quality', supabase.from('inventory_items').select('catatan_impor, baris_excel').limit(1)],
    ['20260928000003_data_quality', supabase.from('import_batches').select('laporan_pemeriksaan').limit(1)],
  ];
  for (const [migration, check] of checks) {
    const { error } = await check;
    if (error) fail(`Skema database belum lengkap (${error.message}). Jalankan migrasi ${migration}.sql terlebih dahulu.`);
  }
}

async function resolveCompany(): Promise<{ id: string | null; created: boolean }> {
  const { data, error } = await supabase.from('companies').select('id').ilike('nama_perusahaan', companyName.trim()).limit(1);
  if (error) fail(`Gagal membaca perusahaan: ${error.message}`);
  if (data && data.length > 0) return { id: data[0].id as string, created: false };
  if (!commit) return { id: null, created: true };
  const { data: created, error: insertError } = await supabase.from('companies').insert({ nama_perusahaan: companyName.trim() }).select('id').single();
  if (insertError) fail(`Gagal membuat perusahaan: ${insertError.message}`);
  return { id: created.id as string, created: true };
}

// ---------------------------------------------------------------------------
// Import

const fmt = (n: number) => n.toLocaleString('id-ID');

interface FileResult {
  file: string;
  status: 'imported' | 'dry-run' | 'already-imported' | 'no-data' | 'failed';
  message?: string;
  sheets: Array<{ sheet: string; category: InventoryCategory; rows: number; inserted: number; duplicates: number; error?: string }>;
}

const results: FileResult[] = [];
const rowsByCategory: Record<string, number> = {};
const rowsByUnit: Record<string, number> = {};
let duplicateRows = 0;

async function main() {
  if (commit) await checkSchema();
  const company = await resolveCompany();
  console.log(`${commit ? 'IMPORT' : 'DRY RUN (tidak ada yang disimpan; tambahkan --commit untuk menyimpan)'}`);
  console.log(`Perusahaan: ${companyName}${company.created ? (commit ? ' (baru dibuat)' : ' (belum ada, akan dibuat)') : ''}`);
  console.log(`Berkas: ${files.length}\n`);

  // Fingerprints of rows already stored, per category, grown as sheets are imported.
  const existing = new Map<InventoryCategory, Set<string>>();
  const existingFor = async (category: InventoryCategory) => {
    if (!existing.has(category)) existing.set(category, company.id ? await fetchExistingFingerprints(supabase, category, company.id) : new Set());
    return existing.get(category) as Set<string>;
  };

  for (const [index, file] of files.entries()) {
    const relative = path.relative(process.cwd(), file);
    const label = `[${index + 1}/${files.length}] ${relative}`;
    const started = performance.now();
    const result: FileResult = { file: relative, status: commit ? 'imported' : 'dry-run', sheets: [] };
    results.push(result);

    try {
      const buffer = fs.readFileSync(file);
      const fileSha256 = await sha256(buffer);
      if (company.id) {
        const previous = await findImportedUpload(supabase, company.id, fileSha256);
        if (previous) {
          result.status = 'already-imported';
          console.log(`${label}\n  · dilewati: berkas identik sudah diimpor ${new Date(previous.createdAt).toLocaleString('id-ID')}`);
          continue;
        }
      }

      const scanned = scanWorkbook(readWorkbook(buffer));
      const included = scanned.filter(({ sheet }) => sheet.include && sheet.category);
      if (included.length === 0) {
        result.status = 'no-data';
        console.log(`${label}\n  · dilewati: tidak ada sheet data inventaris`);
        continue;
      }

      // Store the workbook and its upload session, as the web upload does.
      const uploadId = randomUUID();
      const storagePath = `uploads/${uploadId}/source.${file.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'}`;
      if (commit) {
        const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        if (storageError) throw new Error(`Gagal menyimpan berkas ke Storage: ${storageError.message}`);
        const { error: sessionError } = await supabase.from('upload_sessions').insert({
          id: uploadId,
          company_id: company.id,
          file_name: path.basename(file),
          storage_path: storagePath,
          status: 'scanned',
          sheets: scanned.map(({ sheet }) => sheet),
          file_sha256: fileSha256,
        });
        if (sessionError) throw new Error(`Gagal mencatat unggahan: ${sessionError.message}`);
      }

      console.log(label);
      for (const { sheet, parsed } of included) {
        const category = sheet.category as InventoryCategory;
        const mapping = buildSuggestedMapping(sheet.profile, category, sheet.headers, sheet.sampleRows);
        const mappingError = checkMappings(category, mapping);
        if (mappingError) {
          result.sheets.push({ sheet: sheet.sheetName, category, rows: 0, inserted: 0, duplicates: 0, error: mappingError });
          console.log(`  ✗ ${sheet.sheetName}: ${mappingError}`);
          continue;
        }

        const transformed = transformRows(category, parsed, mapping, { profile: sheet.profile, fileName: relative });
        const { rows, skippedCopies } = transformed;
        const known = await existingFor(category);
        const fresh = rows.filter((row) => !known.has(row.fingerprint));
        const entry: FileResult['sheets'][number] = { sheet: sheet.sheetName, category, rows: rows.length + skippedCopies, inserted: 0, duplicates: skippedCopies + rows.length - fresh.length };
        result.sheets.push(entry);

        if (commit && fresh.length > 0) {
          const batchId = randomUUID();
          const { error: batchError } = await supabase.from('import_batches').insert({
            id: batchId,
            company_id: company.id,
            jenis_data: category,
            nama_file_asli: path.basename(file),
            file_storage_path: storagePath,
            status: 'pending_mapping',
            upload_id: uploadId,
            sheet_name: sheet.sheetName,
            profile: sheet.profile,
            headers: sheet.headers,
            total_rows: sheet.totalRows,
            data_rows: sheet.dataRows,
            preview_rows: sheet.previewRows,
            suggested_mapping: mapping,
          });
          if (batchError) throw new Error(`Gagal membuat batch: ${batchError.message}`);

          const failure = await insertBatchRows(supabase, category, fresh, { id: batchId, company_id: company.id as string });
          if (failure) {
            entry.error = `Excel baris ${failure.rowNumber} dst.: ${failure.message}`;
            await supabase.from('import_batches').update({ status: 'error' }).eq('id', batchId);
            console.log(`  ✗ ${sheet.sheetName}: ${entry.error}`);
            continue;
          }
          await supabase.from('import_batches').update({ status: 'imported', laporan_pemeriksaan: buildCheckReport(transformed, fresh.length) }).eq('id', batchId);
        }

        entry.inserted = commit ? fresh.length : 0;
        for (const row of fresh) {
          known.add(row.fingerprint);
          const unit = (row.item.unit as string | undefined) ?? '(tanpa unit)';
          rowsByUnit[unit] = (rowsByUnit[unit] ?? 0) + 1;
        }
        rowsByCategory[category] = (rowsByCategory[category] ?? 0) + fresh.length;
        duplicateRows += entry.duplicates;
        const units = [...new Set(fresh.map((row) => row.item.unit).filter(Boolean))].join(', ') || 'tanpa unit';
        console.log(`  ✓ ${sheet.sheetName} → ${getCategoryLabel(category)}: ${fmt(fresh.length)} baris ${commit ? 'disimpan' : 'akan disimpan'}${entry.duplicates ? `, ${fmt(entry.duplicates)} duplikat dilewati` : ''} [${units}]`);
      }
      if (result.sheets.some((sheet) => sheet.error)) {
        result.status = 'failed';
        result.message = 'Sebagian sheet gagal';
      }
    } catch (err) {
      result.status = 'failed';
      result.message = err instanceof Error ? err.message : String(err);
      console.log(`${label}\n  ✗ ${result.message}`);
    }
    console.log(`  (${((performance.now() - started) / 1000).toFixed(1)} dtk)`);
  }

  const count = (status: FileResult['status']) => results.filter((result) => result.status === status).length;
  console.log('\n════════ RINGKASAN ════════');
  console.log(`Berkas: ${commit ? `${count('imported')} diimpor` : `${count('dry-run')} siap diimpor`}, ${count('already-imported')} sudah pernah diimpor, ${count('no-data')} tanpa data, ${count('failed')} gagal`);
  console.log(`Baris ${commit ? 'disimpan' : 'akan disimpan'}: ${fmt(Object.values(rowsByCategory).reduce((a, b) => a + b, 0))} · duplikat dilewati: ${fmt(duplicateRows)}`);
  for (const [category, total] of Object.entries(rowsByCategory)) console.log(`  - ${getCategoryLabel(category as InventoryCategory)}: ${fmt(total)}`);
  console.log('Per unit:');
  for (const [unit, total] of Object.entries(rowsByUnit).sort((a, b) => b[1] - a[1])) console.log(`  ${fmt(total).padStart(9)}  ${unit}`);
  const failed = results.filter((result) => result.status === 'failed');
  if (failed.length > 0) {
    console.log('Gagal:');
    for (const result of failed) console.log(`  - ${result.file}: ${result.message ?? result.sheets.filter((sheet) => sheet.error).map((sheet) => `${sheet.sheet}: ${sheet.error}`).join('; ')}`);
  }
  if (reportPath) {
    fs.writeFileSync(reportPath, JSON.stringify({ company: companyName, commit, rowsByCategory, rowsByUnit, duplicateRows, results }, null, 2));
    console.log(`\nLaporan JSON: ${reportPath}`);
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
