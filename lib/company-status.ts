import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryCategory } from '@/lib/inventory';

/**
 * Per company: what it holds and whether its check results were sent. Shared
 * by the dashboard company picker and the companies page.
 */

export type FeedbackStatus = 'pending' | 'sent' | 'new_data' | 'empty';

export interface CompanyStatus {
  rows: number;
  byCategory: Partial<Record<InventoryCategory, number>>;
  files: number;
  lastImportAt: string | null;
  lastSentAt: string | null;
  sends: number;
  status: FeedbackStatus;
}

export const FEEDBACK_STATUSES: Record<FeedbackStatus, { label: string; dot: string; badge: string }> = {
  pending: { label: 'Belum dikirim', dot: 'bg-amber-400', badge: 'border-amber-200 bg-amber-50 text-amber-800' },
  new_data: { label: 'Ada data baru', dot: 'bg-orange-500', badge: 'border-orange-200 bg-orange-50 text-orange-800' },
  sent: { label: 'Sudah dikirim', dot: 'bg-emerald-500', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  empty: { label: 'Kosong', dot: 'bg-slate-300', badge: 'border-slate-200 bg-slate-50 text-slate-500' },
};

/** Order the statuses are listed in: what needs action first. */
export const STATUS_ORDER: FeedbackStatus[] = ['pending', 'new_data', 'sent', 'empty'];

/** Every row of a query, page by page (the API returns at most 1000 rows per request). */
async function selectAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const later = (a: string | null, b: string) => (a === null || new Date(b) > new Date(a) ? b : a);

/**
 * Status of every company that holds data or was ever sent a message.
 * Companies missing from the map are empty. Row counts come from the stats
 * summary table (a few rows per company) rather than the inventory tables.
 */
export async function fetchCompanyStatuses(supabase: SupabaseClient) {
  const [parts, batches, sends] = await Promise.all([
    selectAllRows<{ company_id: string | null; category: InventoryCategory; total: number }>((from, to) => supabase.from('inventory_stats_parts').select('company_id, category, total').range(from, to)),
    selectAllRows<{ company_id: string; uploaded_at: string }>((from, to) => supabase.from('import_batches').select('company_id, uploaded_at').eq('status', 'imported').range(from, to)),
    selectAllRows<{ company_id: string; sent_at: string }>((from, to) => supabase.from('company_feedback_log').select('company_id, sent_at').range(from, to)),
  ]);

  const statuses = new Map<string, CompanyStatus>();
  const get = (id: string) => statuses.get(id) ?? statuses.set(id, { rows: 0, byCategory: {}, files: 0, lastImportAt: null, lastSentAt: null, sends: 0, status: 'empty' }).get(id)!;
  for (const part of parts) {
    if (!part.company_id || !part.total) continue;
    const status = get(part.company_id);
    status.rows += Number(part.total);
    status.byCategory[part.category] = (status.byCategory[part.category] ?? 0) + Number(part.total);
  }
  for (const batch of batches) {
    const status = get(batch.company_id);
    status.files++;
    status.lastImportAt = later(status.lastImportAt, batch.uploaded_at);
  }
  for (const send of sends) {
    const status = get(send.company_id);
    status.sends++;
    status.lastSentAt = later(status.lastSentAt, send.sent_at);
  }
  for (const status of statuses.values()) status.status = deriveStatus(status);
  return statuses;
}

export function deriveStatus({ rows, lastImportAt, lastSentAt }: Pick<CompanyStatus, 'rows' | 'lastImportAt' | 'lastSentAt'>): FeedbackStatus {
  if (rows === 0) return 'empty';
  if (!lastSentAt) return 'pending';
  // Compare as instants: the two timestamps may come back in different offsets.
  return lastImportAt && new Date(lastImportAt) > new Date(lastSentAt) ? 'new_data' : 'sent';
}

export const statusOf = (statuses: Map<string, CompanyStatus> | null | undefined, companyId: string): FeedbackStatus => statuses?.get(companyId)?.status ?? 'empty';

export const formatDate = (value: string) => new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
