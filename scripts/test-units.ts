import { canonicalPlnUnit, resolveUnit, tidyUnitName } from '../lib/units';

/**
 * Unit Induk spellings seen in real PLN reports and the canonical unit they
 * must map to.   npx tsx scripts/test-units.ts
 */
const cases: Array<[unknown, string | null]> = [
  ['UITJBB', 'UIT JBB'], ['UIT JBB', 'UIT JBB'], ['UIT-JBT', 'UIT JBT'], ['UIT JBM', 'UIT JBM'],
  ['UIP3BS', 'UIP3B Sumatera'], ['UIP3B Kalimantan', 'UIP3B Kalimantan'], ['UIKL SUL', 'UIP3B Sulawesi'], ['UIKLSUL', 'UIP3B Sulawesi'],
  ['UIW ACEH', 'UID Aceh'], ['UID ACEH', 'UID Aceh'],
  ['PT PLN (Persero) Unit Induk Wilayah Sumatera Utara', 'UID Sumatera Utara'], ['Unit Induk Wilayah Sumatera Utara', 'UID Sumatera Utara'],
  ['UIW SUMBAR', 'UID Sumatera Barat'],
  ['UIWRKR', 'UID Riau & Kepri'], ['UIW RKR', 'UID Riau & Kepri'], ['WRKR', 'UID Riau & Kepri'], ['UIWKR', 'UID Riau & Kepri'],
  ['UIW S2JB', 'UID S2JB'], ['UID Lampung', 'UID Lampung'], ['UID BANTEN', 'UID Banten'], ['UID Jakarta Raya', 'UID Jakarta Raya'],
  ['UID Jawa Barat', 'UID Jawa Barat'], ['UID JABAR', 'UID Jawa Barat'], ['JAWA BARAT', 'UID Jawa Barat'],
  ['UID Jawa Tengah dan D.I. Yogyakarta', 'UID Jateng & DIY'], ['UIDJTY', 'UID Jateng & DIY'], ['UID DJTY', 'UID Jateng & DIY'],
  ['UID JAWA TIMUR', 'UID Jawa Timur'], ['UID Bali', 'UID Bali'],
  ['UIW Kalimantan Barat', 'UID Kalimantan Barat'], ['PLN UIW Kalbar', 'UID Kalimantan Barat'],
  ['UIWKSKT', 'UID Kalselteng'], ['UIW Kaltimra', 'UID Kaltimra'], ['UID SULSELRABAR', 'UID Sulselrabar'],
  ['UIW SUTG', 'UID Suluttenggo'], ['UIW Babel', 'UIW Babel'], ['UIW NTB', 'UIW NTB'], ['UIW NTT', 'UIW NTT'],
  ['MMU', 'UIW MMU'], ['UIW Papua & Papua Barat', 'UIW Papua & Papua Barat'], ['UIW PPB', 'UIW Papua & Papua Barat'],
  // File names used as fallback.
  ['Data-PLN/0. Inven Ident PLN/18. UID Bali.xlsx', 'UID Bali'], ['14. UID Jaya/UP3 Bandengan.xlsx', 'UID Jakarta Raya'],
  ['4. UIP3B Sumatera.xlsx', 'UIP3B Sumatera'], ['6. UIP3B Sulawesi.xlsx', 'UIP3B Sulawesi'],
  // Not a unit.
  ['CONTOH', null], ['250', null], ['', null], [null, null],
];

let failures = 0;
for (const [input, expected] of cases) {
  const actual = canonicalPlnUnit(input);
  if (actual !== expected) failures++;
  if (actual !== expected) console.log(`✗ ${JSON.stringify(input)} -> ${actual} (harusnya ${expected})`);
}
const extra: Array<[string | null, string | null]> = [
  [resolveUnit('', { profile: 'pln', fileName: '12. UID Lampung.xlsx' }), 'UID Lampung'],
  [resolveUnit('Pabrik Cikarang', {}), 'Pabrik Cikarang'],
  [tidyUnitName('UP3 PONTIANAK'), 'UP3 Pontianak'],
  [tidyUnitName('  up3  Bali   Timur '), 'UP3 Bali Timur'],
  [tidyUnitName('N/A'), null],
];
for (const [actual, expected] of extra) {
  if (actual !== expected) {
    failures++;
    console.log(`✗ ${actual} (harusnya ${expected})`);
  }
}
console.log(failures === 0 ? `Semua ${cases.length + extra.length} kasus lolos.` : `${failures} kasus gagal.`);
process.exit(failures === 0 ? 0 : 1);
