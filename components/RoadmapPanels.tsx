'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarPlus, Check, CheckCircle2, Loader2, Trash2, X } from 'lucide-react';
import { formatPlanDate } from '@/lib/company-pcb-status';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { useReadOnly } from '@/components/useAccess';
import { confirmDialog } from '@/components/Dialog';

type Need = 'uji' | 'penanganan' | 'pengelolaan';
type Category = 'transformator_digunakan' | 'transformator_tidak_digunakan';
type FocusRow = {
  kategori: Category; id: string; nama_merek: string | null; nomor_serial: string | null; tahun_pembuatan: number | null;
  lokasi: string | null; unit: string | null; ppm: number | null; kebutuhan: Need | null;
  rencana_id: string | null; rencana_untuk_alat: boolean | null; rencana_tanggal: string | null; rencana_selesai: string | null;
};
/** What a ticked transformer needs to be planned, and its own plan if it has one. */
type Picked = { kategori: Category; kebutuhan: Need; ownPlan: string | null; done: boolean };

const PAGE = 100;
// What PostgREST returns at most per request.
const BATCH = 1000;
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value: number) => value.toLocaleString('id-ID');
const CATEGORY_LABEL: Record<Category, string> = { transformator_digunakan: 'Digunakan', transformator_tidak_digunakan: 'Tidak digunakan' };
const FILTERS = [
  ['all', 'Semua'], ['uji', 'Belum diuji'], ['penanganan', '≥ 50 ppm'], ['pengelolaan', 'Tidak digunakan'], ['noplan', 'Tanpa rencana'], ['late', 'Lewat tanggal'],
] as const;
type Filter = (typeof FILTERS)[number][0];

const inputClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600';

