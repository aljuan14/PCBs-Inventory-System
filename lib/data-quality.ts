import type { InventoryFilters, QualityFigures } from '@/lib/inventory-query';

/**
 * Data quality indicators shared by the dashboard panel, the Excel export and
 * the printable report, so all three always count the same thing.
 * Figures come from inventory_quality (migration 20260928000003).
 */

export type QualityGroupName = 'Lokasi' | 'Identitas' | 'Teknis' | 'Hasil impor';

export interface QualityIndicator {
  key: keyof QualityFigures;
  group: QualityGroupName;
  label: string;
  /** Rows the indicator applies to, e.g. power only for transformers. */
  base: (figures: QualityFigures) => number;
  /** How the table shows these rows when the indicator is clicked. */
  filters: Partial<InventoryFilters>;
  /** "info" marks automatic fixes: reported, but not a gap in the data. */
  tone: 'issue' | 'info';
  description: string;
}

export const QUALITY_INDICATORS: QualityIndicator[] = [
  { key: 'no_coordinates', group: 'Lokasi', label: 'Koordinat tidak diisi', base: (f) => f.total, filters: { coordinates: 'empty' }, tone: 'issue', description: 'Kolom titik koordinat kosong, sehingga alat tidak tampil di peta.' },
  { key: 'unreadable_coordinates', group: 'Lokasi', label: 'Koordinat tidak terbaca / di luar wilayah', base: (f) => f.total, filters: { coordinates: 'unreadable' }, tone: 'issue', description: 'Koordinat diisi tetapi formatnya tidak dapat dibaca atau titiknya berada di luar wilayah Indonesia. Teks aslinya tetap tersimpan.' },
  { key: 'no_name', group: 'Identitas', label: 'Tanpa merek', base: (f) => f.total, filters: { missing: 'name' }, tone: 'issue', description: 'Nama merek / pabrikan alat (atau merek minyak) tidak diisi.' },
  { key: 'no_serial', group: 'Identitas', label: 'Tanpa nomor seri', base: (f) => f.equipment, filters: { missing: 'serial' }, tone: 'issue', description: 'Nomor seri tidak diisi. Berlaku untuk transformator dan kapasitor.' },
  { key: 'no_code', group: 'Identitas', label: 'Tanpa kode alat', base: (f) => (f.with_code > 0 ? f.total : 0), filters: { missing: 'code' }, tone: 'issue', description: 'Kode alat perusahaan (mis. Kode Trafo PLN) tidak diisi. Hanya dihitung bila perusahaan memakai kode alat.' },
  { key: 'no_year', group: 'Teknis', label: 'Tanpa tahun pembuatan', base: (f) => f.equipment, filters: { missing: 'year' }, tone: 'issue', description: 'Tahun pembuatan tidak diisi, sehingga tidak dapat digolongkan sebelum / sesudah 1997. Berlaku untuk transformator dan kapasitor.' },
  { key: 'no_daya', group: 'Teknis', label: 'Tanpa daya (kVA)', base: (f) => f.transformers, filters: { missing: 'daya' }, tone: 'issue', description: 'Daya transformator dalam kVA tidak diisi.' },
  { key: 'no_volume', group: 'Teknis', label: 'Tanpa volume minyak', base: (f) => f.oil, filters: { missing: 'volume' }, tone: 'issue', description: 'Volume minyak dielektrik tidak diisi.' },
  { key: 'fixed_coordinates', group: 'Hasil impor', label: 'Koordinat diperbaiki otomatis', base: (f) => f.total, filters: { coordinates: 'fixed' }, tone: 'info', description: 'Koordinat berformat tidak baku (mis. titik desimal hilang, lintang/bujur tertukar) yang diperbaiki sistem. Perlu dicek kebenarannya oleh perusahaan.' },
  { key: 'cleared_values', group: 'Hasil impor', label: 'Ada nilai tidak terbaca, dikosongkan', base: (f) => f.total, filters: { missing: 'cleared' }, tone: 'issue', description: 'Salah satu isian tidak sesuai format (mis. huruf di kolom angka, tahun di luar 1900–sekarang) sehingga dikosongkan saat impor. Nilai aslinya tercatat di laporan.' },
];

export const QUALITY_GROUPS: QualityGroupName[] = ['Lokasi', 'Identitas', 'Teknis', 'Hasil impor'];

/** Indicators that apply to the data in scope (e.g. no power figure without transformers). */
export const applicableIndicators = (figures: QualityFigures) => QUALITY_INDICATORS.filter((indicator) => indicator.base(figures) > 0);

export const completenessScore = (figures: QualityFigures) => (figures.total > 0 ? figures.complete / figures.total : null);

export type QualityStatus = 'baik' | 'perhatian' | 'kritis';

export const qualityStatus = (score: number): QualityStatus => (score >= 0.9 ? 'baik' : score >= 0.7 ? 'perhatian' : 'kritis');

export const QUALITY_STATUS_LABELS: Record<QualityStatus, string> = { baik: 'Baik', perhatian: 'Perlu perhatian', kritis: 'Kritis' };

export const SCORE_DEFINITION = 'Skor kelengkapan adalah persentase data yang semua isian pentingnya terisi dan koordinatnya terbaca: merek dan koordinat untuk semua data, nomor seri dan tahun pembuatan untuk transformator dan kapasitor, daya untuk transformator, serta volume untuk minyak dielektrik.';

export const STATUS_DEFINITION = 'Baik: skor 90% ke atas. Perlu perhatian: 70% sampai di bawah 90%. Kritis: di bawah 70%.';

/** "10%", "2,6%", "0,3%": one decimal below 10% so small shares do not round to 0. */
export function formatShare(count: number, base: number) {
  if (base <= 0) return '–';
  const share = (count / base) * 100;
  if (count > 0 && share < 0.1) return '< 0,1%';
  return `${share.toLocaleString('id-ID', { maximumFractionDigits: share < 10 ? 1 : 0 })}%`;
}

export const formatCount = (value: number) => value.toLocaleString('id-ID');

/** What a group row of inventory_quality stands for. */
export const GROUP_LEVEL_LABELS = { company: 'Perusahaan', unit: 'Unit', sub_unit: 'Sub-unit' } as const;

export const unitLabel = (label: string | null) => label ?? '(tanpa unit)';
