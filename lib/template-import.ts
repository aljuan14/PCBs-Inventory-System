import type { WorkBook } from 'xlsx';
import { CHECKLISTS, complianceRate, type ChecklistAnswer, type ChecklistKey } from '@/lib/checklists';
import { BALANCE_SECTIONS, REDUCTION_FIELDS, STORAGE_SECTIONS, fieldErrors, type FormEntry, type FormField } from '@/lib/form-fields';
import { isMeaningful, parseDate, parseNumber } from '@/lib/import-profiles';

/**
 * Reading the official Excel templates 2, 3, 4.2 and 5
 * (Data-inventaris/data-template) into the same entries the web forms make,
 * so they are checked and stored the same way (app/formulir).
 *
 * A template is recognised by its title and its columns by their headers;
 * a file whose headers moved is refused rather than read into the wrong
 * fields. The template's own example rows (UNINDO 90235 ...) are skipped.
 */

export type TemplateKind = 'pengurangan' | 'penyimpanan' | 'pengolahan' | 'pelaporan';

export const TEMPLATE_TITLES: Record<TemplateKind, string> = {
  pengurangan: '2. Pengurangan PCBs',
  penyimpanan: '3. Penyimpanan PCBs',
  pengolahan: '4.2 Pengolahan PCBs (untuk penghasil)',
  pelaporan: '5. Pelaporan PCBs',
};

export type TemplateRow = { row: number; entry: FormEntry; errors: string[] };
export type TemplateChecklist = {
  key: ChecklistKey;
  answers: ChecklistAnswer[];
  rate: number | null;
  permit: { izin_status: string | null; izin_nomor: string | null; izin_masa_berlaku: string | null } | null;
  problems: string[];
};
export type ParsedTemplate = { kind: TemplateKind; rows: TemplateRow[]; checklist: TemplateChecklist | null; skipped: string[] };

type Grid = unknown[][];
const text = (value: unknown) => (isMeaningful(value) ? String(value).replace(/\s+/g, ' ').trim() : '');
const norm = (value: unknown) => text(value).toLowerCase();

/** The kind a title in the first rows names, if any. */
function kindOf(grid: Grid): TemplateKind | null {
  const head = grid.slice(0, 20).flat().map(norm).join(' ');
  if (head.includes('log perawatan pengurangan')) return 'pengurangan';
  if (head.includes('logbook penyimpanan')) return 'penyimpanan';
  if (head.includes('neraca')) return 'pelaporan';
  if (head.includes('ketentuan teknis pengolahan')) return 'pengolahan';
  return null;
}

const findRow = (grid: Grid, test: (cells: string[]) => boolean, from = 0) => {
  for (let index = from; index < grid.length; index++) if (test((grid[index] ?? []).map(norm))) return index;
  return -1;
};

/** Column of each key, from the first header cell matching its pattern. */
function columnsOf(header: string[], patterns: Record<string, RegExp>) {
  const columns: Record<string, number> = {};
  for (const [key, pattern] of Object.entries(patterns)) columns[key] = header.findIndex((cell) => pattern.test(cell));
  return columns;
}

/** A cell as the form's text for this field: numbers with a point, dates as yyyy-mm-dd. */
function fieldValue(field: FormField, raw: unknown): string {
  if (!isMeaningful(raw)) return '';
  if (field.input === 'number') { const number = parseNumber(raw); return number === null ? text(raw) : String(number); }
  if (field.input === 'year') { const number = parseNumber(raw); return number === null ? text(raw) : String(Math.trunc(number)); }
  if (field.input === 'date') return parseDate(raw) ?? text(raw);
  if (field.input === 'select' && field.options?.includes('Uji lab')) return /lab|gc/i.test(text(raw)) ? 'Uji lab' : /cepat|dexil/i.test(text(raw)) ? 'Uji cepat' : text(raw);
  return text(raw);
}

// The example rows the templates come with.
const EXAMPLE_SERIALS = new Set(['90235', '74829', '79886']);
const isExample = (values: Record<string, string>) =>
  EXAMPLE_SERIALS.has(values.nomor_serial ?? '') && (!values.nama_merek || /unindo/i.test(values.nama_merek)) && (!values.lokasi_peralatan || /sakti/i.test(values.lokasi_peralatan) || !('lokasi_peralatan' in values));

let nextId = 0;
const entryId = () => `xlsx-${Date.now()}-${nextId++}`;

