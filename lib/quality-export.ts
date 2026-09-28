import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCategoryLabel, INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import type { DashboardScope, ImportNoteRow, InventoryQuality } from '@/lib/inventory-query';
import {
  applicableIndicators,
  completenessScore,
  GROUP_LEVEL_LABELS,
  QUALITY_INDICATORS,
  QUALITY_STATUS_LABELS,
  qualityStatus,
  SCORE_DEFINITION,
  STATUS_DEFINITION,
  unitLabel,
} from '@/lib/data-quality';

/**
 * "Laporan kualitas data" as an Excel workbook, built in the browser: a
 * summary, one row per finding per equipment (identified by its equipment
 * code, so the company can find it in its own files), and the definitions.
 */

const PAGE_SIZE = 1000;
// Excel's row limit, minus the header.
const MAX_FINDINGS = 1_048_000;

type Level = 'Perlu dilengkapi' | 'Perlu diperbaiki' | 'Perlu dicek';

interface Finding {
  level: Level;
  problem: string;
  original?: string;
  fixed?: string;
}

interface SourceRow {
  id: string;
  company_id: string;
  unit: string | null;
  sub_unit: string | null;
  kode_alat: string | null;
  name: string | null;
  serial: string | null;
  tahun_pembuatan: number | null;
  daya_kva: number | null;
  volume_l: number | null;
  location: string | null;
  koordinat_raw: string | null;
  koordinat_lat: number | null;
  catatan_impor: ImportNoteRow[] | null;
  baris_excel: number | null;
  import_batch_id: string | null;
  created_at: string;
}

// Column names differ per table; aliases give every table the same shape.
const COLUMNS: Record<InventoryCategory, string> = {
  transformator_digunakan: 'id, company_id, unit, sub_unit, kode_alat, name:nama_merek, serial:nomor_serial, tahun_pembuatan, daya_kva, location:lokasi_peralatan, koordinat_raw, koordinat_lat, catatan_impor, baris_excel, import_batch_id, created_at',
  transformator_tidak_digunakan: 'id, company_id, unit, sub_unit, kode_alat, name:nama_merek, serial:nomor_serial, tahun_pembuatan, daya_kva, location:lokasi_peralatan, koordinat_raw, koordinat_lat, catatan_impor, baris_excel, import_batch_id, created_at',
  kapasitor: 'id, company_id, unit, sub_unit, kode_alat, name:nama_merek, serial:nomor_serial, tahun_pembuatan, location:lokasi_peralatan, koordinat_raw, koordinat_lat, catatan_impor, baris_excel, import_batch_id, created_at',
  minyak_dielektrik: 'id, company_id, unit, sub_unit, kode_alat, name:merek_minyak_dielektrik, volume_l, location:lokasi_penyimpanan, koordinat_raw, koordinat_lat, catatan_impor, baris_excel, import_batch_id, created_at',
};

/** Rows with at least one finding, as a PostgREST or() filter per table. */
function problemFilter(category: InventoryCategory, usesCodes: boolean) {
  const conditions = ['koordinat_lat.is.null', 'catatan_impor.not.is.null'];
  if (category === 'minyak_dielektrik') conditions.push('merek_minyak_dielektrik.is.null', 'volume_l.is.null');
  else conditions.push('nama_merek.is.null', 'nomor_serial.is.null', 'tahun_pembuatan.is.null');
  if (category.startsWith('transformator')) conditions.push('daya_kva.is.null');
  if (usesCodes) conditions.push('kode_alat.is.null');
  return conditions.join(',');
}

