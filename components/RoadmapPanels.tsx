'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarPlus, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { formatPlanDate } from '@/lib/company-pcb-status';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';

type Need = 'uji' | 'penanganan';
type Category = 'transformator_digunakan' | 'transformator_tidak_digunakan';
type FocusRow = {
  kategori: Category; id: string; nama_merek: string | null; nomor_serial: string | null; tahun_pembuatan: number | null;
  lokasi: string | null; unit: string | null; ppm: number | null; kebutuhan: Need | null;
  rencana_id: string | null; rencana_untuk_alat: boolean | null; rencana_tanggal: string | null; rencana_selesai: string | null;
};
type Plan = { id: string; kategori: Category | null; item_id: string | null; jenis: Need; rencana_tanggal: string; selesai_at: string | null; catatan: string | null; created_at: string };

const PAGE = 100;
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value: number) => value.toLocaleString('id-ID');
const NEEDS: Record<Need, string> = { uji: 'Uji PCBs', penanganan: 'Penanganan > 50 ppm' };
const CATEGORY_LABEL: Record<Category, string> = { transformator_digunakan: 'Digunakan', transformator_tidak_digunakan: 'Tidak digunakan' };
const FILTERS = [
  ['all', 'Semua yang perlu tindakan'], ['uji', 'Belum diuji'], ['penanganan', '> 50 ppm'], ['noplan', 'Tanpa rencana'], ['late', 'Lewat tanggal'],
] as const;
type Filter = (typeof FILTERS)[number][0];

const inputClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600';

