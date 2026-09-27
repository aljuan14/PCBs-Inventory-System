/**
 * Dry run of the import pipeline over real workbooks, without a database:
 * scan every sheet → detect profile & category → suggested mapping →
 * transform & validate (same code as /api/upload and /api/mapping/validate).
 *
 *   npx tsx scripts/check-import.ts <file-or-folder> [...more]
 *
 * Prints a per-sheet report and totals, plus how identifiable the equipment
 * is (serial numbers, candidate ID columns) for matching rows on re-upload.
 */
import fs from 'fs';
import path from 'path';
import { parseSheet, readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet, hasIdentity, IGNORE, isMeaningful } from '@/lib/import-profiles';
import { transformRows } from '@/lib/import-transform';
import type { InventoryCategory } from '@/lib/inventory';

const listWorkbooks = (target: string): string[] => {
  const stat = fs.statSync(target);
  if (stat.isFile()) return /\.xlsx?$/i.test(target) && !path.basename(target).startsWith('.~lock') ? [target] : [];
  return fs.readdirSync(target).sort().flatMap((entry) => listWorkbooks(path.join(target, entry)));
};

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Pemakaian: npx tsx scripts/check-import.ts <berkas-atau-folder> [...]');
  process.exit(1);
}

const pct = (part: number, whole: number) => (whole === 0 ? '-' : `${((part / whole) * 100).toFixed(1)}%`);
const fmt = (n: number) => n.toLocaleString('id-ID');

// Unmapped columns whose name suggests an equipment / asset identifier.
const ID_HINT = /(^|[^a-z])(id|kode|code|aset|asset|gardu|funcloc|functional|equipment|nomor|no\.?)([^a-z]|$)/i;

const totals = {
  files: 0, failedFiles: 0, sheets: 0, included: 0, skipped: 0, unknownProfile: 0,
  rows: 0, withSerial: 0, withCoords: 0, dupInFile: 0, seconds: 0,
  byCategory: {} as Record<string, number>,
  issues: {} as Record<string, number>,
  idCandidates: {} as Record<string, { sheets: number; rows: number; filled: number; unique: number }>,
};

