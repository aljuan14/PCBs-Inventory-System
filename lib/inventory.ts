export type InventoryCategory =
  | 'transformator_digunakan'
  | 'transformator_tidak_digunakan'
  | 'kapasitor'
  | 'minyak_dielektrik';

export type InventoryFieldType = 'text' | 'numeric' | 'integer' | 'date';

export type InventoryField = {
  field_key: string;
  label: string;
  tipe_data: InventoryFieldType;
  wajib: boolean;
  group: 'Data umum' | 'Perawatan rutin' | 'Kondisi' | 'Uji lanjutan';
};

export const INVENTORY_CATEGORIES: Array<{
  key: InventoryCategory;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}> = [
  { key: 'transformator_digunakan', label: 'Transformator Masih Digunakan', shortLabel: 'Trafo digunakan', description: 'Peralatan yang masih beroperasi dan digunakan.', color: '#0f766e' },
  { key: 'transformator_tidak_digunakan', label: 'Transformator Tidak Digunakan', shortLabel: 'Trafo tidak digunakan', description: 'Peralatan yang sudah tidak beroperasi atau rusak.', color: '#b45309' },
  { key: 'kapasitor', label: 'Kapasitor', shortLabel: 'Kapasitor', description: 'Inventaris kapasitor beserta status penggunaannya.', color: '#2563eb' },
  { key: 'minyak_dielektrik', label: 'Minyak Dielektrik', shortLabel: 'Minyak dielektrik', description: 'Wadah dan sampel minyak dielektrik yang tersimpan.', color: '#7c3aed' },
];

const field = (field_key: string, label: string, tipe_data: InventoryFieldType, wajib: boolean, group: InventoryField['group'] = 'Data umum'): InventoryField => ({ field_key, label, tipe_data, wajib, group });
const trafoCommon = (includeDaya: boolean): InventoryField[] => [
  field('no', 'Nomor', 'integer', true),
  field('nama_merek', 'Nama / Merek Transformator', 'text', true),
  field('nomor_serial', 'Nomor Serial', 'text', true),
  field('tahun_pembuatan', 'Tahun Pembuatan', 'integer', false),
  field('negara_asal', 'Negara Asal', 'text', false),
  field('merek_minyak_dielektrik', 'Merek Minyak Dielektrik', 'text', false),
  field('volume_minyak_l', 'Volume Minyak Dielektrik (L)', 'numeric', false),
  field('lokasi_peralatan', 'Lokasi Peralatan', 'text', false),
  field('koordinat_raw', 'Koordinat', 'text', false),
  ...(includeDaya ? [field('daya_kva', 'Daya (kVA)', 'numeric', true)] : [field('daya_kva', 'Daya (kVA)', 'numeric', true)]),
  field('ketersediaan_keran_buang', 'Ketersediaan Keran Buang', 'text', false),
];

