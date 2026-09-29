import type { SupabaseClient } from '@supabase/supabase-js';
import { parseExcelWithSmartHeader } from '@/lib/excel';
import { parseDMSCoordinate, repairIndonesianCoordinate } from '@/lib/dms';
import { INVENTORY_FIELDS, WEIGHT_FIELDS, type InventoryCategory } from '@/lib/inventory';
import { applyDerivedFields, convertValue, getDerivedFields, hasIdentity, IGNORE, isExampleRow, isMeaningful, recordMask } from '@/lib/import-profiles';
import { downloadWorkbook } from '@/lib/upload-store';
import { resolveUnit, tidyUnitName, type UnitContext } from '@/lib/units';

/**
 * Row transformation shared by the pre-import check (dry run) and the import
 * itself, so the report the admin approves is exactly what gets stored.
 */

export class BatchFileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface LoadedSheet {
  headers: string[];
  allRows: Record<string, unknown>[];
  rowNumbers: number[];
}

// Parsing a 50k-row sheet takes seconds; keep the latest few so repeated
// checks and the final import of the same batch reuse it.
const sheetCache = new Map<string, LoadedSheet>();
const SHEET_CACHE_LIMIT = 2;

export async function loadBatchSheet(
  supabase: SupabaseClient,
  batch: { id: string; file_storage_path: string | null; sheet_name: string | null },
): Promise<LoadedSheet> {
  const cached = sheetCache.get(batch.id);
  if (cached) return cached;

  if (!batch.file_storage_path) {
    throw new BatchFileError('Berkas Excel batch ini tidak tersimpan di penyimpanan. Unggah ulang berkasnya.', 404);
  }
  const buffer = await downloadWorkbook(supabase, batch.file_storage_path);
  if (!buffer) throw new BatchFileError('Berkas Excel tidak dapat diakses dari penyimpanan.', 404);

  const { headers, allRows, rowNumbers } = parseExcelWithSmartHeader(buffer, batch.sheet_name ?? undefined);
  const sheet = { headers, allRows, rowNumbers };
  sheetCache.set(batch.id, sheet);
  if (sheetCache.size > SHEET_CACHE_LIMIT) sheetCache.delete(sheetCache.keys().next().value as string);
  return sheet;
}

export function forgetBatchSheet(batchId: string) {
  sheetCache.delete(batchId);
}

function fieldTypes(category: InventoryCategory) {
  return new Map<string, string>([...INVENTORY_FIELDS[category], ...getDerivedFields(category)].map((field) => [field.field_key, field.tipe_data]));
}

function fieldLabels(category: InventoryCategory) {
  return new Map<string, string>([...INVENTORY_FIELDS[category], ...getDerivedFields(category)].map((field) => [field.field_key, field.label]));
}

/** Returns an error message when the mapping cannot be imported for this category. */
export function checkMappings(category: InventoryCategory, mappings: Record<string, string>) {
  const types = fieldTypes(category);
  const targets = Object.values(mappings).filter((fieldKey) => fieldKey && fieldKey !== IGNORE);
  if (targets.some((fieldKey) => !types.has(fieldKey))) return 'Mapping berisi field yang bukan milik kategori ini.';
  if (new Set(targets).size !== targets.length) return 'Satu field database hanya boleh dipetakan dari satu kolom.';
  return null;
}

// Fields the dashboard and reports rely on. Each entry lists alternatives:
// mapping any one of them is enough.
const IMPORTANT_FIELDS: Record<InventoryCategory, string[][]> = {
  transformator_digunakan: [['nama_merek'], ['nomor_serial'], ['tahun_pembuatan'], ['daya_kva'], ['koordinat_raw'], ['uji_konsentrasi_ppm', '@uji_lab_ppm', '@uji_cepat_ppm']],
  transformator_tidak_digunakan: [['nama_merek'], ['nomor_serial'], ['tahun_pembuatan'], ['daya_kva'], ['koordinat_raw'], ['uji_konsentrasi_ppm', '@uji_lab_ppm', '@uji_cepat_ppm']],
  kapasitor: [['nama_merek'], ['nomor_serial'], ['tahun_pembuatan'], ['koordinat_raw'], ['status_alat']],
  minyak_dielektrik: [['merek_minyak_dielektrik'], ['volume_l'], ['koordinat_raw'], ['uji_konsentrasi_ppm', '@uji_lab_ppm', '@uji_cepat_ppm']],
};

