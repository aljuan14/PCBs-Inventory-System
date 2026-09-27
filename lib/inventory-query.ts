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
}

export type CategoryFilter = InventoryCategory | 'transformator' | 'all';
export type PcbRange = 'all' | 'safe' | 'moderate' | 'high' | 'untested';

export interface InventoryPageQuery {
  category: CategoryFilter;
  companyId: string | null;
  pcbRange: PcbRange;
  search: string;
  page: number;
  pageSize: number;
}

const TRAFO_CATEGORIES: InventoryCategory[] = ['transformator_digunakan', 'transformator_tidak_digunakan'];

// PostgREST filter syntax treats these characters specially inside or().
const cleanSearch = (value: string) => value.replace(/[,()*%\\:"]/g, ' ').trim();

export async function fetchInventoryPage(supabase: SupabaseClient, query: InventoryPageQuery) {
  let request = supabase.from('inventory_items').select('*', { count: 'exact' });

  if (query.category === 'transformator') request = request.in('category', TRAFO_CATEGORIES);
  else if (query.category !== 'all') request = request.eq('category', query.category);
  if (query.companyId) request = request.eq('company_id', query.companyId);

  if (query.pcbRange === 'safe') request = request.lt('ppm', 50);
  else if (query.pcbRange === 'moderate') request = request.gte('ppm', 50).lte('ppm', 500);
  else if (query.pcbRange === 'high') request = request.gt('ppm', 500);
  else if (query.pcbRange === 'untested') request = request.is('ppm', null);

  const term = cleanSearch(query.search);
  if (term) request = request.or(`name.ilike.*${term}*,serial.ilike.*${term}*,location.ilike.*${term}*`);

  const from = (query.page - 1) * query.pageSize;
  const { data, error, count } = await request
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + query.pageSize - 1);
  if (error) throw new Error(`Gagal memuat data: ${error.message}`);
  return { rows: (data ?? []) as InventoryRow[], total: count ?? 0 };
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
