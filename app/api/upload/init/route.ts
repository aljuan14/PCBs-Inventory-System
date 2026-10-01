import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanupStaleUploads, createUploadSession, isExcelFileName, MAX_UPLOAD_BYTES } from '@/lib/upload-store';

/**
 * Step 0 of an import: resolves the company and hands the browser a one-time
 * token to upload the workbook straight to Supabase Storage. The file never
 * passes through this server, so large reports are not cut off by request
 * body limits (4.5 MB on Vercel).
 */
export async function POST(req: NextRequest) {
  try {
    const { fileName, fileSize, companyId: selectedCompanyId, newCompanyName } = (await req.json()) as {
      fileName?: string;
      fileSize?: number;
      companyId?: string | null;
      newCompanyName?: string | null;
    };

    if (!fileName || !isExcelFileName(fileName)) {
      return NextResponse.json({ error: 'Berkas harus berformat Excel (.xlsx / .xls).' }, { status: 400 });
    }
    if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `Ukuran berkas melebihi batas ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }, { status: 400 });
    }
    if (!selectedCompanyId && !newCompanyName?.trim()) {
      return NextResponse.json({ error: 'Perusahaan wajib dipilih atau diisi.' }, { status: 400 });
    }

    const supabase = await createClient();
    let companyId = selectedCompanyId ?? null;

    if (!companyId && newCompanyName?.trim()) {
      // Reuse a company of the same name (case-insensitive): the form keeps the
      // typed name between uploads, and each upload used to add another copy.
      const name = newCompanyName.trim();
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .ilike('nama_perusahaan', name.replace(/[\\%_]/g, (ch) => `\\${ch}`))
        .order('created_at', { ascending: true })
        .limit(1);
      companyId = (existing?.[0]?.id as string | undefined) ?? null;
    }

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
      companyId = newComp.id as string;
    }

    const session = await createUploadSession(supabase, companyId as string, fileName);
    await cleanupStaleUploads(supabase);

    return NextResponse.json({ success: true, companyId, ...session });
  } catch (err) {
    console.error('Upload init error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal menyiapkan unggahan.' }, { status: 500 });
  }
}
