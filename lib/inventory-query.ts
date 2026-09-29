import type { SupabaseClient } from '@supabase/supabase-js';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import type { IssueRowDetail } from '@/lib/import-transform';

/**
 * Dashboard data access. Figures come from the `inventory_stats` function and
 * table rows from the `inventory_items` view one page at a time, because a
 * Supabase request returns at most 1000 rows (see migration 20260926000002).
 */

export interface CategoryStats {
  total: number;
  before_1997: number;
  from_1997: number;
  unknown_year: number;
  tested: number;
  lab_tested: number;
  lab_below_50: number;
  lab_at_least_50: number;
  risk_safe: number;
  risk_moderate: number;
  risk_high: number;
  /** Tested rows and risk classes among rows made before 1997 (tahun_pembuatan < 1997). */
  pre1997_tested: number;
  pre1997_risk_safe: number;
  pre1997_risk_moderate: number;
  pre1997_risk_high: number;
  volume_l: number;
  with_coordinates: number;
  /** Rows with a total weight, and the weights summed in kg (migration 20260929000004). */
  with_weight: number;
  weight_kg: number;
  /** Dry and oil weight, over the rows that report both (with_weight_parts; migration 20260929000005). */
  with_weight_parts: number;
  weight_dry_kg: number;
  weight_oil_kg: number;
  /** Total weight per PCBs risk class, and of equipment made before 1997 (all, untested). */
  weight_safe_kg: number;
  weight_moderate_kg: number;
  weight_high_kg: number;
  weight_untested_kg: number;
  pre1997_weight_kg: number;
  pre1997_weight_untested_kg: number;
}

export type InventoryStats = Record<InventoryCategory, CategoryStats>;

const EMPTY_STATS: CategoryStats = {
  total: 0, before_1997: 0, from_1997: 0, unknown_year: 0, tested: 0, lab_tested: 0, lab_below_50: 0,
  lab_at_least_50: 0, risk_safe: 0, risk_moderate: 0, risk_high: 0, pre1997_tested: 0, pre1997_risk_safe: 0,
  pre1997_risk_moderate: 0, pre1997_risk_high: 0, volume_l: 0, with_coordinates: 0, with_weight: 0, with_weight_parts: 0,
  weight_kg: 0, weight_dry_kg: 0, weight_oil_kg: 0, weight_safe_kg: 0, weight_moderate_kg: 0, weight_high_kg: 0,
  weight_untested_kg: 0, pre1997_weight_kg: 0, pre1997_weight_untested_kg: 0,
};

/** Company, unit and sub-unit a dashboard is narrowed to; null means all. */
export interface DashboardScope {
  companyId: string | null;
  unit: string | null;
  subUnit: string | null;
}

export const ALL_SCOPE: DashboardScope = { companyId: null, unit: null, subUnit: null };

export async function fetchInventoryStats(supabase: SupabaseClient, scope: DashboardScope = ALL_SCOPE): Promise<InventoryStats> {
  // The unit arguments need migration 20260928000002; leave them out when unused.
  const args: Record<string, string | null> = { p_company_id: scope.companyId };
  if (scope.unit) args.p_unit = scope.unit;
  if (scope.subUnit) args.p_sub_unit = scope.subUnit;
  const { data, error } = await supabase.rpc('inventory_stats', args);
  if (error) throw new Error(`Gagal memuat ringkasan: ${error.message}`);
  const raw = (data ?? {}) as Partial<Record<InventoryCategory, Partial<CategoryStats>>>;
  return Object.fromEntries(
    INVENTORY_CATEGORIES.map(({ key }) => [key, { ...EMPTY_STATS, ...Object.fromEntries(Object.entries(raw[key] ?? {}).map(([name, value]) => [name, Number(value) || 0])) }]),
  ) as InventoryStats;
}

/** Sum a figure over several categories. */
export const sumStats = (stats: InventoryStats, categories: InventoryCategory[], key: keyof CategoryStats) =>
  categories.reduce((sum, category) => sum + stats[category][key], 0);

