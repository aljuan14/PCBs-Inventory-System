import { INVENTORY_FIELDS, type InventoryCategory } from '@/lib/inventory';

/**
 * The reporting form (app/formulir): forms 1.1–1.4 of the KLHK templates in
 * Data-inventaris/data-template, field by field in the template's order and
 * sections. The values are stored in the same columns as an Excel import and
 * go through the same check (app/api/formulir).
 */

export type FormInput = 'text' | 'number' | 'year' | 'date' | 'select' | 'coordinate';

export type FormField = {
  key: string;
  label: string;
  input: FormInput;
  required?: boolean;
  /** Choices: a fixed list for 'select', suggestions (datalist) for 'text'. */
  options?: string[];
  unit?: string;
  hint?: string;
};

export type FormSection = { title: string; note?: string; fields: FormField[]; collapsed?: boolean };

export type FormSpec = { code: string; title: string; category: InventoryCategory; sections: FormSection[] };

/** Transformers made from this year on are not reported unit by unit, only counted on the statement. */
export const TRAFO_FOCUS_YEAR = 1997;
export const MAX_FORM_ROWS = 500;

const TEST_METHODS = ['Potentiometry', 'GC-ECD', 'GC-MS', 'Dexil L2000', 'Clor-N-Oil'];
const TEST_SECTION = (): FormSection => ({
  title: 'Uji lanjutan',
  note: 'Diisi jika sudah dilakukan uji cepat dan/atau uji laboratorium.',
  fields: [
    { key: 'uji_penyedia_jasa', label: 'Penyedia jasa uji', input: 'text', hint: 'Nama perusahaan atau laboratorium' },
    { key: 'uji_jenis', label: 'Jenis uji', input: 'select', options: ['Uji cepat', 'Uji lab'] },
    { key: 'uji_metode', label: 'Metode uji', input: 'text', options: TEST_METHODS },
    { key: 'uji_konsentrasi_ppm', label: 'Konsentrasi PCBs', input: 'number', unit: 'ppm' },
  ],
});
const UNIT_SECTION = (): FormSection => ({
  title: 'Unit & kode alat',
  note: 'Untuk perusahaan dengan beberapa pabrik, cabang, atau unit.',
  collapsed: true,
  fields: [
    { key: 'unit', label: 'Unit', input: 'text', hint: 'Pabrik, cabang, atau unit induk' },
    { key: 'sub_unit', label: 'Sub-unit', input: 'text' },
    { key: 'kode_alat', label: 'Kode alat', input: 'text', hint: 'Kode internal peralatan' },
  ],
});
// The weight in its two parts (as the PLN form reports it) and the total; the
// total may be left empty when both parts are filled in (lib/import-transform).
const WEIGHT_INPUTS = (): FormField[] => [
  { key: 'berat_kering_kg', label: 'Berat kering (tanpa minyak)', input: 'number', unit: 'kg', hint: 'Inti, kumparan, dan tangki' },
  { key: 'berat_minyak_kg', label: 'Berat minyak', input: 'number', unit: 'kg' },
  { key: 'berat_ton', label: 'Berat total transformator', input: 'number', unit: 'ton', hint: 'Boleh kosong bila berat kering dan minyak diisi' },
];
const MAINTENANCE_TYPES = ['Purifikasi', 'Retrofilling (penggantian minyak dielektrik)', 'Penambahan minyak dielektrik', 'Filtrasi'];

const trafoGeneral = (): FormSection => ({
  title: 'Data transformator',
  fields: [
    { key: 'nama_merek', label: 'Nama / merek transformator', input: 'text', required: true },
    { key: 'nomor_serial', label: 'Nomor serial', input: 'text', required: true },
    { key: 'tahun_pembuatan', label: 'Tahun pembuatan', input: 'year', required: true, hint: `Formulir ini untuk trafo buatan sebelum ${TRAFO_FOCUS_YEAR}` },
    { key: 'negara_asal', label: 'Negara asal / produsen', input: 'text' },
    { key: 'merek_minyak_dielektrik', label: 'Merek minyak dielektrik / oli', input: 'text' },
    { key: 'volume_minyak_l', label: 'Volume minyak dielektrik', input: 'number', unit: 'L' },
    { key: 'lokasi_peralatan', label: 'Lokasi peralatan', input: 'text', required: true },
    { key: 'koordinat_raw', label: 'Titik koordinat lokasi', input: 'coordinate', required: true },
    { key: 'daya_kva', label: 'Daya', input: 'number', unit: 'kVA' },
    { key: 'ketersediaan_keran_buang', label: 'Keran buang (outlet valve)', input: 'select', options: ['Ada', 'Tidak Ada'] },
  ],
});

