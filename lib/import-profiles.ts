import { INVENTORY_FIELDS, suggestInventoryField, type InventoryCategory, type InventoryFieldType } from './inventory';

/**
 * Known spreadsheet layouts. A profile is recognised from a sheet's header
 * fingerprint and brings a ready-made column mapping, so an admin only has to
 * confirm it instead of mapping every column by hand.
 */
export type ImportProfile = 'template_klhk' | 'pln';

export const IMPORT_PROFILE_LABELS: Record<ImportProfile, string> = {
  template_klhk: 'Template KLHK',
  pln: 'Format PLN',
};

export const IGNORE = '__ignore__';

/**
 * Mapping targets that are not columns themselves but feed a conversion rule
 * (see applyDerivedFields). They start with "@" so they never collide with a
 * database column.
 */
export const DERIVED_FIELDS: Array<{ field_key: string; label: string; tipe_data: InventoryFieldType; categories: InventoryCategory[] }> = [
  { field_key: '@berat_kg', label: 'Berat total (kg) → dikonversi ke ton', tipe_data: 'numeric', categories: ['transformator_digunakan', 'transformator_tidak_digunakan'] },
  { field_key: '@uji_lab_ppm', label: 'Hasil uji lab / GC (ppm) → Uji lab', tipe_data: 'numeric', categories: ['transformator_digunakan', 'transformator_tidak_digunakan', 'minyak_dielektrik'] },
  { field_key: '@uji_lab_penyedia', label: 'Penguji lab / GC', tipe_data: 'text', categories: ['transformator_digunakan', 'transformator_tidak_digunakan', 'minyak_dielektrik'] },
  { field_key: '@uji_cepat_ppm', label: 'Hasil uji cepat / Dexil (ppm) → Uji cepat', tipe_data: 'numeric', categories: ['transformator_digunakan', 'transformator_tidak_digunakan', 'minyak_dielektrik'] },
  { field_key: '@uji_cepat_penyedia', label: 'Penguji uji cepat / Dexil', tipe_data: 'text', categories: ['transformator_digunakan', 'transformator_tidak_digunakan', 'minyak_dielektrik'] },
  { field_key: '@koordinat_bujur', label: 'Bujur (kolom koordinat kedua) → digabung ke Koordinat', tipe_data: 'text', categories: ['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] },
];

export function getDerivedFields(category: InventoryCategory) {
  return DERIVED_FIELDS.filter((field) => field.categories.includes(category));
}

export const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

// A rule matches when the normalised header contains every fragment; a
// fragment starting with "=" must equal the whole header. The first matching
// rule wins and each target is assigned to one column only.
type Rule = [target: string, fragments: string[]];

const PLN_TEST_RULES: Rule[] = [
  ['@uji_cepat_penyedia', ['pihakpenguji', 'dexil']],
  ['@uji_cepat_ppm', ['hasilanalisa', 'dexil', 'ppm']],
  ['@uji_lab_penyedia', ['pihakpenguji', 'gc']],
  ['@uji_lab_ppm', ['hasilanalisa', 'gc', 'ppm']],
];

const PLN_RULES: Record<InventoryCategory, Rule[]> = {
  transformator_digunakan: [
    ['no', ['=no']],
    ['nama_merek', ['merk', 'pabrikan']],
    ['nomor_serial', ['nomorseri']],
    ['tahun_pembuatan', ['tahunproduksi']],
    ['negara_asal', ['negaraproduksi']],
    ['merek_minyak_dielektrik', ['namadagang', 'oli']],
    ['koordinat_raw', ['titikkoordinat']],
    ['lokasi_peralatan', ['kabkota']],
    ['daya_kva', ['daya', 'kva']],
    ['ketersediaan_keran_buang', ['saluranpengurasan']],
    ['perawatan_waktu', ['tanggalperawatan']],
    ['@berat_kg', ['berattotal']],
    ...PLN_TEST_RULES,
  ],
  transformator_tidak_digunakan: [],
  kapasitor: [
    ['no', ['=no']],
    ['nama_merek', ['merk', 'pabrikan']],
    ['nomor_serial', ['nomorseri']],
    ['tahun_pembuatan', ['tahunproduksi']],
    ['negara_asal', ['negaraproduksi']],
    ['koordinat_raw', ['titikkoordinat']],
    ['lokasi_peralatan', ['kabkota']],
    ['status_alat', ['masihdigunakan']],
  ],
  minyak_dielektrik: [
    ['no', ['=no']],
    ['merek_minyak_dielektrik', ['namadagang']],
    ['volume_l', ['volume']],
    ['koordinat_raw', ['titikkoordinat']],
    ['lokasi_penyimpanan', ['lokasipenyimpanan']],
    ['wadah_penyimpanan', ['mediapenyimpanan']],
    ...PLN_TEST_RULES,
  ],
};
PLN_RULES.transformator_tidak_digunakan = [
  ...PLN_RULES.transformator_digunakan,
  ['kondisi_di_dalam_alat', ['kosongterisi']],
  ['status_kondisi', ['=kondisitrafo']],
];

// One ordered list for all official template sheets; rules for fields a
// category does not have are dropped. Specific rules precede generic ones
// ("oli pengganti" before "merek minyak", "ditambahkan" before "volume").
const TEMPLATE_RULES: Rule[] = [
  ['no', ['=no']],
  ['nama_merek', ['namamerek']],
  ['nomor_serial', ['nomorserial']],
  ['tahun_pembuatan', ['tahunpembuatan']],
  ['negara_asal', ['negaraasal']],
  ['perawatan_merek_oli_pengganti', ['olipengganti']],
  ['perawatan_volume_ditambahkan_l', ['ditambahkan']],
  ['merek_minyak_dielektrik', ['merekminyak']],
  ['volume_minyak_l', ['volumeminyak']],
  ['volume_l', ['volume']],
  ['lokasi_peralatan', ['lokasiperalatan']],
  ['lokasi_penyimpanan', ['lokasipenyimpanan']],
  ['koordinat_raw', ['koordinat']],
  ['daya_kva', ['daya']],
  ['ketersediaan_keran_buang', ['keranbuang']],
  ['perawatan_jenis', ['jenisperawatan']],
  ['perawatan_waktu', ['waktuperawatan']],
  ['perawatan_waktu', ['tahunperawatan']],
  ['perawatan_penyedia_jasa', ['penyediajasaperawatan']],
  ['uji_penyedia_jasa', ['penyediajasauji']],
  ['uji_jenis', ['jenisuji']],
  ['uji_metode', ['metodeuji']],
  ['uji_konsentrasi_ppm', ['konsentrasi']],
  ['berat_ton', ['berat']],
  ['peralatan_tanggap_darurat', ['tanggapdarurat']],
  ['kondisi_di_dalam_alat', ['kondisididalam']],
  ['status_kondisi', ['statuskondisi']],
  ['waktu_terakhir_digunakan', ['terakhirdigunakan']],
  ['status_alat', ['statusalat']],
  ['status_minyak', ['statusminyak']],
  ['wadah_penyimpanan', ['wadah']],
];

function applyRules(rules: Rule[], category: InventoryCategory, headers: string[]) {
  const allowed = new Set([...INVENTORY_FIELDS[category].map((field) => field.field_key), ...getDerivedFields(category).map((field) => field.field_key)]);
  const mapping: Record<string, string> = Object.fromEntries(headers.map((header) => [header, IGNORE]));
  const used = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const rule = rules.find(([target, fragments]) => allowed.has(target) && !used.has(target) && fragments.every((fragment) => (fragment.startsWith('=') ? normalized === fragment.slice(1) : normalized.includes(fragment))));
    if (rule) {
      mapping[header] = rule[0];
      used.add(rule[0]);
    }
  }
  return mapping;
}

/**
 * Column mapping for a sheet: profile rules when the layout is known, keyword
 * guesses otherwise. `sampleRows` (first rows of the sheet) lets it spot a
 * coordinate split over two columns.
 */
export function buildSuggestedMapping(profile: ImportProfile | null, category: InventoryCategory, headers: string[], sampleRows: Record<string, unknown>[] = []) {
  let mapping: Record<string, string> = {};
  if (profile === 'pln') mapping = applyRules(PLN_RULES[category], category, headers);
  else if (profile === 'template_klhk') mapping = applyRules(TEMPLATE_RULES, category, headers);
  else {
    const used = new Set<string>();
    for (const header of headers) {
      const fieldKey = suggestInventoryField(category, header);
      mapping[header] = fieldKey !== IGNORE && !used.has(fieldKey) ? fieldKey : IGNORE;
      used.add(fieldKey);
    }
  }
  // A merged "Titik Koordinat" header often spans two columns (latitude,
  // longitude). The second one has no label of its own, or picks up an
  // unrelated one from another header row ("Inventarisasi", "... Y").
  const coordinateIndex = headers.findIndex((header) => mapping[header] === 'koordinat_raw');
  const next = headers[coordinateIndex + 1];
  if (coordinateIndex >= 0 && next && mapping[next] === IGNORE) {
    if (/^Kolom_\d+$/.test(next) || (mostlySingleNumbers(sampleRows, headers[coordinateIndex]) && mostlySingleNumbers(sampleRows, next))) {
      mapping[next] = '@koordinat_bujur';
    }
  }
  return mapping;
}

const SINGLE_NUMBER = /^'?-?\d+(?:[.,]\d+)*$/;
function mostlySingleNumbers(rows: Record<string, unknown>[], header: string) {
  const values = rows.map((row) => row[header]).filter(isMeaningful);
  return values.length > 0 && values.filter((value) => typeof value === 'number' || SINGLE_NUMBER.test(String(value).trim())).length >= values.length * 0.6;
}

export interface SheetDetection {
  profile: ImportProfile | null;
  category: InventoryCategory | null;
  include: boolean;
  /** Why the sheet was skipped or needs attention; empty when detection is confident. */
  reason: string;
}

const hasHeader = (normalized: string[], ...fragments: string[]) => normalized.some((header) => fragments.every((fragment) => header.includes(fragment)));

function guessCategoryFromName(sheetName: string): InventoryCategory | null {
  const name = sheetName.toLowerCase();
  if (/kapasitor/.test(name)) return 'kapasitor';
  if (/minyak|oli/.test(name)) return 'minyak_dielektrik';
  if (/offline|tidak digunakan|tdk digunakan/.test(name)) return 'transformator_tidak_digunakan';
  if (/online|trafo|transformator|digunakan/.test(name)) return 'transformator_digunakan';
  return null;
}

/**
 * Decide the profile, target category and default inclusion of one sheet.
 * `dataRows` is the number of rows that carry real inventory data.
 */
export function detectSheet(sheetName: string, headers: string[], dataRows: number, sheetCount: number): SheetDetection {
  const normalized = headers.map(normalizeHeader);
  const name = sheetName.trim();

  if (headers.length === 0 || dataRows === 0) return { profile: null, category: null, include: false, reason: 'Sheet kosong atau tidak berisi data inventaris.' };
  if (/^database$/i.test(name)) return { profile: null, category: null, include: false, reason: 'Daftar pilihan (dropdown), bukan data.' };

  let profile: ImportProfile | null = null;
  let category: InventoryCategory | null = null;

  if (hasHeader(normalized, 'unitinduk') && hasHeader(normalized, 'jenispotensipencemar')) {
    profile = 'pln';
    if (hasHeader(normalized, 'kapasitor')) category = 'kapasitor';
    else if (hasHeader(normalized, 'kodeolitrafo') || hasHeader(normalized, 'volumeoli')) category = 'minyak_dielektrik';
    else if (/offline/i.test(name)) category = 'transformator_tidak_digunakan';
    else if (/online/i.test(name)) category = 'transformator_digunakan';
    else if (hasHeader(normalized, 'kosongterisi')) category = 'transformator_tidak_digunakan';
    else if (hasHeader(normalized, 'rencanapenggunaan')) category = 'transformator_digunakan';
  } else if (hasHeader(normalized, 'titikkoordinat') && (hasHeader(normalized, 'namamerek') || hasHeader(normalized, 'merekminyakdielektrik'))) {
    profile = 'template_klhk';
    if (hasHeader(normalized, 'namamerekkapasitor')) category = 'kapasitor';
    else if (hasHeader(normalized, 'namamerektransformator')) {
      const unused = hasHeader(normalized, 'terakhirdigunakan') || hasHeader(normalized, 'kondisididalam') || /tidak/i.test(name);
      category = unused ? 'transformator_tidak_digunakan' : 'transformator_digunakan';
    } else if (hasHeader(normalized, 'volumel') || hasHeader(normalized, 'statusminyak')) category = 'minyak_dielektrik';
  }

  if (/reaktor/i.test(name)) return { profile, category: null, include: false, reason: 'Reaktor bukan kategori inventaris; pilih kategori jika ingin tetap diimpor.' };
  if (/rekap|pivot|data per|hanya|copy of|\(\d+\)\s*$|^sheet\s*\d*$/i.test(name)) {
    return { profile, category: category ?? guessCategoryFromName(name), include: false, reason: 'Nama sheet menandakan rekap, salinan, atau duplikat. Periksa sebelum disertakan.' };
  }

  if (!profile) {
    const guessed = guessCategoryFromName(name);
    const single = sheetCount === 1;
    return {
      profile: null,
      category: guessed,
      include: single,
      reason: single ? 'Format tidak dikenali. Kolom akan dicocokkan dengan kata kunci; periksa pemetaan.' : 'Format tidak dikenali (kemungkinan ringkasan atau data mentah).',
    };
  }
  if (!category) return { profile, category: null, include: true, reason: 'Kategori tidak dapat ditentukan otomatis. Pilih kategori.' };
  return { profile, category, include: true, reason: '' };
}

// ---------------------------------------------------------------------------
// Value conversion shared by row counting (upload) and import.

const PLACEHOLDERS = new Set(['', '-', '--', '0', 'n/a', '#n/a', 'na', 'n.a', 'nan', 'null', 'tidak ada data', 'tidak diketahui']);

export function isMeaningful(value: unknown) {
  if (value === null || value === undefined) return false;
  if (value instanceof Date) return true;
  return !PLACEHOLDERS.has(String(value).trim().toLowerCase());
}

/** Fields whose presence marks a row as a real record rather than an empty pre-filled form row. */
const IDENTITY_FIELDS = ['nama_merek', 'nomor_serial', 'merek_minyak_dielektrik', 'koordinat_raw', 'tahun_pembuatan', 'volume_l', 'daya_kva'];

export function hasIdentity(row: Record<string, unknown>, mapping: Record<string, string>) {
  const columns = Object.entries(mapping).filter(([, target]) => IDENTITY_FIELDS.includes(target)).map(([header]) => header);
  if (columns.length === 0) return true;
  return columns.some((header) => isMeaningful(row[header]));
}

/** Parse numbers as written in Indonesian spreadsheets: "96,5", "1.679,64", "36000/60000" (first value), "<0,5". */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Numeric columns formatted as dates are years in practice ("Tahun Produksi").
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getFullYear();
  if (!isMeaningful(value)) return null;
  const match = String(value).match(/-?\d[\d.,]*/);
  if (!match) return null;
  let token = match[0].replace(/[.,]$/, '');
  const lastComma = token.lastIndexOf(',');
  const lastDot = token.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    token = lastComma > lastDot ? token.replace(/\./g, '').replace(',', '.') : token.replace(/,/g, '');
  } else if (lastComma >= 0) {
    token = token.split(',').length > 2 ? token.replace(/,/g, '') : token.replace(',', '.');
  } else if (token.split('.').length > 2) {
    token = token.replace(/\./g, '');
  }
  const number = Number(token);
  return Number.isFinite(number) ? number : null;
}