/** Labels of important fields that no column is mapped to. */
export function missingImportantFields(category: InventoryCategory, mappings: Record<string, string>) {
  const targets = new Set(Object.values(mappings));
  const labels = fieldLabels(category);
  return IMPORTANT_FIELDS[category].filter((options) => !options.some((fieldKey) => targets.has(fieldKey))).map((options) => labels.get(options[0]) ?? options[0]);
}

// Fields whose values together identify a record, used to spot rows that are
// repeated in the file. Rows already stored are found by the database's own
// fingerprint (findRowsInDatabase).
const FINGERPRINT_FIELDS = ['kode_alat', 'no', 'nama_merek', 'merek_minyak_dielektrik', 'nomor_serial', 'tahun_pembuatan', 'daya_kva', 'volume_l', 'koordinat_raw', 'lokasi_peralatan', 'lokasi_penyimpanan'];

const fingerprintFields = (category: InventoryCategory) => {
  const own = new Set(INVENTORY_FIELDS[category].map((field) => field.field_key));
  return FINGERPRINT_FIELDS.filter((fieldKey) => own.has(fieldKey));
};

function fingerprintParts(category: InventoryCategory, record: Record<string, unknown>) {
  return fingerprintFields(category).map((fieldKey) => {
    const value = record[fieldKey];
    if (value === null || value === undefined || value === '') return '';
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
    return number !== null ? String(number) : String(value).trim().toLowerCase();
  });
}

function fingerprint(category: InventoryCategory, record: Record<string, unknown>) {
  return fingerprintParts(category, record).join('|');
}

/** Same values wherever both rows are filled in: one is a copy of the other with fields left out. */
const compatible = (a: string[], b: string[]) => a.every((value, index) => value === b[index] || value === '' || b[index] === '');

/** An earlier import batch the current one will replace, with its stored row count. */
export interface ReplaceTarget {
  id: string;
  fileName: string;
  sheetName: string | null;
  rows: number;
}

/** Checks that `replaceBatchId` can be replaced by `batch`: an imported batch of the same company and category. */
export async function loadReplaceTarget(
  supabase: SupabaseClient,
  batch: { id: string; company_id: string; jenis_data: string },
  replaceBatchId: string | null | undefined,
): Promise<ReplaceTarget | null> {
  if (!replaceBatchId) return null;
  const { data } = await supabase
    .from('import_batches')
    .select('id, company_id, jenis_data, nama_file_asli, sheet_name, status')
    .eq('id', replaceBatchId)
    .maybeSingle();
  if (!data || data.id === batch.id || data.status !== 'imported' || data.company_id !== batch.company_id || data.jenis_data !== batch.jenis_data) {
    throw new BatchFileError('Unggahan yang akan diganti tidak ditemukan, sudah diganti, atau berasal dari perusahaan atau kategori lain.', 400);
  }
  const { count, error } = await supabase.from(batch.jenis_data).select('id', { count: 'exact', head: true }).eq('import_batch_id', replaceBatchId);
  if (error) throw new Error(`Gagal menghitung data unggahan lama: ${error.message}`);
  return { id: data.id, fileName: data.nama_file_asli, sheetName: data.sheet_name, rows: count ?? 0 };
}

const EXISTING_CHECK_CHUNK = 2000;
const EXISTING_CHECK_CONCURRENCY = 3;

// The values the database fingerprint is made of, per category: must match the
// generated fingerprint columns (migration 20260929000002) exactly. Transformer
// tables also store an oil brand (merek_minyak_dielektrik); it is not their name.
function fingerprintInput(category: InventoryCategory, item: Record<string, unknown>) {
  const value = (key: string) => item[key] ?? null;
  const oil = category === 'minyak_dielektrik';
  const transformer = category === 'transformator_digunakan' || category === 'transformator_tidak_digunakan';
  return {
    unit: value('unit'),
    sub_unit: value('sub_unit'),
    kode_alat: value('kode_alat'),
    no: value('no'),
    name: oil ? value('merek_minyak_dielektrik') : value('nama_merek'),
    serial: oil ? null : value('nomor_serial'),
    tahun_pembuatan: value('tahun_pembuatan'),
    daya_kva: transformer ? value('daya_kva') : null,
    volume_l: oil ? value('volume_l') : null,
    koordinat_raw: value('koordinat_raw'),
    location: oil ? value('lokasi_penyimpanan') : value('lokasi_peralatan'),
  };
}

