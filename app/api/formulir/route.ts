import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { buildCheckReport, insertBatchRows, transformRows } from '@/lib/import-transform';
import { MAX_FORM_ROWS, entryErrors, entryRow, formFields, formSpec, type EntryCheck, type FormEntry } from '@/lib/form-fields';

/**
 * Entries of the reporting form (app/formulir), checked like an Excel sheet
 * by transformRows. With `dryRun` only the findings per entry come back;
 * otherwise the entries are stored as one import batch (profile "formulir"),
 * which then shows in the upload history like any file.
 *
 * Findings that block saving: a field the form requires or cannot read
 * (entryErrors), a warning of the import check (e.g. a coordinate that cannot
 * be read or lies outside Indonesia), and an entry whose brand and serial
 * number the company already reported.
 */

const isCategory = (value: unknown): value is InventoryCategory => INVENTORY_CATEGORIES.some((category) => category.key === value);
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();
const UNKNOWN = /^(tidak diketahui|tdk diketahui|-|n\/a)$/i;

export async function POST(req: NextRequest) {
  try {
    const { companyId, category, entries, dryRun = true } = await req.json() as { companyId: string; category: InventoryCategory; entries: FormEntry[]; dryRun?: boolean };
    if (!companyId || !isCategory(category) || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'Perusahaan, jenis formulir, dan isian wajib diisi.' }, { status: 400 });
    }
    if (entries.length > MAX_FORM_ROWS) return NextResponse.json({ error: `Maksimal ${MAX_FORM_ROWS} isian sekali simpan.` }, { status: 400 });

    const supabase = await createClient();
    const { data: company } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle();
    if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan.' }, { status: 404 });

    // The entries as a sheet whose columns are the field keys themselves.
    const rows = entries.map((entry) => entryRow(category, entry));
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const mappings = Object.fromEntries(headers.map((key) => [key, key]));
    const sheet = { headers, allRows: rows, rowNumbers: rows.map((_, index) => index + 1) };
    const result = transformRows(category, sheet, mappings, {}, { keepIssueRows: true });

    const labels = new Map(formFields(category).map((field) => [field.key, field.label]));
    const checks: EntryCheck[] = entries.map((entry) => ({
      id: entry.id,
      errors: Object.entries(entryErrors(category, entry)).map(([key, message]) => `${labels.get(key)}: ${message}`),
      notes: [],
      duplicate: false,
    }));
    const issues = new Map(result.issues.list().map((issue) => [issue.key, issue]));
    for (const [key, refs] of result.issues.rowsByKey ?? []) {
      const issue = issues.get(key);
      if (!issue || key.startsWith('missing:')) continue;
      for (const { rowNumber } of refs) {
        const check = checks[rowNumber - 1];
        if (key === 'duplicate:file') check.errors.push('Sama dengan isian lain di formulir ini.');
        else (issue.level === 'warning' ? check.errors : check.notes).push(issue.label);
      }
    }
    // Rows transformRows left out entirely (nothing identifying filled in).
    const kept = new Set(result.rows.map((row) => row.rowNumber));
    checks.forEach((check, index) => { if (!kept.has(index + 1) && check.errors.length === 0) check.errors.push('Isian kosong.'); });

    // The same unit twice: same brand and serial number, within the form (its
    // running numbers differ, so transformRows sees two records) or already
    // reported by the company.
    const serialOf = (row: Record<string, unknown>) => (category === 'minyak_dielektrik' || UNKNOWN.test(String(row.nomor_serial ?? '')) ? '' : norm(row.nomor_serial));
    const firstEntry = new Map<string, number>();
    for (const row of result.rows) {
      if (!serialOf(row.item)) continue;
      const unit = `${norm(row.item.nama_merek)}|${serialOf(row.item)}`;
      const first = firstEntry.get(unit);
      if (first === undefined) firstEntry.set(unit, row.rowNumber);
      else checks[row.rowNumber - 1].errors.push(`Merek dan nomor serial sama dengan isian ke-${first}.`);
    }
    const serials = [...new Set(result.rows.filter((row) => serialOf(row.item)).map((row) => String(row.item.nomor_serial).trim()))];
    if (serials.length > 0) {
      const { data: existing, error } = await supabase.from(category).select('nama_merek, nomor_serial').eq('company_id', companyId).in('nomor_serial', serials);
      if (error) throw new Error(`Gagal memeriksa data yang sudah ada: ${error.message}`);
      const known = new Set((existing ?? []).map((row) => `${norm(row.nama_merek)}|${norm(row.nomor_serial)}`));
      for (const row of result.rows) {
        if (serialOf(row.item) && known.has(`${norm(row.item.nama_merek)}|${serialOf(row.item)}`)) {
          const check = checks[row.rowNumber - 1];
          check.duplicate = true;
          check.errors.push('Merek dan nomor serial ini sudah pernah dilaporkan perusahaan.');
        }
      }
    }

    const blocked = checks.filter((check) => check.errors.length > 0).length;
    if (dryRun || blocked > 0) return NextResponse.json({ checks, blocked, saved: false });

    // Running numbers continue after the company's last entry in this category.
    const { data: last } = await supabase.from(category).select('no').eq('company_id', companyId).order('no', { ascending: false }).limit(1).maybeSingle();
    let no = Number(last?.no) || 0;
    for (const row of result.rows) row.item.no = ++no;

    const spec = formSpec(category);
    const stamp = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
    const { data: batch, error: batchError } = await supabase.from('import_batches').insert({
      company_id: companyId,
      jenis_data: category,
      nama_file_asli: `Formulir ${spec.code} ${spec.title} · ${stamp}`,
      status: 'mapped',
      profile: 'formulir',
      headers,
      total_rows: entries.length,
      data_rows: result.rows.length,
    }).select('id, company_id').single();
    if (batchError || !batch) throw new Error(`Gagal membuat catatan unggahan: ${batchError?.message}`);

    const failure = await insertBatchRows(supabase, category, result.rows, batch);
    if (failure) {
      await supabase.from('import_batches').delete().eq('id', batch.id);
      return NextResponse.json({ error: `Gagal menyimpan isian ke-${failure.rowNumber}: ${failure.message}` }, { status: 500 });
    }
    await supabase.from('import_batches').update({ status: 'imported', laporan_pemeriksaan: buildCheckReport(result, result.rows.length, mappings) }).eq('id', batch.id);
    return NextResponse.json({ checks, blocked: 0, saved: true, savedRows: result.rows.length, batchId: batch.id });
  } catch (err) {
    console.error('Form submit error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memproses formulir.' }, { status: 500 });
  }
}