export const FORM_SPECS: FormSpec[] = [
  {
    code: '1.1',
    title: 'Transformator yang masih digunakan',
    category: 'transformator_digunakan',
    sections: [
      trafoGeneral(),
      {
        title: 'Perawatan rutin minyak dielektrik',
        note: 'Diisi hanya untuk perawatan yang terakhir kali dilakukan.',
        fields: [
          { key: 'perawatan_jenis', label: 'Jenis perawatan', input: 'text', options: MAINTENANCE_TYPES },
          { key: 'perawatan_waktu', label: 'Waktu perawatan', input: 'date' },
          { key: 'perawatan_merek_oli_pengganti', label: 'Merek / tipe oli pengganti', input: 'text' },
          { key: 'perawatan_volume_ditambahkan_l', label: 'Volume ditambahkan / diganti', input: 'number', unit: 'L' },
          { key: 'perawatan_penyedia_jasa', label: 'Penyedia jasa perawatan', input: 'text', hint: 'Jika dilakukan pihak ketiga' },
        ],
      },
      TEST_SECTION(),
      {
        title: 'Berat & peralatan tanggap darurat',
        fields: [
          ...WEIGHT_INPUTS(),
          { key: 'peralatan_tanggap_darurat', label: 'Peralatan tanggap darurat', input: 'text', options: ['Hydrant, APAR', 'APAR', 'APAR, serbuk kayu', 'Hydrant, APAR, serbuk kayu'] },
        ],
      },
      UNIT_SECTION(),
    ],
  },
  {
    code: '1.2',
    title: 'Transformator yang sudah tidak digunakan',
    category: 'transformator_tidak_digunakan',
    sections: [
      trafoGeneral(),
      {
        title: 'Perawatan / kondisi terakhir minyak dielektrik',
        note: 'Diisi hanya untuk perawatan yang terakhir kali dilakukan.',
        fields: [
          { key: 'perawatan_jenis', label: 'Jenis perawatan', input: 'text', options: MAINTENANCE_TYPES },
          { key: 'perawatan_waktu', label: 'Waktu perawatan', input: 'date' },
          { key: 'perawatan_merek_oli_pengganti', label: 'Merek / tipe oli pengganti', input: 'text' },
          { key: 'perawatan_volume_ditambahkan_l', label: 'Volume ditambahkan / diganti', input: 'number', unit: 'L' },
          { key: 'kondisi_di_dalam_alat', label: 'Kondisi di dalam alat', input: 'text', options: ['Minyak dielektrik penuh', 'Minyak dielektrik sebagian', 'Kosong'] },
        ],
      },
      TEST_SECTION(),
      {
        title: 'Kondisi & lainnya',
        fields: [
          ...WEIGHT_INPUTS(),
          { key: 'status_kondisi', label: 'Status / kondisi', input: 'text', options: ['Baik', 'Rusak', 'Bocor', 'Rusak dan bocor'], hint: 'Ada kerusakan dan/atau kebocoran?' },
          { key: 'waktu_terakhir_digunakan', label: 'Waktu terakhir digunakan', input: 'date' },
          { key: 'peralatan_tanggap_darurat', label: 'Peralatan tanggap darurat', input: 'text', options: ['Hydrant, APAR', 'APAR', 'APAR, serbuk kayu'] },
        ],
      },
      UNIT_SECTION(),
    ],
  },
  {
    code: '1.3',
    title: 'Kapasitor',
    category: 'kapasitor',
    sections: [
      {
        title: 'Data kapasitor',
        fields: [
          { key: 'nama_merek', label: 'Nama / merek kapasitor', input: 'text', required: true },
          { key: 'nomor_serial', label: 'Nomor serial', input: 'text', required: true },
          { key: 'tahun_pembuatan', label: 'Tahun pembuatan', input: 'year', required: true },
          { key: 'negara_asal', label: 'Negara asal / produsen', input: 'text' },
          { key: 'merek_minyak_dielektrik', label: 'Merek minyak dielektrik / oli', input: 'text' },
          { key: 'lokasi_peralatan', label: 'Lokasi peralatan dan/atau penyimpanan', input: 'text', required: true },
          { key: 'koordinat_raw', label: 'Titik koordinat lokasi', input: 'coordinate', required: true },
          { key: 'status_alat', label: 'Status alat', input: 'select', options: ['Masih digunakan', 'Tidak digunakan'], required: true },
        ],
      },
      UNIT_SECTION(),
    ],
  },
  {
    code: '1.4',
    title: 'Minyak dielektrik',
    category: 'minyak_dielektrik',
    sections: [
      {
        title: 'Data minyak dielektrik',
        fields: [
          { key: 'merek_minyak_dielektrik', label: 'Merek minyak dielektrik / oli', input: 'text', required: true },
          { key: 'volume_l', label: 'Volume', input: 'number', unit: 'L', required: true },
          { key: 'tahun_pembuatan', label: 'Tahun pembuatan', input: 'year' },
          { key: 'negara_asal', label: 'Negara asal / produsen', input: 'text' },
          { key: 'lokasi_penyimpanan', label: 'Lokasi penyimpanan', input: 'text', required: true },
          { key: 'koordinat_raw', label: 'Titik koordinat lokasi', input: 'coordinate', required: true },
          { key: 'status_minyak', label: 'Status minyak dielektrik', input: 'text', options: ['Belum digunakan', 'Sudah digunakan'] },
        ],
      },
      TEST_SECTION(),
      {
        title: 'Penyimpanan',
        fields: [{ key: 'wadah_penyimpanan', label: 'Wadah penyimpanan', input: 'text', options: ['Drum', 'IBC', 'Jeriken', 'Tangki'] }],
      },
      UNIT_SECTION(),
    ],
  },
];

