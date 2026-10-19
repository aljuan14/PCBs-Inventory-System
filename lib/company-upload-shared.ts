import type { ValidationIssue } from '@/lib/import-transform';

/**
 * What the browser and the server share about a company's Excel upload
 * (lib/company-upload.ts, which reads the file, stays on the server).
 */

export const COMPANY_UPLOAD_FOLDER = 'unggahan-perusahaan';
export const MAX_COMPANY_UPLOAD_BYTES = 20 * 1024 * 1024;
export type UploadMode = 'tambah' | 'ganti';

/** A few rows to look at, in the template's terms. */
export type SampleRow = { baris: number; merek: string | null; serial: string | null; tahun: number | null; ppm: number | null; lokasi: string | null; koordinat: string | null };

/** What the company sees before sending, and the admin before accepting (stored as ringkasan). */
export interface UploadSummary {
  sheetName: string;
  /** Records read from the sheet, copies inside the file left out. */
  rows: number;
  skippedEmpty: number;
  skippedCopies: number;
  /** "tambah": rows the company already has, which are skipped. */
  alreadyStored: number;
  /** "ganti": the company's current rows of this form, which go. */
  currentRows: number;
  issues: ValidationIssue[];
  sample: SampleRow[];
}