/** Risk classes of the rows made before 1997, for the dashboard's second donut. */
export function pre1997RiskCounts(stats: InventoryStats | null, categories: InventoryCategory[]) {
  const sum = (key: keyof CategoryStats) => (stats ? sumStats(stats, categories, key) : 0);
  return {
    safe: sum('pre1997_risk_safe'),
    moderate: sum('pre1997_risk_moderate'),
    high: sum('pre1997_risk_high'),
    untested: sum('before_1997') - sum('pre1997_tested'),
  };
}

/** Table filter for the rows counted by pre1997RiskCounts (tahun_pembuatan < 1997). */
export const PRE_1997_FILTER: Partial<InventoryFilters> = { yearRange: 'custom', yearMin: null, yearMax: 1996 };

/** A row of the `inventory_items` view. */
export interface InventoryRow {
  id: string;
  category: InventoryCategory;
  company_id: string;
  no: number | null;
  name: string | null;
  serial: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  tahun_pembuatan: number | null;
  uji_jenis: string | null;
  ppm: number | null;
  status: string | null;
  daya_kva: number | null;
  volume_l: number | null;
  created_at: string;
  import_batch_id?: string | null;
  unit?: string | null;
  sub_unit?: string | null;
  kode_alat?: string | null;
  koordinat_raw?: string | null;
  catatan_impor?: ImportNoteRow[] | null;
  baris_excel?: number | null;
  /** Transformers only (migration 20260929000004). */
  berat_kering_kg?: number | null;
  berat_minyak_kg?: number | null;
  berat_total_kg?: number | null;
}

/** One entry of a row's catatan_impor (see ImportNote in lib/import-transform.ts). */
export interface ImportNoteRow {
  kode: string;
  jenis: 'diperbaiki' | 'dikosongkan' | 'tidak_terbaca' | 'di_luar_wilayah';
  kolom: string;
  pesan: string;
  nilai_asli?: string;
  nilai_baru?: string;
}

export type CategoryFilter = InventoryCategory | 'transformator' | 'all';
export type PcbRange = 'all' | 'safe' | 'moderate' | 'high' | 'untested';
export type TestFilter = 'all' | 'lab' | 'cepat' | 'none';
export type YearRange = 'all' | 'pre1985' | '1985_1996' | 'from1997' | 'unknown' | 'custom';
export type CoordinateFilter = 'all' | 'with' | 'without' | 'empty' | 'unreadable' | 'fixed';
export type MissingFilter = 'all' | 'serial' | 'name' | 'year' | 'location' | 'daya' | 'volume' | 'code' | 'cleared';
export type AddedWithin = 'all' | '1d' | '7d' | '30d';
export type InventorySort = 'newest' | 'oldest' | 'ppm_desc' | 'year_asc' | 'year_desc' | 'daya_desc' | 'name_asc';

/** Table filters besides category and free-text search. */
export interface InventoryFilters {
  companyId: string | null;
  /** Unit and sub-unit within the company (PLN: Unit Induk / Unit Pelaksana). */
  unit: string | null;
  subUnit: string | null;
  pcbRange: PcbRange;
  test: TestFilter;
  yearRange: YearRange;
  /** Inclusive bounds, used when yearRange is 'custom'. */
  yearMin: number | null;
  yearMax: number | null;
  dayaMin: number | null;
  dayaMax: number | null;
  coordinates: CoordinateFilter;
  missing: MissingFilter;
  batchId: string | null;
  addedWithin: AddedWithin;
  /** Rows under one map marker (all rows sharing its coordinates), with a label for the filter chip. */
  mapPoint: { ids: string[]; label: string } | null;
  /** Rows with one import note (catatan_impor kode, e.g. coordinate:unreadable), with a label for the filter chip. */
  note: { kode: string; label: string } | null;
}

export const DEFAULT_FILTERS: InventoryFilters = {
  companyId: null,
  unit: null,
  subUnit: null,
  pcbRange: 'all',
  test: 'all',
  yearRange: 'all',
  yearMin: null,
  yearMax: null,
  dayaMin: null,
  dayaMax: null,
  coordinates: 'all',
  missing: 'all',
  batchId: null,
  addedWithin: 'all',
  mapPoint: null,
  note: null,
};