export function parseDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (!isMeaningful(value)) return null;
  const number = typeof value === 'number' ? value : /^\d+(\.\d+)?$/.test(String(value).trim()) ? Number(value) : null;
  if (number !== null) {
    // A bare year ("2023") rather than an Excel serial date.
    if (number >= 1900 && number <= 2100) return `${Math.trunc(number)}-01-01`;
    const date = new Date(Date.UTC(1899, 11, 30) + number * 86400000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  // Indonesian day-first dates: "25/01/2020", "5-3-19".
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(String(value).trim());
  if (dayFirst) {
    const [, day, month, rawYear] = dayFirst.map(Number);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

// Columns with CHECK constraints accept only these spellings.
const ENUM_NORMALIZERS: Record<string, (value: string) => string | null> = {
  ketersediaan_keran_buang: (value) => (/^(tidak|tdk|no\b)/i.test(value) ? 'Tidak Ada' : /^(ada|ya\b|yes\b)/i.test(value) ? 'Ada' : null),
  uji_jenis: (value) => (/lab|gc/i.test(value) ? 'Uji lab' : /cepat|dexil/i.test(value) ? 'Uji cepat' : null),
  status_alat: (value) => (/tidak|attb/i.test(value) ? 'Tidak digunakan' : /masih|^ya\b|^atb$|digunakan/i.test(value) ? 'Masih digunakan' : null),
};

export function convertValue(fieldKey: string, type: string | undefined, value: unknown): string | number | null {
  if (type === 'numeric' || type === 'integer' || type === 'number') {
    const number = parseNumber(value);
    return number === null ? null : type === 'integer' ? Math.round(number) : number;
  }
  if (type === 'date') return parseDate(value);
  if (!isMeaningful(value)) return null;
  const text = (value instanceof Date ? value.toISOString().slice(0, 10) : String(value)).replace(/\s+/g, ' ').trim();
  const normalizer = ENUM_NORMALIZERS[fieldKey];
  return normalizer ? normalizer(text) : text;
}

/** Resolve "@" mapping targets into real columns without overwriting directly mapped values. */
export function applyDerivedFields(item: Record<string, unknown>, derived: Record<string, string | number | null>) {
  const setIfEmpty = (key: string, value: unknown) => {
    if ((item[key] === null || item[key] === undefined) && value !== null && value !== undefined) item[key] = value;
  };
  if (derived['@koordinat_bujur'] !== null && derived['@koordinat_bujur'] !== undefined && typeof item.koordinat_raw === 'string') {
    item.koordinat_raw = `${item.koordinat_raw}, ${derived['@koordinat_bujur']}`;
  }
  if (typeof derived['@berat_kg'] === 'number') setIfEmpty('berat_ton', Number((derived['@berat_kg'] / 1000).toFixed(4)));

  const hasDirectTest = item.uji_konsentrasi_ppm !== null && item.uji_konsentrasi_ppm !== undefined;
  if (!hasDirectTest) {
    if (typeof derived['@uji_lab_ppm'] === 'number') {
      item.uji_jenis = 'Uji lab';
      item.uji_konsentrasi_ppm = derived['@uji_lab_ppm'];
      setIfEmpty('uji_metode', 'GC');
      setIfEmpty('uji_penyedia_jasa', derived['@uji_lab_penyedia']);
    } else if (typeof derived['@uji_cepat_ppm'] === 'number') {
      item.uji_jenis = 'Uji cepat';
      item.uji_konsentrasi_ppm = derived['@uji_cepat_ppm'];
      setIfEmpty('uji_metode', 'Dexil');
      setIfEmpty('uji_penyedia_jasa', derived['@uji_cepat_penyedia']);
    }
  }
}
