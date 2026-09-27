import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseExcelWithSmartHeader } from '@/lib/excel';
import { INVENTORY_FIELDS, type InventoryCategory } from '@/lib/inventory';
import { buildSuggestedMapping, getDerivedFields, IMPORT_PROFILE_LABELS } from '@/lib/import-profiles';
import { readBatchMeta, readBatchWorkbook, readUploadSession } from '@/lib/upload-store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const supabase = await createClient();
    const { data: batch, error } = await supabase
      .from('import_batches')
      .select('*, companies(*)')
      .eq('id', batchId)
      .single();

    if (error || !batch) {
      return NextResponse.json({ error: 'Data batch tidak ditemukan di database.' }, { status: 404 });
    }

    const category = batch.jenis_data as InventoryCategory;
    const meta = readBatchMeta(batchId);
    let headers: string[] = meta?.headers ?? [];
    let sampleRow: Record<string, unknown> = meta?.previewRows?.[0] ?? {};

    // Batches from before multi-sheet uploads stored headers from the old
    // parser; re-read them so the mapping keys match what import will parse.
    if (meta && !meta.uploadId) {
      const workbook = readBatchWorkbook(batchId, meta);
      if (workbook) {
        const parsed = parseExcelWithSmartHeader(workbook);
        headers = parsed.headers;
        sampleRow = parsed.previewRows[0] ?? {};
      }
    }

    const profile = meta?.profile ?? null;
    const suggestedMapping = meta?.suggestedMapping ?? buildSuggestedMapping(profile, category, headers);

    // Other sheets from the same workbook, so the admin can move on to the next one.
    let siblings: Array<{ batchId: string; sheetName: string; category: string; status: string }> = [];
    const session = meta?.uploadId ? readUploadSession(meta.uploadId) : null;
    if (session && session.batches.length > 1) {
      const { data: statuses } = await supabase
        .from('import_batches')
        .select('id, status')
        .in('id', session.batches.map((item) => item.batchId));
      const statusById = new Map((statuses ?? []).map((row) => [row.id, row.status]));
      siblings = session.batches.map((item) => ({ ...item, status: statusById.get(item.batchId) ?? 'pending_mapping' }));
    }

    return NextResponse.json({
      batch,
      fieldDefinitions: [...(INVENTORY_FIELDS[category] || []), ...getDerivedFields(category).map((field) => ({ ...field, wajib: false, derived: true }))],
      headers,
      sampleRow,
      suggestedMapping,
      sheetName: meta?.sheetName ?? null,
      profile,
      profileLabel: profile ? IMPORT_PROFILE_LABELS[profile] : null,
      dataRows: meta?.dataRows ?? meta?.totalRows ?? null,
      siblings,
    });
  } catch (err) {
    console.error('Mapping get error:', err);
    return NextResponse.json({ error: 'Gagal memuat konfigurasi mapping.' }, { status: 500 });
  }
}
