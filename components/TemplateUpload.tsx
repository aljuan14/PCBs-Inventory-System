'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import AddDataCard, { ManualChoice, UploadChoice } from '@/components/AddDataCard';
import UploadRules from '@/components/UploadRules';
import { applyToTrafo, recordOf } from '@/components/ReductionFormPanel';
import { checklistRow } from '@/lib/checklists';
import { BALANCE_SECTIONS, STORAGE_SECTIONS, recordFromEntry } from '@/lib/form-fields';
import { TEMPLATE_FILES } from '@/lib/templates';
import { readTemplate, type ParsedTemplate, type TemplateKind } from '@/lib/template-import';
import { checkFileRules, enforceUploadRules, type RuleCheck } from '@/lib/upload-rules';

const fmt = (value: number) => value.toLocaleString('id-ID');
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();
const TABLES: Partial<Record<TemplateKind, { table: string; fields: typeof STORAGE_SECTIONS[number]['fields'] }>> = {
  penyimpanan: { table: 'penyimpanan_logbook', fields: STORAGE_SECTIONS.flatMap((section) => section.fields) },
  pelaporan: { table: 'pelaporan_neraca', fields: BALANCE_SECTIONS.flatMap((section) => section.fields) },
};

/** The card's title and its form choice, by form. */
const CARD: Record<TemplateKind, { title: string; manual: string; hint: string; upload: string }> = {
  pengurangan: { title: 'Tambah log perawatan trafo · formulir 2', manual: 'Isi lewat formulir', hint: 'Pilih trafo, lalu isi perawatannya.', upload: 'Banyak log sekaligus, diperiksa otomatis dulu.' },
  penyimpanan: { title: 'Tambah logbook penyimpanan · formulir 3', manual: 'Isi lewat formulir', hint: 'Satu baris per limbah yang disimpan.', upload: 'Logbook dan ketentuan sekaligus, diperiksa otomatis dulu.' },
  pengolahan: { title: 'Isi ketentuan pengolahan · formulir 4.2', manual: 'Isi daftar ketentuan', hint: 'Jawab Ya atau Tidak di bawah.', upload: 'Jawaban ketentuan dari template, diperiksa otomatis dulu.' },
  pelaporan: { title: 'Tambah neraca pelaporan · formulir 5', manual: 'Isi lewat formulir', hint: 'Satu baris per jenis limbah.', upload: 'Banyak baris sekaligus, diperiksa otomatis dulu.' },
};

type Ready = { fileName: string; rules: RuleCheck[]; parsed: ParsedTemplate; trafoIds: Map<number, string> };

/**
 * Upload of a filled-in official template (forms 2, 3, 4.2, 5): read in the
 * browser, checked like the web form, shown, then stored as if typed in.
 * With `onManual` it is the form's "add data" card, beside filling the form.
 */