/**
 * Rows identical to a record this company already has in the category table,
 * found by the database (one indexed lookup per chunk). Rows of `excludeBatchId`
 * do not count: that batch is about to be replaced.
 */
export async function findRowsInDatabase(
  supabase: SupabaseClient,
  category: InventoryCategory,
  companyId: string,
  rows: TransformedRow[],
  excludeBatchId: string | null = null,
  onProgress?: (done: number, total: number) => void,
) {
  const found = new Set<TransformedRow>();
  const starts = Array.from({ length: Math.ceil(rows.length / EXISTING_CHECK_CHUNK) }, (_, index) => index * EXISTING_CHECK_CHUNK);
  let checked = 0;
  for (let group = 0; group < starts.length; group += EXISTING_CHECK_CONCURRENCY) {
    await Promise.all(starts.slice(group, group + EXISTING_CHECK_CONCURRENCY).map(async (start) => {
      const chunk = rows.slice(start, start + EXISTING_CHECK_CHUNK);
      // One array of positions (migration 20260929000003): a set of rows would be cut at the API's 1,000-row cap.
      const { data, error } = await supabase.rpc('inventory_existing_rows', {
        p_category: category,
        p_company_id: companyId,
        p_rows: chunk.map((row) => fingerprintInput(category, row.item)),
        p_exclude_batch: excludeBatchId,
      });
      if (error) throw new Error(`Gagal memeriksa data yang sudah ada: ${error.message}`);
      for (const index of (data ?? []) as number[]) found.add(chunk[index]);
      checked += chunk.length;
      onProgress?.(checked, rows.length);
    }));
  }
  return found;
}

export interface ValidationIssue {
  key: string;
  level: 'warning' | 'info';
  label: string;
  count: number;
  /** First Excel row numbers affected. */
  rows: number[];
  examples: string[];
}

/** One affected row of a finding, with the value it was reported for. */
export interface IssueRowRef {
  rowNumber: number;
  value: string | null;
}

class IssueCollector {
  private issues = new Map<string, ValidationIssue>();
  /** Every affected row per finding, kept only when asked for (the report itself lists the first few). */
  readonly rowsByKey: Map<string, IssueRowRef[]> | null;

  constructor(keepRows = false) {
    this.rowsByKey = keepRows ? new Map() : null;
  }

  add(key: string, level: ValidationIssue['level'], label: string, rowNumber: number, example?: unknown) {
    let issue = this.issues.get(key);
    if (!issue) {
      issue = { key, level, label, count: 0, rows: [], examples: [] };
      this.issues.set(key, issue);
    }
    issue.count++;
    if (issue.rows.length < 8) issue.rows.push(rowNumber);
    const text = example === undefined || example === null ? '' : String(example).slice(0, 90);
    if (text && issue.examples.length < 4 && !issue.examples.includes(text)) issue.examples.push(text);
    if (this.rowsByKey) {
      const refs = this.rowsByKey.get(key) ?? [];
      if (refs.length === 0) this.rowsByKey.set(key, refs);
      refs.push({ rowNumber, value: example === undefined || example === null ? null : String(example).slice(0, 200) });
    }
  }

  list() {
    return [...this.issues.values()].sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === 'warning' ? -1 : 1));
  }
}

// Rough bounding box of Indonesia; points outside it are almost always
// swapped or mistyped coordinates and would land in the wrong place on the map.
const INDONESIA = { minLat: -11.5, maxLat: 6.5, minLng: 94, maxLng: 141.5 };
const inIndonesia = (lat: number, lng: number) => lat >= INDONESIA.minLat && lat <= INDONESIA.maxLat && lng >= INDONESIA.minLng && lng <= INDONESIA.maxLng;

