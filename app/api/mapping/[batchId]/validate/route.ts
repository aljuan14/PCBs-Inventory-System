import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InventoryCategory } from '@/lib/inventory';
import {
  BatchFileError,
  checkMappings,
  dashboardPreview,
  fetchExistingFingerprints,
  loadBatchSheet,
  missingImportantFields,
  sampleValues,
  transformRows,
} from '@/lib/import-transform';

// Parsing and checking a large sheet can take a while.
export const maxDuration = 60;

/**
 * Dry run of an import: applies the mapping to every row without writing, and
 * reports what would be stored, skipped, or needs the admin's attention.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const { mappings } = (await req.json()) as { mappings: Record<string, string> };
    const supabase = await createClient();

    const { data: batch, error } = await supabase
      .from('import_batches')
      .select('id, company_id, jenis_data, file_storage_path, sheet_name, status')
      .eq('id', batchId)
      .single();
    if (error || !batch) {
      return NextResponse.json({ error: 'Batch import tidak ditemukan.' }, { status: 404 });
    }

    const category = batch.jenis_data as InventoryCategory;
    const mappingError = checkMappings(category, mappings ?? {});
    if (mappingError) return NextResponse.json({ error: mappingError }, { status: 400 });

    const sheet = await loadBatchSheet(supabase, batch);
    const { rows, skippedEmpty, issues } = transformRows(category, sheet, mappings);

    const existing = await fetchExistingFingerprints(supabase, category, batch.company_id);
    const inDatabase = rows.filter((row) => existing.has(row.fingerprint));

    return NextResponse.json({
      totalRows: sheet.allRows.length,
      dataRows: rows.length,
      skippedEmpty,
      duplicatesInDb: { count: inDatabase.length, rows: inDatabase.slice(0, 8).map((row) => row.rowNumber) },
      issues: issues.list(),
      missingImportant: missingImportantFields(category, mappings),
      dashboard: dashboardPreview(category, rows.filter((row) => !existing.has(row.fingerprint))),
      samples: sampleValues(sheet),
    });
  } catch (err) {
    if (err instanceof BatchFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Validation error:', err);
    return NextResponse.json({ error: (err instanceof Error && err.message) || 'Gagal memeriksa data.' }, { status: 500 });
  }
}