export const formSpec = (category: InventoryCategory) => FORM_SPECS.find((spec) => spec.category === category)!;
export const formFields = (category: InventoryCategory) => formSpec(category).sections.flatMap((section) => section.fields);
export const isTrafo = (category: InventoryCategory) => category === 'transformator_digunakan' || category === 'transformator_tidak_digunakan';

/** One entry of the form: field key → typed text; "tidak diketahui" marks a year left unknown on purpose. */
export type FormEntry = { id: string; values: Record<string, string>; unknownYear?: boolean };

/** The check of one entry by app/api/formulir: errors block sending, notes do not. */
export type EntryCheck = { id: string; errors: string[]; notes: string[]; duplicate: boolean };

/** What blocks saving an entry, per field key (the import check comes after). */
export const entryErrors = (category: InventoryCategory, entry: FormEntry) => fieldErrors(formFields(category), entry, isTrafo(category));

/**
 * Required, number, year and choice checks of any form's fields. With
 * `focusYear`, a transformer made from TRAFO_FOCUS_YEAR on is refused.
 */
export function fieldErrors(fields: FormField[], entry: FormEntry, focusYear = false): Record<string, string> {
  const errors: Record<string, string> = {};
  const currentYear = new Date().getFullYear();
  for (const field of fields) {
    const value = entry.values[field.key]?.trim() ?? '';
    if (field.input === 'year') {
      if (!value) {
        if (field.required && !entry.unknownYear) errors[field.key] = 'Isi tahun, atau centang "tidak diketahui".';
        continue;
      }
      const year = Number(value);
      if (!Number.isInteger(year) || year < 1900 || year > currentYear) errors[field.key] = `Tahun harus antara 1900 dan ${currentYear}.`;
      else if (focusYear && year >= TRAFO_FOCUS_YEAR) errors[field.key] = `Trafo buatan ${TRAFO_FOCUS_YEAR} ke atas tidak diisi satu per satu, cukup jumlah dan tonasenya di Pernyataan.`;
      continue;
    }
    if (!value) {
      if (field.required) errors[field.key] = field.input === 'coordinate' || field.input === 'select' || field.input === 'number' ? 'Wajib diisi.' : 'Wajib diisi. Tulis "Tidak diketahui" bila memang tidak diketahui.';
      continue;
    }
    if (field.input === 'number') {
      const number = Number(value.replace(',', '.'));
      if (!Number.isFinite(number)) errors[field.key] = 'Harus berupa angka.';
      else if (number < 0) errors[field.key] = 'Tidak boleh negatif.';
    }
    if (field.input === 'select' && field.options && !field.options.includes(value)) errors[field.key] = 'Pilih salah satu pilihan.';
  }
  return errors;
}

/** The entry as a row for the import check: only this category's columns, numbers with a decimal point. */
export function entryRow(category: InventoryCategory, entry: FormEntry): Record<string, unknown> {
  const columns = new Set(INVENTORY_FIELDS[category].map((field) => field.field_key));
  const row: Record<string, unknown> = {};
  for (const field of formFields(category)) {
    if (!columns.has(field.key)) continue;
    const value = entry.values[field.key]?.trim();
    if (!value || (field.input === 'year' && entry.unknownYear)) continue;
    row[field.key] = field.input === 'number' ? value.replace(',', '.') : value;
  }
  return row;
}

