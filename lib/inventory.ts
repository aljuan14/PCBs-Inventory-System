export type InventoryCategory =
  | 'transformator_digunakan'
  | 'transformator_tidak_digunakan'
  | 'kapasitor'
  | 'minyak_dielektrik';

export type InventoryField = {
  field_key: string;
  label: string;
  tipe_data: 'text' | 'numeric' | 'date';
  wajib: boolean;
};

export const INVENTORY_CATEGORIES: Array<{
  key: InventoryCategory;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}> = [
  {
    key: 'transformator_digunakan',
    label: 'Transformator Masih Digunakan',
    shortLabel: 'Trafo digunakan',
    description: 'Peralatan yang masih beroperasi dan digunakan.',
    color: '#0f766e',
  },
  {
    key: 'transformator_tidak_digunakan',
    label: 'Transformator Tidak Digunakan',
    shortLabel: 'Trafo tidak digunakan',
    description: 'Peralatan yang sudah tidak beroperasi atau rusak.',
    color: '#b45309',
  },
  {
    key: 'kapasitor',
    label: 'Kapasitor',
    shortLabel: 'Kapasitor',
    description: 'Inventaris kapasitor beserta status penggunaannya.',
    color: '#2563eb',
  },
  {
    key: 'minyak_dielektrik',
    label: 'Minyak Dielektrik',
    shortLabel: 'Minyak dielektrik',
    description: 'Wadah dan sampel minyak dielektrik yang tersimpan.',
    color: '#7c3aed',
  },
];

const commonFields: InventoryField[] = [
  { field_key: 'no', label: 'Nomor', tipe_data: 'numeric', wajib: false },
  { field_key: 'tahun_pembuatan', label: 'Tahun Pembuatan', tipe_data: 'numeric', wajib: false },
  { field_key: 'negara_asal', label: 'Negara Asal', tipe_data: 'text', wajib: false },
  { field_key: 'koordinat_raw', label: 'Koordinat', tipe_data: 'text', wajib: false },
  { field_key: 'koordinat_lat', label: 'Latitude', tipe_data: 'numeric', wajib: false },
  { field_key: 'koordinat_lng', label: 'Longitude', tipe_data: 'numeric', wajib: false },
];

