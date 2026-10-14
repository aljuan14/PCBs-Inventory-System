import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The order of the company lists: last edited first (companies.terakhir_diubah,
 * migration 20261014000003), or by name A-Z / Z-A. One choice for every list,
 * remembered in this browser.
 */
export type CompanySort = 'terbaru' | 'az' | 'za';

export const COMPANY_SORTS: Array<[CompanySort, string]> = [
  ['terbaru', 'Terakhir diubah'],
  ['az', 'A–Z'],
  ['za', 'Z–A'],
];

const KEY = 'pcbs.companySort';
const EVENT = 'pcbs-company-sort';

export function readCompanySort(): CompanySort {
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === 'az' || value === 'za' || value === 'terbaru') return value;
  } catch { /* storage blocked */ }
  return 'terbaru';
}

/** Saved and told to every list on the page. */
export function writeCompanySort(value: CompanySort) {
  try { window.localStorage.setItem(KEY, value); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeCompanySort(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Sorted copy; a list without edit times (before the migration) falls back to A-Z. */
export function sortCompanies<T>(list: T[], sort: CompanySort, name: (item: T) => string, edited: (item: T) => string | null | undefined): T[] {
  const byName = (a: T, b: T) => name(a).localeCompare(name(b), 'id');
  return [...list].sort((a, b) => {
    if (sort === 'za') return byName(b, a);
    if (sort === 'terbaru') return (edited(b) ?? '').localeCompare(edited(a) ?? '') || byName(a, b);
    return byName(a, b);
  });
}

/**
 * The companies with their edit time. A database before migration
 * 20261014000003 has no terakhir_diubah: the columns are read without it.
 */
export async function selectCompanies<T>(supabase: SupabaseClient, columns: string): Promise<{ data: T[]; error: string | null }> {
  const first = await supabase.from('companies').select(`${columns}, terakhir_diubah`).order('nama_perusahaan');
  if (!first.error) return { data: (first.data ?? []) as T[], error: null };
  const fallback = await supabase.from('companies').select(columns).order('nama_perusahaan');
  return { data: (fallback.data ?? []) as T[], error: fallback.error?.message ?? null };
}

export const formatEdited = (value: string) => new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** The options of a company picker: id, name and edit time. */
export async function loadCompanyOptions(supabase: SupabaseClient): Promise<{ data: Array<{ id: string; name: string; lastEdited: string | null }>; error: string | null }> {
  const { data, error } = await selectCompanies<{ id: string; nama_perusahaan: string; terakhir_diubah?: string }>(supabase, 'id, nama_perusahaan');
  return { data: data.map((row) => ({ id: row.id, name: row.nama_perusahaan, lastEdited: row.terakhir_diubah ?? null })), error };
}
