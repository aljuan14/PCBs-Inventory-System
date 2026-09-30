import type { WorkBook } from 'xlsx';
import { parseSheet } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet, recordMask } from '@/lib/import-profiles';
import { flushProgress } from '@/lib/progress';
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
  return workbook.SheetNames.map((sheetName) => scanSheet(workbook, sheetName));
}

/**
 * scanWorkbook for a request that reports its progress: `onSheet` is told
 * which sheet comes next, and the scan yields between sheets so the report
 * reaches the page while the (synchronous) scanning goes on.
 */
export async function scanWorkbookWithProgress(workbook: WorkBook, onSheet: (done: number, total: number, sheetName: string) => void) {
  const scanned: ScannedSheet[] = [];
  for (const [index, sheetName] of workbook.SheetNames.entries()) {
    onSheet(index, workbook.SheetNames.length, sheetName);
    await flushProgress();
    scanned.push(scanSheet(workbook, sheetName));
  }
  return scanned;
}

function scanSheet(workbook: WorkBook, sheetName: string): ScannedSheet {
  const parsed = parseSheet(workbook, sheetName);
  const initial = detectSheet(sheetName, parsed.headers, parsed.totalRows, workbook.SheetNames);
  let dataRows = parsed.allRows;
  if (initial.category) {
    const mapping = buildSuggestedMapping(initial.profile, initial.category, parsed.headers, parsed.allRows.slice(0, SAMPLE_ROWS));
    const records = recordMask(parsed.allRows, parsed.rowNumbers, mapping);
    dataRows = parsed.allRows.filter((_, index) => records[index]);
  }
  // Re-run with the real row count so sheets of empty form rows are skipped.
  const detection = detectSheet(sheetName, parsed.headers, dataRows.length, workbook.SheetNames);
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
}
