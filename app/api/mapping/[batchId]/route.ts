import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { INVENTORY_FIELDS, type InventoryCategory } from '@/lib/inventory';
import fs from 'fs';
import path from 'path';

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
    const metaPath = path.join(process.cwd(), 'tmp_uploads', `${batchId}.json`);
    let headers: string[] = [];
    let sampleRow: Record<string, unknown> = {};

    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      headers = meta.headers || [];
      sampleRow = meta.previewRows?.[0] || {};
    }

    return NextResponse.json({
      batch,
      fieldDefinitions: INVENTORY_FIELDS[category] || [],
      headers,
      sampleRow,
    });
  } catch (err) {
    console.error('Mapping get error:', err);
    return NextResponse.json({ error: 'Gagal memuat konfigurasi mapping.' }, { status: 500 });
  }
}