// Missing values worth reporting, per category.
const COMPLETENESS_FIELDS: Record<InventoryCategory, string[]> = {
  transformator_digunakan: ['nama_merek', 'nomor_serial', 'tahun_pembuatan', 'daya_kva', 'koordinat_raw'],
  transformator_tidak_digunakan: ['nama_merek', 'nomor_serial', 'tahun_pembuatan', 'daya_kva', 'koordinat_raw'],
  kapasitor: ['nama_merek', 'nomor_serial', 'tahun_pembuatan', 'koordinat_raw', 'status_alat'],
  minyak_dielektrik: ['merek_minyak_dielektrik', 'volume_l', 'koordinat_raw'],
};

const INSERT_CHUNK_SIZE = 1000;
const INSERT_CONCURRENCY = 3;

export interface InsertFailure {
  message: string;
  detail: string | null;
  code: string | null;
  /** Excel row number of the first row of the failed chunk. */
  rowNumber: number;
}

/**
 * Stores transformed rows for a batch in chunks. On failure the rows already
 * stored for this batch are removed, so a retry starts clean.
 */
export async function insertBatchRows(
  supabase: SupabaseClient,
  category: InventoryCategory,
  rows: TransformedRow[],
  batch: { id: string; company_id: string },
  onProgress?: (done: number, total: number) => void,
): Promise<InsertFailure | null> {
  const records = rows.map((row) => ({ ...row.item, company_id: batch.company_id, import_batch_id: batch.id }));
  const starts = Array.from({ length: Math.ceil(records.length / INSERT_CHUNK_SIZE) }, (_, index) => index * INSERT_CHUNK_SIZE);
  // A few chunks at a time: fewer round trips without flooding the database.
  for (let group = 0; group < starts.length; group += INSERT_CONCURRENCY) {
    const results = await Promise.all(starts.slice(group, group + INSERT_CONCURRENCY).map(async (start) => {
      const chunk = records.slice(start, start + INSERT_CHUNK_SIZE);
      const { error } = await supabase.from(category).insert(chunk);
      return error ? { start, chunk, error } : null;
    }));
    const failed = results.find((result) => result !== null);
    if (failed) {
      const { start, chunk, error } = failed;
      console.error(`Insert error on table ${category}`, JSON.stringify(error, null, 2));
      console.error('Sample row attempted:', JSON.stringify(chunk[0], null, 2));
      await supabase.from(category).delete().eq('import_batch_id', batch.id);
      return { message: error.message, detail: error.details ?? error.hint ?? null, code: error.code ?? null, rowNumber: rows[start].rowNumber };
    }
    onProgress?.(Math.min((group + INSERT_CONCURRENCY) * INSERT_CHUNK_SIZE, records.length), records.length);
  }
  return null;
}

/**
 * What the import changed or could not read in one row, stored with the row
 * (catatan_impor, migration 20260928000003) for the data quality report.
 */
export interface ImportNote {
  kode: string;
  jenis: 'diperbaiki' | 'dikosongkan' | 'tidak_terbaca' | 'di_luar_wilayah';
  /** Field the note is about; "koordinat" for the coordinate. */
  kolom: string;
  pesan: string;
  nilai_asli?: string;
  nilai_baru?: string;
}

const noteText = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 200));

// Heavier than the largest power transformers in the PLN data (about 400 t):
// a spreadsheet error (UID Jabar reports oil weights in the billions of kg).
const MAX_WEIGHT_KG = 1_000_000;

/**
 * Weights of a transformer row (kg): values over 1.000 t are cleared; a total
 * written in tons (dry + oil ≈ total × 1000) becomes dry + oil; a missing
 * total is dry + oil; any other total that differs from its parts is kept as
 * reported and noted in the check report. berat_ton follows the total.
 */