function findingsOf(category: InventoryCategory, row: SourceRow, usesCodes: boolean): Finding[] {
  const findings: Finding[] = [];
  const notes = row.catatan_impor ?? [];
  const isOil = category === 'minyak_dielektrik';

  if (row.koordinat_lat === null) {
    if (!row.koordinat_raw) findings.push({ level: 'Perlu dilengkapi', problem: 'Koordinat tidak diisi' });
    else {
      const note = notes.find((entry) => entry.kolom === 'koordinat');
      findings.push({ level: 'Perlu diperbaiki', problem: note?.pesan ?? 'Koordinat tidak terbaca (tidak tampil di peta)', original: row.koordinat_raw });
    }
  }
  if (row.name === null) findings.push({ level: 'Perlu dilengkapi', problem: isOil ? 'Tanpa merek minyak' : 'Tanpa merek' });
  if (!isOil && row.serial === null) findings.push({ level: 'Perlu dilengkapi', problem: 'Tanpa nomor seri' });
  if (usesCodes && row.kode_alat === null) findings.push({ level: 'Perlu dilengkapi', problem: 'Tanpa kode alat' });
  if (!isOil && row.tahun_pembuatan === null) findings.push({ level: 'Perlu dilengkapi', problem: 'Tanpa tahun pembuatan' });
  if (category.startsWith('transformator') && row.daya_kva === null) findings.push({ level: 'Perlu dilengkapi', problem: 'Tanpa daya (kVA)' });
  if (isOil && row.volume_l === null) findings.push({ level: 'Perlu dilengkapi', problem: 'Tanpa volume minyak' });

  for (const note of notes) {
    if (note.jenis === 'diperbaiki') findings.push({ level: 'Perlu dicek', problem: note.pesan.replace(/\s*\(periksa contoh\)/, ''), original: note.nilai_asli, fixed: note.nilai_baru });
    else if (note.jenis === 'dikosongkan') findings.push({ level: 'Perlu diperbaiki', problem: note.pesan, original: note.nilai_asli });
    // tidak_terbaca / di_luar_wilayah are reported above with the coordinate.
  }
  return findings;
}

export interface QualityExportOptions {
  scope: DashboardScope;
  scopeLabel: string;
  quality: InventoryQuality;
  companyNames: Map<string, string>;
  onProgress?: (rowsRead: number) => void;
}

export async function exportQualityWorkbook(supabase: SupabaseClient, options: QualityExportOptions) {
  const { scope, scopeLabel, quality, companyNames, onProgress } = options;
  const usesCodes = quality.summary.with_code > 0;

  // File and sheet of each import batch, to point at the source of a row.
  let batchRequest = supabase.from('import_batches').select('id, nama_file_asli, sheet_name').eq('status', 'imported').limit(5000);
  if (scope.companyId) batchRequest = batchRequest.eq('company_id', scope.companyId);
  const { data: batchRows, error: batchError } = await batchRequest;
  if (batchError) throw new Error(`Gagal memuat daftar berkas: ${batchError.message}`);
  const batches = new Map((batchRows ?? []).map((batch) => [batch.id as string, batch as { nama_file_asli: string; sheet_name: string | null }]));

  const header = ['Perusahaan', 'Unit Induk / Unit', 'Unit Pelaksana / Sub-unit', 'Kategori', 'Kode alat', 'Merek', 'Nomor seri', 'Tahun pembuatan', 'Lokasi', 'Tingkat', 'Temuan', 'Nilai asli', 'Nilai setelah perbaikan', 'Berkas asal', 'Sheet', 'Baris Excel', 'Tanggal input'];
  const findingRows: unknown[][] = [header];
  let rowsRead = 0;
  let truncated = false;

  for (const { key: category } of INVENTORY_CATEGORIES) {
    let lastId: string | null = null;
    for (;;) {
      let request = supabase.from(category).select(COLUMNS[category]).or(problemFilter(category, usesCodes)).order('id').limit(PAGE_SIZE);
      if (scope.companyId) request = request.eq('company_id', scope.companyId);
      if (scope.unit) request = request.eq('unit', scope.unit);
      if (scope.subUnit) request = request.eq('sub_unit', scope.subUnit);
      if (lastId) request = request.gt('id', lastId);
      const { data, error } = await request;
      if (error) throw new Error(`Gagal memuat data ${getCategoryLabel(category)}: ${error.message}`);
      const rows = (data ?? []) as unknown as SourceRow[];
      for (const row of rows) {
        const batch = row.import_batch_id ? batches.get(row.import_batch_id) : undefined;
        for (const finding of findingsOf(category, row, usesCodes)) {
          if (findingRows.length > MAX_FINDINGS) {
            truncated = true;
            break;
          }
          findingRows.push([
            companyNames.get(row.company_id) ?? '',
            row.unit ?? '',
            row.sub_unit ?? '',
            getCategoryLabel(category),
            row.kode_alat ?? '',
            row.name ?? '',
            row.serial ?? '',
            row.tahun_pembuatan ?? '',
            row.location ?? '',
            finding.level,
            finding.problem,
            finding.original ?? '',
            finding.fixed ?? '',
            batch?.nama_file_asli ?? '',
            batch?.sheet_name ?? '',
            row.baris_excel ?? '',
            new Date(row.created_at).toLocaleDateString('id-ID'),
          ]);
        }
      }
      rowsRead += rows.length;
      onProgress?.(rowsRead);
      if (rows.length < PAGE_SIZE || truncated) break;
      lastId = rows[rows.length - 1].id;
    }
    if (truncated) break;
  }

  const generatedAt = new Date();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet(quality, scopeLabel, generatedAt), 'Ringkasan');

  const findingsSheet = XLSX.utils.aoa_to_sheet(findingRows);
  findingsSheet['!cols'] = [22, 18, 22, 26, 16, 20, 18, 10, 24, 16, 48, 28, 24, 32, 18, 10, 12].map((wch) => ({ wch }));
  findingsSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(findingRows.length - 1, 1), c: header.length - 1 } }) };
  XLSX.utils.book_append_sheet(workbook, findingsSheet, 'Daftar temuan');

  XLSX.utils.book_append_sheet(workbook, definitionsSheet(truncated), 'Keterangan');

  const slug = (scopeLabel || 'Semua perusahaan').replace(/[›/\\?*[\]:]+/g, ' ').trim().replace(/\s+/g, '-');
  XLSX.writeFile(workbook, `Laporan-kualitas-data_${slug}_${generatedAt.toISOString().slice(0, 10)}.xlsx`);
  return { findings: findingRows.length - 1, rowsRead, truncated };
}

