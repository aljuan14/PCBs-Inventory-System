import type { ImportProfile } from '@/lib/import-profiles';

/**
 * Rules for the Excel files companies upload: small files with only the data
 * of the official KLHK template. Photos and documents belong in the
 * "bukti dukung" links, not in the workbook.
 *
 * The file rules are read from the workbook's zip directory in the browser,
 * without parsing the cells; the sheet rules come from the server's scan.
 * The admin sees every broken rule as a warning and may still upload (large
 * files lose their photos on the way, see excel-compact.ts). Company accounts
 * do not exist yet; once they do, their uploads are refused on a broken rule
 * (enforceUploadRules).
 */

export const COMPANY_MAX_UPLOAD_BYTES = 1024 * 1024;
export const COMPANY_MAX_ROWS_PER_SHEET = 5000;

/** Whether a broken rule refuses the upload. False for the admin, the only account for now. */
export const enforceUploadRules = (role: 'admin' | 'company' = 'admin') => role === 'company';

export type RuleCheck = { key: string; label: string; ok: boolean; detail?: string };

const ZIP = '504b0304';
const OLE = 'd0cf11e0';
const PDF = '25504446';

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;

/** Rules of the file itself: format, size, pictures, macros, password. */
export async function checkFileRules(file: File): Promise<RuleCheck[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const magic = Array.from(bytes.subarray(0, 4), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';

  const checks: RuleCheck[] = [];
  const isPdf = magic === PDF || extension === '.pdf';
  // An encrypted .xlsx is an OLE container, like the old .xls format.
  const locked = extension === '.xlsx' && magic === OLE;
  const formatOk = extension === '.xlsx' && magic === ZIP;
  checks.push({
    key: 'format',
    label: 'Format .xlsx',
    ok: formatOk || locked,
    detail: isPdf ? 'Berkas PDF tidak diterima. Isi template Excel atau gunakan formulir.'
      : extension === '.xls' ? 'Format lama .xls. Buka di Excel lalu simpan ulang sebagai .xlsx.'
        : extension === '.xlsm' || extension === '.xlsb' ? `Format ${extension} tidak diterima. Simpan ulang sebagai .xlsx biasa.`
          : formatOk || locked ? undefined : 'Bukan berkas Excel .xlsx.',
  });
  checks.push({ key: 'size', label: `Ukuran maksimal ${formatMb(COMPANY_MAX_UPLOAD_BYTES)}`, ok: file.size <= COMPANY_MAX_UPLOAD_BYTES, detail: file.size > COMPANY_MAX_UPLOAD_BYTES ? `Ukuran berkas ${formatMb(file.size)}.` : undefined });

  let entries: string[] = [];
  if (formatOk || magic === OLE) {
    try {
      // The ESM build (browser) exports CFB by name, the CommonJS one on default.
      const xlsx = await import('xlsx');
      const CFB = xlsx.CFB ?? (xlsx as unknown as { default: typeof xlsx }).default.CFB;
      entries = CFB.read(bytes, { type: 'array' }).FullPaths;
    } catch {
      checks.push({ key: 'readable', label: 'Berkas dapat dibaca', ok: false, detail: 'Berkas rusak atau bukan Excel.' });
      return checks;
    }
  }
  const pictures = entries.filter((path) => /\/xl\/(media|embeddings)\/[^/]+$/i.test(path)).length;
  checks.push({ key: 'pictures', label: 'Tanpa gambar atau objek tersemat', ok: pictures === 0, detail: pictures > 0 ? `${pictures.toLocaleString('id-ID')} gambar/objek di dalam berkas. Hapus, lalu lampirkan sebagai tautan bukti dukung.` : undefined });
  const macros = entries.some((path) => /vbaProject\.bin$/i.test(path));
  checks.push({ key: 'macros', label: 'Tanpa makro', ok: !macros, detail: macros ? 'Berkas berisi makro (VBA).' : undefined });
  const encrypted = locked || entries.some((path) => /EncryptionInfo$/i.test(path));
  checks.push({ key: 'password', label: 'Tidak dikunci kata sandi', ok: !encrypted, detail: encrypted ? 'Buka kunci kata sandi lalu simpan ulang.' : undefined });
  return checks;
}

/** Rules of the sheets the scan found: the official template, and not too many rows per sheet. */
export function checkSheetRules(sheets: Array<{ sheetName: string; profile: ImportProfile | null; dataRows: number; include: boolean }>): RuleCheck[] {
  const data = sheets.filter((sheet) => sheet.include);
  const offTemplate = data.filter((sheet) => sheet.profile !== 'template_klhk');
  const long = data.filter((sheet) => sheet.dataRows > COMPANY_MAX_ROWS_PER_SHEET);
  return [
    { key: 'template', label: 'Memakai template KLHK', ok: offTemplate.length === 0, detail: offTemplate.length ? `Sheet di luar template: ${offTemplate.map((sheet) => sheet.sheetName).join(', ')}.` : undefined },
    { key: 'rows', label: `Maksimal ${COMPANY_MAX_ROWS_PER_SHEET.toLocaleString('id-ID')} baris per sheet`, ok: long.length === 0, detail: long.length ? `Terlalu banyak baris: ${long.map((sheet) => `${sheet.sheetName} (${sheet.dataRows.toLocaleString('id-ID')})`).join(', ')}. Bagi ke beberapa berkas.` : undefined },
  ];
}