function checkWeights(
  item: Record<string, unknown>,
  rowNumber: number,
  note: (level: ValidationIssue['level'], entry: ImportNote, example?: unknown) => void,
  found: Array<Parameters<IssueCollector['add']>>,
) {
  for (const key of WEIGHT_FIELDS) {
    const value = item[key];
    if (typeof value === 'number' && value > MAX_WEIGHT_KG) {
      note('warning', { kode: 'weight:implausible', jenis: 'dikosongkan', kolom: key, pesan: 'Berat lebih dari 1.000 ton (tidak wajar), dikosongkan', nilai_asli: String(value) }, value);
      item[key] = null;
    }
  }
  const dry = item.berat_kering_kg;
  const oil = item.berat_minyak_kg;
  const total = item.berat_total_kg;
  if (typeof dry === 'number' && typeof oil === 'number') {
    const sum = dry + oil;
    if (typeof total !== 'number') {
      item.berat_total_kg = sum;
    } else if (Math.abs(sum - total * 1000) <= 0.02 * sum) {
      note('info', { kode: 'weight:total_in_tons', jenis: 'diperbaiki', kolom: 'berat_total_kg', pesan: 'Berat total tertulis dalam ton, diganti berat kering + minyak', nilai_asli: String(total), nilai_baru: String(sum) }, `${total} → ${sum}`);
      item.berat_total_kg = sum;
    } else if (Math.abs(sum - total) > Math.max(1, 0.02 * total)) {
      found.push(['weight:mismatch', 'info', 'Berat total tidak sama dengan berat kering + minyak (dipakai berat total yang tertulis)', rowNumber, `${dry} + ${oil} ≠ ${total}`]);
    }
  }
  if (typeof item.berat_total_kg === 'number' && (item.berat_ton === null || item.berat_ton === undefined)) {
    item.berat_ton = Number((item.berat_total_kg / 1000).toFixed(4));
  }
}

export interface TransformedRow {
  rowNumber: number;
  item: Record<string, unknown>;
  fingerprint: string;
}

