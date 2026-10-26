import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/admin';
import type { InventoryCategory } from '@/lib/inventory';
import { UploadCheckError, importCompanyUpload, type UploadMode } from '@/lib/company-upload';

// A large workbook is read and stored in one request, as an admin import is.
export const maxDuration = 300;

type Waiting = { id: string; company_id: string; kategori: InventoryCategory; mode: UploadMode; nama_file: string; file_path: string; status: string };

/**
 * The admin's answer to a company's upload still waiting from before uploads
 * were saved straight away (2026-10-26; unggahan_perusahaan):
 * { action: 'terima' } reads the file again and imports it like an admin
 * upload, as one import batch; "ganti" then removes every other row of the
 * company for that form. { action: 'tolak', catatan } refuses it, with the
 * reason the company sees.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Hanya admin yang dapat memeriksa unggahan.' }, { status: 403 });
    const { supabase, userId } = caller;
    const { id } = await params;
    const { action, catatan } = await req.json() as { action: 'terima' | 'tolak'; catatan?: string };

    const { data: upload } = await supabase.from('unggahan_perusahaan').select('id, company_id, kategori, mode, nama_file, file_path, status').eq('id', id).maybeSingle();
    const waiting = upload as Waiting | null;
    if (!waiting) return NextResponse.json({ error: 'Unggahan tidak ditemukan.' }, { status: 404 });
    if (waiting.status !== 'menunggu') return NextResponse.json({ error: 'Unggahan ini sudah diperiksa atau dibatalkan.' }, { status: 409 });
    const checked = { diperiksa_oleh: userId, diperiksa_at: new Date().toISOString() };

    if (action === 'tolak') {
      const reason = String(catatan ?? '').trim();
      if (!reason) return NextResponse.json({ error: 'Tuliskan alasan penolakan untuk perusahaan.' }, { status: 400 });
      const { error } = await supabase.from('unggahan_perusahaan').update({ status: 'ditolak', catatan: reason, ...checked }).eq('id', id).eq('status', 'menunggu');
      if (error) return NextResponse.json({ error: `Gagal menolak: ${error.message}` }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    if (action !== 'terima') return NextResponse.json({ error: 'Tindakan tidak dikenal.' }, { status: 400 });

    // The file is read again: what is imported is what the admin accepted, checked now.
    const { batchId, imported, skipped, replacedRows } = await importCompanyUpload(supabase, { companyId: waiting.company_id, category: waiting.kategori, path: waiting.file_path, fileName: waiting.nama_file, mode: waiting.mode });
    await supabase.from('unggahan_perusahaan').update({ status: 'diterima', import_batch_id: batchId, ...checked }).eq('id', id);
    return NextResponse.json({ ok: true, imported, skipped, replacedRows });
  } catch (err) {
    if (err instanceof UploadCheckError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('Company upload check error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memproses unggahan.' }, { status: 500 });
  }
}
