import type { WorkBook } from 'xlsx';
import { parseSheet } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet, hasIdentity } from '@/lib/import-profiles';
import type { UploadSheet } from '@/lib/upload-store';

// Rows kept per sheet so the mapping can be suggested again once the admin picks a category.
const SAMPLE_ROWS = 30;

export interface ScannedSheet {
  sheet: UploadSheet;
  /** Every parsed row with its Excel row number, for callers that import right away. */
  parsed: ReturnType<typeof parseSheet>;
}

/**
 * Classifies every sheet of a workbook (profile, category, include by
 * default) and counts the rows carrying real inventory data. Shared by the
 * upload route and the command-line import scripts.
 */
export function scanWorkbook(workbook: WorkBook): ScannedSheet[] {
  return workbook.SheetNames.map((sheetName) => {
    const parsed = parseSheet(workbook, sheetName);
    const initial = detectSheet(sheetName, parsed.headers, parsed.totalRows, workbook.SheetNames.length);
    let dataRows = parsed.allRows;
    if (initial.category) {
      const mapping = buildSuggestedMapping(initial.profile, initial.category, parsed.headers, parsed.allRows.slice(0, SAMPLE_ROWS));
      dataRows = parsed.allRows.filter((row) => hasIdentity(row, mapping));
    }
    // Re-run with the real row count so sheets of empty form rows are skipped.
    const detection = detectSheet(sheetName, parsed.headers, dataRows.length, workbook.SheetNames.length);
    const sheet: UploadSheet = {
      sheetName,
      headerRowIndex: parsed.headerRowIndex,
      headers: parsed.headers,
      totalRows: parsed.totalRows,
      dataRows: dataRows.length,
      previewRows: dataRows.slice(0, 5),
      sampleRows: dataRows.slice(0, SAMPLE_ROWS),
      ...detection,
    };
    return { sheet, parsed };
  });
}
