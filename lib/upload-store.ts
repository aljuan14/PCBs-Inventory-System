import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryCategory } from '@/lib/inventory';
import type { ImportProfile } from '@/lib/import-profiles';

/**
 * Working state of the upload → review → mapping → import flow. The workbook
 * lives in Supabase Storage (uploaded directly by the browser), the sheet scan
 * in `upload_sessions`, and each confirmed sheet becomes an `import_batches`
 * row carrying its mapping context. Nothing is kept on the server's disk, so
 * the flow works on serverless hosts.
 */
export const STORAGE_BUCKET = 'pcbs-files';
/** Matches the bucket's file_size_limit (see migration 20260927000001). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** Uploads never turned into a batch are removed after this long. */
const STALE_UPLOAD_MS = 7 * 24 * 60 * 60 * 1000;

export interface UploadSheet {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  totalRows: number;
  /** Rows carrying real inventory data (excludes empty pre-filled form rows). */
  dataRows: number;
  previewRows: Record<string, unknown>[];
  profile: ImportProfile | null;
  category: InventoryCategory | null;
  include: boolean;
  reason: string;
}

export interface UploadSession {
  id: string;
  company_id: string;
  file_name: string;
  storage_path: string;
  status: 'uploading' | 'scanned';
  sheets: UploadSheet[] | null;
  created_at: string;
}

/** Columns of import_batches the mapping and import steps need. */
export const BATCH_COLUMNS =
  'id, company_id, jenis_data, nama_file_asli, file_storage_path, status, upload_id, sheet_name, profile, headers, total_rows, data_rows, preview_rows, suggested_mapping';

export interface BatchRow {
  id: string;
  company_id: string;
  jenis_data: InventoryCategory;
  nama_file_asli: string;
  file_storage_path: string | null;
  status: string;
  upload_id: string | null;
  sheet_name: string | null;
  profile: ImportProfile | null;
  /** Null for batches created before upload_sessions; parse the workbook instead. */
  headers: string[] | null;
  total_rows: number | null;
  data_rows: number | null;
  preview_rows: Record<string, unknown>[] | null;
  suggested_mapping: Record<string, string> | null;
}

export const isUploadId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

export const isExcelFileName = (name: string) => /\.(xlsx|xls)$/i.test(name);

const sourcePath = (uploadId: string, fileName: string) => `uploads/${uploadId}/source.${fileName.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'}`;

/** Registers an upload and returns a one-time URL token the browser uploads the workbook with. */
export async function createUploadSession(supabase: SupabaseClient, companyId: string, fileName: string) {
  const uploadId = crypto.randomUUID();
  const storagePath = sourcePath(uploadId, fileName);

  const { data: signed, error: signErr } = await supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(storagePath);
  if (signErr || !signed) {
    throw new Error(`Penyimpanan berkas tidak tersedia (bucket "${STORAGE_BUCKET}"): ${signErr?.message ?? 'tanpa keterangan'}. Pastikan migrasi 20260927000001_upload_storage.sql sudah dijalankan.`);
  }

  const { error } = await supabase.from('upload_sessions').insert({ id: uploadId, company_id: companyId, file_name: fileName, storage_path: storagePath });
  if (error) throw new Error(`Gagal mencatat unggahan: ${error.message}`);

  return { uploadId, storagePath, token: signed.token };
}

export async function readUploadSession(supabase: SupabaseClient, uploadId: string) {
  const { data, error } = await supabase.from('upload_sessions').select('*').eq('id', uploadId).maybeSingle();
  if (error) throw new Error(`Gagal membaca sesi unggahan: ${error.message}`);
  return data as UploadSession | null;
}

export async function saveUploadScan(supabase: SupabaseClient, uploadId: string, sheets: UploadSheet[]) {
  const { error } = await supabase.from('upload_sessions').update({ status: 'scanned', sheets }).eq('id', uploadId);
  if (error) throw new Error(`Gagal menyimpan hasil pemindaian: ${error.message}`);
}

export async function downloadWorkbook(supabase: SupabaseClient, storagePath: string) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Removes uploads that were never turned into an import batch (abandoned at
 * the review step). Best effort: failures only leave clutter behind.
 */
export async function cleanupStaleUploads(supabase: SupabaseClient) {
  try {
    const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
    const { data: stale } = await supabase
      .from('upload_sessions')
      .select('id, storage_path, import_batches(id)')
      .lt('created_at', cutoff)
      .limit(50);
    const unused = (stale ?? []).filter((row) => !row.import_batches || (row.import_batches as unknown[]).length === 0);
    if (unused.length === 0) return;
    await supabase.storage.from(STORAGE_BUCKET).remove(unused.map((row) => row.storage_path));
    await supabase.from('upload_sessions').delete().in('id', unused.map((row) => row.id));
  } catch (err) {
    console.warn('Stale upload cleanup skipped:', err);
  }
}