/** A fraction as an Excel percentage cell (shown as 12,3% in Indonesian Excel). */
const percentCell = (count: number, base: number): XLSX.CellObject | string => (base > 0 ? { t: 'n', v: count / base, z: '0.0%' } : '–');

function summarySheet(quality: InventoryQuality, scopeLabel: string, generatedAt: Date) {
  const { summary, groups, level } = quality;
  const score = completenessScore(summary);
  const indicators = applicableIndicators(summary);
  const rows: unknown[][] = [
    ['Laporan Kualitas Data Inventarisasi PCBs'],
    ['Cakupan', scopeLabel || 'Semua perusahaan'],
    ['Dibuat', generatedAt.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })],
    [],
    ['Skor kelengkapan', score === null ? '–' : { t: 'n', v: score, z: '0.0%' }, score === null ? '' : QUALITY_STATUS_LABELS[qualityStatus(score)]],
    ['Data lengkap', summary.complete, `dari ${summary.total.toLocaleString('id-ID')} data`],
    [],
    ['Indikator', 'Kelompok', 'Jumlah data', 'Dari', 'Persentase'],
    ...indicators.map((indicator) => [indicator.label, indicator.group, summary[indicator.key], indicator.base(summary), percentCell(summary[indicator.key], indicator.base(summary))]),
    [],
    [`Perbandingan per ${GROUP_LEVEL_LABELS[level].toLowerCase()}`],
    [GROUP_LEVEL_LABELS[level], 'Jumlah data', 'Data lengkap', 'Skor', 'Status', ...indicators.map((indicator) => indicator.label)],
    ...[...groups]
      .sort((a, b) => (completenessScore(a) ?? 1) - (completenessScore(b) ?? 1))
      .map((group) => {
        const groupScore = completenessScore(group);
        return [
          unitLabel(group.label),
          group.total,
          group.complete,
          groupScore === null ? '–' : { t: 'n', v: groupScore, z: '0.0%' },
          groupScore === null ? '' : QUALITY_STATUS_LABELS[qualityStatus(groupScore)],
          ...indicators.map((indicator) => percentCell(group[indicator.key], indicator.base(group))),
        ];
      }),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, ...indicators.map(() => ({ wch: 18 }))];
  return sheet;
}

function definitionsSheet(truncated: boolean) {
  const rows: string[][] = [
    ['Istilah', 'Keterangan'],
    ['Skor kelengkapan', SCORE_DEFINITION],
    ['Status', STATUS_DEFINITION],
    ...QUALITY_INDICATORS.map((indicator) => [indicator.label, indicator.description]),
    ['Tingkat: Perlu dilengkapi', 'Isian kosong di berkas asal; mohon dilengkapi.'],
    ['Tingkat: Perlu diperbaiki', 'Isian ada tetapi tidak dapat dibaca atau tidak valid; mohon diperbaiki. Nilai aslinya tercantum di kolom "Nilai asli".'],
    ['Tingkat: Perlu dicek', 'Isian diperbaiki otomatis oleh sistem; mohon dipastikan "Nilai setelah perbaikan" sudah benar.'],
    ['Baris Excel', 'Nomor baris pada sheet berkas asal saat diunggah. Gunakan Kode alat bila berkas sudah diubah sejak diunggah.'],
  ];
  if (truncated) rows.push(['Catatan', `Daftar temuan dipotong pada ${MAX_FINDINGS.toLocaleString('id-ID')} baris karena batas jumlah baris Excel. Persempit cakupan (pilih unit) untuk daftar lengkap.`]);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 36 }, { wch: 110 }];
  return sheet;
}