for (const file of targets.flatMap(listWorkbooks)) {
  totals.files++;
  const started = performance.now();
  const name = path.relative(process.cwd(), file);
  let workbook;
  try {
    workbook = readWorkbook(fs.readFileSync(file));
  } catch (err) {
    totals.failedFiles++;
    console.log(`\n✗ ${name}: tidak dapat dibaca (${err instanceof Error ? err.message : err})`);
    continue;
  }

  console.log(`\n■ ${name}  (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB, ${workbook.SheetNames.length} sheet)`);
  for (const sheetName of workbook.SheetNames) {
    totals.sheets++;
    const parsed = parseSheet(workbook, sheetName);
    const initial = detectSheet(sheetName, parsed.headers, parsed.totalRows, workbook.SheetNames.length);
    let dataRows = parsed.allRows;
    if (initial.category) {
      const mapping = buildSuggestedMapping(initial.profile, initial.category, parsed.headers, parsed.allRows.slice(0, 30));
      dataRows = parsed.allRows.filter((row) => hasIdentity(row, mapping));
    }
    const detection = detectSheet(sheetName, parsed.headers, dataRows.length, workbook.SheetNames.length);

    if (!detection.include || !detection.category) {
      totals.skipped++;
      console.log(`  · ${sheetName}: dilewati — ${detection.reason}`);
      continue;
    }
    totals.included++;
    if (!detection.profile) totals.unknownProfile++;

    const category = detection.category as InventoryCategory;
    const mapping = buildSuggestedMapping(detection.profile, category, parsed.headers, dataRows.slice(0, 30));
    const { rows, issues } = transformRows(category, parsed, mapping);

    const withSerial = rows.filter((row) => isMeaningful(row.item.nomor_serial)).length;
    const withCoords = rows.filter((row) => typeof row.item.koordinat_lat === 'number').length;
    const serials = rows.map((row) => row.item.nomor_serial).filter(isMeaningful).map((value) => String(value).trim().toLowerCase());
    const dupSerials = serials.length - new Set(serials).size;
    const issueList = issues.list();
    const dupInFile = issueList.find((issue) => issue.key === 'duplicate:file')?.count ?? 0;

    totals.rows += rows.length;
    totals.withSerial += withSerial;
    totals.withCoords += withCoords;
    totals.dupInFile += dupInFile;
    totals.byCategory[category] = (totals.byCategory[category] ?? 0) + rows.length;
    for (const issue of issueList) totals.issues[issue.label.replace(/"[^"]*"/, '"…"')] = (totals.issues[issue.label.replace(/"[^"]*"/, '"…"')] ?? 0) + issue.count;

    const mapped = Object.values(mapping).filter((target) => target !== IGNORE).length;
    console.log(`  ✓ ${sheetName}: ${detection.profile ?? 'profil tidak dikenal'} → ${category}, ${fmt(rows.length)} baris, ${mapped}/${parsed.headers.length} kolom terpetakan`);
    console.log(`      no. seri ${pct(withSerial, rows.length)} (kembar ${fmt(dupSerials)}), koordinat valid ${pct(withCoords, rows.length)}, baris kembar ${fmt(dupInFile)}`);
    for (const issue of issueList.filter((item) => item.level === 'warning').slice(0, 4)) {
      console.log(`      ! ${issue.label}: ${fmt(issue.count)} (mis. baris ${issue.rows.slice(0, 3).join(', ')}${issue.examples[0] ? `, "${issue.examples[0]}"` : ''})`);
    }

    for (const header of parsed.headers) {
      if (mapping[header] !== IGNORE || !ID_HINT.test(header)) continue;
      const values = parsed.allRows.map((row) => row[header]).filter(isMeaningful).map((value) => String(value).trim());
      if (values.length === 0) continue;
      const key = header.replace(/\s+/g, ' ').trim();
      const entry = (totals.idCandidates[key] ??= { sheets: 0, rows: 0, filled: 0, unique: 0 });
      entry.sheets++;
      entry.rows += parsed.allRows.length;
      entry.filled += values.length;
      entry.unique += new Set(values).size;
    }
  }
  totals.seconds += (performance.now() - started) / 1000;
}

console.log('\n════════ RINGKASAN ════════');
console.log(`Berkas: ${totals.files} (${totals.failedFiles} gagal dibaca), waktu ${totals.seconds.toFixed(1)} dtk`);
console.log(`Sheet: ${totals.sheets} total, ${totals.included} diimpor, ${totals.skipped} dilewati, ${totals.unknownProfile} tanpa profil`);
console.log(`Baris data: ${fmt(totals.rows)}`);
for (const [category, count] of Object.entries(totals.byCategory)) console.log(`  - ${category}: ${fmt(count)}`);
console.log(`Punya nomor seri: ${pct(totals.withSerial, totals.rows)} · koordinat valid: ${pct(totals.withCoords, totals.rows)} · baris kembar dalam file: ${fmt(totals.dupInFile)}`);
console.log('\nTemuan validasi (jumlah baris):');
for (const [label, count] of Object.entries(totals.issues).sort((a, b) => b[1] - a[1])) console.log(`  ${fmt(count).padStart(9)}  ${label}`);
console.log('\nKandidat kolom ID alat yang belum dipetakan (terisi / unik):');
for (const [header, entry] of Object.entries(totals.idCandidates).sort((a, b) => b[1].filled - a[1].filled).slice(0, 15)) {
  console.log(`  ${header}: ${entry.sheets} sheet, terisi ${pct(entry.filled, entry.rows)}, unik ${pct(entry.unique, entry.filled)}`);
}
console.log(`\nMemori puncak: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`);