/** Data rows below `header` until TOTAL, a new table, a footnote or the end; rows with only a running number are the template's blank lines. */
function readRows(grid: Grid, start: number, columns: Record<string, number>, fields: FormField[], skipped: string[]): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (let index = start; index < grid.length; index++) {
    const cells = grid[index] ?? [];
    const first = norm(cells[0]) || norm(cells[1]);
    // TOTAL, the next table, or the footnote ("*Jika informasi tidak diketahui ...") ends the table.
    if (/^total|^tabel|^\*/.test(first)) break;
    const values: Record<string, string> = {};
    for (const field of fields) if (columns[field.key] >= 0) values[field.key] = fieldValue(field, cells[columns[field.key]]);
    if (!Object.values(values).some(Boolean)) continue;
    if (isExample(values)) { skipped.push(`Baris ${index + 1}: baris contoh dari template, dilewati.`); continue; }
    const entry: FormEntry = { id: entryId(), values, unknownYear: 'tahun_pembuatan' in values && !values.tahun_pembuatan };
    const errors = Object.entries(fieldErrors(fields, entry)).map(([key, message]) => `${fields.find((field) => field.key === key)?.label}: ${message}`);
    rows.push({ row: index + 1, entry, errors });
  }
  return rows;
}

/** A yes / no table: its header row has "Ketentuan", "Ya" and "Tidak"; answers in the order of the questions. */
function readChecklist(grid: Grid, key: ChecklistKey, withPermit: boolean): TemplateChecklist | null {
  const headerIndex = findRow(grid, (cells) => cells.some((cell) => cell === 'ketentuan') && cells.includes('ya') && cells.includes('tidak'));
  if (headerIndex < 0) return null;
  const header = (grid[headerIndex] ?? []).map(norm);
  const col = columnsOf(header, { no: /^no$/, ya: /^ya$/, tidak: /^tidak$/, surat: /^no, ?sk|^no\. ?sk/, keterangan: /^keterangan/, bukti: /^bukti dukung/, masa: /^masa berlaku/ });
  const questions = CHECKLISTS[key].questions;
  const answers: ChecklistAnswer[] = questions.map(() => ({ jawaban: null }));
  const problems: string[] = [];
  let read = 0;
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const cells = grid[index] ?? [];
    if (/total bobot|persentase/.test(cells.map(norm).join(' '))) break;
    const number = parseNumber(cells[col.no]);
    if (number === null || !Number.isInteger(number) || number < 1) continue;
    if (number > questions.length) { problems.push(`Ketentuan nomor ${number} tidak ada di formulir (hanya ${questions.length}).`); continue; }
    const yes = isMeaningful(cells[col.ya]);
    const no = col.tidak >= 0 && isMeaningful(cells[col.tidak]);
    if (yes && no) problems.push(`Ketentuan ${number} dicentang Ya dan Tidak sekaligus.`);
    // The template's example link stays out.
    const link = col.bukti >= 0 && /^https?:/i.test(text(cells[col.bukti])) ? text(cells[col.bukti]) : '';
    answers[number - 1] = {
      jawaban: yes && !no ? 'ya' : no && !yes ? 'tidak' : null,
      nomor_surat: col.surat >= 0 && !withPermit ? text(cells[col.surat]) : '',
      keterangan: col.keterangan >= 0 ? text(cells[col.keterangan]) : '',
      bukti_dukung: link,
    };
    read++;
  }
  const unanswered = answers.filter((answer) => !answer.jawaban).length;
  if (read === 0) problems.push('Tidak ada ketentuan yang terbaca.');
  else if (unanswered > 0) problems.push(`${unanswered} ketentuan belum dijawab Ya atau Tidak.`);
  let permit: TemplateChecklist['permit'] = null;
  if (withPermit) {
    const values = grid[headerIndex + 1] ?? [];
    const nomor = col.surat >= 0 ? text(values[col.surat]) : '';
    permit = { izin_status: nomor ? 'Izin TPS Limbah B3' : null, izin_nomor: nomor || null, izin_masa_berlaku: col.masa >= 0 ? parseDate(values[col.masa]) : null };
  }
  return { key, answers, rate: complianceRate(answers), permit, problems };
}

const STORAGE_FIELDS = STORAGE_SECTIONS.flatMap((section) => section.fields);
const BALANCE_FIELDS = BALANCE_SECTIONS.flatMap((section) => section.fields);