/**
 * Form 2 "Pengurangan PCBs": one maintenance of a transformer still in use,
 * in the template's columns (table pengurangan_pcbs, migration 20261013000003).
 * The keys are the table's columns.
 */
export const REDUCTION_SECTIONS: FormSection[] = [
  {
    title: 'Data transformator',
    note: 'Terisi otomatis bila trafo dipilih dari data formulir 1.1.',
    fields: [
      { key: 'nama_merek', label: 'Nama / merek transformator', input: 'text', required: true },
      { key: 'nomor_serial', label: 'Nomor serial', input: 'text', required: true },
      { key: 'tahun_pembuatan', label: 'Tahun pembuatan', input: 'year' },
      { key: 'negara_asal', label: 'Negara asal / produsen', input: 'text' },
      { key: 'merek_minyak_dielektrik', label: 'Merek minyak dielektrik / oli', input: 'text' },
      { key: 'volume_minyak_l', label: 'Volume minyak dielektrik', input: 'number', unit: 'L' },
      { key: 'lokasi_peralatan', label: 'Lokasi peralatan', input: 'text', required: true },
      { key: 'koordinat_raw', label: 'Titik koordinat lokasi', input: 'coordinate' },
    ],
  },
  {
    title: 'Hasil uji sebelum perawatan',
    fields: [
      { key: 'uji_sebelum_jenis', label: 'Jenis uji', input: 'select', options: ['Uji cepat', 'Uji lab'] },
      { key: 'uji_sebelum_ppm', label: 'Konsentrasi PCBs sebelum perawatan', input: 'number', unit: 'ppm' },
    ],
  },
  {
    title: 'Perawatan pengurangan PCBs',
    note: 'Perawatan yang dilaporkan, mis. retrofilling (penggantian minyak dielektrik).',
    fields: [
      { key: 'perawatan_jenis', label: 'Jenis perawatan', input: 'text', required: true, options: MAINTENANCE_TYPES },
      { key: 'perawatan_waktu', label: 'Waktu perawatan', input: 'date', required: true },
      { key: 'perawatan_merek_oli_pengganti', label: 'Merek / tipe oli pengganti', input: 'text' },
      { key: 'perawatan_volume_l', label: 'Volume ditambahkan / diganti', input: 'number', unit: 'L' },
      { key: 'perawatan_penyedia_jasa', label: 'Penyedia jasa perawatan', input: 'text', hint: 'Jika dilakukan pihak ketiga' },
    ],
  },
  {
    title: 'Hasil uji setelah perawatan',
    note: 'Diisi jika sudah dilakukan uji cepat dan/atau uji laboratorium setelah perawatan.',
    fields: [
      { key: 'uji_sesudah_penyedia_jasa', label: 'Penyedia jasa uji', input: 'text', hint: 'Nama perusahaan atau laboratorium' },
      { key: 'uji_sesudah_jenis', label: 'Jenis uji', input: 'select', options: ['Uji cepat', 'Uji lab'] },
      { key: 'uji_sesudah_metode', label: 'Metode uji', input: 'text', options: TEST_METHODS },
      { key: 'uji_sesudah_ppm', label: 'Konsentrasi PCBs setelah perawatan', input: 'number', unit: 'ppm' },
    ],
  },
  {
    title: 'Kondisi & limbah',
    fields: [
      { key: 'berat_ton', label: 'Berat transformator', input: 'number', unit: 'ton' },
      { key: 'status_kondisi', label: 'Status / kondisi saat perawatan', input: 'text', options: ['Baik', 'Terjadi ceceran', 'Terjadi kebocoran'] },
      { key: 'peralatan_tanggap_darurat', label: 'Peralatan tanggap darurat', input: 'text', options: ['Hydrant, APAR', 'APAR', 'APAR, serbuk kayu'] },
      { key: 'pengelolaan_limbah_b3', label: 'Pengelolaan limbah B3 hasil perawatan', input: 'text', required: true, hint: 'mis. diserahkan ke pihak ketiga berizin PT …' },
      { key: 'bukti_dukung', label: 'Bukti dukung (tautan Google Drive)', input: 'text', hint: 'Foto trafo setelah perawatan dengan simbol dan label' },
    ],
  },
];

