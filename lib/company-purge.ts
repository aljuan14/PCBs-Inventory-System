import type { SupabaseClient } from '@supabase/supabase-js';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { STORAGE_BUCKET } from '@/lib/upload-store';

/**
 * Removing a company's imported data: the inventory rows in all category
 * tables, the import batches, the upload sessions (which also forgets the
 * file hashes that make import-folder.ts skip identical workbooks) and the
 * workbooks in Storage. Shared by scripts/purge-company.ts and the companies
 * page, which also deletes the company afterwards.
 */

// Ids per delete request; `id=in.(…)` travels in the URL, so keep it short.
const DELETE_CHUNK = 200;
const PAGE_SIZE = 1000;

export interface CompanyData {
  inventory: Array<{ table: InventoryCategory; total: number }>;
  inventoryTotal: number;
  batches: number;
  sessions: number;
  storagePaths: string[];
}

export type PurgeProgress = (table: string, deleted: number, total: number) => void;

async function countRows(supabase: SupabaseClient, table: string, companyId: string) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
  if (error) throw new Error(`Gagal menghitung ${table}: ${error.message}`);
  return count ?? 0;
}

/** Every value of `column` in this company's rows of `table`, paged. */
async function selectAll(supabase: SupabaseClient, table: string, column: string, companyId: string) {
  const values: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(column).eq('company_id', companyId).order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Gagal membaca ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, string | null>[];
    for (const row of rows) if (row[column]) values.push(row[column] as string);
    if (rows.length < PAGE_SIZE) break;
  }
  return values;
}

/**
 * Deletes this company's rows of `table` a page at a time. One large DELETE
 * could hit the statement timeout on hundreds of thousands of rows.
 */
async function deleteAll(supabase: SupabaseClient, table: string, companyId: string, total: number, onProgress?: PurgeProgress) {
  let deleted = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select('id').eq('company_id', companyId).limit(PAGE_SIZE);
    if (error) throw new Error(`Gagal membaca ${table}: ${error.message}`);
    const ids = (data ?? []).map((row) => row.id as string);
    if (ids.length === 0) break;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += DELETE_CHUNK) chunks.push(ids.slice(i, i + DELETE_CHUNK));
    const results = await Promise.all(chunks.map((chunk) => supabase.from(table).delete().in('id', chunk)));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(`Gagal menghapus ${table}: ${failed.error.message}`);
    deleted += ids.length;
    onProgress?.(table, deleted, total);
  }
  return deleted;
}

export async function countCompanyData(supabase: SupabaseClient, companyId: string): Promise<CompanyData> {
  const inventory = await Promise.all(INVENTORY_CATEGORIES.map(async ({ key }) => ({ table: key, total: await countRows(supabase, key, companyId) })));
  const [batches, sessions, sessionPaths, batchPaths] = await Promise.all([
    countRows(supabase, 'import_batches', companyId),
    countRows(supabase, 'upload_sessions', companyId),
    selectAll(supabase, 'upload_sessions', 'storage_path', companyId),
    selectAll(supabase, 'import_batches', 'file_storage_path', companyId),
  ]);
  return {
    inventory,
    inventoryTotal: inventory.reduce((sum, { total }) => sum + total, 0),
    batches,
    sessions,
    storagePaths: [...new Set([...sessionPaths, ...batchPaths])],
  };
}

/**
 * Deletes everything counted in `data`. Safe to re-run if it stops halfway.
 * Returns how many Storage files could not be removed.
 */
export async function purgeCompanyData(supabase: SupabaseClient, companyId: string, data: CompanyData, onProgress?: PurgeProgress) {
  // Rows first: their import_batch_id is ON DELETE SET NULL, so removing the
  // batches alone would leave the rows behind.
  for (const { table, total } of data.inventory) if (total > 0) await deleteAll(supabase, table, companyId, total, onProgress);
  if (data.batches > 0) await deleteAll(supabase, 'import_batches', companyId, data.batches, onProgress);

  let storageFailures = 0;
  for (let i = 0; i < data.storagePaths.length; i += 100) {
    const batch = data.storagePaths.slice(i, i + 100);
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(batch);
    if (error) storageFailures += batch.length;
    onProgress?.('storage', Math.min(i + 100, data.storagePaths.length) - storageFailures, data.storagePaths.length);
  }

  // Sessions last: they hold the file hashes, so a failure above can be
  // retried without import-folder.ts treating the files as already imported.
  if (data.sessions > 0) await deleteAll(supabase, 'upload_sessions', companyId, data.sessions, onProgress);
  return storageFailures;
}

/** Removes the company's data, then the company itself. */
export async function deleteCompany(supabase: SupabaseClient, companyId: string, onProgress?: PurgeProgress) {
  const data = await countCompanyData(supabase, companyId);
  const storageFailures = await purgeCompanyData(supabase, companyId, data, onProgress);
  const { error } = await supabase.from('companies').delete().eq('id', companyId);
  if (error) throw new Error(`Gagal menghapus perusahaan: ${error.message}`);
  return { storageFailures };
}
