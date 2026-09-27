import fs from 'fs';
import { parseSheet, readWorkbook } from '@/lib/excel';
import { buildSuggestedMapping, detectSheet } from '@/lib/import-profiles';
const [file, sheetName] = process.argv.slice(2);
const wb = readWorkbook(fs.readFileSync(file));
const p = parseSheet(wb, sheetName);
const d = detectSheet(sheetName, p.headers, p.totalRows, wb.SheetNames.length);
const m = buildSuggestedMapping(d.profile, d.category!, p.headers);
for (const h of p.headers) console.log(JSON.stringify(h), '=>', m[h], '|', JSON.stringify(p.allRows.slice(0,3).map(r=>r[h])));
