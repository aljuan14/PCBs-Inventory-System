import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InventoryCategory } from '@/lib/inventory';
import { BatchFileError, checkMappings, describeIssueRows, loadBatchSheet, transformRows, type CheckReport, type IssueRowRef } from '@/lib/import-transform';

// The first request for a batch checks the whole sheet again.
export const maxDuration = 60;

const PAGE_LIMIT = 100;

// Affected rows per finding for the latest mappings checked, so paging
// through a finding does not re-check a 50k-row sheet each time.
const issueRowsCache = new Map<string, Map<string, IssueRowRef[]>>();
const CACHE_LIMIT = 3;

/**
 * Rows behind one finding of the pre-import check, a page at a time, with
 * the details that identify each row in the workbook. The upload history
 * uses it for the rows an import skipped, which are only in the workbook.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const { mappings: requested, key, offset = 0, limit = 20 } = (await req.json()) as {
      /** Omitted for an imported batch: the mapping stored with its check report is used. */
      mappings?: Record<string, string>;
      key: string;
      offset?: number;
      limit?: number;
    };
    if (typeof key !== 'string' || !key) return NextResponse.json({ error: 'Temuan tidak dikenal.' }, { status: 400 });

    const supabase = await createClient();
    const { data: batch, error } = await supabase
      .from('import_batches')
      .select('id, jenis_data, nama_file_asli, file_storage_path, sheet_name, profile, laporan_pemeriksaan')
      .eq('id', batchId)
      .single();
    if (error || !batch) {
      return NextResponse.json({ error: 'Batch import tidak ditemukan.' }, { status: 404 });
    }

    const mappings = requested ?? (batch.laporan_pemeriksaan as CheckReport | null)?.mappings;
    if (!mappings) {
      return NextResponse.json({ error: 'Pemetaan kolom impor ini tidak tersimpan, jadi baris yang dilewati tidak dapat ditampilkan.' }, { status: 409 });
    }
    const category = batch.jenis_data as InventoryCategory;
    const mappingError = checkMappings(category, mappings);
    if (mappingError) return NextResponse.json({ error: mappingError }, { status: 400 });

    const sheet = await loadBatchSheet(supabase, batch);
    const unitContext = { profile: batch.profile, fileName: batch.nama_file_asli };
    const cacheKey = `${batchId}|${JSON.stringify(mappings)}`;
    let rowsByKey = issueRowsCache.get(cacheKey);
    if (!rowsByKey) {
      const { issues } = transformRows(category, sheet, mappings, unitContext, { keepIssueRows: true });
      rowsByKey = issues.rowsByKey ?? new Map();
      issueRowsCache.set(cacheKey, rowsByKey);
      if (issueRowsCache.size > CACHE_LIMIT) issueRowsCache.delete(issueRowsCache.keys().next().value as string);
    }

    const refs = rowsByKey.get(key) ?? [];
    const start = Math.max(0, Math.floor(offset));
    const page = refs.slice(start, start + Math.min(Math.max(1, Math.floor(limit)), PAGE_LIMIT));
    return NextResponse.json({ total: refs.length, rows: describeIssueRows(sheet, mappings, page, unitContext) });
  } catch (err) {
    if (err instanceof BatchFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Issue rows error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal memuat baris temuan.' }, { status: 500 });
  }
}