function planState(row: FocusRow) {
  if (!row.rencana_tanggal) return { label: 'Tanpa rencana', className: 'border-rose-200 bg-rose-50 text-rose-800' };
  // A handling is done by its after-test under 50 ppm (form 2), when the transformer leaves this list; one marked done by hand is not.
  if (row.rencana_selesai && row.kebutuhan === 'penanganan') return { label: 'Ditandai selesai, masih ≥ 50 ppm', className: 'border-amber-200 bg-amber-50 text-amber-900' };
  if (row.rencana_selesai) return { label: `Selesai ${formatPlanDate(row.rencana_selesai)}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (row.rencana_tanggal < today()) return { label: `Lewat: ${formatPlanDate(row.rencana_tanggal)}`, className: 'border-rose-200 bg-rose-50 text-rose-800' };
  return { label: formatPlanDate(row.rencana_tanggal), className: 'border-amber-200 bg-amber-50 text-amber-900' };
}

const needLabel = (row: FocusRow) =>
  row.kebutuhan === 'uji' ? 'Uji PCBs'
    : row.kebutuhan === 'pengelolaan' ? `Pengelolaan${row.ppm !== null ? ` (${row.ppm.toLocaleString('id-ID')} ppm)` : ' (belum diuji)'}`
      : `Retrofilling / penggantian (${row.ppm?.toLocaleString('id-ID')} ppm)`;

/** The transformers of a filter, as the database function gives them. */
function focusQuery(supabase: SupabaseClient, companyId: string, filter: Filter, columns = '*', options?: { count: 'exact'; head: true }) {
  let request = supabase.rpc('company_focus_transformers', { p_company_id: companyId }, options).select(columns).not('kebutuhan', 'is', null);
  if (filter === 'uji' || filter === 'penanganan' || filter === 'pengelolaan') request = request.eq('kebutuhan', filter);
  if (filter === 'noplan') request = request.is('rencana_tanggal', null);
  if (filter === 'late') request = request.lt('rencana_tanggal', today()).is('rencana_selesai', null);
  return request;
}

const pickedOf = (row: FocusRow): Picked => ({ kategori: row.kategori, kebutuhan: row.kebutuhan!, ownPlan: row.rencana_untuk_alat ? row.rencana_id : null, done: Boolean(row.rencana_selesai) });

/**
 * A company's roadmap for its transformers before 1997 (or of unknown year),
 * in one table: tick the ones to plan, give them a date; mark a plan done or
 * remove it on its row or for the ticked ones. A new date replaces the open
 * plan a transformer had. On the Roadmap page and in the company's report.
 */
export default function RoadmapPanels({ supabase, companyId, reloadKey, onChange }: { supabase: SupabaseClient; companyId: string; reloadKey: number; onChange: () => void }) {
  // A pemantau account sees the plans and the transformers, without the means to change them.
  const readOnly = useReadOnly();
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [rows, setRows] = useState<{ key: string; list: FocusRow[]; more: boolean } | null>(null);
  const [counts, setCounts] = useState<{ key: string; values: Partial<Record<Filter, number>> } | null>(null);
  const [picked, setPicked] = useState<Map<string, Picked>>(new Map());
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = `${companyId}|${reloadKey}|${filter}|${limit}`;
  const countKey = `${companyId}|${reloadKey}`;

  useEffect(() => {
    let active = true;
    focusQuery(supabase, companyId, filter).order('kebutuhan', { ascending: false }).order('tahun_pembuatan', { nullsFirst: true }).range(0, limit)
      .then(({ data }) => {
        if (!active) return;
        const list = (data ?? []) as unknown as FocusRow[];
        setRows({ key: requestKey, list: list.slice(0, limit), more: list.length > limit });
      });
    return () => { active = false; };
  }, [supabase, companyId, filter, limit, requestKey]);

  // The number behind each filter.
  useEffect(() => {
    let active = true;
    Promise.all(FILTERS.map(async ([key]) => {
      const { count } = await focusQuery(supabase, companyId, key, 'id', { count: 'exact', head: true });
      return [key, count ?? 0] as const;
    })).then((entries) => { if (active) setCounts({ key: countKey, values: Object.fromEntries(entries) }); });
    return () => { active = false; };
  }, [supabase, companyId, countKey]);

  const list = rows?.key === requestKey ? rows.list : null;
  const count = (key: Filter) => (counts?.key === countKey ? counts.values[key] : undefined);
  const filterTotal = count(filter) ?? 0;
  const allShownPicked = list !== null && list.length > 0 && list.every((row) => picked.has(row.id));

  const toggle = (row: FocusRow) => setPicked((current) => {
    const next = new Map(current);
    if (next.has(row.id)) next.delete(row.id); else next.set(row.id, pickedOf(row));
    return next;
  });
  const toggleShown = () => setPicked(allShownPicked ? new Map() : new Map((list ?? []).map((row) => [row.id, pickedOf(row)])));

  // Every transformer of the filter, beyond the rows loaded.
  const pickAll = async () => {
    setBusy('pick');
    const next = new Map<string, Picked>();
    for (let from = 0; ; from += BATCH) {
      const { data, error: loadError } = await focusQuery(supabase, companyId, filter).range(from, from + BATCH - 1);
      if (loadError) { setBusy(null); return setError(loadError.message); }
      for (const row of (data ?? []) as unknown as FocusRow[]) next.set(row.id, pickedOf(row));
      if (!data || data.length < BATCH) break;
    }
    setPicked(next);
    setBusy(null);
  };

  const run = async (kind: string, work: () => Promise<{ error: { message: string } | null }[]>) => {
    setBusy(kind);
    setError(null);
    const failed = (await work()).find((result) => result.error)?.error;
    setBusy(null);
    if (failed) return setError(failed.message);
    setPicked(new Map());
    setDate('');
    onChange();
  };

  const chosen = [...picked.entries()];
  const withOwnPlan = chosen.filter(([, row]) => row.ownPlan);
  // A test is done by its result in the data, a handling by its after-test under 50 ppm (form 2);
  // only a management (handing a transformer no longer in use over) is marked done by hand.
  const toFinish = withOwnPlan.filter(([, row]) => !row.done && row.kebutuhan === 'pengelolaan');

  // Each ticked transformer gets the date; an open plan it had is replaced, and so is a handling
  // marked done while the transformer is still 50 ppm or more (it would win over the new date).
  const setPlan = () => run('plan', async () => {
    const ids = chosen.map(([id]) => id);
    const results = [];
    for (let at = 0; at < ids.length; at += BATCH) {
      const slice = ids.slice(at, at + BATCH);
      results.push(await supabase.from('equipment_plans').delete().eq('company_id', companyId).in('item_id', slice).is('selesai_at', null));
      results.push(await supabase.from('equipment_plans').delete().eq('company_id', companyId).in('item_id', slice).eq('jenis', 'penanganan'));
    }
    for (let at = 0; at < chosen.length; at += BATCH) {
      results.push(await supabase.from('equipment_plans').insert(chosen.slice(at, at + BATCH).map(([id, row]) => ({ company_id: companyId, kategori: row.kategori, item_id: id, jenis: row.kebutuhan, rencana_tanggal: date }))));
    }
    return results;
  });
  const finishPlans = (planIds: string[]) => run('finish', async () => [await supabase.from('equipment_plans').update({ selesai_at: today() }).in('id', planIds)]);
  const removePlans = async (planIds: string[]) => {
    if (!(await confirmDialog({ title: planIds.length === 1 ? 'Hapus rencana trafo ini?' : `Hapus rencana ${fmt(planIds.length)} trafo?`, message: 'Trafonya kembali tanpa rencana dan status perusahaan bisa menjadi merah sampai diberi tanggal lagi.', tone: 'danger', confirmLabel: 'Hapus rencana' }))) return;
    run('remove', async () => [await supabase.from('equipment_plans').delete().in('id', planIds)]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Trafo yang perlu tindakan</h2>
          <p className="mt-1 text-xs text-slate-500">
            Trafo buatan sebelum {TRAFO_FOCUS_YEAR} atau tanpa tahun: yang masih digunakan dan belum diuji (kapan diuji), yang masih digunakan ≥ 50 ppm (kapan diretrofilling atau diganti), dan yang sudah tidak digunakan (kapan dikelola).
            {!readOnly && ' Centang trafonya, lalu tetapkan tanggal rencana.'}
          </p>
        </div>
        <div role="group" aria-label="Saring" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {FILTERS.map(([key, label]) => {
            const value = count(key);
            const alarming = (key === 'noplan' || key === 'late') && value;
            return (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE); setPicked(new Map()); }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>
                {label}
                {value !== undefined && <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${alarming ? 'bg-rose-100 text-rose-800' : 'bg-slate-200/70 text-slate-600'}`}>{fmt(value)}</span>}
              </button>
            );
          })}
        </div>

        {!readOnly && picked.size > 0 && (
          <div className="space-y-2 rounded-xl bg-emerald-50 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <span className="self-center text-xs font-semibold text-emerald-900">{fmt(picked.size)} trafo dipilih</span>
              <label className="text-xs font-medium text-slate-600">Tanggal rencana<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${inputClass} mt-1 block`} /></label>
              <button type="button" disabled={!date || busy !== null} onClick={setPlan} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">
                {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Tetapkan rencana
              </button>
              <span className="flex-1" />
              {toFinish.length > 0 && (
                <button type="button" disabled={busy !== null} onClick={() => finishPlans(toFinish.map(([, row]) => row.ownPlan!))} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                  <CheckCircle2 className="h-4 w-4" /> Tandai selesai ({fmt(toFinish.length)})
                </button>
              )}
              {withOwnPlan.length > 0 && (
                <button type="button" disabled={busy !== null} onClick={() => removePlans(withOwnPlan.map(([, row]) => row.ownPlan!))} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
                  <Trash2 className="h-4 w-4" /> Hapus rencana ({fmt(withOwnPlan.length)})
                </button>
              )}
            </div>
            {withOwnPlan.length > 0 && <p className="text-[11px] text-slate-500">Tanggal baru menggantikan rencana yang belum selesai pada trafo yang sudah punya rencana.</p>}
          </div>
        )}
        {error && <p className="text-xs font-medium text-rose-700">{error}</p>}
      </div>

      {list === null ? <p className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
        : list.length === 0 ? <p className="p-5 text-sm text-slate-500">{filter === 'all' ? `Tidak ada trafo sebelum ${TRAFO_FOCUS_YEAR} yang perlu tindakan.` : 'Tidak ada trafo pada pilihan ini.'}</p> : (
          <div className="overflow-x-auto">
            {!readOnly && allShownPicked && filterTotal > list.length && picked.size < filterTotal && (
              <p className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-600">
                {fmt(list.length)} trafo yang tampil dipilih.{' '}
                <button type="button" disabled={busy !== null} onClick={pickAll} className="font-semibold text-emerald-700 underline">{busy === 'pick' ? 'Memilih…' : `Pilih semua ${fmt(filterTotal)} trafo pada saringan ini`}</button>
              </p>
            )}
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {!readOnly && <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Pilih semua yang tampil" checked={allShownPicked} onChange={toggleShown} className="accent-emerald-700" /></th>}
                  <th className="px-3 py-2.5">Merek / No. serial</th><th className="px-3 py-2.5">Tahun</th><th className="px-3 py-2.5">Lokasi</th><th className="px-3 py-2.5">Trafo</th><th className="px-3 py-2.5">Perlu</th><th className="px-3 py-2.5">Rencana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((row) => {
                  const state = planState(row);
                  const own = row.rencana_untuk_alat ? row.rencana_id : null;
                  return (
                    <tr key={row.id} className={picked.has(row.id) ? 'bg-emerald-50/50' : ''}>
                      {!readOnly && <td className="px-3 py-2.5"><input type="checkbox" aria-label="Pilih" checked={picked.has(row.id)} onChange={() => toggle(row)} className="accent-emerald-700" /></td>}
                      <td className="px-3 py-2.5 text-slate-800">{row.nama_merek || '–'}<span className="block text-slate-500">{row.nomor_serial || '–'}</span></td>
                      <td className="px-3 py-2.5 tabular-nums">{row.tahun_pembuatan ?? <span className="text-amber-700">tidak ada</span>}</td>
                      <td className="max-w-56 px-3 py-2.5 text-slate-600"><span className="line-clamp-2">{[row.unit, row.lokasi].filter(Boolean).join(' · ') || '–'}</span></td>
                      <td className="px-3 py-2.5 text-slate-600">{CATEGORY_LABEL[row.kategori]}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{needLabel(row)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${state.className}`}>{state.label}</span>
                          {!readOnly && own && !row.rencana_selesai && row.kebutuhan === 'pengelolaan' && (
                            <button type="button" title="Tandai selesai" aria-label="Tandai selesai" disabled={busy !== null} onClick={() => finishPlans([own])} className="rounded-md p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                          )}
                          {!readOnly && own && (
                            <button type="button" title="Hapus rencana" aria-label="Hapus rencana" disabled={busy !== null} onClick={() => removePlans([own])} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><X className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                        {row.rencana_tanggal && !own && <span className="mt-0.5 block text-[10px] text-slate-400">rencana bersama (lama)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows?.more && <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="w-full border-t border-slate-100 py-3 text-xs font-semibold text-emerald-700 hover:bg-slate-50">Muat {PAGE} lagi</button>}
          </div>
        )}
    </div>
  );
}