export const REDUCTION_FIELDS = REDUCTION_SECTIONS.flatMap((section) => section.fields);

const WASTE_NAME_TEXT = 'Limbah yang mengandung senyawa POPs dan UPOPs antara lain polychlorinated biphenyls (PCBs), DDT, PCDD, PCDF';
const WASTE_SOURCE_OPTIONS = [
  'Minyak dielektrik yang sudah dikeluarkan dari transformator',
  'Karkas transformator (minyak dielektrik sudah dikeluarkan)',
  'Transformator utuh sudah tidak digunakan',
  'Kapasitor sudah tidak digunakan',
  'Minyak dielektrik sudah tidak digunakan',
];

/** Form 3 "Tabel Logbook Penyimpanan PCBs" (table penyimpanan_logbook). */
export const STORAGE_SECTIONS: FormSection[] = [
  {
    title: 'Limbah yang disimpan',
    fields: [
      { key: 'kode_limbah', label: 'Kode limbah', input: 'text', required: true, options: ['A101d'] },
      { key: 'nama_limbah', label: 'Nama limbah', input: 'text', required: true, options: [WASTE_NAME_TEXT] },
      { key: 'sumber_limbah', label: 'Sumber limbah', input: 'text', required: true, options: WASTE_SOURCE_OPTIONS },
      { key: 'nomor_serial', label: 'Nomor serial peralatan', input: 'text' },
    ],
  },
  {
    title: 'Waktu & jumlah',
    note: 'Masa simpan dan jumlah yang masih disimpan di TPS dihitung otomatis.',
    fields: [
      { key: 'tanggal_dihasilkan', label: 'Tanggal dihasilkan', input: 'date', required: true },
      { key: 'tanggal_terakhir_dikelola', label: 'Tanggal terakhir dikelola', input: 'date' },
      { key: 'jumlah_dihasilkan_ton', label: 'Jumlah dihasilkan', input: 'number', unit: 'ton', required: true },
      { key: 'jumlah_dikelola_ton', label: 'Jumlah telah dikelola lebih lanjut', input: 'number', unit: 'ton' },
      { key: 'bukti_dukung', label: 'Bukti dukung (tautan Google Drive)', input: 'text' },
    ],
  },
];

/** Form 5 "Tabel neraca Pengelolaan PCBs" (table pelaporan_neraca). */
export const BALANCE_SECTIONS: FormSection[] = [
  {
    title: 'Limbah',
    fields: [
      { key: 'kode_limbah', label: 'Kode limbah', input: 'text', required: true, options: ['A101d'] },
      { key: 'nama_limbah', label: 'Nama limbah', input: 'text', required: true, options: [WASTE_NAME_TEXT] },
      { key: 'jenis', label: 'Jenis', input: 'text', required: true, options: WASTE_SOURCE_OPTIONS },
      { key: 'nomor_serial', label: 'Nomor serial peralatan', input: 'text' },
      { key: 'periode', label: 'Periode pelaporan (tanggal)', input: 'date' },
    ],
  },
  {
    title: 'Neraca',
    note: 'Yang belum dikelola = dihasilkan − dikelola − disimpan, dihitung otomatis.',
    fields: [
      { key: 'dihasilkan_ton', label: 'Dihasilkan', input: 'number', unit: 'ton', required: true },
      { key: 'dikelola_ton', label: 'Dikelola', input: 'number', unit: 'ton' },
      { key: 'disimpan_ton', label: 'Disimpan', input: 'number', unit: 'ton' },
      { key: 'keterangan', label: 'Keterangan', input: 'text', hint: 'mis. diserahkan ke pihak ketiga PT …, pengangkut PT …, kode festronik KLH-…' },
    ],
  },
];

/** A new entry with the waste code and name already filled in. */
export const wasteEntryDefaults = () => ({ kode_limbah: 'A101d', nama_limbah: WASTE_NAME_TEXT });

/**
 * An entry of a table form (logbook, balance) as its row: numbers parsed,
 * empty text as null; an empty amount in tons is left out so the table's
 * default (0) applies.
 */
export function recordFromEntry(fields: FormField[], entry: FormEntry, companyId: string): Record<string, unknown> {
  const record: Record<string, unknown> = { company_id: companyId };
  for (const field of fields) {
    const value = entry.values[field.key]?.trim() ?? '';
    if (field.input === 'number') {
      if (value) record[field.key] = Number(value.replace(',', '.'));
      else if (!field.key.endsWith('_ton')) record[field.key] = null;
    } else record[field.key] = value || null;
  }
  return record;
}
