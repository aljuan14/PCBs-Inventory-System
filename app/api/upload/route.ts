import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseSheet, readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet, hasIdentity } from '@/lib/import-profiles';
import { saveWorkbook, writeUploadSession, type UploadSheet } from '@/lib/upload-store';

/**
 * Step 1 of an import: store the workbook and scan every sheet. Each sheet is
 * classified (profile, category, include by default) for the admin to review;
 * batches are only created once the admin confirms (see ./confirm).
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    let companyId = formData.get('company_id') as string | null;
    const newCompanyName = formData.get('new_company_name') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'File Excel wajib diunggah.' }, { status: 400 });
    }
    if (!companyId && !newCompanyName?.trim()) {
      return NextResponse.json({ error: 'Perusahaan wajib dipilih atau diisi.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse before touching the database so an unreadable file leaves no trace.
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

    const supabase = await createClient();

    if (!companyId && newCompanyName?.trim()) {
      const { data: newComp, error: compErr } = await supabase
        .from('companies')
        .insert({ nama_perusahaan: newCompanyName.trim() })
        .select('id')
        .single();

      if (compErr) {
        console.error('Error inserting company:', compErr);
        return NextResponse.json({ error: `Gagal menyimpan perusahaan: ${compErr.message}` }, { status: 500 });
      }
      companyId = newComp.id;
    }

    const uploadId = randomUUID();
    saveWorkbook(uploadId, buffer);

    // Supabase Storage copy is optional; the local file is used first.
    let storagePath: string | null = null;
    try {
      const path = `${uploadId}/${file.name}`;
      const { error: storageErr } = await supabase.storage
        .from('pcbs-files')
        .upload(path, buffer, {
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });
      if (!storageErr) storagePath = path;
    } catch (stErr) {
      console.warn('Supabase storage upload skipped/warning:', stErr);
    }

    writeUploadSession({
      uploadId,
      companyId: companyId as string,
      fileName: file.name,
      storagePath,
      createdAt: new Date().toISOString(),
      sheets,
      batches: [],
    });

    return NextResponse.json({
      success: true,
      uploadId,
      companyId,
      fileName: file.name,
      sheets: sheets.map(({ headers, ...sheet }) => ({ ...sheet, headerCount: headers.length, headers: headers.slice(0, 60) })),
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Terjadi kesalahan pada server saat memproses file.' }, { status: 500 });
  }
}