/** Table filter for the rows under one map marker. */
export function mapPointFilter(points: Array<{ id: string; name: string; latitude: number; longitude: number }>): NonNullable<InventoryFilters['mapPoint']> {
  const [first] = points;
  const where = `${first.latitude.toFixed(5)}, ${first.longitude.toFixed(5)}`;
  const label = points.length === 1 ? `Titik peta: ${first.name || 'Tanpa nama'} (${where})` : `Titik peta: ${points.length} data di ${where}`;
  return { ids: points.map((point) => point.id), label };
}

export interface InventoryPageQuery {
  category: CategoryFilter;
  search: string;
  filters: InventoryFilters;
  sort: InventorySort;
  page: number;
  pageSize: number;
}

export const TRAFO_CATEGORIES: InventoryCategory[] = ['transformator_digunakan', 'transformator_tidak_digunakan'];

// PostgREST filter syntax treats these characters specially inside or().
const cleanSearch = (value: string) => value.replace(/[,()*%\\:"]/g, ' ').trim();

const DAY_MS = 24 * 60 * 60 * 1000;
const ADDED_WITHIN_DAYS: Record<Exclude<AddedWithin, 'all'>, number> = { '1d': 1, '7d': 7, '30d': 30 };

const SORTS: Record<InventorySort, Array<[column: string, ascending: boolean]>> = {
  newest: [['created_at', false], ['id', false]],
  oldest: [['created_at', true], ['id', true]],
  ppm_desc: [['ppm', false], ['id', false]],
  year_asc: [['tahun_pembuatan', true], ['id', true]],
  year_desc: [['tahun_pembuatan', false], ['id', false]],
  daya_desc: [['daya_kva', false], ['id', false]],
  name_asc: [['name', true], ['id', true]],
};

// jsonb containment on catatan_impor. supabase-js sends a JS array as a
// Postgres array literal ({…}), which jsonb rejects, so pass JSON text.
const noteMatch = (entry: Partial<ImportNoteRow>) => JSON.stringify([entry]);

// The builder returned by select() on inventory_items, which every filter below keeps.
type InventoryRequest = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

/** Category and table filters, shared by the table and the rows behind a check finding. */
function applyFilters(request: InventoryRequest, category: CategoryFilter, filters: InventoryFilters) {
  if (category === 'transformator') request = request.in('category', TRAFO_CATEGORIES);
  else if (category !== 'all') request = request.eq('category', category);
  if (filters.companyId) request = request.eq('company_id', filters.companyId);
  if (filters.unit) request = request.eq('unit', filters.unit);
  if (filters.subUnit) request = request.eq('sub_unit', filters.subUnit);
  if (filters.batchId) request = request.eq('import_batch_id', filters.batchId);
  if (filters.mapPoint) request = request.in('id', filters.mapPoint.ids);
  if (filters.note) request = request.contains('catatan_impor', noteMatch({ kode: filters.note.kode }));

  // Bounds of PCB_CLASSES in lib/inventory.ts.
  if (filters.pcbRange === 'safe') request = request.lt('ppm', 2);
  else if (filters.pcbRange === 'moderate') request = request.gte('ppm', 2).lte('ppm', 50);
  else if (filters.pcbRange === 'high') request = request.gt('ppm', 50);
  else if (filters.pcbRange === 'untested') request = request.is('ppm', null);

  if (filters.test === 'lab') request = request.ilike('uji_jenis', '%lab%').not('ppm', 'is', null);
  else if (filters.test === 'cepat') request = request.ilike('uji_jenis', '%cepat%').not('ppm', 'is', null);
  else if (filters.test === 'none') request = request.is('ppm', null);

  // Year bands follow the regulation's split: equipment made before 1997 may contain PCBs.
  if (filters.yearRange === 'pre1985') request = request.lt('tahun_pembuatan', 1985);
  else if (filters.yearRange === '1985_1996') request = request.gte('tahun_pembuatan', 1985).lte('tahun_pembuatan', 1996);
  else if (filters.yearRange === 'from1997') request = request.gte('tahun_pembuatan', 1997);
  else if (filters.yearRange === 'unknown') request = request.is('tahun_pembuatan', null);
  else if (filters.yearRange === 'custom') {
    if (filters.yearMin !== null) request = request.gte('tahun_pembuatan', filters.yearMin);
    if (filters.yearMax !== null) request = request.lte('tahun_pembuatan', filters.yearMax);
  }

  if (filters.dayaMin !== null) request = request.gte('daya_kva', filters.dayaMin);
  if (filters.dayaMax !== null) request = request.lte('daya_kva', filters.dayaMax);

  if (filters.coordinates === 'with') request = request.not('lat', 'is', null);
  else if (filters.coordinates === 'without') request = request.is('lat', null);
  else if (filters.coordinates === 'empty') request = request.is('lat', null).is('koordinat_raw', null);
  else if (filters.coordinates === 'unreadable') request = request.is('lat', null).not('koordinat_raw', 'is', null);
  else if (filters.coordinates === 'fixed') request = request.contains('catatan_impor', noteMatch({ jenis: 'diperbaiki', kolom: 'koordinat' }));

  // Serial number and year apply to equipment, power to transformers and
  // volume to oil, as in inventory_quality (migration 20260928000003).
  if (filters.missing === 'serial') request = request.is('serial', null).neq('category', 'minyak_dielektrik');
  else if (filters.missing === 'name') request = request.is('name', null);
  else if (filters.missing === 'year') request = request.is('tahun_pembuatan', null).neq('category', 'minyak_dielektrik');
  else if (filters.missing === 'location') request = request.is('location', null);
  else if (filters.missing === 'daya') request = request.is('daya_kva', null).in('category', TRAFO_CATEGORIES);
  else if (filters.missing === 'volume') request = request.is('volume_l', null).eq('category', 'minyak_dielektrik');
  else if (filters.missing === 'code') request = request.is('kode_alat', null);
  else if (filters.missing === 'cleared') request = request.contains('catatan_impor', noteMatch({ jenis: 'dikosongkan' }));

  if (filters.addedWithin !== 'all') {
    request = request.gte('created_at', new Date(Date.now() - ADDED_WITHIN_DAYS[filters.addedWithin] * DAY_MS).toISOString());
  }
  return request;
}

export async function fetchInventoryPage(supabase: SupabaseClient, query: InventoryPageQuery) {
  let request = applyFilters(supabase.from('inventory_items').select('*', { count: 'exact' }), query.category, query.filters);

  const term = cleanSearch(query.search);
  if (term) request = request.or(`name.ilike.*${term}*,serial.ilike.*${term}*,location.ilike.*${term}*,kode_alat.ilike.*${term}*`);

  for (const [column, ascending] of SORTS[query.sort]) {
    request = request.order(column, { ascending, nullsFirst: false });
  }
  const from = (query.page - 1) * query.pageSize;
  const { data, error, count } = await request.range(from, from + query.pageSize - 1);
  if (error) throw new Error(`Gagal memuat data: ${error.message}`);
  return { rows: (data ?? []) as InventoryRow[], total: count ?? 0 };
}

// Completeness findings of the pre-import check (missing:<field>) and the table filter showing them.
const MISSING_FINDINGS: Record<string, Partial<InventoryFilters>> = {
  'missing:nomor_serial': { missing: 'serial' },
  'missing:nama_merek': { missing: 'name' },
  'missing:merek_minyak_dielektrik': { missing: 'name' },
  'missing:tahun_pembuatan': { missing: 'year' },
  'missing:daya_kva': { missing: 'daya' },
  'missing:volume_l': { missing: 'volume' },
  'missing:koordinat_raw': { coordinates: 'empty' },
};

/**
 * Table filter for the imported rows of one check finding, or null when the
 * rows cannot be found in the database: copies and leftovers were never
 * imported. Other findings are stored per row as a note with the same key.
 */
export function issueTableFilter(key: string, label: string): Partial<InventoryFilters> | null {
  if (key.startsWith('missing:')) return MISSING_FINDINGS[key] ?? null;
  // Not kept with the row: read from the workbook. weight:mismatch keeps the reported total, so it is only a finding.
  if (key.startsWith('duplicate:') || key.startsWith('skipped:') || key === 'weight:mismatch') return null;
  return { note: { kode: key, label } };
}

/** Rows of one check finding of an import batch, opened from the upload history. */
export interface IssueLink {
  batchId: string;
  key: string;
  label: string;
}

/** Link to a category dashboard showing the imported rows of one finding. */
export function issueLinkHref(category: InventoryCategory, link: IssueLink) {
  const query = new URLSearchParams({ batch: link.batchId, temuan: link.key, label: link.label });
  return `/dashboard/${category.replace(/_/g, '-')}?${query}`;
}

/** Reads an IssueLink from a category dashboard's query string (see issueLinkHref). */
export function issueLinkFromParams(params: Record<string, string | string[] | undefined>): IssueLink | undefined {
  const value = (name: string) => (typeof params[name] === 'string' ? params[name] : undefined);
  const batchId = value('batch');
  const key = value('temuan');
  return batchId && key ? { batchId, key, label: value('label') ?? key } : undefined;
}

/** Imported rows of one check finding of a batch, in workbook order. */
export async function fetchIssueRows(
  supabase: SupabaseClient,
  batch: { id: string; jenis_data: InventoryCategory },
  issue: { key: string; label: string },
  offset: number,
  limit: number,
): Promise<{ total: number; rows: IssueRowDetail[] }> {
  const filter = issueTableFilter(issue.key, issue.label);
  if (!filter) return { total: 0, rows: [] };
  const request = applyFilters(
    supabase.from('inventory_items').select('id, baris_excel, unit, sub_unit, no, kode_alat, name, serial, location, catatan_impor', { count: 'exact' }),
    batch.jenis_data,
    { ...DEFAULT_FILTERS, ...filter, batchId: batch.id },
  );
  const { data, error, count } = await request
    .order('baris_excel', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Gagal memuat baris: ${error.message}`);
  const rows = ((data ?? []) as unknown as InventoryRow[]).map((row) => {
    const note = row.catatan_impor?.find((entry) => entry.kode === issue.key);
    return {
      rowNumber: row.baris_excel ?? null,
      unit: row.unit ?? null,
      subUnit: row.sub_unit ?? null,
      no: row.no === null ? null : String(row.no),
      code: row.kode_alat ?? null,
      name: row.name,
      serial: row.serial,
      location: row.location,
      value: note ? [note.nilai_asli, note.nilai_baru].filter(Boolean).join(' → ') || null : null,
    };
  });
  return { total: count ?? 0, rows };
}

/** Completeness figures of inventory_quality (migration 20260928000003). */
export interface QualityFigures {
  total: number;
  complete: number;
  no_coordinates: number;
  unreadable_coordinates: number;
  fixed_coordinates: number;
  cleared_values: number;
  no_name: number;
  no_serial: number;
  no_year: number;
  no_daya: number;
  no_volume: number;
  no_code: number;
  with_code: number;
  /** Rows the serial number and year apply to (all but oil). */
  equipment: number;
  transformers: number;
  oil: number;
}

export interface QualityGroup extends QualityFigures {
  /** Company id, unit or sub-unit name; null for rows without a unit. */
  key: string | null;
  label: string | null;
}

export interface InventoryQuality {
  /** What the groups are: companies, units of a company or sub-units of a unit. */
  level: 'company' | 'unit' | 'sub_unit';
  summary: QualityFigures;
  groups: QualityGroup[];
}

const EMPTY_QUALITY: QualityFigures = {
  total: 0, complete: 0, no_coordinates: 0, unreadable_coordinates: 0, fixed_coordinates: 0, cleared_values: 0, no_name: 0,
  no_serial: 0, no_year: 0, no_daya: 0, no_volume: 0, no_code: 0, with_code: 0, equipment: 0, transformers: 0, oil: 0,
};

const toFigures = (raw: Record<string, unknown> | undefined): QualityFigures =>
  Object.fromEntries(Object.keys(EMPTY_QUALITY).map((key) => [key, Number(raw?.[key]) || 0])) as unknown as QualityFigures;

export async function fetchInventoryQuality(supabase: SupabaseClient, scope: DashboardScope = ALL_SCOPE): Promise<InventoryQuality> {
  const { data, error } = await supabase.rpc('inventory_quality', { p_company_id: scope.companyId, p_unit: scope.unit, p_sub_unit: scope.subUnit });
  if (error) throw new Error(`Gagal memuat kualitas data: ${error.message}`);
  const raw = (data ?? {}) as { level?: InventoryQuality['level']; summary?: Record<string, unknown>; groups?: Array<Record<string, unknown>> };
  return {
    level: raw.level ?? 'company',
    summary: toFigures(raw.summary),
    groups: (raw.groups ?? []).map((group) => ({ ...toFigures(group), key: (group.key as string | null) ?? null, label: (group.label as string | null) ?? null })),
  };
}

export interface UnitSummary {
  unit: string;
  sub_unit: string | null;
  total: number;
  tested: number;
  at_least_50: number;
}

const UNIT_PAGE_SIZE = 1000;

/**
 * Units and sub-units of a company with their figures (see inventory_units in
 * migration 20260928000001). One row per unit and sub-unit, read in pages:
 * a response holds at most 1000 rows, and PLN alone has hundreds.
 */
export async function fetchCompanyUnits(supabase: SupabaseClient, companyId: string) {
  const rows: UnitSummary[] = [];
  for (let from = 0; ; from += UNIT_PAGE_SIZE) {
    const { data, error } = await supabase.rpc('inventory_units', { p_company_id: companyId }).range(from, from + UNIT_PAGE_SIZE - 1);
    if (error) throw new Error(`Gagal memuat daftar unit: ${error.message}`);
    rows.push(...((data ?? []) as UnitSummary[]));
    if ((data ?? []).length < UNIT_PAGE_SIZE) break;
  }
  return rows.map((row) => ({ ...row, total: Number(row.total), tested: Number(row.tested), at_least_50: Number(row.at_least_50) }));
}

/** Imported batches, newest first, for the table's "import batch" filter. */
export async function fetchImportedBatches(supabase: SupabaseClient, companyId: string | null) {
  let request = supabase
    .from('import_batches')
    .select('id, company_id, jenis_data, nama_file_asli, sheet_name, uploaded_at')
    .eq('status', 'imported')
    .order('uploaded_at', { ascending: false })
    .limit(200);
  if (companyId) request = request.eq('company_id', companyId);
  const { data, error } = await request;
  if (error) throw new Error(`Gagal memuat daftar batch: ${error.message}`);
  return (data ?? []) as Array<{ id: string; company_id: string; jenis_data: InventoryCategory; nama_file_asli: string; sheet_name: string | null; uploaded_at: string }>;
}

/** Full record of one row, for the expanded detail view. */
export async function fetchInventoryDetails(supabase: SupabaseClient, category: InventoryCategory, id: string) {
  const { data, error } = await supabase.from(category).select('*').eq('id', id).single();
  if (error) throw new Error(`Gagal memuat detail: ${error.message}`);
  return data as Record<string, unknown>;
}

/**
 * Points for the map, capped: drawing hundreds of thousands of markers would
 * freeze the browser. Returns the points loaded and how many exist in total.
 */
export async function fetchMapPoints(supabase: SupabaseClient, category: CategoryFilter, scope: DashboardScope = ALL_SCOPE, limit = 5000) {
  const pageSize = 1000;
  const rows: InventoryRow[] = [];
  let total = 0;
  for (let from = 0; from < limit; from += pageSize) {
    let request = supabase
      .from('inventory_items')
      .select('id, category, company_id, name, serial, location, lat, lng, ppm, status', { count: from === 0 ? 'exact' : undefined })
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    if (category === 'transformator') request = request.in('category', TRAFO_CATEGORIES);
    else if (category !== 'all') request = request.eq('category', category);
    if (scope.companyId) request = request.eq('company_id', scope.companyId);
    if (scope.unit) request = request.eq('unit', scope.unit);
    if (scope.subUnit) request = request.eq('sub_unit', scope.subUnit);
    const { data, error, count } = await request.order('id').range(from, Math.min(from + pageSize, limit) - 1);
    if (error) throw new Error(`Gagal memuat titik peta: ${error.message}`);
    if (from === 0) total = count ?? 0;
    rows.push(...((data ?? []) as InventoryRow[]));
    if (!data || data.length < pageSize) break;
  }
  return { rows, total };
}
