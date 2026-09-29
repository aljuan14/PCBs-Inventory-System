/**
 * Organisational units of a reporting company (see migration 20260928000001).
 *
 * PLN reports write the same Unit Induk many ways ("UIWRKR", "UIW RKR",
 * "WRKR"; "PT PLN (Persero) Unit Induk Wilayah Sumatera Utara") or leave it
 * empty, so it is mapped onto one name per unit. One workbook covers one
 * Unit Induk, so the file name is the fallback.
 */

// Checked in order on a lowercase, alphanumeric-only key; the first match wins.
// Transmission / load-dispatch units come first: their names contain regions
// that also belong to distribution units ("UIP3B Kalimantan", "UPT Bali").
const PLN_UNITS: Array<[name: string, pattern: RegExp]> = [
  ['UIT JBB', /uitjbb/],
  ['UIT JBT', /uitjbt/],
  ['UIT JBM', /uitjbm/],
  ['UIP3B Sumatera', /uip3bs(umatera)?(?![a-z])|uip3bsumatera/],
  ['UIP3B Kalimantan', /uip3bkalimantan/],
  ['UIP3B Sulawesi', /uip3bsulawesi|uikl(sul|sulawesi)/],
  ['UID Aceh', /aceh/],
  ['UID Sumatera Utara', /sumut|sumaterautara/],
  ['UID Sumatera Barat', /sumbar|sumaterabarat/],
  ['UID Riau & Kepri', /rkr|wkr|riau/],
  ['UID S2JB', /s2jb/],
  ['UID Lampung', /lampung/],
  ['UID Banten', /banten/],
  ['UID Jakarta Raya', /jaya|jakarta/],
  ['UID Jawa Barat', /jabar|jawabarat/],
  ['UID Jateng & DIY', /jateng|jawatengah|djty|uidjty/],
  ['UID Jawa Timur', /jatim|jawatimur/],
  ['UID Bali', /(^|uid|uiw)bali/],
  ['UID Kalimantan Barat', /kalbar|kalimantanbarat/],
  ['UID Kalselteng', /kalselteng|kskt/],
  ['UID Kaltimra', /kaltimra/],
  ['UID Sulselrabar', /sulselrabar/],
  ['UID Suluttenggo', /suluttenggo|sutg/],
  ['UIW Babel', /babel|bangkabelitung/],
  ['UIW NTB', /ntb/],
  ['UIW NTT', /ntt/],
  ['UIW MMU', /mmu|maluku/],
  ['UIW Papua & Papua Barat', /p2b|ppb|papua/],
];

const key = (value: string) => value.toLowerCase().replace(/pt\.?\s*pln\s*\(persero\)/g, '').replace(/[^a-z0-9]+/g, '');

/** Canonical PLN Unit Induk for a cell value or file path, or null when none matches. */
export function canonicalPlnUnit(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = key(String(value));
  if (!text) return null;
  return PLN_UNITS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Every canonical PLN Unit Induk, e.g. for documentation or a picker. */
export const PLN_UNIT_NAMES = PLN_UNITS.map(([name]) => name);

// Unit type prefixes that stay upper case ("UP3 Bandung", "UPT Bekasi").
const UNIT_PREFIX = /^(up3b?|upt|ulp|updk|upk|up2d|up2b|uid|uiw|uit|uip3b|ulpltd|pltd|gi)$/i;

// The company written before a unit type ("PLN UP3 Ketapang", "PT PLN (Persero) UP3 …").
const COMPANY_BEFORE_UNIT = /^(?:PT\.? )?PLN(?: \(Persero\))? (?=(?:up3b?|upt|ulp|updk|upk|up2d|up2b|uid|uiw|uit|uip3b|ulpltd|pltd) )/i;

/**
 * Tidy casing and spacing so "UP3 PONTIANAK" and "UP3 Pontianak" become one
 * sub-unit, and undo what spreadsheet editing adds to the name:
 * - Excel's fill handle counts up the number in a dragged "UP3 Banten Selatan"
 *   ("UP4 …", "UP5 …", … "UP1270 Banten Selatan"); there is no UP4 or above;
 * - a running number and site appended to it ("UP3 Berau - 01 - Gudang ULP Nunukan");
 * - the company written before the unit type ("PLN UP3 Ketapang" next to "UP3 Ketapang").
 */
export function tidyUnitName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(COMPANY_BEFORE_UNIT, '')
    .replace(/^UP(\d+) /i, (match, number: string) => (Number(number) >= 4 ? 'UP3 ' : match))
    .replace(/^(.+?) - \d+ - .+$/, '$1');
  if (!text || /^[-–.0]+$/.test(text) || /^(n\/?a|contoh|-)$/i.test(text)) return null;
  return text
    .split(' ')
    .map((word) => {
      if (UNIT_PREFIX.test(word)) return word.toUpperCase();
      // Short all-caps abbreviations (FBT, DIY, L.) and words with digits stay as written.
      if (/\d/.test(word) || (word.length <= 3 && word === word.toUpperCase())) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export interface UnitContext {
  /** Import profile of the sheet; PLN names are mapped onto canonical units. */
  profile?: string | null;
  /** Original file name or relative path, the fallback for a missing unit. */
  fileName?: string | null;
}

/** Final unit for a row: canonical for PLN (cell, then file name), tidied otherwise. */
export function resolveUnit(value: unknown, context: UnitContext = {}): string | null {
  if (context.profile === 'pln') return canonicalPlnUnit(value) ?? canonicalPlnUnit(context.fileName) ?? tidyUnitName(value);
  return tidyUnitName(value);
}
