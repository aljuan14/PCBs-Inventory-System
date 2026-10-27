import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSheet, readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet } from '@/lib/import-profiles';
import { buildCheckReport, checkMappings, findRowsInDatabase, insertBatchRows, transformRows, type LoadedSheet, type TransformedRow } from '@/lib/import-transform';
import { TRAFO_FOCUS_YEAR, formSpec, isTrafo } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';
import type { SampleRow, UploadMode, UploadSummary } from '@/lib/company-upload-shared';
import { downloadWorkbook } from '@/lib/upload-store';

/**
 * A company's Excel upload of forms 1.1-1.4 (unggahan_perusahaan, migration
 * 20261014000006): only the official template of that form, its columns
 * known from their titles (no mapping by hand), checked by transformRows as
 * an admin upload is. Read here when the company checks it, and again when
 * it is saved (importCompanyUpload): straight away since 2026-10-26, without
 * the admin's acceptance first.
 */

export { COMPANY_UPLOAD_FOLDER, MAX_COMPANY_UPLOAD_BYTES, type SampleRow, type UploadMode, type UploadSummary } from '@/lib/company-upload-shared';

export class UploadCheckError extends Error {}

const text = (value: unknown) => (value === null || value === undefined || value === '' ? null : String(value));
const number = (value: unknown) => (typeof value === 'number' ? value : null);

function sampleOf(category: InventoryCategory, rows: TransformedRow[]): SampleRow[] {
  return rows.slice(0, 5).map(({ rowNumber, item }) => ({
    baris: rowNumber,
    merek: text(category === 'minyak_dielektrik' ? item.merek_minyak_dielektrik : item.nama_merek),
    serial: text(item.nomor_serial),
    tahun: number(item.tahun_pembuatan),
    ppm: number(item.uji_konsentrasi_ppm),
    lokasi: text(category === 'minyak_dielektrik' ? item.lokasi_penyimpanan : item.lokasi_peralatan),
    koordinat: typeof item.koordinat_lat === 'number' ? `${item.koordinat_lat}, ${item.koordinat_lng}` : text(item.koordinat_raw),
  }));
}

/** The sheet of the workbook holding this form's template, or why there is none. */
function templateSheet(buffer: Uint8Array, category: InventoryCategory) {
  const workbook = readWorkbook(buffer);
  const found: Array<{ name: string; parsed: ReturnType<typeof parseSheet>; category: InventoryCategory | null }> = [];
  for (const name of workbook.SheetNames) {
    const parsed = parseSheet(workbook, name);
    const detection = detectSheet(name, parsed.headers, parsed.allRows.length, workbook.SheetNames);
    if (detection.profile === 'template_klhk') found.push({ name, parsed, category: detection.category });
  }
  const own = found.filter((sheet) => sheet.category === category);
  if (own.length > 0) return own.sort((a, b) => b.parsed.allRows.length - a.parsed.allRows.length)[0];
  const other = found.find((sheet) => sheet.category);
  if (other?.category) throw new UploadCheckError(`Berkas ini template formulir ${formSpec(other.category).code} (${formSpec(other.category).title.toLowerCase()}), bukan formulir ${formSpec(category).code}. Unggah di tab formulir ${formSpec(other.category).code}.`);
  throw new UploadCheckError(`Berkas ini bukan template resmi formulir ${formSpec(category).code}. Gunakan template dari KLH tanpa mengubah judul kolomnya.`);
}

/**
 * Reads and checks an uploaded file. The rows come back for the import on
 * acceptance; the summary is what both sides look at.
 */