export const INVENTORY_FIELDS: Record<InventoryCategory, InventoryField[]> = {
  transformator_digunakan: [
    ...commonFields,
    { field_key: 'nama_merek', label: 'Nama / Merek', tipe_data: 'text', wajib: true },
    { field_key: 'nomor_serial', label: 'Nomor Serial', tipe_data: 'text', wajib: false },
    { field_key: 'merek_minyak_dielektrik', label: 'Merek Minyak Dielektrik', tipe_data: 'text', wajib: false },
    { field_key: 'volume_minyak_l', label: 'Volume Minyak (L)', tipe_data: 'numeric', wajib: false },
    { field_key: 'lokasi_peralatan', label: 'Lokasi Peralatan', tipe_data: 'text', wajib: false },
    { field_key: 'daya_kva', label: 'Daya (kVA)', tipe_data: 'numeric', wajib: false },
    { field_key: 'ketersediaan_keran_buang', label: 'Ketersediaan Keran Buang', tipe_data: 'text', wajib: false },
    { field_key: 'perawatan_jenis', label: 'Jenis Perawatan', tipe_data: 'text', wajib: false },
    { field_key: 'perawatan_waktu', label: 'Waktu Perawatan', tipe_data: 'date', wajib: false },
    { field_key: 'perawatan_merek_oli_pengganti', label: 'Merek Oli Pengganti', tipe_data: 'text', wajib: false },
    { field_key: 'perawatan_volume_ditambahkan_l', label: 'Volume Oli Ditambahkan (L)', tipe_data: 'numeric', wajib: false },
    { field_key: 'perawatan_penyedia_jasa', label: 'Penyedia Jasa Perawatan', tipe_data: 'text', wajib: false },
    { field_key: 'uji_penyedia_jasa', label: 'Penyedia Jasa Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_jenis', label: 'Jenis Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_metode', label: 'Metode Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_konsentrasi_ppm', label: 'Konsentrasi Uji (ppm)', tipe_data: 'numeric', wajib: false },
    { field_key: 'berat_ton', label: 'Berat (ton)', tipe_data: 'numeric', wajib: false },
    { field_key: 'peralatan_tanggap_darurat', label: 'Peralatan Tanggap Darurat', tipe_data: 'text', wajib: false },
  ],
  transformator_tidak_digunakan: [
    ...commonFields,
    { field_key: 'nama_merek', label: 'Nama / Merek', tipe_data: 'text', wajib: true },
    { field_key: 'nomor_serial', label: 'Nomor Serial', tipe_data: 'text', wajib: false },
    { field_key: 'merek_minyak_dielektrik', label: 'Merek Minyak Dielektrik', tipe_data: 'text', wajib: false },
    { field_key: 'volume_minyak_l', label: 'Volume Minyak (L)', tipe_data: 'numeric', wajib: false },
    { field_key: 'lokasi_peralatan', label: 'Lokasi Peralatan', tipe_data: 'text', wajib: false },
    { field_key: 'daya_kva', label: 'Daya (kVA)', tipe_data: 'numeric', wajib: false },
    { field_key: 'ketersediaan_keran_buang', label: 'Ketersediaan Keran Buang', tipe_data: 'text', wajib: false },
    { field_key: 'perawatan_jenis', label: 'Jenis Perawatan', tipe_data: 'text', wajib: false },
    { field_key: 'perawatan_waktu', label: 'Waktu Perawatan', tipe_data: 'date', wajib: false },
    { field_key: 'perawatan_merek_oli_pengganti', label: 'Merek Oli Pengganti', tipe_data: 'text', wajib: false },
    { field_key: 'perawatan_volume_ditambahkan_l', label: 'Volume Oli Ditambahkan (L)', tipe_data: 'numeric', wajib: false },
    { field_key: 'uji_penyedia_jasa', label: 'Penyedia Jasa Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_jenis', label: 'Jenis Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_metode', label: 'Metode Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_konsentrasi_ppm', label: 'Konsentrasi Uji (ppm)', tipe_data: 'numeric', wajib: false },
    { field_key: 'berat_ton', label: 'Berat (ton)', tipe_data: 'numeric', wajib: false },
    { field_key: 'peralatan_tanggap_darurat', label: 'Peralatan Tanggap Darurat', tipe_data: 'text', wajib: false },
    { field_key: 'kondisi_di_dalam_alat', label: 'Kondisi di Dalam Alat', tipe_data: 'text', wajib: false },
    { field_key: 'status_kondisi', label: 'Status Kondisi', tipe_data: 'text', wajib: false },
    { field_key: 'waktu_terakhir_digunakan', label: 'Waktu Terakhir Digunakan', tipe_data: 'date', wajib: false },
  ],
  kapasitor: [
    ...commonFields,
    { field_key: 'nama_merek', label: 'Nama / Merek', tipe_data: 'text', wajib: true },
    { field_key: 'nomor_serial', label: 'Nomor Serial', tipe_data: 'text', wajib: false },
    { field_key: 'merek_minyak_dielektrik', label: 'Merek Minyak Dielektrik', tipe_data: 'text', wajib: false },
    { field_key: 'lokasi_peralatan', label: 'Lokasi Peralatan', tipe_data: 'text', wajib: false },
    { field_key: 'status_alat', label: 'Status Alat', tipe_data: 'text', wajib: false },
  ],
  minyak_dielektrik: [
    ...commonFields,
    { field_key: 'merek_minyak_dielektrik', label: 'Merek Minyak Dielektrik', tipe_data: 'text', wajib: true },
    { field_key: 'volume_l', label: 'Volume (L)', tipe_data: 'numeric', wajib: false },
    { field_key: 'lokasi_penyimpanan', label: 'Lokasi Penyimpanan', tipe_data: 'text', wajib: false },
    { field_key: 'status_minyak', label: 'Status Minyak', tipe_data: 'text', wajib: false },
    { field_key: 'uji_penyedia_jasa', label: 'Penyedia Jasa Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_jenis', label: 'Jenis Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_metode', label: 'Metode Uji', tipe_data: 'text', wajib: false },
    { field_key: 'uji_konsentrasi_ppm', label: 'Konsentrasi Uji (ppm)', tipe_data: 'numeric', wajib: false },
    { field_key: 'wadah_penyimpanan', label: 'Wadah Penyimpanan', tipe_data: 'text', wajib: false },
  ],
};

export function getCategoryLabel(category: InventoryCategory) {
  return INVENTORY_CATEGORIES.find((item) => item.key === category)?.label ?? category;
}