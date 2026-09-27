import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { buildSuggestedMapping } from '@/lib/import-profiles';
import { isUploadId, readUploadSession } from '@/lib/upload-store';

const CATEGORY_KEYS = new Set<string>(INVENTORY_CATEGORIES.map((category) => category.key));

/**
 * Step 2 of an import: the admin confirmed which sheets to import and their
 * categories. Creates one import batch per sheet, each pre-filled with the
 * profile's column mapping for the chosen category.
 */
export async function POST(req: NextRequest) {
  try {
    const { uploadId, sheets } = (await req.json()) as {
      uploadId: string;
      sheets: Array<{ sheetName: string; category: InventoryCategory }>;
    };

    if (!isUploadId(uploadId)) {
      return NextResponse.json({ error: 'ID unggahan tidak valid.' }, { status: 400 });
    }
    const supabase = await createClient();
    const session = await readUploadSession(supabase, uploadId);
    if (!session?.sheets) {
      return NextResponse.json({ error: 'Sesi unggahan tidak ditemukan. Unggah ulang berkasnya.' }, { status: 404 });
    }
    if (!Array.isArray(sheets) || sheets.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal satu sheet untuk diimpor.' }, { status: 400 });
    }

    const { data: existing } = await supabase.from('import_batches').select('sheet_name').eq('upload_id', uploadId);
    const batchedSheets = new Set((existing ?? []).map((row) => row.sheet_name));

    const selections = [];
    for (const selection of sheets) {
      const sheet = session.sheets.find((item) => item.sheetName === selection.sheetName);
      if (!sheet) return NextResponse.json({ error: `Sheet "${selection.sheetName}" tidak ada di berkas.` }, { status: 400 });
      if (!CATEGORY_KEYS.has(selection.category)) return NextResponse.json({ error: `Pilih kategori untuk sheet "${selection.sheetName}".` }, { status: 400 });
      if (batchedSheets.has(sheet.sheetName)) {
        return NextResponse.json({ error: `Sheet "${sheet.sheetName}" sudah dibuatkan batch.` }, { status: 409 });
      }
      selections.push({ batchId: randomUUID(), sheet, category: selection.category });
    }

    const { error: batchErr } = await supabase
      .from('import_batches')
      .insert(selections.map(({ batchId, sheet, category }) => ({
        id: batchId,
        company_id: session.company_id,
        jenis_data: category,
        nama_file_asli: session.file_name,
        file_storage_path: session.storage_path,
        status: 'pending_mapping',
        upload_id: uploadId,
        sheet_name: sheet.sheetName,
        profile: sheet.profile,
        headers: sheet.headers,
        total_rows: sheet.totalRows,
        data_rows: sheet.dataRows,
        preview_rows: sheet.previewRows,
        suggested_mapping: buildSuggestedMapping(sheet.profile, category, sheet.headers, sheet.sampleRows ?? sheet.previewRows),
      })));

    if (batchErr) {
      console.error('Error creating import batches:', batchErr);
      return NextResponse.json({ error: `Gagal membuat batch import: ${batchErr.message}` }, { status: 500 });
    }

    const created = selections.map(({ batchId, sheet, category }) => ({ batchId, sheetName: sheet.sheetName, category }));

    return NextResponse.json({ success: true, batches: created });
  } catch (err) {
    console.error('Confirm upload error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal membuat batch import.' }, { status: 500 });
  }
}
