import * as XLSX from 'xlsx';

export interface SheetParseResult {
  sheetName: string;
  /** 0-based worksheet row index of the main label row, or -1 if none was found. */
  headerRowIndex: number;
  headers: string[];
  previewRows: Record<string, unknown>[];
  totalRows: number;
  allRows: Record<string, unknown>[];
  /** 1-based worksheet row number of each entry in allRows, for pointing admins at problem rows. */
  rowNumbers: number[];
}

export interface ExcelParseResult extends SheetParseResult {
  sheetNames: string[];
  selectedSheet: string;
}

const HEADER_KEYWORDS = [
  'no', 'nomor', 'nama', 'merk', 'merek', 'seri', 'serial', 'lokasi', 'tahun',
  'daya', 'minyak', 'oli', 'koordinat', 'uji', 'kondisi', 'status', 'kva', 'ton',
  'ppm', 'alat', 'volume', 'negara', 'wadah', 'berat', 'perawatan', 'digunakan',
  'kode', 'unit', 'jenis', 'analisa', 'hasil', 'tanggal', 'pabrikan', 'produksi',
];
const HEADER_SCAN_ROWS = 20;
const MAX_GROUP_ROWS = 3;
const MAX_SUBLABEL_ROWS = 2;

// Control characters other than tab and line breaks. Exports from fixed-width
// systems pad text with NUL ("TRAFINDO\u0000\u0000…", UID Jatim), which
// Postgres rejects in text and jsonb ("unsupported Unicode escape sequence").
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const cleanCell = (value: unknown) => (typeof value === 'string' ? value.replace(CONTROL_CHARACTERS, '') : value);

const text = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(cleanCell(value) ?? '')).replace(/\s+/g, ' ').trim();
const isNumericLike = (value: string) => /^[\d.,\s-]+$/.test(value);
const isLabel = (value: string) => value !== '' && !isNumericLike(value);

function isOrdinalOnlyRow(row: unknown[]) {
  const values = row.map(text).filter(Boolean);
  return values.length > 1 && values.every((value, index) => /^\d{1,3}$/.test(value) && Number(value) === index + 1);
}

function scoreLabelRow(row: unknown[]) {
  if (isOrdinalOnlyRow(row)) return -Infinity;
  const labels = row.map(text).filter(isLabel);
  const distinct = new Set(labels.map((label) => label.toLowerCase()));
  if (distinct.size < 2) return distinct.size;
  const keywordHits = [...distinct].filter((label) => HEADER_KEYWORDS.some((keyword) => new RegExp(`\\b${keyword}`).test(label))).length;
  // Repeated values ("Inventarisasi | Inventarisasi | ...") mark a group row, not labels.
  return distinct.size + keywordHits * 3 - (labels.length - distinct.size);
}

/**
 * Formatting-only cells can stretch a sheet's range to ~1M rows. Shrink it to
 * the cells that actually hold values so parsing stays proportional to data.
 */
function tightenRange(worksheet: XLSX.WorkSheet) {
  let maxRow = -1;
  let maxCol = -1;
  for (const key of Object.keys(worksheet)) {
    if (key[0] === '!') continue;
    const cell = worksheet[key] as XLSX.CellObject;
    if (cell.v === undefined || cell.v === null || cell.v === '') continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  if (maxRow < 0) return false;
  worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  return true;
}

export function readWorkbook(buffer: ArrayBuffer | Uint8Array) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (workbook.SheetNames.length === 0) throw new Error('File Excel tidak memiliki sheet.');
  return workbook;
}

/**
 * Detect the real header of one sheet. Handles report-style layouts:
 * title rows, merged group headers ("UJI LANJUTAN") with sub-labels in the
 * row below, ordinal "1 2 3 ..." rows, and PLN forms with 8-10 note rows.
 */
