import { INVENTORY_FIELDS, getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import type { CheckReport, ValidationIssue } from '@/lib/import-transform';

/**
 * Turns the check reports of a company's imports into findings worded for the
 * company itself (a request to complete or correct its workbook), plus a
 * message the admin can paste into an email.
 */

export interface FeedbackBatch {
  fileName: string | null;
  sheetName: string | null;
  category: InventoryCategory;
  report: CheckReport | null;
}

export interface FeedbackFile {
  fileName: string;
  sheetName: string | null;
  category: InventoryCategory;
  importedRows: number;
  points: string[];
}

export interface CompanyFeedback {
  files: FeedbackFile[];
  importedRows: number;
  /** Number of findings across files; 0 means the data needs nothing from the company. */
  findings: number;
}

// Findings about the import itself (template example rows, stray pasted rows): not the company's to fix.
const INTERNAL_KEYS = new Set(['skipped:example', 'skipped:no_context']);

// Friendlier column names than the inventory field labels, where they differ.
const COMPANY_LABELS: Record<string, string> = { koordinat_raw: 'Titik Koordinat Lokasi' };

function fieldLabel(category: InventoryCategory, fieldKey: string) {
  return COMPANY_LABELS[fieldKey] ?? INVENTORY_FIELDS[category].find((field) => field.field_key === fieldKey)?.label ?? fieldKey;
}

/** "baris 8, 9, 14 dan 9 baris lainnya" from the first rows a report keeps. */
function rowList(issue: ValidationIssue) {
  const rows = [...new Set(issue.rows)].sort((a, b) => a - b);
  if (rows.length === 0) return '';
  const rest = issue.count - rows.length;
  return `baris ${rows.join(', ')}${rest > 0 ? ` dan ${rest} baris lainnya` : ''}`;
}

const examples = (issue: ValidationIssue) => (issue.examples.length > 0 ? `, contoh: ${issue.examples.slice(0, 2).map((value) => `"${value}"`).join(', ')}` : '');

/** One finding as a sentence addressed to the company, or null when it is not theirs to act on. */
export function describeIssue(category: InventoryCategory, issue: ValidationIssue): string | null {
  if (INTERNAL_KEYS.has(issue.key)) return null;
  const where = rowList(issue);
  const count = `${issue.count.toLocaleString('id-ID')} baris`;
  const [kind, field = ''] = issue.key.split(':');

  if (kind === 'missing') return `Kolom ${fieldLabel(category, field)} belum diisi pada ${count} (${where}).`;
  if (issue.key === 'invalid:tahun_range') return `Tahun pembuatan tidak wajar (di luar 1900 sampai tahun ini) pada ${count} (${where}${examples(issue)}).`;
  if (issue.key === 'invalid:ppm_negative') return `Konsentrasi PCBs bernilai negatif pada ${count} (${where}).`;
  if (kind === 'invalid') return `Isi kolom ${fieldLabel(category, field)} tidak dapat dibaca pada ${count} (${where}${examples(issue)}). Mohon isi dengan angka atau format yang sesuai template.`;
  if (issue.key === 'coordinate:unreadable') return `Titik koordinat tidak dapat dibaca pada ${count} (${where}${examples(issue)}). Mohon gunakan format desimal, contoh: -6.2088, 106.8456.`;
  if (issue.key === 'coordinate:outside') return `Titik koordinat berada di luar wilayah Indonesia pada ${count} (${where}). Mohon periksa kembali lintang dan bujurnya.`;
  if (issue.key === 'coordinate:swapped') return `Lintang dan bujur pada titik koordinat tertukar pada ${count} (${where}).`;
  if (issue.key === 'coordinate:repaired') return `Format titik koordinat belum baku pada ${count} (${where}). Mohon gunakan format desimal, contoh: -6.2088, 106.8456.`;
  if (issue.key === 'duplicate:file') return `Terdapat data yang tercatat dua kali pada ${count} (${where}).`;
  if (issue.key === 'weight:implausible') return `Berat peralatan tidak wajar (lebih dari 1.000 ton) pada ${count} (${where}). Mohon pastikan satuannya kilogram.`;
  if (issue.key === 'weight:total_in_tons') return `Berat total tampaknya ditulis dalam ton pada ${count} (${where}). Mohon gunakan satuan kilogram.`;
  if (issue.key === 'weight:mismatch') return `Berat total tidak sama dengan berat kering ditambah berat minyak pada ${count} (${where}).`;
  // A finding added later without its own wording: fall back to the report label.
  return `${issue.label} pada ${count} (${where}).`;
}

export function buildCompanyFeedback(batches: FeedbackBatch[]): CompanyFeedback {
  const files = batches.map((batch) => {
    const points = (batch.report?.issues ?? []).map((issue) => describeIssue(batch.category, issue)).filter((point): point is string => point !== null);
    return {
      fileName: batch.fileName ?? 'Berkas tanpa nama',
      sheetName: batch.sheetName,
      category: batch.category,
      importedRows: batch.report?.importedRows ?? 0,
      points,
    };
  });
  return {
    files,
    importedRows: files.reduce((sum, file) => sum + file.importedRows, 0),
    findings: files.reduce((sum, file) => sum + file.points.length, 0),
  };
}

const fileTitle = (file: FeedbackFile) => `${file.fileName}${file.sheetName ? ` (sheet "${file.sheetName}")` : ''} – ${getCategoryLabel(file.category)}`;

/** Email body for the company, ready to paste. */
export function feedbackMessage(companyName: string, feedback: CompanyFeedback) {
  const lines = [`Yth. ${companyName},`, '', 'Terima kasih atas penyampaian data inventarisasi PCBs.'];
  if (feedback.findings === 0) {
    lines.push(
      `Data yang kami terima (${feedback.importedRows.toLocaleString('id-ID')} baris dari ${feedback.files.length} berkas) telah kami periksa dan tidak ditemukan hal yang perlu diperbaiki.`,
    );
  } else {
    lines.push('Dari hasil pemeriksaan data yang kami terima, terdapat beberapa hal yang perlu dilengkapi atau diperbaiki:', '');
    for (const file of feedback.files.filter((item) => item.points.length > 0)) {
      lines.push(`Berkas: ${fileTitle(file)}`);
      file.points.forEach((point, index) => lines.push(`${index + 1}. ${point}`));
      lines.push('');
    }
    lines.push('Nomor baris mengacu pada nomor baris di berkas Excel yang dikirimkan.');
    lines.push('Mohon perbaikan dikirimkan kembali dalam format Excel sesuai template inventarisasi PCBs.');
  }
  lines.push('', 'Terima kasih atas kerja samanya.', '', 'Hormat kami,');
  return lines.join('\n');
}
