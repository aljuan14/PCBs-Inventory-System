import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { INVENTORY_FIELDS, type InventoryCategory } from '@/lib/inventory';
import { buildSuggestedMapping, getDerivedFields, IMPORT_PROFILE_LABELS } from '@/lib/import-profiles';
import { BatchFileError, loadBatchSheet } from '@/lib/import-transform';
import type { BatchRow } from '@/lib/upload-store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('import_batches')
      .select('*, companies(*)')
      .eq('id', batchId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Data batch tidak ditemukan di database.' }, { status: 404 });
    }

    const batch = data as BatchRow & { companies: unknown };
    const category = batch.jenis_data as InventoryCategory;
    let headers: string[] = batch.headers ?? [];
    let sampleRow: Record<string, unknown> = batch.preview_rows?.[0] ?? {};

    // Batches created before upload_sessions kept their headers on the local
    // disk; re-read them from the workbook so the mapping keys match import.
    if (!batch.headers) {
      const sheet = await loadBatchSheet(supabase, batch);
      headers = sheet.headers;
      sampleRow = sheet.allRows[0] ?? {};
    }

    const profile = batch.profile ?? null;
    const suggestedMapping = batch.suggested_mapping ?? buildSuggestedMapping(profile, category, headers);

    // Other sheets from the same workbook, so the admin can move on to the next one.
    let siblings: Array<{ batchId: string; sheetName: string; category: string; status: string }> = [];
    if (batch.upload_id) {
      const { data: rows } = await supabase
        .from('import_batches')
        .select('id, sheet_name, jenis_data, status, uploaded_at')
        .eq('upload_id', batch.upload_id)
        .order('uploaded_at');
      if (rows && rows.length > 1) {
        siblings = rows.map((row) => ({ batchId: row.id, sheetName: row.sheet_name ?? '', category: row.jenis_data, status: row.status }));
      }
    }

    return NextResponse.json({
      batch,
      fieldDefinitions: [...(INVENTORY_FIELDS[category] || []), ...getDerivedFields(category).map((field) => ({ ...field, wajib: false, derived: true }))],
      headers,
      sampleRow,
      suggestedMapping,
      sheetName: batch.sheet_name,
      profile,
      profileLabel: profile ? IMPORT_PROFILE_LABELS[profile] : null,
      dataRows: batch.data_rows ?? batch.total_rows ?? null,
      siblings,
    });
  } catch (err) {
    if (err instanceof BatchFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Mapping get error:', err);
    return NextResponse.json({ error: 'Gagal memuat konfigurasi mapping.' }, { status: 500 });
  }
}
