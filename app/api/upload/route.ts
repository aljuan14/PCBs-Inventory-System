import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readWorkbook } from '@/lib/excel';
import { scanWorkbookWithProgress } from '@/lib/import-scan';
import { flushProgress, progressResponse } from '@/lib/progress';
import { downloadWorkbook, findImportedUpload, isUploadId, readUploadSession, saveUploadScan, sha256, type UploadSheet } from '@/lib/upload-store';

// Parsing a large multi-sheet workbook can take a while.
export const maxDuration = 60;

/**
 * Step 1 of an import: scan every sheet of a workbook the browser already put
 * in Storage (see ./init). Each sheet is classified (profile, category,
 * include by default) for the admin to review; batches are only created once
 * the admin confirms (see ./confirm). Streams its progress sheet by sheet
 * (lib/progress.ts).
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

    return progressResponse(req, 'Upload scan', async (send) => {
      send({ type: 'plan', stages: ['download', 'parse', 'scan', 'save'] });
      send({ type: 'stage', stage: 'download' });
      const buffer = await downloadWorkbook(supabase, session.storage_path);
      if (!buffer) return { type: 'error', error: 'Berkas belum tersimpan di penyimpanan. Unggah ulang berkasnya.', status: 404 };

      send({ type: 'stage', stage: 'parse' });
      await flushProgress();
      let workbook;
      try {
        workbook = readWorkbook(buffer);
      } catch (parseErr) {
        return { type: 'error', error: `Berkas tidak dapat dibaca sebagai Excel: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, status: 400 };
      }

      send({ type: 'stage', stage: 'scan' });
      const scanned = await scanWorkbookWithProgress(workbook, (done, total, sheetName) => send({ type: 'progress', done, total, unit: 'sheets', label: sheetName }));
      const sheets: UploadSheet[] = scanned.map(({ sheet }) => sheet);
      if (sheets.every((sheet) => sheet.headers.length === 0)) {
        return { type: 'error', error: 'Tidak ada sheet dengan header tabel yang dapat dikenali.', status: 400 };
      }

      send({ type: 'stage', stage: 'save' });
      const fileSha256 = await sha256(buffer);
      await saveUploadScan(supabase, uploadId, sheets, fileSha256);
      // Same file already imported for this company: the review step warns the admin.
      const previousUpload = await findImportedUpload(supabase, session.company_id, fileSha256, uploadId);

      return {
        type: 'result',
        data: {
          success: true,
          uploadId,
          companyId: session.company_id,
          fileName: session.file_name,
          previousUpload,
          // Sample rows stay server-side (only the mapping suggestion needs them).
          sheets: sheets.map(({ headers, ...sheet }) => ({ ...sheet, sampleRows: undefined, headerCount: headers.length, headers: headers.slice(0, 60) })),
        },
      };
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Terjadi kesalahan pada server saat memproses file.' }, { status: 500 });
  }
}
