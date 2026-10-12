'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, FileSignature, Loader2 } from 'lucide-react';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';

export type CompanyStatement = {
  id: string;
  punya_trafo_sebelum_1997: boolean;
  punya_trafo_1997_keatas: boolean;
  jumlah_trafo_1997_keatas: number | null;
  tonase_trafo_1997_keatas_ton: number | null;
  catatan: string | null;
  created_at: string;
};

const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** The company's statement on its transformers; each save adds a new row (company_statements). */
export default function CompanyStatementCard({ supabase, companyId, onSaved }: { supabase: SupabaseClient; companyId: string; onSaved: (statement: CompanyStatement | null) => void }) {
  const [current, setCurrent] = useState<CompanyStatement | null | undefined>(undefined);
  const [owns, setOwns] = useState<boolean | null>(null);
  const [before, setBefore] = useState(false);
  const [after, setAfter] = useState(false);
  const [count, setCount] = useState('');
  const [tonnage, setTonnage] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const fill = (statement: CompanyStatement | null) => {
    setCurrent(statement);
    setOwns(statement ? statement.punya_trafo_sebelum_1997 || statement.punya_trafo_1997_keatas : null);
    setBefore(statement?.punya_trafo_sebelum_1997 ?? false);
    setAfter(statement?.punya_trafo_1997_keatas ?? false);
    setCount(statement?.jumlah_trafo_1997_keatas?.toString() ?? '');
    setTonnage(statement?.tonase_trafo_1997_keatas_ton?.toString() ?? '');
    setNote(statement?.catatan ?? '');
  };

  useEffect(() => {
    // The parent keys this card by company, so it starts empty for each one.
    let active = true;
    supabase.from('company_statements').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        fill((data as CompanyStatement | null) ?? null);
        onSaved((data as CompanyStatement | null) ?? null);
      });
    return () => { active = false; };
  }, [supabase, companyId, onSaved]);

  const save = async () => {
    setError(null);
    if (owns === null) return setError('Pilih salah satu pernyataan.');
    if (owns && !before && !after) return setError(`Centang trafo buatan sebelum ${TRAFO_FOCUS_YEAR}, ${TRAFO_FOCUS_YEAR} ke atas, atau keduanya.`);
    const units = Number(count);
    const tons = Number(tonnage.replace(',', '.'));
    if (owns && after) {
      if (!Number.isInteger(units) || units < 1) return setError(`Isi jumlah trafo buatan ${TRAFO_FOCUS_YEAR} ke atas (bilangan bulat, minimal 1).`);
      if (tonnage.trim() === '' || !Number.isFinite(tons) || tons < 0) return setError(`Isi total tonase trafo buatan ${TRAFO_FOCUS_YEAR} ke atas (ton).`);
    }
    setSaving(true);
    const { data, error: saveError } = await supabase.from('company_statements').insert({
      company_id: companyId,
      punya_trafo_sebelum_1997: owns && before,
      punya_trafo_1997_keatas: owns && after,
      jumlah_trafo_1997_keatas: owns && after ? units : null,
      tonase_trafo_1997_keatas_ton: owns && after ? tons : null,
      catatan: note.trim() || null,
    }).select('*').single();
    setSaving(false);
    if (saveError) return setError(saveError.message);
    fill(data as CompanyStatement);
    onSaved(data as CompanyStatement);
    setSavedAt((data as CompanyStatement).created_at);
  };

  const option = (value: boolean, title: string, detail: string) => (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${owns === value ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name="owns" checked={owns === value} onChange={() => setOwns(value)} className="mt-0.5 accent-emerald-700" />
      <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="text-xs text-slate-500">{detail}</span></span>
    </label>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FileSignature className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">Pernyataan perusahaan</h2>
          <p className="text-xs text-slate-500">
            {current === undefined ? 'Memuat…' : current ? `Pernyataan terakhir: ${fmtDate(current.created_at)}. Ubah lalu simpan bila ada perubahan.` : 'Belum ada pernyataan. Isi dulu sebelum mengisi formulir.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {option(false, 'Tidak memiliki transformator', 'Perusahaan tidak memiliki transformator sama sekali.')}
        {option(true, 'Memiliki transformator', 'Pilih tahun pembuatannya di bawah.')}
      </div>

      {owns && (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={before} onChange={(event) => setBefore(event.target.checked)} className="mt-1 accent-emerald-700" />
            <span><span className="font-semibold">Buatan sebelum {TRAFO_FOCUS_YEAR}</span> (atau tahunnya tidak diketahui). <span className="text-slate-500">Diisi satu per satu di formulir 1.1 / 1.2 di bawah.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={after} onChange={(event) => setAfter(event.target.checked)} className="mt-1 accent-emerald-700" />
            <span><span className="font-semibold">Buatan {TRAFO_FOCUS_YEAR} ke atas.</span> <span className="text-slate-500">Cukup jumlah dan tonasenya.</span></span>
          </label>
          {after && (
            <div className="grid gap-3 pl-6 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Jumlah trafo {TRAFO_FOCUS_YEAR} ke atas
                <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-emerald-600"><input type="number" min={1} step={1} value={count} onChange={(event) => setCount(event.target.value)} className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none" /><span className="pr-3 text-xs text-slate-400">unit</span></div>
              </label>
              <label className="text-xs font-medium text-slate-600">Total tonase
                <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-emerald-600"><input type="number" min={0} step="any" value={tonnage} onChange={(event) => setTonnage(event.target.value)} className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none" /><span className="pr-3 text-xs text-slate-400">ton</span></div>
              </label>
            </div>
          )}
        </div>
      )}

      <label className="mt-3 block text-xs font-medium text-slate-600">Catatan (opsional)
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
      </label>

      {error && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || current === undefined} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan pernyataan
        </button>
        {savedAt && <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Tersimpan</span>}
      </div>
    </section>
  );
}
