'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { CHECKLISTS, checklistRow, complianceRate, type ChecklistAnswer, type ChecklistKey } from '@/lib/checklists';

type Saved = { jawaban: ChecklistAnswer[]; izin_status: string | null; izin_nomor: string | null; izin_masa_berlaku: string | null; created_at: string };

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-emerald-600';
const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * A yes / no checklist of the templates (lib/checklists.ts), filled in from
 * the company's last answers; each save keeps the earlier ones as history.
 * Form 3 also asks for the storage permit.
 */
export default function ChecklistPanel({ supabase, companyId, checklist, refreshKey = 0, onSaved }: { supabase: SupabaseClient; companyId: string; checklist: ChecklistKey; refreshKey?: number; onSaved?: () => void }) {
  const spec = CHECKLISTS[checklist];
  const [answers, setAnswers] = useState<ChecklistAnswer[]>(() => spec.questions.map(() => ({ jawaban: null })));
  const [permit, setPermit] = useState({ izin_status: '', izin_nomor: '', izin_masa_berlaku: '' });
  const [lastSaved, setLastSaved] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.from('ketentuan_teknis').select('jawaban, izin_status, izin_nomor, izin_masa_berlaku, created_at').eq('company_id', companyId).eq('checklist', checklist)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const saved = data as Saved | null;
        if (saved) {
          setAnswers(spec.questions.map((_, index) => saved.jawaban[index] ?? { jawaban: null }));
          setPermit({ izin_status: saved.izin_status ?? '', izin_nomor: saved.izin_nomor ?? '', izin_masa_berlaku: saved.izin_masa_berlaku ?? '' });
        }
        setLastSaved(saved?.created_at ?? null);
      });
    return () => { active = false; };
  }, [supabase, companyId, checklist, spec, refreshKey]);

  const set = (index: number, changes: Partial<ChecklistAnswer>) => {
    setJustSaved(false);
    setAnswers((current) => current.map((answer, at) => (at === index ? { ...answer, ...changes } : answer)));
  };
  const changePermit = (changes: Partial<typeof permit>) => {
    setJustSaved(false);
    setPermit({ ...permit, ...changes });
  };
  const answered = answers.filter((answer) => answer.jawaban).length;
  const rate = complianceRate(answers);

  const save = async () => {
    if (answered < answers.length) return setError(`Masih ada ${answers.length - answered} ketentuan yang belum dijawab Ya atau Tidak.`);
    setSaving(true);
    setError(null);
    const { data, error: saveError } = await supabase.from('ketentuan_teknis').insert(checklistRow(companyId, checklist, answers,
      { izin_status: permit.izin_status.trim() || null, izin_nomor: permit.izin_nomor.trim() || null, izin_masa_berlaku: permit.izin_masa_berlaku || null })).select('created_at').single();
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setLastSaved((data as { created_at: string }).created_at);
    setJustSaved(true);
    onSaved?.();
  };

  return (
    <div id="ketentuan-teknis" className="scroll-mt-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{spec.title}</h3>
        <p className="text-xs text-slate-500">{spec.note}</p>
        <p className="mt-1 text-xs text-slate-500">{lastSaved === undefined ? 'Memuat…' : lastSaved ? `Terakhir disimpan ${fmtDate(lastSaved)}.` : 'Belum pernah diisi.'}</p>
      </div>

      {spec.permit && (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">Status perizinan
            <select value={permit.izin_status} onChange={(event) => changePermit({ izin_status: event.target.value })} className={`${inputClass} mt-1`}>
              <option value="">Pilih…</option>
              <option>Izin TPS Limbah B3</option>
              <option>Rincian Teknis Penyimpanan Limbah B3 (Perizinan Lingkungan)</option>
              <option>Belum memiliki izin</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Nomor SK / surat
            <input value={permit.izin_nomor} onChange={(event) => changePermit({ izin_nomor: event.target.value })} placeholder="mis. 503/0009/PB/DPMPTSP/2019" className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600">Masa berlaku
            <input type="date" value={permit.izin_masa_berlaku} onChange={(event) => changePermit({ izin_masa_berlaku: event.target.value })} className={`${inputClass} mt-1`} />
          </label>
        </div>
      )}

      <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {spec.questions.map((question, index) => {
          const answer = answers[index];
          return (
            <li key={question} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]">
              <p className="text-xs text-slate-800"><span className="mr-1.5 font-semibold tabular-nums text-slate-400">{index + 1}.</span>{question}</p>
              <div role="radiogroup" aria-label={`Jawaban ketentuan ${index + 1}`} className="flex gap-1 self-start rounded-lg bg-slate-100 p-0.5">
                {(['ya', 'tidak'] as const).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={answer.jawaban === value} onClick={() => set(index, { jawaban: value })}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${answer.jawaban === value ? (value === 'ya' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'text-slate-600 hover:text-slate-900'}`}>
                    {value === 'ya' ? 'Ya' : 'Tidak'}
                  </button>
                ))}
              </div>
              {answer.jawaban && (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
                  <input value={answer.nomor_surat ?? ''} onChange={(event) => set(index, { nomor_surat: event.target.value })} placeholder="No. SK / surat (bila ada)" className={inputClass} />
                  <input value={answer.keterangan ?? ''} onChange={(event) => set(index, { keterangan: event.target.value })} placeholder="Keterangan" className={inputClass} />
                  <input value={answer.bukti_dukung ?? ''} onChange={(event) => set(index, { bukti_dukung: event.target.value })} placeholder="Tautan bukti dukung (Google Drive)" className={inputClass} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs text-slate-600">
          Terjawab {answered}/{answers.length}
          {rate !== null && <> · Persentase penaatan <span className={`font-semibold ${rate === 1 ? 'text-emerald-700' : 'text-amber-800'}`}>{Math.round(rate * 100)}%</span></>}
        </span>
        <button type="button" onClick={save} disabled={saving || lastSaved === undefined} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan jawaban
        </button>
      </div>
      {error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{error}</p>}
      {justSaved && !error && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900"><CheckCircle2 className="h-4 w-4 shrink-0" /> Jawaban tersimpan.</p>}
    </div>
  );
}
