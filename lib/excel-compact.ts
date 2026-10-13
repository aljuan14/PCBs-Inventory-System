/**
 * Workbooks above this size are rewritten in the browser before upload,
 * keeping the cells and dropping the pictures. Reports with photos of every
 * transformer reach 50-100 MB (Toray: 269 photos, 96 MB) while their data is
 * under 1 MB, and the importer reads only the cells. Smaller files go as they are.
 */
export const COMPACT_ABOVE_BYTES = 10 * 1024 * 1024;

/**
 * The workbook as .xlsx with its cell values, formulas' results, merges and
 * sheets, without pictures (SheetJS does not write images). Checked on the
 * Toray and Shenhua reports: every cell and merge equal, same rows found by
 * the importer, 96 MB -> 40 kB.
 */
export async function compactWorkbook(file: File): Promise<File> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
  const name = file.name.replace(/\.xlsx?$/i, '') + '.xlsx';
  return new File([data], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', lastModified: file.lastModified });
}
