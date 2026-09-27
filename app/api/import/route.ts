import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InventoryCategory } from '@/lib/inventory';
import { BatchFileError, checkMappings, fetchExistingFingerprints, forgetBatchSheet, loadBatchSheet, transformRows } from '@/lib/import-transform';

const INSERT_CHUNK_SIZE = 500;

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
      .select('id, company_id, jenis_data, file_storage_path, status')
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
    const sheet = await loadBatchSheet(supabase, batchId, batch.file_storage_path);
    const { rows, skippedEmpty } = transformRows(jenisData, sheet, mappings);

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
    const tableName = jenisData;
    const records = toInsert.map((row) => ({ ...row.item, company_id: batch.company_id, import_batch_id: batchId }));
    for (let start = 0; start < records.length; start += INSERT_CHUNK_SIZE) {
      const chunk = records.slice(start, start + INSERT_CHUNK_SIZE);
      const { error: insertErr } = await supabase.from(tableName).insert(chunk);
      if (insertErr) {
        console.error('Insert error on table ' + tableName, JSON.stringify(insertErr, null, 2));
        console.error('Sample row attempted:', JSON.stringify(chunk[0], null, 2));
        // Earlier chunks are already stored; remove them so a retry starts clean.
        if (start > 0) await supabase.from(tableName).delete().eq('import_batch_id', batchId);
        return NextResponse.json({
          error: `Gagal menyimpan data ke database (Excel baris ${toInsert[start].rowNumber} dst.): ${insertErr.message}`,
          detail: insertErr.details ?? insertErr.hint ?? null,
          code: insertErr.code ?? null,
        }, { status: 500 });
      }
    }

    // 4. Update status import_batches
    await supabase
      .from('import_batches')
      .update({ status: 'imported' })
      .eq('id', batchId);
    forgetBatchSheet(batchId);

    return NextResponse.json({
      success: true,
      importedCount: records.length,
      skippedEmpty,
      skippedDuplicates,
      tableName,
    });
  } catch (err) {
    if (err instanceof BatchFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Import execution error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal mengeksekusi import.' }, { status: 500 });
  }
}
