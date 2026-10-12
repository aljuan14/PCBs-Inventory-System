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
        title: 'Lainnya',
        fields: [
          { key: 'berat_ton', label: 'Berat transformator', input: 'number', unit: 'ton' },
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
          { key: 'berat_ton', label: 'Berat transformator', input: 'number', unit: 'ton' },
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
export function entryErrors(category: InventoryCategory, entry: FormEntry): Record<string, string> {
  const errors: Record<string, string> = {};
  const currentYear = new Date().getFullYear();
  for (const field of formFields(category)) {
    const value = entry.values[field.key]?.trim() ?? '';
    if (field.input === 'year') {
      if (!value) {
        if (field.required && !entry.unknownYear) errors[field.key] = 'Isi tahun, atau centang "tidak diketahui".';
        continue;
      }
      const year = Number(value);
      if (!Number.isInteger(year) || year < 1900 || year > currentYear) errors[field.key] = `Tahun harus antara 1900 dan ${currentYear}.`;
      else if (isTrafo(category) && year >= TRAFO_FOCUS_YEAR) errors[field.key] = `Trafo buatan ${TRAFO_FOCUS_YEAR} ke atas tidak diisi satu per satu, cukup jumlah dan tonasenya di Pernyataan.`;
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