export function parseSheet(workbook: XLSX.WorkBook, sheetName: string): SheetParseResult {
  const empty: SheetParseResult = { sheetName, headerRowIndex: -1, headers: [], previewRows: [], totalRows: 0, allRows: [], rowNumbers: [] };
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet || !tightenRange(worksheet)) return empty;

  // Keep blank rows so indices match the worksheet (needed for merge ranges).
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: true });
  if (rawRows.length === 0) return empty;

  let anchor = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, rawRows.length); i++) {
    const score = scoreLabelRow(rawRows[i] || []);
    if (score > bestScore) {
      bestScore = score;
      anchor = i;
    }
  }
  if (anchor < 0 || bestScore < 2) return empty;

  const anchorRow = rawRows[anchor].map(text);

  // Sub-label rows sit directly below the anchor and only fill columns whose
  // anchor cell is empty or an ordinal number (the template's merged groups).
  let bandEnd = anchor;
  for (let r = anchor + 1; r <= anchor + MAX_SUBLABEL_ROWS && r < rawRows.length; r++) {
    const row = rawRows[r].map(text);
    if (isOrdinalOnlyRow(row)) { bandEnd = r; continue; }
    const labelColumns = row.map((value, column) => (isLabel(value) ? column : -1)).filter((column) => column >= 0);
    if (labelColumns.length === 0 || labelColumns.some((column) => isLabel(anchorRow[column] ?? ''))) break;
    bandEnd = r;
  }

  const colCount = Math.max(...rawRows.slice(Math.max(0, anchor - MAX_GROUP_ROWS), bandEnd + 1).map((row) => row.length));
  const merges = worksheet['!merges'] ?? [];

  // Per-row lookups for the header band, built once. Some workbooks repeat a
  // header block across all 16k columns with tens of thousands of merges, so
  // anything scanning merges or columns per cell would take minutes.
  const bandStart = Math.max(0, anchor - MAX_GROUP_ROWS);
  const bandRows = new Map<number, { texts: string[]; labelCount: number; mergeAt: (XLSX.Range | undefined)[]; filledLeft: Int32Array }>();
  for (let r = bandStart; r <= bandEnd; r++) {
    const texts = rawRows[r].map(text);
    const mergeAt: (XLSX.Range | undefined)[] = [];
    // Nearest non-empty column at or left of each column (-1 when none).
    const filledLeft = new Int32Array(Math.max(colCount, texts.length));
    let last = -1;
    for (let c = 0; c < filledLeft.length; c++) {
      if ((texts[c] ?? '') !== '') last = c;
      filledLeft[c] = last;
    }
    bandRows.set(r, { texts, labelCount: texts.filter(isLabel).length, mergeAt, filledLeft });
  }
  for (const range of merges) {
    for (let r = Math.max(range.s.r, bandStart); r <= Math.min(range.e.r, bandEnd); r++) {
      const { mergeAt } = bandRows.get(r)!;
      for (let c = range.s.c; c <= Math.min(range.e.c, colCount - 1); c++) mergeAt[c] ??= range;
    }
  }

  // Group label for a column: nearest label above `belowRow` in the band,
  // taken from a merged range or forward-filled from the left. Title rows
  // (a single label, or merges spanning most of the sheet) are ignored.
  const groupFor = (column: number, belowRow: number, forwardFill = true) => {
    for (let r = belowRow - 1; r >= bandStart; r--) {
      const { texts, labelCount, mergeAt, filledLeft } = bandRows.get(r)!;
      if (labelCount < 2) continue;
      const merge = mergeAt[column];
      if (merge) {
        const value = text(rawRows[merge.s.r]?.[merge.s.c]);
        if (isLabel(value) && merge.e.c - merge.s.c + 1 <= colCount * 0.6) return value;
        continue;
      }
      if (!forwardFill) continue;
      const c = filledLeft[column] ?? -1;
      if (c >= 0 && isLabel(texts[c])) return texts[c];
    }
    return '';
  };

  const headers: string[] = [];
  const usedHeaders = new Set<string>();
  const nextSuffix = new Map<string, number>();
  for (let column = 0; column < colCount; column++) {
    let label = isLabel(anchorRow[column] ?? '') ? anchorRow[column] : '';
    let group = '';
    if (!label) {
      for (let r = bandEnd; r > anchor; r--) {
        const value = text(rawRows[r][column]);
        if (isLabel(value)) {
          label = value;
          group = groupFor(column, r);
          break;
        }
      }
      if (!label) group = groupFor(column, anchor, false);
    }
    let header = group && label && group.toLowerCase() !== label.toLowerCase() ? `${group} - ${label}` : label || group || `Kolom_${column + 1}`;
    if (usedHeaders.has(header)) {
      let counter = nextSuffix.get(header) ?? 2;
      while (usedHeaders.has(`${header} (${counter})`)) counter++;
      nextSuffix.set(header, counter + 1);
      header = `${header} (${counter})`;
    }
    headers.push(header);
    usedHeaders.add(header);
  }

  const headerTexts = new Set(anchorRow.filter(isLabel).map((value) => value.toLowerCase()));
  const allRows: Record<string, unknown>[] = [];
  const rowNumbers: number[] = [];
  const filledCounts: number[] = [];
  let blankGap = false;
  for (let r = bandEnd + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const values = row.map(text);
    const filled = values.filter(Boolean);
    // Skip blank rows, footnotes, rows holding only a running number, and
    // header rows repeated further down the sheet.
    if (filled.length < 2 || isOrdinalOnlyRow(row)) {
      if (filled.length === 0) blankGap = true;
      continue;
    }
    if (filled.filter((value) => headerTexts.has(value.toLowerCase())).length >= filled.length / 2) continue;
    // A much sparser row after a blank gap starts a trailing section
    // (documentation checklist, signatures), not more inventory rows.
    if (blankGap && filledCounts.length > 0) {
      const median = [...filledCounts].sort((a, b) => a - b)[Math.floor(filledCounts.length / 2)];
      if (filled.length < median * 0.3) break;
    }
    blankGap = false;
    if (filledCounts.length < 200) filledCounts.push(filled.length);
    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, column) => {
      const value = cleanCell(row[column]);
      rowObj[header] = value === undefined || value === '' ? null : value;
    });
    allRows.push(rowObj);
    rowNumbers.push(r + 1);
  }

  return { sheetName, headerRowIndex: anchor, headers, previewRows: allRows.slice(0, 5), totalRows: allRows.length, allRows, rowNumbers };
}

/** Parse one sheet (the first by default) of an Excel buffer. */
export function parseExcelWithSmartHeader(buffer: ArrayBuffer | Uint8Array, sheetName?: string): ExcelParseResult {
  const workbook = readWorkbook(buffer);
  const selectedSheet = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const result = parseSheet(workbook, selectedSheet);
  if (result.headers.length === 0) throw new Error(`Sheet "${selectedSheet}" kosong atau header tidak ditemukan.`);
  return { ...result, sheetNames: workbook.SheetNames, selectedSheet };
}