export const INVENTORY_FIELDS: Record<InventoryCategory, InventoryField[]> = {
  transformator_digunakan: [
    ...trafoCommon(true),
    field('perawatan_jenis', 'Jenis Perawatan', 'text', false, 'Perawatan rutin'),
    field('perawatan_waktu', 'Waktu Perawatan', 'date', false, 'Perawatan rutin'),
    field('perawatan_merek_oli_pengganti', 'Merek Oli Pengganti', 'text', false, 'Perawatan rutin'),
    field('perawatan_volume_ditambahkan_l', 'Volume Oli Ditambahkan (L)', 'numeric', false, 'Perawatan rutin'),
    field('perawatan_penyedia_jasa', 'Penyedia Jasa Perawatan', 'text', false, 'Perawatan rutin'),
    field('uji_penyedia_jasa', 'Penyedia Jasa Uji', 'text', false, 'Uji lanjutan'),
    field('uji_jenis', 'Jenis Uji', 'text', false, 'Uji lanjutan'),
    field('uji_metode', 'Metode Uji', 'text', false, 'Uji lanjutan'),
    field('uji_konsentrasi_ppm', 'Konsentrasi Uji (ppm)', 'numeric', false, 'Uji lanjutan'),
    field('berat_ton', 'Berat (ton)', 'numeric', false),
    field('peralatan_tanggap_darurat', 'Peralatan Tanggap Darurat', 'text', false),
  ],
  transformator_tidak_digunakan: [
    ...trafoCommon(true),
    field('perawatan_jenis', 'Jenis Perawatan', 'text', false, 'Perawatan rutin'),
    field('perawatan_waktu', 'Waktu Perawatan', 'date', false, 'Perawatan rutin'),
    field('perawatan_merek_oli_pengganti', 'Merek Oli Pengganti', 'text', false, 'Perawatan rutin'),
    field('perawatan_volume_ditambahkan_l', 'Volume Oli Ditambahkan (L)', 'numeric', false, 'Perawatan rutin'),
    field('kondisi_di_dalam_alat', 'Kondisi di Dalam Alat', 'text', false, 'Kondisi'),
    field('uji_penyedia_jasa', 'Penyedia Jasa Uji', 'text', false, 'Uji lanjutan'),
    field('uji_jenis', 'Jenis Uji', 'text', false, 'Uji lanjutan'),
    field('uji_metode', 'Metode Uji', 'text', false, 'Uji lanjutan'),
    field('uji_konsentrasi_ppm', 'Konsentrasi Uji (ppm)', 'numeric', false, 'Uji lanjutan'),
    field('berat_ton', 'Berat (ton)', 'numeric', false),
    field('status_kondisi', 'Status Kondisi', 'text', false, 'Kondisi'),
    field('waktu_terakhir_digunakan', 'Waktu Terakhir Digunakan', 'date', false, 'Kondisi'),
    field('peralatan_tanggap_darurat', 'Peralatan Tanggap Darurat', 'text', false),
  ],
  kapasitor: [
    field('no', 'Nomor', 'integer', true),
    field('nama_merek', 'Nama / Merek Kapasitor', 'text', true),
    field('nomor_serial', 'Nomor Serial', 'text', true),
    field('tahun_pembuatan', 'Tahun Pembuatan', 'integer', false),
    field('negara_asal', 'Negara Asal', 'text', false),
    field('merek_minyak_dielektrik', 'Merek Minyak Dielektrik', 'text', false),
    field('lokasi_peralatan', 'Lokasi Peralatan dan/atau Penyimpanan', 'text', false),
    field('koordinat_raw', 'Koordinat', 'text', false),
    field('status_alat', 'Status Alat', 'text', false),
  ],
  minyak_dielektrik: [
    field('no', 'Nomor', 'integer', true),
    field('merek_minyak_dielektrik', 'Merek Minyak Dielektrik', 'text', true),
    field('volume_l', 'Volume (L)', 'numeric', false),
    field('tahun_pembuatan', 'Tahun Pembuatan', 'integer', false),
    field('negara_asal', 'Negara Asal', 'text', false),
    field('lokasi_penyimpanan', 'Lokasi Penyimpanan', 'text', false),
    field('koordinat_raw', 'Koordinat', 'text', false),
    field('status_minyak', 'Status Minyak', 'text', false),
    field('uji_penyedia_jasa', 'Penyedia Jasa Uji', 'text', false, 'Uji lanjutan'),
    field('uji_jenis', 'Jenis Uji', 'text', false, 'Uji lanjutan'),
    field('uji_metode', 'Metode Uji', 'text', false, 'Uji lanjutan'),
    field('uji_konsentrasi_ppm', 'Konsentrasi Uji (ppm)', 'numeric', false, 'Uji lanjutan'),
    field('wadah_penyimpanan', 'Wadah Penyimpanan', 'text', false),
  ],
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const CATEGORY_HINTS: Record<InventoryCategory, Array<[string, string[]]>> = {
  transformator_digunakan: [
    ['daya_kva', ['daya', 'kva']], ['ketersediaan_keran_buang', ['keran', 'buang']],
    ['perawatan_jenis', ['perawatan', 'jenis']], ['perawatan_waktu', ['perawatan', 'waktu']],
    ['perawatan_merek_oli_pengganti', ['perawatan', 'merek', 'oli']], ['perawatan_volume_ditambahkan_l', ['perawatan', 'volume', 'ditambahkan']],
    ['perawatan_penyedia_jasa', ['penyedia', 'jasa', 'perawatan']],
    ['uji_penyedia_jasa', ['uji', 'penyedia']], ['uji_jenis', ['uji', 'jenis']], ['uji_metode', ['uji', 'metode']],
    ['uji_konsentrasi_ppm', ['konsentrasi', 'ppm']], ['peralatan_tanggap_darurat', ['tanggap', 'darurat']],
    ['berat_ton', ['berat', 'ton']],
  ],
  transformator_tidak_digunakan: [
    ['daya_kva', ['daya', 'kva']], ['ketersediaan_keran_buang', ['keran', 'buang']],
    ['perawatan_jenis', ['perawatan', 'jenis']], ['perawatan_waktu', ['perawatan', 'waktu']],
    ['perawatan_merek_oli_pengganti', ['perawatan', 'merek', 'oli']], ['perawatan_volume_ditambahkan_l', ['perawatan', 'volume', 'ditambahkan']],
    ['kondisi_di_dalam_alat', ['kondisi', 'dalam']],
    ['status_kondisi', ['status', 'kondisi']], ['waktu_terakhir_digunakan', ['waktu', 'terakhir', 'digunakan']],
    ['uji_penyedia_jasa', ['uji', 'penyedia']], ['uji_jenis', ['uji', 'jenis']], ['uji_metode', ['uji', 'metode']],
    ['uji_konsentrasi_ppm', ['konsentrasi', 'ppm']], ['peralatan_tanggap_darurat', ['tanggap', 'darurat']], ['berat_ton', ['berat', 'ton']],
  ],
  kapasitor: [['status_alat', ['status', 'alat']], ['lokasi_peralatan', ['lokasi', 'peralatan']], ['nama_merek', ['nama', 'merek']]],
  minyak_dielektrik: [['merek_minyak_dielektrik', ['merek', 'minyak']], ['lokasi_penyimpanan', ['lokasi', 'penyimpanan']], ['status_minyak', ['status', 'minyak']], ['uji_konsentrasi_ppm', ['konsentrasi', 'ppm']], ['wadah_penyimpanan', ['wadah']]],
};

export function suggestInventoryField(category: InventoryCategory, header: string): string {
  const normalizedHeader = normalize(header);
  const fields = INVENTORY_FIELDS[category];
  const exact = fields.find((item) => normalize(item.field_key) === normalizedHeader || normalize(item.label) === normalizedHeader);
  if (exact) return exact.field_key;
  const hint = CATEGORY_HINTS[category].find(([, words]) => words.every((word) => normalizedHeader.includes(normalize(word))));
  if (hint && fields.some((item) => item.field_key === hint[0])) return hint[0];
  const generic: Array<[string, string[]]> = [
    ['nomor_serial', ['serial', 'seri']], ['koordinat_raw', ['koordinat', 'dms', 'latlon']],
    ['tahun_pembuatan', ['tahun']], ['negara_asal', ['negara', 'asal']], ['no', ['nomor', 'no']],
    ['nama_merek', ['nama', 'merek', 'merk']], ['volume_l', ['volume']], ['volume_minyak_l', ['volume', 'minyak']],
    ['lokasi_peralatan', ['lokasi', 'peralatan']], ['lokasi_penyimpanan', ['lokasi', 'penyimpanan']],
    ['uji_penyedia_jasa', ['uji', 'penyedia']], ['uji_jenis', ['jenis', 'uji']], ['uji_metode', ['metode', 'uji']],
  ];
  const match = generic.find(([key, words]) => fields.some((item) => item.field_key === key) && words.some((word) => normalizedHeader.includes(normalize(word))) && (key !== 'nama_merek' || words.filter((word) => normalizedHeader.includes(normalize(word))).length >= 2));
  return match?.[0] ?? '__ignore__';
}

export function getCategoryLabel(category: InventoryCategory) {
  return INVENTORY_CATEGORIES.find((item) => item.key === category)?.label ?? category;
}
