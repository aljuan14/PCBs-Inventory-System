import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseExcelWithSmartHeader } from '@/lib/excel';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    let companyId = formData.get('company_id') as string | null;
    const newCompanyName = formData.get('new_company_name') as string | null;
    const jenisData = formData.get('jenis_data') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'File Excel wajib diunggah.' }, { status: 400 });
    }

    if (!jenisData || !['transformator', 'kapasitor', 'minyak_dielektrik'].includes(jenisData)) {
      return NextResponse.json({ error: 'Jenis data inventaris tidak valid.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Jika ada nama perusahaan baru, simpan ke tabel companies
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

    if (!companyId) {
      return NextResponse.json({ error: 'Perusahaan wajib dipilih atau diisi.' }, { status: 400 });
    }

    // 2. Baca buffer file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Parse headers & preview rows
    const parseResult = parseExcelWithSmartHeader(arrayBuffer);

    // 4. Buat record import_batches di database
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .insert({
        company_id: companyId,
        jenis_data: jenisData,
        nama_file_asli: file.name,
        status: 'pending_mapping',
      })
      .select('id')
      .single();

    if (batchErr) {
      console.error('Error creating import batch:', batchErr);
      return NextResponse.json({ error: `Gagal membuat batch import: ${batchErr.message}` }, { status: 500 });
    }

    const batchId = batch.id;

    // 5. Simpan file secara lokal ke tmp_uploads sebagai cadangan instan
    const uploadDir = path.join(process.cwd(), 'tmp_uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const localFilePath = path.join(uploadDir, `${batchId}.xlsx`);
    fs.writeFileSync(localFilePath, buffer);

    // Simpan juga json preview untuk akses cepat di halaman mapping
    const metaPath = path.join(uploadDir, `${batchId}.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        batchId,
        companyId,
        jenisData,
        fileName: file.name,
        headers: parseResult.headers,
        totalRows: parseResult.totalRows,
        previewRows: parseResult.previewRows,
      })
    );

    // 6. Coba upload ke Supabase Storage (opsional)
    try {
      const storagePath = `${batchId}/${file.name}`;
      const { error: storageErr } = await supabase.storage
        .from('pcbs-files')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });

      if (!storageErr) {
        await supabase
          .from('import_batches')
          .update({ file_storage_path: storagePath })
          .eq('id', batchId);
      }
    } catch (stErr) {
      console.warn('Supabase storage upload skipped/warning:', stErr);
    }

    return NextResponse.json({
      success: true,
      batchId,
      companyId,
      jenisData,
      fileName: file.name,
      headers: parseResult.headers,
      previewRows: parseResult.previewRows,
      totalRows: parseResult.totalRows,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message || 'Terjadi kesalahan pada server saat memproses file.' }, { status: 500 });
  }
}
