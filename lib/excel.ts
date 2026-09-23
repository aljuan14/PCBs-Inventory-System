import * as XLSX from 'xlsx';

export interface ExcelParseResult {
  sheetNames: string[];
  selectedSheet: string;
  headerRowIndex: number;
  headers: string[];
  previewRows: Record<string, any>[];
  totalRows: number;
  allRows: Record<string, any>[];
}

/**
 * Deteksi baris header terbaik pada berkas Excel yang sering kali memiliki
 * 1-4 baris judul dokumen / header bertingkat di awal sheet.
 */
export function parseExcelWithSmartHeader(buffer: ArrayBuffer | Uint8Array): ExcelParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('File Excel tidak memiliki sheet.');
  }

  const selectedSheet = sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];

  // Konversi sheet menjadi array of arrays (matrix 2D)
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawRows.length === 0) {
    throw new Error('Sheet Excel kosong.');
  }

  const headerKeywords = [
    'no', 'nomor', 'nama', 'merk', 'merek', 'seri', 'serial', 'lokasi', 'tahun',
    'daya', 'minyak', 'koordinat', 'uji', 'kondisi', 'status', 'kva', 'ton',
    'ppm', 'alat', 'volume', 'negara', 'wadah', 'berat', 'perawatan', 'digunakan',
  ];
  const clean = (value: unknown) => String(value ?? '').trim();
  const isEmpty = (value: unknown) => clean(value) === '';
  const isOrdinalOnlyRow = (row: any[]) => {
    const values = row.filter((cell) => !isEmpty(cell)).map((cell) => clean(cell));
    return values.length > 0 && values.every((value, index) => /^\d{1,3}$/.test(value) && Number(value) === index + 1);
  };
  const scoreLabelRow = (row: any[]) => {
    if (isOrdinalOnlyRow(row)) return -Infinity;
    return row.reduce((score, cell) => {
      const value = clean(cell).toLowerCase();
      if (!value || /^\d+$/.test(value)) return score;
      return score + 1 + (headerKeywords.some((keyword) => value.includes(keyword)) ? 3 : 0);
    }, 0);
  };

  // The final textual label row wins. Numeric-only ordinal rows are explicitly
  // excluded, so templates with a separate 1..N row remain intact.
  const maxScanRows = Math.min(14, rawRows.length);
  let bestRowIndex = 0;
  let maxScore = -Infinity;
  for (let i = 0; i < maxScanRows; i++) {
    const score = scoreLabelRow(rawRows[i] || []);
    if (score >= maxScore) {
      maxScore = score;
      bestRowIndex = i;
    }
  }

  const labelRow = rawRows[bestRowIndex] || [];
  const groupKeywords = ['perawatan', 'uji lanjutan', 'uji', 'kondisi'];
  const groupRows = rawRows.slice(Math.max(0, bestRowIndex - 3), bestRowIndex);
  const groupByColumn: string[] = Array.from({ length: labelRow.length }, () => '');
  for (const row of groupRows) {
    const anchors = row
      .map((cell, column) => ({ column, value: clean(cell) }))
      .filter(({ value }) => value && !/^\d+$/.test(value) && groupKeywords.some((keyword) => value.toLowerCase().includes(keyword)));
    for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex++) {
      const anchor = anchors[anchorIndex];
      const nextColumn = anchors[anchorIndex + 1]?.column ?? labelRow.length;
      for (let column = anchor.column; column < nextColumn; column++) {
        groupByColumn[column] = anchor.value;
      }
    }
  }

  // Merge a meaningful group label with the per-column label. Do not carry a
  // document title or an ordinal row into the field name.
  const headers: string[] = [];
  const colCount = labelRow.length;

  for (let c = 0; c < colCount; c++) {
    const label = clean(labelRow[c]);
    const group = groupByColumn[c];
    let headerName = label;
    if (group && label && group.toLowerCase() !== label.toLowerCase()) {
      headerName = `${group} - ${label}`;
    } else if (group && !label) {
      headerName = group;
    }
    if (!headerName) {
      headerName = `Kolom_${c + 1}`;
    }

    // Hindari header duplikat
    let uniqueName = headerName;
    let counter = 2;
    while (headers.includes(uniqueName)) {
      uniqueName = `${headerName}_${counter}`;
      counter++;
    }

    headers.push(uniqueName);
  }

  // Data begins after the textual label row. Any remaining ordinal-only row is
  // skipped defensively in case the source template places it below labels.
  const dataRows: Record<string, any>[] = [];
  for (let r = bestRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;
    if (isOrdinalOnlyRow(row)) continue;

    // Abaikan baris yang seluruhnya kosong
    const isRowEmpty = row.every(
      (cell) => cell === null || cell === undefined || String(cell).trim() === ''
    );
    if (isRowEmpty) continue;

    const rowObj: Record<string, any> = {};
    for (let c = 0; c < headers.length; c++) {
      const headerKey = headers[c];
      const val = row[c];
      rowObj[headerKey] = val !== undefined ? val : null;
    }
    dataRows.push(rowObj);
  }

  return {
    sheetNames,
    selectedSheet,
    headerRowIndex: bestRowIndex,
    headers,
    previewRows: dataRows.slice(0, 5),
    totalRows: dataRows.length,
    allRows: dataRows,
  };
}
