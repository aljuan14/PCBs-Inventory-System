/**
 * Fills the transformer weight columns (migration 20260929000004) of rows
 * already imported, without importing again. Each imported transformer batch
 * is read from its workbook in Storage with its profile's mapping, and the
 * dry, oil and total weight of every row are written to the stored row of the
 * same batch and Excel row (inventory_set_weights). Nothing else of the row
 * changes, so edits made in the app stay.
 *
 *   npx tsx scripts/backfill-weights.ts                # dry run: what would be filled
 *   npx tsx scripts/backfill-weights.ts --only Jabar   # batches whose file name contains the text
 *   npx tsx scripts/backfill-weights.ts --commit       # write
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local when present, otherwise the anon key.
 */
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { parseExcelWithSmartHeader } from '@/lib/excel';
import { buildSuggestedMapping, IGNORE, type ImportProfile } from '@/lib/import-profiles';
import { transformRows } from '@/lib/import-transform';
import { WEIGHT_FIELDS, type InventoryCategory } from '@/lib/inventory';
import { downloadWorkbook } from '@/lib/upload-store';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const only = args.flatMap((arg, index) => (arg === '--only' ? [(args[index + 1] ?? '').toLowerCase()] : []));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

loadEnvConfig(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) fail('Variabel Supabase tidak ditemukan di .env.local.');
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const CHUNK = 2000;
const fmt = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 1 });

interface Batch {
  id: string;
  nama_file_asli: string;
  sheet_name: string | null;
  jenis_data: InventoryCategory;
  file_storage_path: string | null;
  profile: ImportProfile | null;
  suggested_mapping: Record<string, string> | null;
  mappings: Record<string, string> | null;
}

/** Stored rows of a batch; with `withoutExcelRow`, only those that cannot be matched. */
async function count(table: string, batchId: string, withoutExcelRow = false) {
  const query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('import_batch_id', batchId);
  const { count: rows, error } = await (withoutExcelRow ? query.is('baris_excel', null) : query);
  if (error) throw new Error(error.message);
  return rows ?? 0;
}

async function main() {
  const { error: schemaError } = await supabase.from('transformator_digunakan').select('berat_total_kg').limit(1);
  if (schemaError) fail(`Kolom berat belum ada (${schemaError.message}). Jalankan migrasi 20260929000004_transformer_weights.sql terlebih dahulu.`);

  const { data, error } = await supabase
    .from('import_batches')
    .select('id, nama_file_asli, sheet_name, jenis_data, file_storage_path, profile, suggested_mapping, mappings:laporan_pemeriksaan->mappings')
    .eq('status', 'imported')
    .in('jenis_data', ['transformator_digunakan', 'transformator_tidak_digunakan'])
    .order('nama_file_asli')
    .limit(1000);
  if (error) fail(`Gagal membaca batch: ${error.message}`);
  const batches = (data as unknown as Batch[]).filter((batch) => only.length === 0 || only.some((text) => batch.nama_file_asli.toLowerCase().includes(text)));

  console.log(`${commit ? 'MENGISI' : 'DRY RUN (tidak ada yang disimpan; tambahkan --commit untuk menyimpan)'} · ${batches.length} batch trafo\n`);
  const workbooks = new Map<string, Buffer | null>();
  const totals = { dbRows: 0, withWeight: 0, weightKg: 0, updated: 0, problems: 0 };

  for (const batch of batches) {
    const label = `${batch.nama_file_asli} › ${batch.sheet_name ?? '-'}`;
    try {
      if (!batch.file_storage_path) throw new Error('berkas tidak tersimpan di Storage');
      if (!workbooks.has(batch.file_storage_path)) workbooks.set(batch.file_storage_path, await downloadWorkbook(supabase, batch.file_storage_path));
      const buffer = workbooks.get(batch.file_storage_path);
      if (!buffer) throw new Error('berkas tidak dapat diunduh dari Storage');

      const sheet = parseExcelWithSmartHeader(buffer, batch.sheet_name ?? undefined);
      // The mapping used at import, with the weight columns this profile now reads.
      const rebuilt = buildSuggestedMapping(batch.profile, batch.jenis_data, sheet.headers, sheet.allRows.slice(0, 30));
      const weightHeaders = Object.entries(rebuilt).filter(([, target]) => WEIGHT_FIELDS.includes(target));
      if (weightHeaders.length === 0) {
        console.log(`– ${label}: tidak ada kolom berat di sheet ini, dilewati`);
        continue;
      }
      const mapping = Object.fromEntries(Object.entries(batch.mappings ?? batch.suggested_mapping ?? {})
        .map(([header, target]) => [header, WEIGHT_FIELDS.includes(target) || target === '@berat_kg' ? IGNORE : target]));
      for (const [header, target] of weightHeaders) mapping[header] = target;

      const { rows } = transformRows(batch.jenis_data, sheet, mapping, { profile: batch.profile, fileName: batch.nama_file_asli });
      const payload = rows.map((row) => ({
        row: row.rowNumber,
        dry: row.item.berat_kering_kg ?? null,
        oil: row.item.berat_minyak_kg ?? null,
        total: row.item.berat_total_kg ?? null,
      }));
      const withWeight = payload.filter((row) => row.total !== null);
      const weightKg = withWeight.reduce((sum, row) => sum + Number(row.total), 0);

      const dbRows = await count(batch.jenis_data, batch.id);
      const withoutRow = await count(batch.jenis_data, batch.id, true);
      let updated = 0;
      if (commit) {
        for (let start = 0; start < payload.length; start += CHUNK) {
          const { data: done, error: updateError } = await supabase.rpc('inventory_set_weights', { p_category: batch.jenis_data, p_batch: batch.id, p_rows: payload.slice(start, start + CHUNK) });
          if (updateError) throw new Error(`gagal menyimpan (baris ${payload[start].row} dst.): ${updateError.message}`);
          updated += Number(done) || 0;
        }
      }

      const problems = [
        withoutRow > 0 ? `${fmt(withoutRow)} baris di database tanpa nomor baris Excel` : '',
        rows.length !== dbRows ? `baris berkas ${fmt(rows.length)} ≠ database ${fmt(dbRows)}` : '',
        commit && updated !== dbRows ? `${fmt(dbRows - updated)} baris tidak terisi` : '',
      ].filter(Boolean);
      totals.dbRows += dbRows;
      totals.withWeight += withWeight.length;
      totals.weightKg += weightKg;
      totals.updated += updated;
      if (problems.length) totals.problems++;
      console.log(`${problems.length ? '⚠' : '✓'} ${label}: ${fmt(withWeight.length)} dari ${fmt(dbRows)} baris punya berat total (${fmt(weightKg / 1000)} ton)${commit ? ` · ${fmt(updated)} baris diperbarui` : ''}${problems.length ? ` · ${problems.join('; ')}` : ''}`);
    } catch (err) {
      totals.problems++;
      console.log(`✗ ${label}: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal: ${fmt(totals.withWeight)} dari ${fmt(totals.dbRows)} trafo punya berat total, ${fmt(totals.weightKg / 1000)} ton${commit ? ` · ${fmt(totals.updated)} baris diperbarui` : ''} · ${totals.problems} batch perlu dicek`);
}

main().catch((err) => fail((err as Error).message));
