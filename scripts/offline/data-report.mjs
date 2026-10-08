/**
 * README.md and CHANGELOG.md of the data repo, written by data:push: which
 * companies the data holds, newest import first, and what changed since the
 * previous push. The per-company counts are kept in data/summary.json so the
 * next push can tell what changed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DATA_REPO_DIR, query } from './lib.mjs';

const SUMMARY_FILE = path.join(DATA_DIR, 'summary.json');

const CATEGORY_COLUMNS = [
  ['transformator_digunakan', 'Trafo dig.', 'Trafo digunakan'],
  ['transformator_tidak_digunakan', 'Trafo tdk', 'Trafo tidak digunakan'],
  ['kapasitor', 'Kapasitor', 'Kapasitor'],
  ['minyak_dielektrik', 'Minyak', 'Minyak dielektrik'],
];

const fmt = (value) => (value ? Number(value).toLocaleString('id-ID') : '–');
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const cell = (text) => String(text).replaceAll('|', '\\|');

/** One entry per company, newest import first; companies without imports last. */
export async function companySummary() {
  const sums = CATEGORY_COLUMNS.map(([key]) => `'${key}', coalesce(sum(total) filter (where category = '${key}'), 0)`).join(', ');
  const rows = await query(`
    with parts as (
      select company_id, jsonb_build_object(${sums}) as by_category, coalesce(sum(total), 0) as total
      from public.inventory_stats_parts where company_id is not null group by company_id
    ), batches as (
      select company_id, count(*) as files, max(uploaded_at) as last_import
      from public.import_batches where status = 'imported' group by company_id
    ), sends as (
      select company_id, max(sent_at) as last_sent from public.company_feedback_log group by company_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.nama_perusahaan, 'byCategory', coalesce(p.by_category, '{}'::jsonb), 'total', coalesce(p.total, 0),
      'files', coalesce(b.files, 0), 'lastImport', b.last_import, 'lastSent', s.last_sent
    ) order by b.last_import desc nulls last, c.nama_perusahaan), '[]'::jsonb)::text
    from public.companies c
    left join parts p on p.company_id = c.id
    left join batches b on b.company_id = c.id
    left join sends s on s.company_id = c.id`);
  return JSON.parse(rows.map((row) => row.join('\t')).join('\n'));
}

/** Same rules as lib/company-status.ts. */
function sendStatus(company) {
  if (!company.total) return 'Kosong';
  if (!company.lastSent) return 'Belum dikirim';
  return company.lastImport && new Date(company.lastImport) > new Date(company.lastSent) ? 'Ada data baru' : 'Sudah dikirim';
}

export function readPreviousSummary() {
  try {
    return JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** Kept with the data so the next push can compare. No timestamps of its own, so unchanged data stays unchanged. */
export function writeSummary(companies) {
  const slim = companies.map(({ id, name, total }) => ({ id, name, total: Number(total) }));
  fs.writeFileSync(SUMMARY_FILE, `${JSON.stringify(slim, null, 1)}\n`);
}

/** Companies added, changed, emptied or removed since the previous push. */
export function diffSummary(previous, companies) {
  if (!previous) return null;
  const before = new Map(previous.map((company) => [company.id, company]));
  const now = new Map(companies.map((company) => [company.id, company]));
  const added = [];
  const changed = [];
  const removed = [];
  for (const company of companies) {
    const total = Number(company.total);
    const old = before.get(company.id);
    if (!old || (!old.total && total)) { if (total) added.push({ name: company.name, total, files: company.files }); }
    else if (old.total !== total) changed.push({ name: company.name, from: old.total, to: total });
  }
  for (const old of previous) if (!now.has(old.id) && old.total) removed.push({ name: old.name, total: old.total });
  return { added, changed, removed };
}

function changeLines(diff) {
  if (!diff) return ['- Ringkasan pertama dibuat (belum ada pembanding).'];
  const lines = [
    ...diff.added.map((c) => `- **+** ${cell(c.name)}: ${fmt(c.total)} baris baru (${fmt(c.files)} berkas)`),
    ...diff.changed.map((c) => `- **~** ${cell(c.name)}: ${fmt(c.from)} → ${fmt(c.to)} baris`),
    ...diff.removed.map((c) => `- **−** ${cell(c.name)}: dihapus (sebelumnya ${fmt(c.total)} baris)`),
  ];
  return lines.length ? lines : ['- Tidak ada perubahan jumlah baris per perusahaan (perubahan isi data atau riwayat pengiriman pesan).'];
}

/** Short commit message, e.g. "data: +2 perusahaan (PT A, PT B), 1 berubah". */
export function commitMessage(diff) {
  if (!diff) return 'data: ringkasan pertama';
  const names = (list) => list.slice(0, 3).map((c) => c.name).join(', ') + (list.length > 3 ? `, +${list.length - 3} lainnya` : '');
  const parts = [];
  if (diff.added.length) parts.push(`+${diff.added.length} perusahaan (${names(diff.added)})`);
  if (diff.changed.length) parts.push(`${diff.changed.length} berubah`);
  if (diff.removed.length) parts.push(`${diff.removed.length} dihapus (${names(diff.removed)})`);
  return `data: ${parts.length ? parts.join(', ') : 'perubahan isi data'}`;
}

export function writeReadme(companies, diff, when) {
  const withData = companies.filter((company) => Number(company.total) > 0);
  const total = withData.reduce((sum, company) => sum + Number(company.total), 0);
  const categoryTotals = CATEGORY_COLUMNS.map(([key, , label]) => `${label} ${fmt(withData.reduce((sum, company) => sum + Number(company.byCategory[key] ?? 0), 0))}`);
  const lines = [
    '# Data Inventarisasi PCBs',
    '',
    '> Berkas ini ditulis otomatis oleh `npm run data:push` di repo aplikasi. Jangan diedit manual.',
    '',
    `Terakhir diperbarui: **${when}** · **${fmt(withData.length)} perusahaan** berisi data · **${fmt(total)} baris**`,
    '',
    '## Perubahan terakhir',
    '',
    ...changeLines(diff),
    '',
    'Riwayat lengkap: [CHANGELOG.md](CHANGELOG.md).',
    '',
    '## Ringkasan per kategori',
    '',
    categoryTotals.join(' · '),
    '',
    '## Daftar perusahaan',
    '',
    'Diurutkan dari impor terbaru.',
    '',
    `| Perusahaan | ${CATEGORY_COLUMNS.map(([, short]) => short).join(' | ')} | Berkas | Impor terakhir | Status pesan |`,
    `|---|${CATEGORY_COLUMNS.map(() => '---:').join('|')}|---:|---|---|`,
    ...companies.map((company) => `| ${cell(company.name)} | ${CATEGORY_COLUMNS.map(([key]) => fmt(company.byCategory[key])).join(' | ')} | ${fmt(company.files)} | ${fmtDate(company.lastImport)} | ${sendStatus(company)} |`),
    '',
  ];
  fs.writeFileSync(path.join(DATA_REPO_DIR, 'README.md'), lines.join('\n'));
}

/** Adds this push at the top of CHANGELOG.md; earlier entries are kept. */
export function prependChangelog(diff, when) {
  const file = path.join(DATA_REPO_DIR, 'CHANGELOG.md');
  const header = '# Riwayat perubahan data\n\nDitulis otomatis oleh `npm run data:push`, terbaru di atas.\n';
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(header, '').trimStart() : '';
  const entry = [`## ${when}`, '', ...changeLines(diff), ''].join('\n');
  fs.writeFileSync(file, `${header}\n${entry}\n${previous}`.trimEnd() + '\n');
}
