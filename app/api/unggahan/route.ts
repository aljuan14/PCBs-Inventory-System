import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { COMPANY_UPLOAD_FOLDER, UploadCheckError, importCompanyUpload, readCompanyUpload, type UploadMode } from '@/lib/company-upload';
import { isExcelFileName } from '@/lib/upload-store';

export const maxDuration = 300;

const isCategory = (value: unknown): value is InventoryCategory => INVENTORY_CATEGORIES.some((category) => category.key === value);

/**
 * A company's Excel upload of a form 1.x (lib/company-upload.ts). The file is
 * already in its folder (the browser put it there). `send: false` checks it
 * and returns what was found; `send: true` reads it again and saves it to
 * the company's data at once (no admin acceptance since 2026-10-26), noted
 * as accepted in unggahan_perusahaan for the upload history.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, category, path, fileName, mode, send = false } = await req.json() as { companyId: string; category: InventoryCategory; path: string; fileName: string; mode: UploadMode; send?: boolean };
    if (!companyId || !isCategory(category) || (mode !== 'tambah' && mode !== 'ganti')) return NextResponse.json({ error: 'Perusahaan, formulir, dan pilihan tambah/ganti wajib diisi.' }, { status: 400 });
    if (typeof path !== 'string' || !path.startsWith(`${COMPANY_UPLOAD_FOLDER}/${companyId}/`) || typeof fileName !== 'string' || !isExcelFileName(fileName)) {
      return NextResponse.json({ error: 'Berkas harus Excel (.xlsx atau .xls).' }, { status: 400 });
    }

    const supabase = await createClient();
    // Row-level security answers: a company sees only itself.
    const { data: company } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle();
    if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan.' }, { status: 404 });

    if (!send) {
      const { summary } = await readCompanyUpload(supabase, { companyId, category, path, mode });
      return NextResponse.json({ summary });
    }

    const { summary, batchId, imported, skipped, replacedRows, plansKept, plansLost } = await importCompanyUpload(supabase, { companyId, category, path, fileName, mode });
    // The data is in; this row is the upload's place in the history.
    const { data, error } = await supabase.from('unggahan_perusahaan').insert({
      company_id: companyId, kategori: category, mode, nama_file: fileName, file_path: path, sheet_name: summary.sheetName, ringkasan: summary,
      status: 'diterima', import_batch_id: batchId,
    }).select('id').single();
    if (error) console.error('Company upload saved, history row failed:', error.message);
    return NextResponse.json({ id: data?.id, summary, imported, skipped, replacedRows, plansKept, plansLost });
  } catch (err) {
    if (err instanceof UploadCheckError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('Company upload error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memeriksa berkas.' }, { status: 500 });
  }
}