export function transformRows(
  category: InventoryCategory,
  sheet: LoadedSheet,
  mappings: Record<string, string>,
  context: UnitContext = {},
  options: { keepIssueRows?: boolean } = {},
) {
  const types = fieldTypes(category);
  const labels = fieldLabels(category);
  const active = Object.entries(mappings).filter(([header, fieldKey]) => fieldKey && fieldKey !== IGNORE && sheet.headers.includes(header));
  const mappedTargets = new Set(active.map(([, fieldKey]) => fieldKey));
  const completeness = COMPLETENESS_FIELDS[category].filter((fieldKey) => mappedTargets.has(fieldKey));
  const currentYear = new Date().getFullYear();
  const issues = new IssueCollector(options.keepIssueRows);
  const rows: TransformedRow[] = [];
  // Fingerprint values of rows whose No comes from the sheet, to spot partial copies.
  const numberedParts = new Map<TransformedRow, string[]>();
  // A row's findings are reported once it is known to be imported, not for copies that are skipped.
  const findings = new Map<TransformedRow, Array<Parameters<IssueCollector['add']>>>();
  let skippedEmpty = 0;
  const records = recordMask(sheet.allRows, sheet.rowNumbers, mappings);

  sheet.allRows.forEach((rawRow, index) => {
    const rowNumber = sheet.rowNumbers[index] ?? index + 1;
    // Empty pre-filled form rows (running number / default values only) are not data.
    if (!hasIdentity(rawRow, mappings)) {
      skippedEmpty++;
      return;
    }
    if (isExampleRow(rawRow, mappings)) {
      skippedEmpty++;
      issues.add('skipped:example', 'info', 'Baris contoh dari template (CONTOH), dilewati', rowNumber);
      return;
    }
    // Leftovers pasted below the form (see recordMask) are not data either, but worth a look.
    if (!records[index]) {
      skippedEmpty++;
      issues.add('skipped:no_context', 'warning', 'Baris tanpa Unit Induk, Unit Pelaksana dan No (sisa tempelan di luar formulir), dilewati', rowNumber);
      return;
    }

    const item: Record<string, unknown> = {};
    const derived: Record<string, string | number | null> = {};
    const notes: ImportNote[] = [];
    // Reports a finding for the check report and keeps it with the row.
    const found: Array<Parameters<IssueCollector['add']>> = [];
    const note = (level: ValidationIssue['level'], entry: ImportNote, example?: unknown) => {
      found.push([entry.kode, level, entry.pesan, rowNumber, example]);
      notes.push(entry);
    };
    for (const [header, fieldKey] of active) {
      const raw = rawRow[header];
      const value = convertValue(fieldKey, types.get(fieldKey), raw);
      // A date column answered in words ("Tidak", "Tidak Pernah") just means no date.
      const wordsOnly = types.get(fieldKey) === 'date' && typeof raw === 'string' && !/\d/.test(raw);
      if (value === null && isMeaningful(raw) && !wordsOnly) {
        note('warning', {
          kode: `invalid:${fieldKey}`,
          jenis: 'dikosongkan',
          kolom: fieldKey,
          pesan: `Nilai tidak terbaca di kolom "${header}" (${labels.get(fieldKey)}), dikosongkan`,
          nilai_asli: noteText(raw),
        }, noteText(raw));
      }
      if (fieldKey.startsWith('@')) derived[fieldKey] = value;
      else item[fieldKey] = value;
    }
    applyDerivedFields(item, derived);

    // Units are normalised (PLN: canonical Unit Induk, file name as fallback).
    // Left out entirely when the sheet has no unit data at all.
    const unit = resolveUnit(item.unit, context);
    if (unit !== null || 'unit' in item) item.unit = unit;
    if ('sub_unit' in item) item.sub_unit = tidyUnitName(item.sub_unit);

    // Row numbers are required in the database; number rows sequentially when absent.
    const numbered = item.no !== null && item.no !== undefined;
    if (!numbered) item.no = rows.length + 1;

    // A year column formatted as a date holds an Excel serial (40460 = 2010).
    if (typeof item.tahun_pembuatan === 'number' && item.tahun_pembuatan > 20000 && item.tahun_pembuatan < 80000) {
      item.tahun_pembuatan = new Date(Date.UTC(1899, 11, 30) + item.tahun_pembuatan * 86400000).getUTCFullYear();
    }
    if (item.tahun_pembuatan === 0) item.tahun_pembuatan = null;
    if (typeof item.tahun_pembuatan === 'number' && (item.tahun_pembuatan < 1900 || item.tahun_pembuatan > currentYear)) {
      note('warning', { kode: 'invalid:tahun_range', jenis: 'dikosongkan', kolom: 'tahun_pembuatan', pesan: `Tahun pembuatan di luar 1900–${currentYear}, dikosongkan`, nilai_asli: String(item.tahun_pembuatan) }, item.tahun_pembuatan);
      item.tahun_pembuatan = null;
    }
    checkWeights(item, rowNumber, note, found);
    if (typeof item.uji_konsentrasi_ppm === 'number' && item.uji_konsentrasi_ppm < 0) {
      note('warning', { kode: 'invalid:ppm_negative', jenis: 'dikosongkan', kolom: 'uji_konsentrasi_ppm', pesan: 'Konsentrasi PCBs negatif, dikosongkan', nilai_asli: String(item.uji_konsentrasi_ppm) }, item.uji_konsentrasi_ppm);
      item.uji_konsentrasi_ppm = null;
    }

    if (typeof item.koordinat_raw === 'string') {
      const raw = item.koordinat_raw;
      const parsed = parseDMSCoordinate(raw);
      const lat = parsed.latitude as number;
      const lng = parsed.longitude as number;
      if (parsed.isValid && inIndonesia(lat, lng)) {
        item.koordinat_lat = lat;
        item.koordinat_lng = lng;
      } else if (parsed.isValid && inIndonesia(lng, lat)) {
        // Indonesia's latitude and longitude ranges do not overlap, so a swap is unambiguous.
        item.koordinat_lat = lng;
        item.koordinat_lng = lat;
        note('info', { kode: 'coordinate:swapped', jenis: 'diperbaiki', kolom: 'koordinat', pesan: 'Koordinat tertukar lintang/bujur, dibalik otomatis', nilai_asli: raw, nilai_baru: `${lng}, ${lat}` }, raw);
      } else {
        const repaired = repairIndonesianCoordinate(raw);
        if (repaired) {
          item.koordinat_lat = repaired.latitude;
          item.koordinat_lng = repaired.longitude;
          const fixed = `${repaired.latitude}, ${repaired.longitude}`;
          note('info', { kode: 'coordinate:repaired', jenis: 'diperbaiki', kolom: 'koordinat', pesan: 'Koordinat berformat tidak baku, diperbaiki otomatis (periksa contoh)', nilai_asli: raw, nilai_baru: fixed }, `${raw} → ${fixed}`);
        } else if (!parsed.isValid) {
          note('warning', { kode: 'coordinate:unreadable', jenis: 'tidak_terbaca', kolom: 'koordinat', pesan: 'Koordinat tidak terbaca (tidak tampil di peta)', nilai_asli: raw }, raw);
        } else {
          note('warning', { kode: 'coordinate:outside', jenis: 'di_luar_wilayah', kolom: 'koordinat', pesan: 'Koordinat di luar wilayah Indonesia (tidak tampil di peta)', nilai_asli: raw, nilai_baru: `${lat}, ${lng}` }, raw);
        }
      }
    }

    for (const fieldKey of completeness) {
      if (item[fieldKey] === null || item[fieldKey] === undefined) {
        found.push([`missing:${fieldKey}`, 'info', `Tanpa ${labels.get(fieldKey)?.toLowerCase()}`, rowNumber]);
      }
    }

    item.catatan_impor = notes.length > 0 ? notes : null;
    item.baris_excel = rowNumber;
    const row = { rowNumber, item, fingerprint: fingerprint(category, item) };
    rows.push(row);
    findings.set(row, found);
    if (numbered) numberedParts.set(row, fingerprintParts(category, item));
  });

  // Records repeated inside the file are imported once: identical rows, and
  // rows with the same unit and No that only leave fields out (UID Lampung
  // pasted its offline transformers twice, the second time without serial
  // numbers). Unit and sub-unit count here: two units may both report "No 1".
  const identical = new Map<string, number>();
  const byNumber = new Map<string, Array<{ rowNumber: number; parts: string[] }>>();
  const unique = rows.filter((row) => {
    const place = `${row.item.unit ?? ''}|${row.item.sub_unit ?? ''}`;
    const key = `${place}|${row.fingerprint}`;
    const parts = numberedParts.get(row);
    const earlier = parts ? byNumber.get(`${place}|${row.item.no}`) ?? [] : [];
    const first = identical.get(key) ?? earlier.find((other) => compatible(other.parts, parts as string[]))?.rowNumber;
    if (first === undefined) {
      identical.set(key, row.rowNumber);
      if (parts) byNumber.set(`${place}|${row.item.no}`, [...earlier, { rowNumber: row.rowNumber, parts }]);
      for (const finding of findings.get(row) ?? []) issues.add(...finding);
      return true;
    }
    issues.add('duplicate:file', 'warning', 'Baris kembar di dalam file (salinan baris lain), dilewati', row.rowNumber, `sama dengan baris ${first}`);
    return false;
  });

  return { rows: unique, skippedEmpty, skippedCopies: rows.length - unique.length, issues };
}