/** Reads the first sheet of a workbook as template `expected`; a string is the reason it cannot. */
export async function readTemplate(workbook: WorkBook, expected: TemplateKind): Promise<ParsedTemplate | string> {
  const XLSX = await import('xlsx');
  const utils = XLSX.utils ?? (XLSX as unknown as { default: typeof XLSX }).default.utils;
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true, raw: true });
  const kind = kindOf(grid);
  if (!kind) return 'Berkas ini bukan template resmi KLH (judul tabelnya tidak dikenali).';
  if (kind !== expected) return `Berkas ini template "${TEMPLATE_TITLES[kind]}", bukan "${TEMPLATE_TITLES[expected]}". Unggah di tab yang sesuai.`;
  const skipped: string[] = [];

  if (kind === 'pengurangan') {
    const header = findRow(grid, (cells) => cells.some((cell) => cell.startsWith('nama/merek transformator')));
    if (header < 0) return 'Kolom "NAMA/MEREK TRANSFORMATOR" tidak ditemukan.';
    const top = (grid[header] ?? []).map(norm);
    const sub = (grid[header + 1] ?? []).map(norm);
    const anchor = top.findIndex((cell) => cell.startsWith('nama/merek transformator'));
    // Columns in the template's order from the brand column; the headers that must be where expected.
    const checks: Array<[number, RegExp, string]> = [[1, /serial/, 'NOMOR SERIAL'], [2, /tahun/, 'TAHUN PEMBUATAN'], [7, /koordinat/, 'TITIK KOORDINAT'], [9, /sebelum/, 'HASIL UJI SEBELUM'], [19, /berat/, 'BERAT TRANSFORMATOR'], [22, /limbah/, 'PENGELOLAAN LIMBAH B3']];
    const subChecks: Array<[number, RegExp, string]> = [[10, /jenis perawatan/, 'JENIS PERAWATAN'], [11, /waktu/, 'WAKTU PERAWATAN'], [18, /konsentrasi/, 'KONSENTRASI PCBs']];
    for (const [offset, pattern, label] of checks) if (!pattern.test(top[anchor + offset] ?? '')) return `Kolom "${label}" tidak berada di tempatnya. Gunakan template resmi tanpa menambah atau menghapus kolom.`;
    for (const [offset, pattern, label] of subChecks) if (!pattern.test(sub[anchor + offset] ?? '')) return `Kolom "${label}" tidak berada di tempatnya. Gunakan template resmi tanpa menambah atau menghapus kolom.`;
    const order = ['nama_merek', 'nomor_serial', 'tahun_pembuatan', 'negara_asal', 'merek_minyak_dielektrik', 'volume_minyak_l', 'lokasi_peralatan', 'koordinat_raw', 'uji_sebelum_jenis', 'uji_sebelum_ppm',
      'perawatan_jenis', 'perawatan_waktu', 'perawatan_merek_oli_pengganti', 'perawatan_volume_l', 'perawatan_penyedia_jasa', 'uji_sesudah_penyedia_jasa', 'uji_sesudah_jenis', 'uji_sesudah_metode', 'uji_sesudah_ppm',
      'berat_ton', 'status_kondisi', 'peralatan_tanggap_darurat', 'pengelolaan_limbah_b3'];
    const columns = Object.fromEntries(order.map((key, offset) => [key, anchor + offset]));
    columns.bukti_dukung = -1;
    return { kind, rows: readRows(grid, header + 2, columns, REDUCTION_FIELDS, skipped), checklist: null, skipped };
  }

  if (kind === 'penyimpanan') {
    const header = findRow(grid, (cells) => cells.includes('kode limbah') && cells.some((cell) => cell.startsWith('sumber limbah')));
    if (header < 0) return 'Tabel logbook penyimpanan tidak ditemukan.';
    const columns = columnsOf((grid[header] ?? []).map(norm), {
      kode_limbah: /^kode limbah/, nama_limbah: /^nama limbah/, sumber_limbah: /^sumber limbah/, nomor_serial: /serial/, tanggal_dihasilkan: /^tanggal dihasilkan/,
      tanggal_terakhir_dikelola: /terakhir dikelola/, jumlah_dihasilkan_ton: /^jumlah dihasilkan/, jumlah_dikelola_ton: /dikelola lebih lanjut/,
    });
    const missing = Object.entries(columns).filter(([, index]) => index < 0).map(([key]) => STORAGE_FIELDS.find((field) => field.key === key)?.label ?? key);
    if (missing.length) return `Kolom logbook tidak ditemukan: ${missing.join(', ')}.`;
    columns.bukti_dukung = -1;
    return { kind, rows: readRows(grid, header + 1, columns, STORAGE_FIELDS, skipped), checklist: readChecklist(grid, '3_penyimpanan', true), skipped };
  }

  if (kind === 'pelaporan') {
    const header = findRow(grid, (cells) => cells.includes('kode limbah') && cells.some((cell) => cell.startsWith('dihasilkan')));
    if (header < 0) return 'Tabel neraca tidak ditemukan.';
    const columns = columnsOf((grid[header] ?? []).map(norm), {
      kode_limbah: /^kode limbah/, nama_limbah: /^nama limbah/, jenis: /^jenis/, nomor_serial: /serial/, dihasilkan_ton: /^dihasilkan/, dikelola_ton: /^dikelola/, disimpan_ton: /^disimpan/, keterangan: /^keterangan/,
    });
    const missing = Object.entries(columns).filter(([, index]) => index < 0).map(([key]) => BALANCE_FIELDS.find((field) => field.key === key)?.label ?? key);
    if (missing.length) return `Kolom neraca tidak ditemukan: ${missing.join(', ')}.`;
    columns.periode = -1;
    // The balance's processing table is form 4.2's checklist.
    return { kind, rows: readRows(grid, header + 1, columns, BALANCE_FIELDS, skipped), checklist: readChecklist(grid, '4_2_pengolahan', false), skipped };
  }

  const checklist = readChecklist(grid, '4_2_pengolahan', false);
  if (!checklist) return 'Tabel ketentuan teknis tidak ditemukan.';
  return { kind, rows: [], checklist, skipped };
}
