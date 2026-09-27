import type { SupabaseClient } from '@supabase/supabase-js';
import { parseExcelWithSmartHeader } from '@/lib/excel';
import { parseDMSCoordinate, repairIndonesianCoordinate } from '@/lib/dms';
import { INVENTORY_FIELDS, type InventoryCategory } from '@/lib/inventory';
import { applyDerivedFields, convertValue, getDerivedFields, hasIdentity, IGNORE, isMeaningful } from '@/lib/import-profiles';
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
// repeated in the file or were already imported (e.g. a re-uploaded sheet).
const FINGERPRINT_FIELDS = ['kode_alat', 'no', 'nama_merek', 'merek_minyak_dielektrik', 'nomor_serial', 'tahun_pembuatan', 'daya_kva', 'volume_l', 'koordinat_raw', 'lokasi_peralatan', 'lokasi_penyimpanan'];

const fingerprintFields = (category: InventoryCategory) => {
  const own = new Set(INVENTORY_FIELDS[category].map((field) => field.field_key));
  return FINGERPRINT_FIELDS.filter((fieldKey) => own.has(fieldKey));
};

function fingerprint(category: InventoryCategory, record: Record<string, unknown>) {
  return fingerprintFields(category).map((fieldKey) => {
    const value = record[fieldKey];
    if (value === null || value === undefined || value === '') return '';
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
    return number !== null ? String(number) : String(value).trim().toLowerCase();
  }).join('|');
}

