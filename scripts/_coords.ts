import fs from 'fs';
import path from 'path';
import { parseSheet, readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet, hasIdentity, convertValue } from '@/lib/import-profiles';
import { transformRows } from '@/lib/import-transform';
const list = (t: string): string[] => fs.statSync(t).isFile() ? (/\.xlsx$/i.test(t) ? [t] : []) : fs.readdirSync(t).flatMap((e) => list(path.join(t, e)));
const shapes = new Map<string, { n: number; ex: string[] }>();
const dates = new Map<string, number>();
let total = 0, ok = 0;
for (const f of list(process.argv[2])) {
  const wb = readWorkbook(fs.readFileSync(f));
  for (const sn of wb.SheetNames) {
    const p = parseSheet(wb, sn);
    const d0 = detectSheet(sn, p.headers, p.totalRows, wb.SheetNames.length);
    if (!d0.category) continue;
    const m0 = buildSuggestedMapping(d0.profile, d0.category, p.headers);
    const d = detectSheet(sn, p.headers, p.allRows.filter((r) => hasIdentity(r, m0)).length, wb.SheetNames.length);
    if (!d.include || !d.category) continue;
    const m = buildSuggestedMapping(d.profile, d.category, p.headers);
    const { rows } = transformRows(d.category, p, m);
    const dateCol = Object.keys(m).find((h) => m[h] === 'perawatan_waktu');
    for (const r of rows) {
      const raw = r.item.koordinat_raw as string | null;
      if (raw == null) continue;
      total++;
      if (typeof r.item.koordinat_lat === 'number') { ok++; continue; }
      const shape = raw.replace(/\d+/g, '9').replace(/\s+/g, ' ');
      const e = shapes.get(shape) ?? { n: 0, ex: [] };
      e.n++; if (e.ex.length < 2) e.ex.push(raw);
      shapes.set(shape, e);
    }
    if (dateCol) for (const raw of p.allRows.map((r) => r[dateCol])) {
      if (raw == null || convertValue('perawatan_waktu', 'date', raw) !== null) continue;
      const k = String(raw).replace(/\d+/g, '9').slice(0, 40);
      dates.set(k, (dates.get(k) ?? 0) + 1);
    }
  }
}
console.log(`coords: ${ok}/${total} ok`);
for (const [s, e] of [...shapes].sort((a, b) => b[1].n - a[1].n).slice(0, 45)) console.log(String(e.n).padStart(7), JSON.stringify(s), '|', e.ex.map((x) => JSON.stringify(x)).join(' '));
console.log('--- dates');
for (const [s, n] of [...dates].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(n).padStart(7), JSON.stringify(s));