export async function readCompanyUpload(supabase: SupabaseClient, input: { companyId: string; category: InventoryCategory; path: string; mode: UploadMode }) {
  const buffer = await downloadWorkbook(supabase, input.path);
  if (!buffer) throw new UploadCheckError('Berkas tidak dapat dibaca dari penyimpanan. Unggah ulang.');
  const { name, parsed } = templateSheet(buffer, input.category);
  const mappings = buildSuggestedMapping('template_klhk', input.category, parsed.headers, parsed.previewRows);
  const mappingError = checkMappings(input.category, mappings);
  if (mappingError) throw new UploadCheckError(`Kolom template tidak lengkap: ${mappingError}`);

  const sheet: LoadedSheet = { headers: parsed.headers, allRows: parsed.allRows, rowNumbers: parsed.rowNumbers };
  const transformed = transformRows(input.category, sheet, mappings, { profile: 'template_klhk' });
  if (transformed.rows.length === 0) throw new UploadCheckError('Tidak ada baris data di template ini. Baris contoh dari template tidak dihitung.');

  let alreadyStored = 0;
  let currentRows = 0;
  let existing = new Set<TransformedRow>();
  if (input.mode === 'tambah') {
    existing = await findRowsInDatabase(supabase, input.category, input.companyId, transformed.rows);
    alreadyStored = existing.size;
  } else {
    const { count } = await supabase.from(input.category).select('id', { count: 'exact', head: true }).eq('company_id', input.companyId);
    currentRows = count ?? 0;
  }

  const summary: UploadSummary = {
    sheetName: name,
    rows: transformed.rows.length,
    skippedEmpty: transformed.skippedEmpty,
    skippedCopies: transformed.skippedCopies,
    alreadyStored,
    currentRows,
    issues: transformed.issues.list(),
    sample: sampleOf(input.category, transformed.rows),
  };
  return { summary, sheet, mappings, transformed, existing };
}

type PlanRow = { id: string; item_id: string; jenis: string };
type TrafoRow = { id: string; nama_merek: string | null; nomor_serial: string | null; tahun_pembuatan: number | null; uji_konsentrasi_ppm: number | null };

const UNKNOWN_SERIAL = /^(tidak diketahui|tdk diketahui|-|n\/a)?$/i;
const identity = (row: TrafoRow) => {
  const serial = (row.nomor_serial ?? '').trim().toLowerCase();
  return UNKNOWN_SERIAL.test(serial) ? null : `${(row.nama_merek ?? '').trim().toLowerCase()}|${serial}`;
};
// What the roadmap asks of a transformer, as company_focus_transformers decides it (migration 20261020000001).
const needOf = (category: InventoryCategory, row: TrafoRow) => {
  if (row.tahun_pembuatan !== null && row.tahun_pembuatan >= TRAFO_FOCUS_YEAR) return null;
  if (category === 'transformator_tidak_digunakan') return 'pengelolaan';
  return row.uji_konsentrasi_ppm === null ? 'uji' : row.uji_konsentrasi_ppm >= 50 ? 'penanganan' : null;
};

