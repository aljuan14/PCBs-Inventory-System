import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InventoryCategory } from '@/lib/inventory';
import { BatchFileError, buildCheckReport, checkMappings, fetchExistingFingerprints, forgetBatchSheet, insertBatchRows, loadBatchSheet, transformRows } from '@/lib/import-transform';

// Large sheets (tens of thousands of rows) are parsed and inserted in one request.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { batchId, mappings, skipDuplicates = true } = body as {
      batchId: string;
      mappings: Record<string, string>; // { [excelColumn]: fieldKey }
      /** Skip rows identical to records already stored for this company. */
      skipDuplicates?: boolean;
    };

    if (!batchId || !mappings || Object.keys(mappings).length === 0) {
      return NextResponse.json({ error: 'Data batch dan konfigurasi mapping wajib diisi.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Ambil batch info
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .select('id, company_id, jenis_data, nama_file_asli, file_storage_path, sheet_name, profile, status')
      .eq('id', batchId)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Batch import tidak ditemukan.' }, { status: 404 });
    }
    if (batch.status === 'imported') {
      return NextResponse.json({ error: 'Batch ini sudah diimpor.' }, { status: 409 });
    }

    const jenisData = batch.jenis_data as InventoryCategory;
    const mappingError = checkMappings(jenisData, mappings);
    if (mappingError) return NextResponse.json({ error: mappingError }, { status: 400 });

    // 2. Baca sheet & transformasi (logika yang sama dengan pemeriksaan data)
    const sheet = await loadBatchSheet(supabase, batch);
    const transformed = transformRows(jenisData, sheet, mappings, { profile: batch.profile, fileName: batch.nama_file_asli });
    const { rows, skippedEmpty, skippedCopies } = transformed;

    let skippedDuplicates = 0;
    let toInsert = rows;
    if (skipDuplicates) {
      const existing = await fetchExistingFingerprints(supabase, jenisData, batch.company_id);
      toInsert = rows.filter((row) => !existing.has(row.fingerprint));
      skippedDuplicates = rows.length - toInsert.length;
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        error: skippedDuplicates > 0
          ? `Semua ${skippedDuplicates} baris sudah ada di database.`
          : 'Tidak ada baris data yang dapat diimpor.',
      }, { status: 400 });
    }

    // 3. Insert bertahap ke tabel sesuai jenis_data
    const failure = await insertBatchRows(supabase, jenisData, toInsert, batch);
    if (failure) {
      return NextResponse.json({
        error: `Gagal menyimpan data ke database (Excel baris ${failure.rowNumber} dst.): ${failure.message}`,
        detail: failure.detail,
        code: failure.code,
      }, { status: 500 });
    }

    // 4. Update status import_batches, dengan laporan pemeriksaan untuk riwayat upload
    await supabase
      .from('import_batches')
      .update({ status: 'imported', laporan_pemeriksaan: buildCheckReport(transformed, toInsert.length) })
      .eq('id', batchId);
    forgetBatchSheet(batchId);

    return NextResponse.json({
      success: true,
      importedCount: toInsert.length,
      skippedEmpty,
      skippedDuplicates: skippedCopies + skippedDuplicates,
      tableName: jenisData,
    });
  } catch (err) {
    if (err instanceof BatchFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Import execution error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal mengeksekusi import.' }, { status: 500 });
  }
}