/** Fingerprints of this company's rows already stored in the category table. */
export async function fetchExistingFingerprints(supabase: SupabaseClient, category: InventoryCategory, companyId: string) {
  const columns = fingerprintFields(category).join(', ');
  const fingerprints = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(category).select(columns).eq('company_id', companyId).order('id').range(from, from + pageSize - 1);
    if (error) throw new Error(`Gagal memeriksa data yang sudah ada: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) fingerprints.add(fingerprint(category, row));
    if (!data || data.length < pageSize) break;
  }
  return fingerprints;
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

class IssueCollector {
  private issues = new Map<string, ValidationIssue>();

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

const INSERT_CHUNK_SIZE = 500;

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
export async function insertBatchRows(supabase: SupabaseClient, category: InventoryCategory, rows: TransformedRow[], batch: { id: string; company_id: string }): Promise<InsertFailure | null> {
  const records = rows.map((row) => ({ ...row.item, company_id: batch.company_id, import_batch_id: batch.id }));
  for (let start = 0; start < records.length; start += INSERT_CHUNK_SIZE) {
    const chunk = records.slice(start, start + INSERT_CHUNK_SIZE);
    const { error } = await supabase.from(category).insert(chunk);
    if (error) {
      console.error(`Insert error on table ${category}`, JSON.stringify(error, null, 2));
      console.error('Sample row attempted:', JSON.stringify(chunk[0], null, 2));
      if (start > 0) await supabase.from(category).delete().eq('import_batch_id', batch.id);
      return { message: error.message, detail: error.details ?? error.hint ?? null, code: error.code ?? null, rowNumber: rows[start].rowNumber };
    }
  }
  return null;
}

export interface TransformedRow {
  rowNumber: number;
  item: Record<string, unknown>;
  fingerprint: string;
}

export function transformRows(category: InventoryCategory, sheet: LoadedSheet, mappings: Record<string, string>, context: UnitContext = {}) {
  const types = fieldTypes(category);
  const labels = fieldLabels(category);
  const active = Object.entries(mappings).filter(([header, fieldKey]) => fieldKey && fieldKey !== IGNORE && sheet.headers.includes(header));
  const mappedTargets = new Set(active.map(([, fieldKey]) => fieldKey));
  const completeness = COMPLETENESS_FIELDS[category].filter((fieldKey) => mappedTargets.has(fieldKey));
  const currentYear = new Date().getFullYear();
  const issues = new IssueCollector();
  const rows: TransformedRow[] = [];
  let skippedEmpty = 0;

  sheet.allRows.forEach((rawRow, index) => {
    const rowNumber = sheet.rowNumbers[index] ?? index + 1;
    // Empty pre-filled form rows (running number / default values only) are not data.
    if (!hasIdentity(rawRow, mappings)) {
      skippedEmpty++;
      return;
    }

    const item: Record<string, unknown> = {};
    const derived: Record<string, string | number | null> = {};
    for (const [header, fieldKey] of active) {
      const raw = rawRow[header];
      const value = convertValue(fieldKey, types.get(fieldKey), raw);
      // A date column answered in words ("Tidak", "Tidak Pernah") just means no date.
      const wordsOnly = types.get(fieldKey) === 'date' && typeof raw === 'string' && !/\d/.test(raw);
      if (value === null && isMeaningful(raw) && !wordsOnly) {
        issues.add(`invalid:${fieldKey}`, 'warning', `Nilai tidak terbaca di kolom "${header}" (${labels.get(fieldKey)}), dikosongkan`, rowNumber, raw instanceof Date ? raw.toISOString().slice(0, 10) : raw);
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
    if (item.no === null || item.no === undefined) item.no = rows.length + 1;

    // A year column formatted as a date holds an Excel serial (40460 = 2010).
    if (typeof item.tahun_pembuatan === 'number' && item.tahun_pembuatan > 20000 && item.tahun_pembuatan < 80000) {
      item.tahun_pembuatan = new Date(Date.UTC(1899, 11, 30) + item.tahun_pembuatan * 86400000).getUTCFullYear();
    }
    if (item.tahun_pembuatan === 0) item.tahun_pembuatan = null;
    if (typeof item.tahun_pembuatan === 'number' && (item.tahun_pembuatan < 1900 || item.tahun_pembuatan > currentYear)) {
      issues.add('invalid:tahun_range', 'warning', `Tahun pembuatan di luar 1900–${currentYear}, dikosongkan`, rowNumber, item.tahun_pembuatan);
      item.tahun_pembuatan = null;
    }
    if (typeof item.uji_konsentrasi_ppm === 'number' && item.uji_konsentrasi_ppm < 0) {
      issues.add('invalid:ppm_negative', 'warning', 'Konsentrasi PCBs negatif, dikosongkan', rowNumber, item.uji_konsentrasi_ppm);
      item.uji_konsentrasi_ppm = null;
    }

    if (typeof item.koordinat_raw === 'string') {
      const parsed = parseDMSCoordinate(item.koordinat_raw);
      const lat = parsed.latitude as number;
      const lng = parsed.longitude as number;
      if (parsed.isValid && inIndonesia(lat, lng)) {
        item.koordinat_lat = lat;
        item.koordinat_lng = lng;
      } else if (parsed.isValid && inIndonesia(lng, lat)) {
        // Indonesia's latitude and longitude ranges do not overlap, so a swap is unambiguous.
        item.koordinat_lat = lng;
        item.koordinat_lng = lat;
        issues.add('coordinate:swapped', 'info', 'Koordinat tertukar lintang/bujur, dibalik otomatis', rowNumber, item.koordinat_raw);
      } else {
        const repaired = repairIndonesianCoordinate(item.koordinat_raw);
        if (repaired) {
          item.koordinat_lat = repaired.latitude;
          item.koordinat_lng = repaired.longitude;
          issues.add('coordinate:repaired', 'info', 'Koordinat berformat tidak baku, diperbaiki otomatis (periksa contoh)', rowNumber, `${item.koordinat_raw} → ${repaired.latitude}, ${repaired.longitude}`);
        } else if (!parsed.isValid) {
          issues.add('coordinate:unreadable', 'warning', 'Koordinat tidak terbaca (tidak tampil di peta)', rowNumber, item.koordinat_raw);
        } else {
          issues.add('coordinate:outside', 'warning', 'Koordinat di luar wilayah Indonesia (tidak tampil di peta)', rowNumber, item.koordinat_raw);
        }
      }
    }

    for (const fieldKey of completeness) {
      if (item[fieldKey] === null || item[fieldKey] === undefined) {
        issues.add(`missing:${fieldKey}`, 'info', `Tanpa ${labels.get(fieldKey)?.toLowerCase()}`, rowNumber);
      }
    }

    rows.push({ rowNumber, item, fingerprint: fingerprint(category, item) });
  });

  // Identical records inside the file (copy-pasted rows).
  const seen = new Map<string, number>();
  for (const row of rows) {
    const first = seen.get(row.fingerprint);
    if (first === undefined) seen.set(row.fingerprint, row.rowNumber);
    else issues.add('duplicate:file', 'warning', 'Baris kembar di dalam file (isi identik dengan baris lain)', row.rowNumber, `sama dengan baris ${first}`);
  }

  return { rows, skippedEmpty, issues };
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
