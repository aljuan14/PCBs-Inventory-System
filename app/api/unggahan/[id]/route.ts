import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/admin';
import type { InventoryCategory } from '@/lib/inventory';
import { UploadCheckError, readCompanyUpload, type UploadMode } from '@/lib/company-upload';
import { buildCheckReport, insertBatchRows } from '@/lib/import-transform';

// A large workbook is read and stored in one request, as an admin import is.
export const maxDuration = 300;

type Waiting = { id: string; company_id: string; kategori: InventoryCategory; mode: UploadMode; nama_file: string; file_path: string; status: string };

/**
 * The admin's answer to a company's upload (unggahan_perusahaan):
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
    const category = waiting.kategori;
    const { summary, sheet, mappings, transformed, existing } = await readCompanyUpload(supabase, { companyId: waiting.company_id, category, path: waiting.file_path, mode: waiting.mode });
    const rows = waiting.mode === 'tambah' ? transformed.rows.filter((row) => !existing.has(row)) : transformed.rows;
    if (rows.length === 0) return NextResponse.json({ error: `Semua ${summary.rows} baris sudah ada di data perusahaan; tidak ada yang ditambahkan.` }, { status: 400 });

    const batch = { id: randomUUID(), company_id: waiting.company_id };
    const { error: batchError } = await supabase.from('import_batches').insert({
      id: batch.id, company_id: batch.company_id, jenis_data: category, nama_file_asli: waiting.nama_file, file_storage_path: waiting.file_path,
      status: 'pending_mapping', sheet_name: summary.sheetName, profile: 'template_klhk', headers: sheet.headers,
      total_rows: sheet.allRows.length, data_rows: summary.rows, suggested_mapping: mappings,
    });
    if (batchError) return NextResponse.json({ error: `Gagal mencatat unggahan: ${batchError.message}` }, { status: 500 });

    const failure = await insertBatchRows(supabase, category, rows, batch);
    if (failure) {
      await supabase.from('import_batches').delete().eq('id', batch.id);
      return NextResponse.json({ error: `Gagal menyimpan data (Excel baris ${failure.rowNumber} dst.): ${failure.message}` }, { status: 500 });
    }

    // "ganti": the company's other rows of this form go only once the new ones are in.
    let replacedRows = 0;
    if (waiting.mode === 'ganti') {
      const { count, error: deleteError } = await supabase.from(category).delete({ count: 'exact' }).eq('company_id', batch.company_id).or(`import_batch_id.is.null,import_batch_id.neq.${batch.id}`);
      if (deleteError) {
        await supabase.from(category).delete().eq('import_batch_id', batch.id);
        await supabase.from('import_batches').delete().eq('id', batch.id);
        return NextResponse.json({ error: `Gagal mengganti data lama: ${deleteError.message}. Tidak ada data yang berubah.` }, { status: 500 });
      }
      replacedRows = count ?? 0;
      await supabase.from('import_batches').update({ status: 'replaced', replaced_by: batch.id, replaced_at: new Date().toISOString() })
        .eq('company_id', batch.company_id).eq('jenis_data', category).eq('status', 'imported').neq('id', batch.id);
    }

    const report = buildCheckReport(transformed, rows.length, mappings);
    await supabase.from('import_batches').update({ status: 'imported', laporan_pemeriksaan: report }).eq('id', batch.id);
    await supabase.from('unggahan_perusahaan').update({ status: 'diterima', import_batch_id: batch.id, ...checked }).eq('id', id);
    return NextResponse.json({ ok: true, imported: rows.length, skipped: transformed.rows.length - rows.length, replacedRows });
  } catch (err) {
    if (err instanceof UploadCheckError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('Company upload check error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memproses unggahan.' }, { status: 500 });
  }
}
