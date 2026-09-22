import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const supabase = await createClient();

    // 1. Ambil data batch dari database
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .select('*, companies(*)')
      .eq('id', batchId)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Data batch tidak ditemukan di database.' }, { status: 404 });
    }

    // 2. Ambil field_definitions sesuai jenis_data
    const { data: fieldDefs, error: fieldErr } = await supabase
      .from('field_definitions')
      .select('*')
      .eq('jenis_data', batch.jenis_data)
      .order('wajib', { ascending: false });

    // 3. Ambil data headers dan sample row dari file meta di tmp_uploads
    const metaPath = path.join(process.cwd(), 'tmp_uploads', `${batchId}.json`);
    let headers: string[] = [];
    let sampleRow: Record<string, any> = {};

    if (fs.existsSync(metaPath)) {
      try {
        const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        headers = metaContent.headers || [];
        if (metaContent.previewRows && metaContent.previewRows.length > 0) {
          sampleRow = metaContent.previewRows[0];
        }
      } catch (err) {
        console.error('Error reading meta json:', err);
      }
    }

    return NextResponse.json({
      batch,
      fieldDefinitions: fieldDefs || [],
      headers,
      sampleRow,
    });
  } catch (err: any) {
    console.error('Mapping get error:', err);
    return NextResponse.json({ error: err.message || 'Gagal memuat konfigurasi mapping.' }, { status: 500 });
  }
}
