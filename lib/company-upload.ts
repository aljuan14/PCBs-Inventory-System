import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSheet, readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet } from '@/lib/import-profiles';
import { checkMappings, findRowsInDatabase, transformRows, type LoadedSheet, type TransformedRow } from '@/lib/import-transform';
import { formSpec } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';
import type { SampleRow, UploadMode, UploadSummary } from '@/lib/company-upload-shared';
import { downloadWorkbook } from '@/lib/upload-store';

/**
 * A company's Excel upload of forms 1.1-1.4 (unggahan_perusahaan, migration
 * 20261014000006): only the official template of that form, its columns
 * known from their titles (no mapping by hand), checked by transformRows as
 * an admin upload is. Read here when the company checks and sends it, and
 * again when the admin accepts it.
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