function planState(plan: { rencana_tanggal: string | null; rencana_selesai?: string | null; selesai_at?: string | null }) {
  const done = plan.rencana_selesai ?? plan.selesai_at;
  if (!plan.rencana_tanggal) return { label: 'Tanpa rencana', className: 'border-rose-200 bg-rose-50 text-rose-800' };
  if (done) return { label: `Selesai ${formatPlanDate(done)}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (plan.rencana_tanggal < today()) return { label: `Lewat: ${formatPlanDate(plan.rencana_tanggal)}`, className: 'border-rose-200 bg-rose-50 text-rose-800' };
  return { label: formatPlanDate(plan.rencana_tanggal), className: 'border-amber-200 bg-amber-50 text-amber-900' };
}

/** A plan for every transformer of the company still needing it. */
function CompanyPlanForm({ supabase, companyId, onSaved }: { supabase: SupabaseClient; companyId: string; onSaved: () => void }) {
  const [jenis, setJenis] = useState<Need>('uji');
  const [kategori, setKategori] = useState<Category | ''>('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!date) return setError('Isi tanggal rencana.');
    setBusy(true);
    setError(null);
    const { error: saveError } = await supabase.from('equipment_plans').insert({ company_id: companyId, jenis, kategori: kategori || null, rencana_tanggal: date, catatan: note.trim() || null });
    setBusy(false);
    if (saveError) return setError(saveError.message);
    setDate('');
    setNote('');
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Rencana untuk semua trafo</h2>
      <p className="mt-1 text-xs text-slate-500">Satu tanggal target untuk semua trafo sebelum {TRAFO_FOCUS_YEAR} yang masih membutuhkannya, misalnya &quot;semua yang belum diuji, selesai diuji Juni 2027&quot;. Rencana per trafo (di daftar bawah) didahulukan.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">Rencana
          <select value={jenis} onChange={(event) => setJenis(event.target.value as Need)} className={`${inputClass} mt-1 w-full`}>
            <option value="uji">Uji PCBs (yang belum diuji)</option>
            <option value="penanganan">Penanganan (yang &gt; 50 ppm)</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Trafo
          <select value={kategori} onChange={(event) => setKategori(event.target.value as Category | '')} className={`${inputClass} mt-1 w-full`}>
            <option value="">Semua</option>
            <option value="transformator_digunakan">Masih digunakan</option>
            <option value="transformator_tidak_digunakan">Tidak digunakan</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Tanggal target
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="text-xs font-medium text-slate-600">Catatan
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="mis. lab yang ditunjuk" className={`${inputClass} mt-1 w-full`} />
        </label>
      </div>
      {error && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Simpan rencana
      </button>
    </div>
  );
}

/** Plans made, the ones for single transformers grouped by when they were made. */
function PlanList({ supabase, companyId, reloadKey, onChange }: { supabase: SupabaseClient; companyId: string; reloadKey: number; onChange: () => void }) {
  const [plans, setPlans] = useState<{ key: string; rows: Plan[] } | null>(null);
  const requestKey = `${companyId}|${reloadKey}`;
  useEffect(() => {
    let active = true;
    supabase.from('equipment_plans').select('id, kategori, item_id, jenis, rencana_tanggal, selesai_at, catatan, created_at').eq('company_id', companyId).order('rencana_tanggal')
      .then(({ data }) => { if (active) setPlans({ key: requestKey, rows: (data ?? []) as Plan[] }); });
    return () => { active = false; };
  }, [supabase, companyId, requestKey]);

  const groups = useMemo(() => {
    const map = new Map<string, Plan[]>();
    for (const plan of plans?.rows ?? []) {
      const key = plan.item_id ? `item|${plan.jenis}|${plan.rencana_tanggal}|${plan.created_at}|${plan.selesai_at ?? ''}` : plan.id;
      map.set(key, [...(map.get(key) ?? []), plan]);
    }
    return [...map.values()];
  }, [plans]);

  const remove = async (group: Plan[]) => {
    if (!window.confirm('Hapus rencana ini?')) return;
    await supabase.from('equipment_plans').delete().in('id', group.map((plan) => plan.id));
    onChange();
  };
  const finish = async (group: Plan[]) => {
    await supabase.from('equipment_plans').update({ selesai_at: today() }).in('id', group.map((plan) => plan.id));
    onChange();
  };

  if (!plans || plans.key !== requestKey) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold">Rencana tersimpan ({fmt(groups.length)})</div>
      {groups.length === 0 ? <p className="p-5 text-sm text-slate-500">Belum ada rencana.</p> : groups.map((group) => {
        const plan = group[0];
        const state = planState(plan);
        const scope = plan.item_id ? `${fmt(group.length)} trafo dipilih` : `Semua trafo${plan.kategori ? ` ${CATEGORY_LABEL[plan.kategori].toLowerCase()}` : ''} yang membutuhkannya`;
        return (
          <div key={plan.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{NEEDS[plan.jenis]} · {scope}</div>
              {plan.catatan && <div className="text-xs text-slate-500">{plan.catatan}</div>}
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${state.className}`}>{state.label}</span>
            {/* A test is done by its result in the data; a handling is marked by hand. */}
            {plan.jenis === 'penanganan' && !plan.selesai_at && <button type="button" onClick={() => finish(group)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CheckCircle2 className="h-3.5 w-3.5" /> Tandai selesai</button>}
            <button type="button" onClick={() => remove(group)} aria-label="Hapus rencana" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
    </div>
  );
}

