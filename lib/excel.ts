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

  // Cari baris yang paling mungkin merupakan header kolom:
  // Kriteria: memiliki jumlah kolom terisi terbanyak dan berisi kata-kata kunci
  // seperti 'no', 'nama', 'merk', 'merek', 'seri', 'lokasi', 'tahun', 'daya', 'koordinat'
  const headerKeywords = [
    'no', 'nomor', 'nama', 'merk', 'merek', 'seri', 'serial', 'lokasi',
    'tahun', 'daya', 'tegangan', 'minyak', 'koordinat', 'uji', 'kondisi',
    'status', 'kva', 'kvar', 'ton', 'ppm', 'alat', 'volume'
  ];

  let bestRowIndex = 0;
  let maxScore = -1;

  // Cek maksimal hingga 10 baris pertama
  const maxScanRows = Math.min(10, rawRows.length);
  for (let i = 0; i < maxScanRows; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;

    let score = 0;
    let filledCols = 0;

    for (const cell of row) {
      if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
        filledCols++;
        const cellStr = String(cell).toLowerCase();
        for (const kw of headerKeywords) {
          if (cellStr.includes(kw)) {
            score += 2;
            break;
          }
        }
      }
    }

    const totalScore = filledCols + score;
    if (totalScore > maxScore) {
      maxScore = totalScore;
      bestRowIndex = i;
    }
  }

  // Jika baris sebelumnya adalah header induk (misal row 1 'Data Teknis', row 2 'Daya'),
  // kita bisa menggabungkan jika diperlukan, namun baris bestRowIndex biasanya adalah nama kolom spesifik.
  const rawHeaderRow = rawRows[bestRowIndex] || [];
  
  // Ambil headers unik dan bersihkan spasi
  const headers: string[] = [];
  const colCount = rawHeaderRow.length;

  for (let c = 0; c < colCount; c++) {
    const rawVal = rawHeaderRow[c];
    let headerName = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
    
    // Jika kolom tidak ada namanya, beri label Kolom_X
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

  // Ambil baris data setelah headerRowIndex
  const dataRows: Record<string, any>[] = [];
  for (let r = bestRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;

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