export default function TemplateUpload({ supabase, companyId, kind, onImported, onManual }: { supabase: SupabaseClient; companyId: string; kind: TemplateKind; onImported: () => void; /** Opens the form (or brings the checklist into view). */ onManual?: () => void }) {
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [updateTrafo, setUpdateTrafo] = useState(true);

  const choose = async (file: File) => {
    setBusy('read');
    setError(null);
    setDone(null);
    setReady(null);
    try {
      const rules = await checkFileRules(file);
      if (enforceUploadRules() && rules.some((rule) => !rule.ok)) throw new Error('Berkas tidak memenuhi aturan unggah.');
      const XLSX = await import('xlsx');
      const read = XLSX.read ?? (XLSX as unknown as { default: typeof XLSX }).default.read;
      const parsed = await readTemplate(read(await file.arrayBuffer(), { type: 'array', cellDates: false }), kind);
      if (typeof parsed === 'string') throw new Error(parsed);
      // Form 2: each log to its transformer of form 1.1, by brand and serial number.
      const trafoIds = new Map<number, string>();
      if (kind === 'pengurangan' && parsed.rows.length) {
        const serials = [...new Set(parsed.rows.map((row) => row.entry.values.nomor_serial).filter(Boolean))];
        const { data } = await supabase.from('transformator_digunakan').select('id, nama_merek, nomor_serial').eq('company_id', companyId).in('nomor_serial', serials);
        for (const row of parsed.rows) {
          const match = (data ?? []).find((trafo) => norm(trafo.nomor_serial) === norm(row.entry.values.nomor_serial) && norm(trafo.nama_merek) === norm(row.entry.values.nama_merek));
          if (match) trafoIds.set(row.row, match.id as string);
        }
      }
      setReady({ fileName: file.name, rules, parsed, trafoIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!ready) return;
    setBusy('save');
    setError(null);
    const { parsed, trafoIds } = ready;
    const parts: string[] = [];
    try {
      if (kind === 'pengurangan') {
        let updated = 0;
        for (const row of parsed.rows) {
          const record = recordOf(row.entry, companyId, trafoIds.get(row.row) ?? null);
          const { error: insertError } = await supabase.from('pengurangan_pcbs').insert(record);
          if (insertError) throw new Error(`Baris ${row.row}: ${insertError.message}`);
          const trafoId = trafoIds.get(row.row);
          if (trafoId && updateTrafo && !(await applyToTrafo(supabase, trafoId, record)).error) updated++;
        }
        parts.push(`${fmt(parsed.rows.length)} log perawatan tersimpan${updated ? `, ${fmt(updated)} data trafo diperbarui` : ''}`);
      } else if (TABLES[kind] && parsed.rows.length) {
        const { table, fields } = TABLES[kind]!;
        const { error: insertError } = await supabase.from(table).insert(parsed.rows.map((row) => recordFromEntry(fields, row.entry, companyId)));
        if (insertError) throw new Error(insertError.message);
        parts.push(`${fmt(parsed.rows.length)} baris ${kind === 'penyimpanan' ? 'logbook' : 'neraca'} tersimpan`);
      }
      if (parsed.checklist) {
        const { error: checklistError } = await supabase.from('ketentuan_teknis').insert(checklistRow(companyId, parsed.checklist.key, parsed.checklist.answers, parsed.checklist.permit));
        if (checklistError) throw new Error(checklistError.message);
        parts.push(`jawaban ${parsed.checklist.answers.length} ketentuan tersimpan`);
      }
      setDone(`${parts.join('; ')}.`);
      setReady(null);
      onImported();
    } catch (err) {
      setError(`Gagal menyimpan: ${err instanceof Error ? err.message : String(err)}${parts.length ? ` (sudah tersimpan: ${parts.join('; ')})` : ''}`);
    } finally {
      setBusy(null);
    }
  };

  const card = CARD[kind];
  const broken = ready ? ready.parsed.rows.filter((row) => row.errors.length) : [];
  const checklistProblems = ready?.parsed.checklist?.problems ?? [];
  const nothing = ready !== null && ready.parsed.rows.length === 0 && !ready.parsed.checklist;
  const canSave = ready !== null && broken.length === 0 && checklistProblems.length === 0 && !nothing;

  return (
    <AddDataCard
      title={onManual ? card.title : undefined}
      manual={onManual && <ManualChoice label={card.manual} hint={card.hint} onClick={onManual} />}
      upload={<UploadChoice hint={card.upload} accept=".xlsx" busy={busy !== null} template={TEMPLATE_FILES.find((item) => item.form === kind)?.file} onFile={choose} />}>
      {error && <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
      {done && <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {done}</p>}

      {ready && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">{ready.fileName}</p>
            <button type="button" onClick={() => setReady(null)} aria-label="Batal" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          {ready.rules.some((rule) => !rule.ok) && <UploadRules title="Aturan unggah perusahaan" checks={ready.rules} enforced={enforceUploadRules()} />}

          <ul className="space-y-1 text-xs text-slate-700">
            {kind !== 'pengolahan' && <li>• {fmt(ready.parsed.rows.length)} baris terbaca{broken.length ? <>, <span className="font-semibold text-rose-700">{fmt(broken.length)} perlu diperbaiki</span></> : ''}.</li>}
            {kind === 'pengurangan' && ready.parsed.rows.length > 0 && <li>• {fmt(ready.trafoIds.size)} cocok dengan trafo di data 1.1 (merek + nomor serial); sisanya disimpan sebagai trafo belum terdaftar.</li>}
            {ready.parsed.skipped.map((note) => <li key={note} className="text-slate-500">• {note}</li>)}
            {ready.parsed.checklist && (
              <li>• Ketentuan teknis: {fmt(ready.parsed.checklist.answers.filter((answer) => answer.jawaban === 'ya').length)} Ya, {fmt(ready.parsed.checklist.answers.filter((answer) => answer.jawaban === 'tidak').length)} Tidak
                {ready.parsed.checklist.rate !== null && ` (penaatan ${Math.round(ready.parsed.checklist.rate * 100)}%)`}
                {ready.parsed.checklist.permit?.izin_nomor && `; izin TPS ${ready.parsed.checklist.permit.izin_nomor}`}.
              </li>
            )}
            {nothing && <li className="font-semibold text-amber-800">• Tidak ada data yang terisi di template ini.</li>}
          </ul>

          {(broken.length > 0 || checklistProblems.length > 0) && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900">
              {broken.slice(0, 30).map((row) => <p key={row.row}><span className="font-semibold">Baris {row.row}:</span> {row.errors.join('; ')}</p>)}
              {broken.length > 30 && <p>… dan {fmt(broken.length - 30)} baris lain.</p>}
              {checklistProblems.map((problem) => <p key={problem}><span className="font-semibold">Ketentuan:</span> {problem}</p>)}
              <p className="mt-2 text-rose-800">Perbaiki di Excel, lalu unggah lagi.</p>
            </div>
          )}

          {kind === 'pengurangan' && ready.trafoIds.size > 0 && (
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={updateTrafo} onChange={(event) => setUpdateTrafo(event.target.checked)} className="mt-0.5 accent-emerald-700" />
              Perbarui data trafo yang cocok dengan perawatan dan hasil uji setelah perawatan, sehingga status PCBs ikut berubah.
            </label>
          )}

          <button type="button" disabled={!canSave || busy !== null} onClick={save} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan isi template
          </button>
        </div>
      )}
    </AddDataCard>
  );
}
