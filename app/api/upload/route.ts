import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseSheet, readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet, hasIdentity } from '@/lib/import-profiles';
import { downloadWorkbook, isUploadId, readUploadSession, saveUploadScan, type UploadSheet } from '@/lib/upload-store';

// Parsing a large multi-sheet workbook can take a while.
export const maxDuration = 60;

/**
 * Step 1 of an import: scan every sheet of a workbook the browser already put
 * in Storage (see ./init). Each sheet is classified (profile, category,
 * include by default) for the admin to review; batches are only created once
 * the admin confirms (see ./confirm).
 */
export async function POST(req: NextRequest) {
  try {
    const { uploadId } = (await req.json()) as { uploadId?: string };
    if (!isUploadId(uploadId)) {
      return NextResponse.json({ error: 'ID unggahan tidak valid.' }, { status: 400 });
    }

    const supabase = await createClient();
    const session = await readUploadSession(supabase, uploadId);
    if (!session) {
      return NextResponse.json({ error: 'Sesi unggahan tidak ditemukan. Unggah ulang berkasnya.' }, { status: 404 });
    }

    const buffer = await downloadWorkbook(supabase, session.storage_path);
    if (!buffer) {
      return NextResponse.json({ error: 'Berkas belum tersimpan di penyimpanan. Unggah ulang berkasnya.' }, { status: 404 });
    }

    let workbook;
    try {
      workbook = readWorkbook(buffer);
    } catch (parseErr) {
      return NextResponse.json({ error: `Berkas tidak dapat dibaca sebagai Excel: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` }, { status: 400 });
    }

    const sheets: UploadSheet[] = workbook.SheetNames.map((sheetName) => {
      const parsed = parseSheet(workbook, sheetName);
      const initial = detectSheet(sheetName, parsed.headers, parsed.totalRows, workbook.SheetNames.length);
      let dataRows = parsed.allRows;
      if (initial.category) {
        const mapping = buildSuggestedMapping(initial.profile, initial.category, parsed.headers);
        dataRows = parsed.allRows.filter((row) => hasIdentity(row, mapping));
      }
      // Re-run with the real row count so sheets of empty form rows are skipped.
      const detection = detectSheet(sheetName, parsed.headers, dataRows.length, workbook.SheetNames.length);
      return {
        sheetName,
        headerRowIndex: parsed.headerRowIndex,
        headers: parsed.headers,
        totalRows: parsed.totalRows,
        dataRows: dataRows.length,
        previewRows: dataRows.slice(0, 5),
        ...detection,
      };
    });

    if (sheets.every((sheet) => sheet.headers.length === 0)) {
      return NextResponse.json({ error: 'Tidak ada sheet dengan header tabel yang dapat dikenali.' }, { status: 400 });
    }

    await saveUploadScan(supabase, uploadId, sheets);

    return NextResponse.json({
      success: true,
      uploadId,
      companyId: session.company_id,
      fileName: session.file_name,
      sheets: sheets.map(({ headers, ...sheet }) => ({ ...sheet, headerCount: headers.length, headers: headers.slice(0, 60) })),
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Terjadi kesalahan pada server saat memproses file.' }, { status: 500 });
  }
}