async function allRows<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await load(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

/**
 * Before "ganti" deletes a company's transformers (and, by trigger, their
 * roadmap plans; migration 20261027000002), each plan moves to the new row of
 * the same brand and serial number, when that pairing is one to one and the
 * new row still needs the same thing. Rows without a serial number cannot be
 * told apart, so their plans go. Returns how many plans moved and went.
 */
async function carryPlans(supabase: SupabaseClient, category: InventoryCategory, companyId: string, batchId: string) {
  const columns = 'id, nama_merek, nomor_serial, tahun_pembuatan, uji_konsentrasi_ppm';
  const [fresh, old] = await Promise.all([
    allRows<TrafoRow>((from, to) => supabase.from(category).select(columns).eq('import_batch_id', batchId).range(from, to)),
    allRows<TrafoRow>((from, to) => supabase.from(category).select(columns).eq('company_id', companyId).or(`import_batch_id.is.null,import_batch_id.neq.${batchId}`).range(from, to)),
  ]);
  const plans: PlanRow[] = [];
  const oldIds = old.map((row) => row.id);
  for (let at = 0; at < oldIds.length; at += 300) {
    plans.push(...await allRows<PlanRow>((from, to) => supabase.from('equipment_plans').select('id, item_id, jenis').in('item_id', oldIds.slice(at, at + 300)).range(from, to)));
  }
  if (plans.length === 0) return { kept: 0, lost: 0 };

  // Only a brand and serial found once on each side pairs two rows.
  const byKey = (rows: TrafoRow[]) => {
    const found = new Map<string, TrafoRow | null>();
    for (const row of rows) {
      const key = identity(row);
      if (key) found.set(key, found.has(key) ? null : row);
    }
    return found;
  };
  const freshByKey = byKey(fresh);
  const oldByKey = byKey(old);
  const target = new Map<string, TrafoRow>();
  for (const [key, row] of oldByKey) {
    const match = freshByKey.get(key);
    if (row && match) target.set(row.id, match);
  }

  let kept = 0;
  for (const plan of plans) {
    const match = target.get(plan.item_id);
    if (!match || needOf(category, match) !== plan.jenis) continue;
    const { error } = await supabase.from('equipment_plans').update({ item_id: match.id, kategori: category }).eq('id', plan.id);
    if (error) throw new Error(`Gagal memindahkan rencana roadmap: ${error.message}`);
    kept++;
  }
  return { kept, lost: plans.length - kept };
}

/**
 * Reads the file again and imports it like an admin upload, as one import
 * batch; "ganti" then removes every other row of the company for that form.
 * Runs with the caller's rights: a company only reaches its own rows.
 */
export async function importCompanyUpload(supabase: SupabaseClient, input: { companyId: string; category: InventoryCategory; path: string; fileName: string; mode: UploadMode }) {
  const { summary, sheet, mappings, transformed, existing } = await readCompanyUpload(supabase, input);
  const rows = input.mode === 'tambah' ? transformed.rows.filter((row) => !existing.has(row)) : transformed.rows;
  if (rows.length === 0) throw new UploadCheckError(`Semua ${summary.rows} baris sudah ada di data perusahaan; tidak ada yang ditambahkan.`);

  const batch = { id: randomUUID(), company_id: input.companyId };
  const { error: batchError } = await supabase.from('import_batches').insert({
    id: batch.id, company_id: batch.company_id, jenis_data: input.category, nama_file_asli: input.fileName, file_storage_path: input.path,
    status: 'pending_mapping', sheet_name: summary.sheetName, profile: 'template_klhk', headers: sheet.headers,
    total_rows: sheet.allRows.length, data_rows: summary.rows, suggested_mapping: mappings,
  });
  if (batchError) throw new Error(`Gagal mencatat unggahan: ${batchError.message}`);

  const failure = await insertBatchRows(supabase, input.category, rows, batch);
  if (failure) {
    await supabase.from('import_batches').delete().eq('id', batch.id);
    throw new Error(`Gagal menyimpan data (Excel baris ${failure.rowNumber} dst.): ${failure.message}`);
  }

  // "ganti": the company's other rows of this form go only once the new ones are in.
  let replacedRows = 0;
  let plans = { kept: 0, lost: 0 };
  if (input.mode === 'ganti') {
    if (isTrafo(input.category)) {
      try {
        plans = await carryPlans(supabase, input.category, batch.company_id, batch.id);
      } catch (err) {
        await supabase.from(input.category).delete().eq('import_batch_id', batch.id);
        await supabase.from('import_batches').delete().eq('id', batch.id);
        throw new Error(`${err instanceof Error ? err.message : String(err)}. Tidak ada data yang berubah.`);
      }
    }
    const { count, error: deleteError } = await supabase.from(input.category).delete({ count: 'exact' }).eq('company_id', batch.company_id).or(`import_batch_id.is.null,import_batch_id.neq.${batch.id}`);
    if (deleteError) {
      await supabase.from(input.category).delete().eq('import_batch_id', batch.id);
      await supabase.from('import_batches').delete().eq('id', batch.id);
      throw new Error(`Gagal mengganti data lama: ${deleteError.message}. Tidak ada data yang berubah.`);
    }
    replacedRows = count ?? 0;
    await supabase.from('import_batches').update({ status: 'replaced', replaced_by: batch.id, replaced_at: new Date().toISOString() })
      .eq('company_id', batch.company_id).eq('jenis_data', input.category).eq('status', 'imported').neq('id', batch.id);
  }

  const report = buildCheckReport(transformed, rows.length, mappings);
  await supabase.from('import_batches').update({ status: 'imported', laporan_pemeriksaan: report }).eq('id', batch.id);
  return { summary, batchId: batch.id, imported: rows.length, skipped: transformed.rows.length - rows.length, replacedRows, plansKept: plans.kept, plansLost: plans.lost };
}