/** Focus transformers needing a test or handling, with a plan set for the ones ticked. */
function FocusList({ supabase, companyId, reloadKey, onChange }: { supabase: SupabaseClient; companyId: string; reloadKey: number; onChange: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [rows, setRows] = useState<{ key: string; list: FocusRow[]; more: boolean } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const requestKey = `${companyId}|${reloadKey}|${filter}|${limit}`;

  useEffect(() => {
    let active = true;
    let request = supabase.rpc('company_focus_transformers', { p_company_id: companyId }).not('kebutuhan', 'is', null);
    if (filter === 'uji' || filter === 'penanganan') request = request.eq('kebutuhan', filter);
    if (filter === 'noplan') request = request.is('rencana_tanggal', null);
    if (filter === 'late') request = request.lt('rencana_tanggal', today()).is('rencana_selesai', null);
    request.order('kebutuhan', { ascending: false }).order('tahun_pembuatan', { nullsFirst: true }).range(0, limit)
      .then(({ data }) => {
        if (!active) return;
        const list = (data ?? []) as FocusRow[];
        setRows({ key: requestKey, list: list.slice(0, limit), more: list.length > limit });
      });
    return () => { active = false; };
  }, [supabase, companyId, filter, limit, requestKey]);

  const list = rows?.key === requestKey ? rows.list : null;
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allPicked = list !== null && list.length > 0 && list.every((row) => picked.has(row.id));

  const plan = async () => {
    if (!date || !list) return;
    setBusy(true);
    const chosen = list.filter((row) => picked.has(row.id) && row.kebutuhan);
    const { error } = await supabase.from('equipment_plans').insert(chosen.map((row) => ({ company_id: companyId, kategori: row.kategori, item_id: row.id, jenis: row.kebutuhan, rencana_tanggal: date, catatan: note.trim() || null })));
    setBusy(false);
    if (error) return window.alert(`Gagal menyimpan rencana: ${error.message}`);
    setPicked(new Set());
    setDate('');
    setNote('');
    onChange();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-slate-200 px-5 py-4">
        <div className="text-sm font-semibold">Trafo yang perlu tindakan</div>
        <div role="group" aria-label="Saring" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE); setPicked(new Set()); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
          ))}
        </div>
        {picked.size > 0 && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-emerald-50 p-3">
            <span className="text-xs font-semibold text-emerald-900">{fmt(picked.size)} trafo dipilih</span>
            <label className="text-xs font-medium text-slate-600">Tanggal rencana<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${inputClass} mt-1 block`} /></label>
            <label className="min-w-48 flex-1 text-xs font-medium text-slate-600">Catatan<input value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} mt-1 block w-full`} /></label>
            <button type="button" disabled={!date || busy} onClick={plan} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Tetapkan rencana</button>
          </div>
        )}
      </div>
      {list === null ? <p className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
        : list.length === 0 ? <p className="p-5 text-sm text-slate-500">Tidak ada trafo pada pilihan ini.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Pilih semua" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((row) => row.id)))} className="accent-emerald-700" /></th>
                  <th className="px-3 py-2.5">Merek / No. serial</th><th className="px-3 py-2.5">Tahun</th><th className="px-3 py-2.5">Lokasi</th><th className="px-3 py-2.5">Trafo</th><th className="px-3 py-2.5">Perlu</th><th className="px-3 py-2.5">Rencana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((row) => {
                  const state = planState(row);
                  return (
                    <tr key={row.id} className={picked.has(row.id) ? 'bg-emerald-50/50' : ''}>
                      <td className="px-3 py-2.5"><input type="checkbox" aria-label="Pilih" checked={picked.has(row.id)} onChange={() => toggle(row.id)} className="accent-emerald-700" /></td>
                      <td className="px-3 py-2.5 text-slate-800">{row.nama_merek || '–'}<span className="block text-slate-500">{row.nomor_serial || '–'}</span></td>
                      <td className="px-3 py-2.5 tabular-nums">{row.tahun_pembuatan ?? <span className="text-amber-700">tidak ada</span>}</td>
                      <td className="max-w-56 px-3 py-2.5 text-slate-600"><span className="line-clamp-2">{[row.unit, row.lokasi].filter(Boolean).join(' · ') || '–'}</span></td>
                      <td className="px-3 py-2.5 text-slate-600">{CATEGORY_LABEL[row.kategori]}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{row.kebutuhan === 'uji' ? 'Uji' : `Penanganan (${row.ppm?.toLocaleString('id-ID')} ppm)`}</td>
                      <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${state.className}`}>{state.label}</span>{row.rencana_tanggal && !row.rencana_untuk_alat && <span className="mt-0.5 block text-[10px] text-slate-400">rencana semua trafo</span>}</td>
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

/**
 * A company's roadmap: a plan for all its transformers still needing a test
 * or handling, the plans made, and the transformers to tick for a plan of
 * their own. On the Roadmap page and in the company's report.
 */
export default function RoadmapPanels({ supabase, companyId, reloadKey, onChange }: { supabase: SupabaseClient; companyId: string; reloadKey: number; onChange: () => void }) {
  return (
    <div className="space-y-6">
      <CompanyPlanForm key={`plan-${companyId}`} supabase={supabase} companyId={companyId} onSaved={onChange} />
      <PlanList supabase={supabase} companyId={companyId} reloadKey={reloadKey} onChange={onChange} />
      <FocusList key={`focus-${companyId}`} supabase={supabase} companyId={companyId} reloadKey={reloadKey} onChange={onChange} />
    </div>
  );
}
