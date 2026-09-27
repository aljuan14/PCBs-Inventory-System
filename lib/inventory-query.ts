import type { SupabaseClient } from '@supabase/supabase-js';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';

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
  volume_l: number;
  with_coordinates: number;
}

export type InventoryStats = Record<InventoryCategory, CategoryStats>;

const EMPTY_STATS: CategoryStats = {
  total: 0, before_1997: 0, from_1997: 0, unknown_year: 0, tested: 0, lab_tested: 0, lab_below_50: 0,
  lab_at_least_50: 0, risk_safe: 0, risk_moderate: 0, risk_high: 0, volume_l: 0, with_coordinates: 0,
};

export async function fetchInventoryStats(supabase: SupabaseClient, companyId?: string | null): Promise<InventoryStats> {
  const { data, error } = await supabase.rpc('inventory_stats', { p_company_id: companyId ?? null });
  if (error) throw new Error(`Gagal memuat ringkasan: ${error.message}`);
  const raw = (data ?? {}) as Partial<Record<InventoryCategory, Partial<CategoryStats>>>;
  return Object.fromEntries(
    INVENTORY_CATEGORIES.map(({ key }) => [key, { ...EMPTY_STATS, ...Object.fromEntries(Object.entries(raw[key] ?? {}).map(([name, value]) => [name, Number(value) || 0])) }]),
  ) as InventoryStats;
}

/** Sum a figure over several categories. */
export const sumStats = (stats: InventoryStats, categories: InventoryCategory[], key: keyof CategoryStats) =>
  categories.reduce((sum, category) => sum + stats[category][key], 0);

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
  /** Present once migration 20260927000002 is applied. */
  import_batch_id?: string | null;
}

export type CategoryFilter = InventoryCategory | 'transformator' | 'all';
export type PcbRange = 'all' | 'safe' | 'moderate' | 'high' | 'untested';
export type TestFilter = 'all' | 'lab' | 'cepat' | 'none';
export type YearRange = 'all' | 'pre1985' | '1985_1996' | 'from1997' | 'unknown' | 'custom';
export type CoordinateFilter = 'all' | 'with' | 'without';
export type MissingFilter = 'all' | 'serial' | 'name' | 'year' | 'location';
export type AddedWithin = 'all' | '1d' | '7d' | '30d';
export type InventorySort = 'newest' | 'oldest' | 'ppm_desc' | 'year_asc' | 'year_desc' | 'daya_desc' | 'name_asc';

/** Table filters besides category and free-text search. */
export interface InventoryFilters {
  companyId: string | null;
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
}

export const DEFAULT_FILTERS: InventoryFilters = {
  companyId: null,
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
};

export interface InventoryPageQuery {
  category: CategoryFilter;
  search: string;
  filters: InventoryFilters;
  sort: InventorySort;
  page: number;
  pageSize: number;
}

const TRAFO_CATEGORIES: InventoryCategory[] = ['transformator_digunakan', 'transformator_tidak_digunakan'];

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

export async function fetchInventoryPage(supabase: SupabaseClient, query: InventoryPageQuery) {
  const { filters } = query;
  let request = supabase.from('inventory_items').select('*', { count: 'exact' });

  if (query.category === 'transformator') request = request.in('category', TRAFO_CATEGORIES);
  else if (query.category !== 'all') request = request.eq('category', query.category);
  if (filters.companyId) request = request.eq('company_id', filters.companyId);
  if (filters.batchId) request = request.eq('import_batch_id', filters.batchId);

  if (filters.pcbRange === 'safe') request = request.lt('ppm', 50);
  else if (filters.pcbRange === 'moderate') request = request.gte('ppm', 50).lte('ppm', 500);
  else if (filters.pcbRange === 'high') request = request.gt('ppm', 500);
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

  if (filters.missing === 'serial') request = request.is('serial', null);
  else if (filters.missing === 'name') request = request.is('name', null);
  else if (filters.missing === 'year') request = request.is('tahun_pembuatan', null);
  else if (filters.missing === 'location') request = request.is('location', null);

  if (filters.addedWithin !== 'all') {
    request = request.gte('created_at', new Date(Date.now() - ADDED_WITHIN_DAYS[filters.addedWithin] * DAY_MS).toISOString());
  }

  const term = cleanSearch(query.search);
  if (term) request = request.or(`name.ilike.*${term}*,serial.ilike.*${term}*,location.ilike.*${term}*`);

  for (const [column, ascending] of SORTS[query.sort]) {
    request = request.order(column, { ascending, nullsFirst: false });
  }
  const from = (query.page - 1) * query.pageSize;
  const { data, error, count } = await request.range(from, from + query.pageSize - 1);
  if (error) throw new Error(`Gagal memuat data: ${error.message}`);
  return { rows: (data ?? []) as InventoryRow[], total: count ?? 0 };
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
export async function fetchMapPoints(supabase: SupabaseClient, category: CategoryFilter, limit = 5000) {
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
    const { data, error, count } = await request.order('id').range(from, Math.min(from + pageSize, limit) - 1);
    if (error) throw new Error(`Gagal memuat titik peta: ${error.message}`);
    if (from === 0) total = count ?? 0;
    rows.push(...((data ?? []) as InventoryRow[]));
    if (!data || data.length < pageSize) break;
  }
  return { rows, total };
}
