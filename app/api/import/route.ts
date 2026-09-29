import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InventoryCategory } from '@/lib/inventory';
import { BatchFileError, buildCheckReport, checkMappings, findRowsInDatabase, forgetBatchSheet, insertBatchRows, loadBatchSheet, loadReplaceTarget, transformRows } from '@/lib/import-transform';
import { flushProgress, progressResponse, type ProgressStage } from '@/lib/progress';
import { stepTimer } from '@/lib/timing';

// Large sheets (tens of thousands of rows) are parsed and inserted in one request.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { batchId, mappings, skipDuplicates = true, replaceBatchId } = body as {
      batchId: string;
      mappings: Record<string, string>; // { [excelColumn]: fieldKey }
      /** Skip rows identical to records already stored for this company. */
      skipDuplicates?: boolean;
      /** Earlier import batch (a previous version of this sheet) whose rows this import replaces. */
      replaceBatchId?: string | null;
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

    const timer = stepTimer(`import ${batchId.slice(0, 8)}`);
    const replacing = await loadReplaceTarget(supabase, batch, replaceBatchId);

    // From here the work streams its progress (lib/progress.ts) and finishes
    // even if the page is closed.
    return progressResponse(req, 'Import', async (send) => {
      const stages: ProgressStage[] = ['load', 'transform', ...(skipDuplicates ? ['existing' as const] : []), 'insert', ...(replacing ? ['replace' as const] : [])];
      send({ type: 'plan', stages });

      // 2. Baca sheet & transformasi (logika yang sama dengan pemeriksaan data)
      send({ type: 'stage', stage: 'load' });
      const sheet = await loadBatchSheet(supabase, batch);
      timer.step('load');
      send({ type: 'stage', stage: 'transform' });
      await flushProgress();
      const transformed = transformRows(jenisData, sheet, mappings, { profile: batch.profile, fileName: batch.nama_file_asli });
      const { rows, skippedEmpty, skippedCopies } = transformed;
      timer.step('transform');

      // Rows of the batch being replaced are about to go, so they are not duplicates.
      let skippedDuplicates = 0;
      let toInsert = rows;
      if (skipDuplicates) {
        send({ type: 'stage', stage: 'existing' });
        const existing = await findRowsInDatabase(supabase, jenisData, batch.company_id, rows, replacing?.id,
          (done, total) => send({ type: 'progress', done, total }));
        toInsert = rows.filter((row) => !existing.has(row));
        skippedDuplicates = rows.length - toInsert.length;
        timer.step('existing');
      }

      if (toInsert.length === 0) {
        timer.done();
        return {
          type: 'error',
          error: skippedDuplicates > 0 ? `Semua ${skippedDuplicates} baris sudah ada di database.` : 'Tidak ada baris data yang dapat diimpor.',
          status: 400,
        };
      }

      // 3. Insert bertahap ke tabel sesuai jenis_data
      send({ type: 'stage', stage: 'insert' });
      const failure = await insertBatchRows(supabase, jenisData, toInsert, batch, (done, total) => send({ type: 'progress', done, total }));
      timer.step('insert');
      if (failure) {
        timer.done();
        return {
          type: 'error',
          error: `Gagal menyimpan data ke database (Excel baris ${failure.rowNumber} dst.): ${failure.message}`,
          detail: failure.detail,
          code: failure.code,
        };
      }

      // 3b. The old version's rows go only once the new ones are stored; if that
      // fails, the new rows are removed again so nothing is left half-replaced.
      let deletedRows = 0;
      if (replacing) {
        send({ type: 'stage', stage: 'replace' });
        const { data: deleted, error: replaceError } = await supabase.rpc('replace_import_batch', { p_old: replacing.id, p_new: batchId });
        timer.step('replace');
        if (replaceError) {
          await supabase.from(jenisData).delete().eq('import_batch_id', batchId);
          timer.done();
          return { type: 'error', error: `Gagal mengganti data unggahan lama: ${replaceError.message}. Tidak ada data yang berubah.` };
        }
        deletedRows = Number(deleted) || 0;
      }

      // 4. Update status import_batches, dengan laporan pemeriksaan untuk riwayat upload
      const report = buildCheckReport(transformed, toInsert.length, mappings);
      if (replacing) report.replaced = { batchId: replacing.id, fileName: replacing.fileName, sheetName: replacing.sheetName, deletedRows };
      await supabase
        .from('import_batches')
        .update({ status: 'imported', laporan_pemeriksaan: report })
        .eq('id', batchId);
      forgetBatchSheet(batchId);
      timer.done();

      return {
        type: 'result',
        data: {
          success: true,
          importedCount: toInsert.length,
          skippedEmpty,
          skippedDuplicates: skippedCopies + skippedDuplicates,
          replacedRows: replacing ? deletedRows : null,
          tableName: jenisData,
        },
      };
    });
  } catch (err) {
    if (err instanceof BatchFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Import execution error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal mengeksekusi import.' }, { status: 500 });
  }
}
