import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { buildSuggestedMapping } from '@/lib/import-profiles';
import { isUploadId, readUploadSession, writeBatchMeta, writeUploadSession } from '@/lib/upload-store';

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
    const session = readUploadSession(uploadId);
    if (!session) {
      return NextResponse.json({ error: 'Sesi unggahan tidak ditemukan. Unggah ulang berkasnya.' }, { status: 404 });
    }
    if (!Array.isArray(sheets) || sheets.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal satu sheet untuk diimpor.' }, { status: 400 });
    }

    const selections = [];
    for (const selection of sheets) {
      const sheet = session.sheets.find((item) => item.sheetName === selection.sheetName);
      if (!sheet) return NextResponse.json({ error: `Sheet "${selection.sheetName}" tidak ada di berkas.` }, { status: 400 });
      if (!CATEGORY_KEYS.has(selection.category)) return NextResponse.json({ error: `Pilih kategori untuk sheet "${selection.sheetName}".` }, { status: 400 });
      if (session.batches.some((batch) => batch.sheetName === sheet.sheetName)) {
        return NextResponse.json({ error: `Sheet "${sheet.sheetName}" sudah dibuatkan batch.` }, { status: 409 });
      }
      selections.push({ batchId: randomUUID(), sheet, category: selection.category });
    }

    const supabase = await createClient();
    const { error: batchErr } = await supabase
      .from('import_batches')
      .insert(selections.map(({ batchId, category }) => ({
        id: batchId,
        company_id: session.companyId,
        jenis_data: category,
        nama_file_asli: session.fileName,
        file_storage_path: session.storagePath,
        status: 'pending_mapping',
      })));

    if (batchErr) {
      console.error('Error creating import batches:', batchErr);
      return NextResponse.json({ error: `Gagal membuat batch import: ${batchErr.message}` }, { status: 500 });
    }

    const created = selections.map(({ batchId, sheet, category }) => {
      writeBatchMeta({
        batchId,
        uploadId,
        companyId: session.companyId,
        jenisData: category,
        fileName: session.fileName,
        sheetName: sheet.sheetName,
        profile: sheet.profile,
        headers: sheet.headers,
        totalRows: sheet.totalRows,
        dataRows: sheet.dataRows,
        previewRows: sheet.previewRows,
        suggestedMapping: buildSuggestedMapping(sheet.profile, category, sheet.headers),
      });
      return { batchId, sheetName: sheet.sheetName, category };
    });

    writeUploadSession({ ...session, batches: [...session.batches, ...created] });

    return NextResponse.json({ success: true, batches: created });
  } catch (err) {
    console.error('Confirm upload error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal membuat batch import.' }, { status: 500 });
  }
}
