import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InventoryCategory } from '@/lib/inventory';
import {
  BatchFileError,
  checkMappings,
  dashboardPreview,
  findRowsInDatabase,
  loadBatchSheet,
  loadReplaceTarget,
  missingImportantFields,
  sampleValues,
  transformRows,
} from '@/lib/import-transform';
import { progressResponse } from '@/lib/progress';
import { stepTimer } from '@/lib/timing';

// Parsing and checking a large sheet can take a while.
export const maxDuration = 60;

/**
 * Dry run of an import: applies the mapping to every row without writing, and
 * reports what would be stored, skipped, or needs the admin's attention.
 * Streams its progress (lib/progress.ts); problems found before the work
 * starts are a plain JSON error.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const { mappings, replaceBatchId } = (await req.json()) as {
      mappings: Record<string, string>;
      /** Earlier batch this import would replace; its rows do not count as duplicates. */
      replaceBatchId?: string | null;
    };
    const timer = stepTimer(`check ${batchId.slice(0, 8)}`);
    const supabase = await createClient();

    const { data: batch, error } = await supabase
      .from('import_batches')
      .select('id, company_id, jenis_data, nama_file_asli, file_storage_path, sheet_name, profile, status')
      .eq('id', batchId)
      .single();
    if (error || !batch) {
      return NextResponse.json({ error: 'Batch import tidak ditemukan.' }, { status: 404 });
    }

    const category = batch.jenis_data as InventoryCategory;
    const mappingError = checkMappings(category, mappings ?? {});
    if (mappingError) return NextResponse.json({ error: mappingError }, { status: 400 });

    const replacing = await loadReplaceTarget(supabase, batch, replaceBatchId);

    return progressResponse('Validation', async (send) => {
      send({ type: 'plan', stages: ['load', 'transform', 'existing'] });
      send({ type: 'stage', stage: 'load' });
      const sheet = await loadBatchSheet(supabase, batch);
      timer.step('load');
      send({ type: 'stage', stage: 'transform' });
      const { rows, skippedEmpty, issues } = transformRows(category, sheet, mappings, { profile: batch.profile, fileName: batch.nama_file_asli });
      timer.step('transform');

      send({ type: 'stage', stage: 'existing' });
      const existing = await findRowsInDatabase(supabase, category, batch.company_id, rows, replacing?.id,
        (done, total) => send({ type: 'progress', done, total }));
      const inDatabase = rows.filter((row) => existing.has(row));
      timer.step('existing');
      timer.done();

      return {
        type: 'result',
        data: {
          totalRows: sheet.allRows.length,
          dataRows: rows.length,
          skippedEmpty,
          duplicatesInDb: { count: inDatabase.length, rows: inDatabase.slice(0, 8).map((row) => row.rowNumber) },
          issues: issues.list(),
          missingImportant: missingImportantFields(category, mappings),
          dashboard: dashboardPreview(category, rows.filter((row) => !existing.has(row))),
          samples: sampleValues(sheet),
          replacing,
        },
      };
    });
  } catch (err) {
    if (err instanceof BatchFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Validation error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal memeriksa data.' }, { status: 500 });
  }
}