/**
 * The check report kept with an import batch (laporan_pemeriksaan), so what
 * was found at upload can be reviewed later in the upload history.
 */
export interface CheckReport {
  checkedAt: string;
  dataRows: number;
  skippedEmpty: number;
  skippedDuplicates: number;
  importedRows: number;
  issues: ValidationIssue[];
  /** Column mapping used for the import, so the rows it skipped can be read from the workbook later. */
  mappings?: Record<string, string>;
  /** The earlier upload this import replaced, and how many of its rows were removed. */
  replaced?: { batchId: string; fileName: string; sheetName: string | null; deletedRows: number };
}

export function buildCheckReport(
  result: { rows: TransformedRow[]; skippedEmpty: number; skippedCopies: number; issues: IssueCollector },
  importedRows: number,
  mappings: Record<string, string>,
): CheckReport {
  return {
    checkedAt: new Date().toISOString(),
    dataRows: result.rows.length,
    skippedEmpty: result.skippedEmpty,
    skippedDuplicates: result.skippedCopies + result.rows.length - importedRows,
    importedRows,
    issues: result.issues.list(),
    mappings,
  };
}

/** A row behind a finding, with what the admin needs to find the equipment in the workbook. */
export interface IssueRowDetail {
  /** Excel row number; null for rows imported before it was stored. */
  rowNumber: number | null;
  unit: string | null;
  subUnit: string | null;
  no: string | null;
  code: string | null;
  name: string | null;
  serial: string | null;
  location: string | null;
  /** The value the finding is about ("Kmp. Baru", "'-6.79 , '106.09 → -6.79, 106.09", "sama dengan baris 10"). */
  value: string | null;
}

// Where to read each identifying detail; the first mapped field wins.
const DETAIL_FIELDS = {
  unit: ['unit'],
  subUnit: ['sub_unit'],
  no: ['no'],
  code: ['kode_alat'],
  name: ['nama_merek', 'merek_minyak_dielektrik'],
  serial: ['nomor_serial'],
  location: ['lokasi_peralatan', 'lokasi_penyimpanan'],
} as const;

/**
 * Identifying details of the given rows, read from the workbook (unit names
 * canonical, as stored on import).
 * Rows that were skipped (copies, leftovers) are covered too, since they are
 * never transformed.
 */
export function describeIssueRows(sheet: LoadedSheet, mappings: Record<string, string>, refs: IssueRowRef[], context: UnitContext = {}): IssueRowDetail[] {
  const headerFor = new Map<string, string>();
  for (const [header, fieldKey] of Object.entries(mappings)) if (fieldKey && fieldKey !== IGNORE && !headerFor.has(fieldKey)) headerFor.set(fieldKey, header);
  const indexOf = new Map(sheet.rowNumbers.map((rowNumber, index) => [rowNumber, index]));
  const read = (row: Record<string, unknown> | undefined, fieldKeys: readonly string[]) => {
    for (const fieldKey of fieldKeys) {
      const header = headerFor.get(fieldKey);
      const value = header && row ? row[header] : undefined;
      if (isMeaningful(value)) return noteText(value).replace(/\s+/g, ' ').trim().slice(0, 80);
    }
    return null;
  };
  return refs.map(({ rowNumber, value }) => {
    const index = indexOf.get(rowNumber);
    const row = index === undefined ? undefined : sheet.allRows[index];
    // Canonical names as stored on import; a row without a unit (a leftover) stays without one.
    const unit = read(row, DETAIL_FIELDS.unit);
    const subUnit = read(row, DETAIL_FIELDS.subUnit);
    return {
      rowNumber,
      unit: unit && resolveUnit(unit, context),
      subUnit: subUnit && tidyUnitName(subUnit),
      no: read(row, DETAIL_FIELDS.no),
      code: read(row, DETAIL_FIELDS.code),
      name: read(row, DETAIL_FIELDS.name),
      serial: read(row, DETAIL_FIELDS.serial),
      location: read(row, DETAIL_FIELDS.location),
      value,
    };
  });
}

/** Example values per column, to help the admin judge a mapping at a glance. */
export function sampleValues(sheet: LoadedSheet, limit = 3) {
  const samples: Record<string, string[]> = {};
  for (const header of sheet.headers) {
    const values: string[] = [];
    for (const row of sheet.allRows.slice(0, 500)) {
      const value = row[header];
      if (!isMeaningful(value)) continue;
      const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).replace(/\s+/g, ' ').trim().slice(0, 50);
      if (!values.includes(text)) values.push(text);
      if (values.length >= limit) break;
    }
    samples[header] = values;
  }
  return samples;
}

/** What the dashboard tiles will show for these rows (transformers only). */
export function dashboardPreview(category: InventoryCategory, rows: TransformedRow[]) {
  if (!category.startsWith('transformator')) return null;
  const years = rows.map((row) => row.item.tahun_pembuatan).filter((year): year is number => typeof year === 'number');
  const lab = rows.filter((row) => row.item.uji_jenis === 'Uji lab' && typeof row.item.uji_konsentrasi_ppm === 'number');
  return {
    before1997: years.filter((year) => year < 1997).length,
    from1997: years.filter((year) => year >= 1997).length,
    unknownYear: rows.length - years.length,
    labTested: lab.length,
    labAtLeast50: lab.filter((row) => (row.item.uji_konsentrasi_ppm as number) >= 50).length,
  };
}
