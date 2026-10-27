'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarPlus, CheckCircle2, ListChecks, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { formatPlanDate, formatPlanMonth, monthEnd } from '@/lib/company-pcb-status';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { useReadOnly } from '@/components/useAccess';
import { confirmDialog } from '@/components/Dialog';

type Need = 'uji' | 'penanganan' | 'pengelolaan';
type Category = 'transformator_digunakan' | 'transformator_tidak_digunakan';
type FocusRow = {
  kategori: Category; id: string; nama_merek: string | null; nomor_serial: string | null; tahun_pembuatan: number | null;
  lokasi: string | null; unit: string | null; ppm: number | null; kebutuhan: Need | null;
  rencana_id: string | null; rencana_untuk_alat: boolean | null; rencana_tanggal: string | null; rencana_selesai: string | null; rencana_catatan: string | null;
};
/** What a transformer to plan needs, and its own plan if it has one. */
type Picked = { kategori: Category; kebutuhan: Need; ownPlan: string | null; done: boolean };
/** The plan dialog: for one row (its plan can be changed, finished, removed) or for several transformers at once. */
type Editing = { row: FocusRow } | { targets: Array<[string, Picked]>; title: string };

const PAGE = 100;
// What PostgREST returns at most per request.
const BATCH = 1000;
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value: number) => value.toLocaleString('id-ID');
const FILTERS = [['all', 'Semua'], ['noplan', 'Belum diisi'], ['late', 'Terlambat']] as const;
type Filter = (typeof FILTERS)[number][0];
const MONTHS = Array.from({ length: 12 }, (_, index) => new Date(2000, index, 1).toLocaleDateString('id-ID', { month: 'long' }));
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 11 }, (_, index) => thisYear + index);

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10';

function planState(row: FocusRow) {
  if (!row.rencana_tanggal) return null;
  // A handling is done by its after-test under 50 ppm (form 2), when the transformer leaves this list; one marked done by hand is not.
  if (row.rencana_selesai && row.kebutuhan === 'penanganan') return { label: 'Ditandai selesai, masih ≥ 50 ppm', className: 'border-amber-200 bg-amber-50 text-amber-900' };
  if (row.rencana_selesai) return { label: `Selesai ${formatPlanDate(row.rencana_selesai)}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (row.rencana_tanggal < today()) return { label: `Terlambat · ${formatPlanMonth(row.rencana_tanggal)}`, className: 'border-rose-200 bg-rose-50 text-rose-800' };
  return { label: formatPlanMonth(row.rencana_tanggal), className: 'border-slate-200 bg-white text-slate-800' };
}

// One table per need, the most pressing first: in use at 50 ppm or more, in use untested, no longer in use.
// Only the first shows the test result; a transformer no longer in use is managed whatever it says.
const NEEDS: Array<{ need: Need; title: string; text: string; none: string }> = [
  { need: 'penanganan', title: 'Perlu retrofilling / ganti trafo', text: 'Trafo masih digunakan dengan hasil uji 50 ppm atau lebih. Isi kapan akan diretrofilling atau diganti.', none: 'tidak ada trafo masih digunakan dengan hasil uji ≥ 50 ppm.' },
  { need: 'uji', title: 'Perlu diuji', text: 'Trafo masih digunakan yang belum ada hasil ujinya. Isi kapan akan diuji kandungan PCBs-nya.', none: 'tidak ada trafo masih digunakan yang belum diuji.' },
  { need: 'pengelolaan', title: 'Perlu dikelola', text: 'Trafo yang sudah tidak digunakan, berapa pun hasil ujinya. Isi kapan akan dikelola sebagai limbah B3.', none: 'tidak ada trafo yang sudah tidak digunakan.' },
];

/** The transformers of one need and filter, as the database function gives them. */
function focusQuery(supabase: SupabaseClient, companyId: string, need: Need, filter: Filter, columns = '*', options?: { count: 'exact'; head: true }) {
  let request = supabase.rpc('company_focus_transformers', { p_company_id: companyId }, options).select(columns).eq('kebutuhan', need);
  if (filter === 'noplan') request = request.is('rencana_tanggal', null);
  if (filter === 'late') request = request.lt('rencana_tanggal', today()).is('rencana_selesai', null);
  return request;
}

const pickedOf = (row: FocusRow): Picked => ({ kategori: row.kategori, kebutuhan: row.kebutuhan!, ownPlan: row.rencana_untuk_alat ? row.rencana_id : null, done: Boolean(row.rencana_selesai) });

/**
 * A company's roadmap for its transformers before 1997 (or of unknown year),
 * one table per need (NEEDS): retrofilling, testing, management.
 * On the Roadmap page and in the company's report.
 */
export default function RoadmapPanels(props: { supabase: SupabaseClient; companyId: string; reloadKey: number; onChange: () => void }) {
  return (
    <div className="space-y-6">
      {NEEDS.map((entry) => <RoadmapGroup key={entry.need} {...props} need={entry} />)}
    </div>
  );
}

/**
 * The month and year of a plan (kept as the month's last day, so a plan is
 * late only once its month is over) and a note; for one row also marking a
 * management done and removing the plan.
 */
function PlanDialog({ title, subtitle, initial, busy, error, done, onSave, onFinish, onUndo, onRemove, onClose }: {
  title: string;
  subtitle?: string;
  initial: { date: string | null; note: string | null };
  busy: string | null;
  error: string | null;
  /** A management already marked done: no new month, only undoing the mark. */
  done?: string;
  onSave: (date: string, note: string) => void;
  onFinish?: () => void;
  onUndo?: () => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(initial.date ? String(Number(initial.date.slice(5, 7))) : '');
  const [year, setYear] = useState(initial.date ? initial.date.slice(0, 4) : '');
  const [note, setNote] = useState(initial.note ?? '');
  const date = month && year ? monthEnd(Number(year), Number(month)) : '';
  // A year before this one (an old plan) stays choosable.
  const years = year && !YEARS.includes(Number(year)) ? [Number(year), ...YEARS] : YEARS;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title" className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="plan-dialog-title" className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy !== null} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        {done ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900"><CheckCircle2 className="h-4 w-4 shrink-0" /> {done}</p> : <>
        <p className="mt-4 text-[13px] font-medium text-slate-800">Kapan akan dilakukan?</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <select aria-label="Bulan" value={month} onChange={(event) => setMonth(event.target.value)} className={fieldClass}>
            <option value="">Pilih bulan</option>
            {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
          <select aria-label="Tahun" value={year} onChange={(event) => setYear(event.target.value)} className={fieldClass}>
            <option value="">Pilih tahun</option>
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <label className="mt-4 block text-[13px] font-medium text-slate-800">Keterangan <span className="font-normal text-slate-400">(boleh kosong)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="mis. menunggu jadwal laboratorium" className={`${fieldClass} mt-1.5`} />
        </label>
        </>}
        {error && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {onRemove && (
            <button type="button" disabled={busy !== null} onClick={onRemove} className="mr-auto flex items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40">
              {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Hapus rencana
            </button>
          )}
          {onFinish && (
            <button type="button" disabled={busy !== null} onClick={onFinish} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">
              {busy === 'finish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Tandai selesai
            </button>
          )}
          {done ? (
            onUndo && <button type="button" disabled={busy !== null} onClick={onUndo} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {busy === 'finish' && <Loader2 className="h-4 w-4 animate-spin" />} Batalkan tanda selesai
            </button>
          ) : (
            <button type="button" disabled={!date || busy !== null} onClick={() => onSave(date, note)} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
              {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Simpan rencana
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * One group's table: the transformers without a plan first, each with a
 * button to give it one (or change, finish or remove it) on its row; above
 * the table the plan can be set at once for every transformer still without
 * one, or for those picked. A new plan replaces the open one a transformer had.
 */
function RoadmapGroup({ supabase, companyId, reloadKey, onChange, need: { need: group, title, text, none } }: { supabase: SupabaseClient; companyId: string; reloadKey: number; onChange: () => void; need: (typeof NEEDS)[number] }) {
  // A pemantau account sees the plans and the transformers, without the means to change them.
  const readOnly = useReadOnly();
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [rows, setRows] = useState<{ key: string; list: FocusRow[]; more: boolean } | null>(null);
  const [counts, setCounts] = useState<{ key: string; values: Partial<Record<Filter, number>> } | null>(null);
  // Picking several transformers is a mode, so the table has no checkboxes otherwise.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Map<string, Picked>>(new Map());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = `${companyId}|${reloadKey}|${filter}|${limit}`;
  const countKey = `${companyId}|${reloadKey}`;
  const withPpm = group === 'penanganan';

  useEffect(() => {
    let active = true;
    focusQuery(supabase, companyId, group, filter).order('rencana_tanggal', { nullsFirst: true }).order('tahun_pembuatan', { nullsFirst: true }).range(0, limit)
      .then(({ data }) => {
        if (!active) return;
        const list = (data ?? []) as unknown as FocusRow[];
        setRows({ key: requestKey, list: list.slice(0, limit), more: list.length > limit });
      });
    return () => { active = false; };
  }, [supabase, companyId, group, filter, limit, requestKey]);

  // The number behind each filter.
  useEffect(() => {
    let active = true;
    Promise.all(FILTERS.map(async ([key]) => {
      const { count } = await focusQuery(supabase, companyId, group, key, 'id', { count: 'exact', head: true });
      return [key, count ?? 0] as const;
    })).then((entries) => { if (active) setCounts({ key: countKey, values: Object.fromEntries(entries) }); });
    return () => { active = false; };
  }, [supabase, companyId, group, countKey]);

  const list = rows?.key === requestKey ? rows.list : null;
  const count = (key: Filter) => (counts?.key === countKey ? counts.values[key] : undefined);
  const total = count('all');
  const open = count('noplan');
  const planned = total !== undefined && open !== undefined ? total - open : undefined;
  const filterTotal = count(filter) ?? 0;
  const allShownPicked = list !== null && list.length > 0 && list.every((row) => picked.has(row.id));

  const toggle = (row: FocusRow) => setPicked((current) => {
    const next = new Map(current);
    if (next.has(row.id)) next.delete(row.id); else next.set(row.id, pickedOf(row));
    return next;
  });
  const toggleShown = () => setPicked(allShownPicked ? new Map() : new Map((list ?? []).map((row) => [row.id, pickedOf(row)])));
  const stopPicking = () => { setPicking(false); setPicked(new Map()); };

  // Every transformer of a filter, beyond the rows loaded.
  const loadAll = async (which: Filter) => {
    const found = new Map<string, Picked>();
    for (let from = 0; ; from += BATCH) {
      const { data, error: loadError } = await focusQuery(supabase, companyId, group, which).range(from, from + BATCH - 1);
      if (loadError) throw new Error(loadError.message);
      for (const row of (data ?? []) as unknown as FocusRow[]) found.set(row.id, pickedOf(row));
      if (!data || data.length < BATCH) break;
    }
    return found;
  };
  const pickAll = async () => {
    setBusy('pick');
    try { setPicked(await loadAll(filter)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(null);
  };
  const planAllOpen = async () => {
    setBusy('pick');
    setError(null);
    try {
      const targets = [...(await loadAll('noplan')).entries()];
      if (targets.length) setEditing({ targets, title: `Isi rencana untuk ${fmt(targets.length)} trafo yang belum diisi` });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  };

  const run = async (kind: string, work: () => Promise<{ error: { message: string } | null }[]>) => {
    setBusy(kind);
    setError(null);
    const failed = (await work()).find((result) => result.error)?.error;
    setBusy(null);
    if (failed) return setError(failed.message);
    setEditing(null);
    stopPicking();
    onChange();
  };

  // Each transformer gets the month; an open plan it had is replaced, and so is a handling
  // marked done while the transformer is still 50 ppm or more (it would win over the new month).
  const setPlan = (targets: Array<[string, Picked]>, date: string, note: string) => run('plan', async () => {
    const ids = targets.map(([id]) => id);
    const results = [];
    for (let at = 0; at < ids.length; at += BATCH) {
      const slice = ids.slice(at, at + BATCH);
      results.push(await supabase.from('equipment_plans').delete().eq('company_id', companyId).in('item_id', slice).is('selesai_at', null));
      results.push(await supabase.from('equipment_plans').delete().eq('company_id', companyId).in('item_id', slice).eq('jenis', 'penanganan'));
    }
    for (let at = 0; at < targets.length; at += BATCH) {
      results.push(await supabase.from('equipment_plans').insert(targets.slice(at, at + BATCH).map(([id, row]) => ({ company_id: companyId, kategori: row.kategori, item_id: id, jenis: row.kebutuhan, rencana_tanggal: date, catatan: note.trim() || null }))));
    }
    return results;
  });
  // A test is done by its result in the data, a handling by its after-test under 50 ppm (form 2);
  // only a management (handing a transformer no longer in use over) is marked done by hand.
  const finishPlan = (planId: string, done = true) => run('finish', async () => [await supabase.from('equipment_plans').update({ selesai_at: done ? today() : null }).eq('id', planId)]);
  const removePlans = async (planIds: string[]) => {
    if (!(await confirmDialog({ title: planIds.length === 1 ? 'Hapus rencana trafo ini?' : `Hapus rencana ${fmt(planIds.length)} trafo?`, message: 'Trafonya kembali belum punya rencana dan status perusahaan bisa menjadi merah sampai diisi lagi.', tone: 'danger', confirmLabel: 'Hapus rencana' }))) return;
    run('remove', async () => [await supabase.from('equipment_plans').delete().in('id', planIds)]);
  };

  const chosen = [...picked.entries()];
  const withOwnPlan = chosen.filter(([, row]) => row.ownPlan);
  const name = (row: FocusRow) => [row.nama_merek, row.nomor_serial].filter(Boolean).join(' · ') || 'Trafo tanpa nama';
  const dialog = editing && ('row' in editing
    ? (() => {
        const row = editing.row;
        const own = row.rencana_untuk_alat ? row.rencana_id : null;
        return (
          <PlanDialog title={row.rencana_tanggal ? 'Ubah rencana' : 'Isi rencana'} subtitle={`${name(row)} · ${row.kebutuhan === 'uji' ? 'uji kandungan PCBs' : row.kebutuhan === 'pengelolaan' ? 'kelola sebagai limbah B3' : 'retrofilling / ganti trafo'}`}
            initial={{ date: row.rencana_selesai ? null : row.rencana_tanggal, note: row.rencana_catatan }} busy={busy} error={error}
            done={row.rencana_selesai && row.kebutuhan === 'pengelolaan' ? `Pengelolaan trafo ini ditandai selesai pada ${formatPlanDate(row.rencana_selesai)}.` : undefined}
            onSave={(date, note) => setPlan([[row.id, pickedOf(row)]], date, note)}
            onFinish={own && !row.rencana_selesai && row.kebutuhan === 'pengelolaan' ? () => finishPlan(own) : undefined}
            onUndo={own ? () => finishPlan(own, false) : undefined}
            onRemove={own ? () => removePlans([own]) : undefined}
            onClose={() => { setEditing(null); setError(null); }} />
        );
      })()
    : <PlanDialog title={editing.title} subtitle="Bulan dan tahun yang sama untuk semua trafo ini. Rencana yang belum selesai diganti." initial={{ date: null, note: null }} busy={busy} error={error}
        onSave={(date, note) => setPlan(editing.targets, date, note)} onClose={() => { setEditing(null); setError(null); }} />);

  // Nothing of this need: one line, so the company sees it was looked at.
  if (total === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-400" /> <span><span className="font-semibold text-slate-900">{title}</span>: {none}</span>
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            {title}
            {total !== undefined && <span className="rounded-full bg-slate-100 px-2 text-xs tabular-nums text-slate-600">{fmt(total)}</span>}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{text} Hanya trafo buatan sebelum {TRAFO_FOCUS_YEAR} atau tanpa tahun.</p>
        </div>

        {total !== undefined && total > 0 && planned !== undefined && (
          <div>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-800">{fmt(planned)} dari {fmt(total)} trafo sudah punya rencana</span>
              {open ? <span className="font-semibold text-rose-700">{fmt(open)} belum diisi</span> : <span className="flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Semua sudah diisi</span>}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${open ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${(planned / total) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Tampilkan" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {FILTERS.map(([key, label]) => {
              const value = count(key);
              const alarming = key !== 'all' && value;
              return (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE); setPicked(new Map()); }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>
                  {label}
                  {value !== undefined && <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${alarming ? 'bg-rose-100 text-rose-800' : 'bg-slate-200/70 text-slate-600'}`}>{fmt(value)}</span>}
                </button>
              );
            })}
          </div>
          {!readOnly && !picking && total !== undefined && total > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              {open !== undefined && open > 1 && (
                <button type="button" disabled={busy !== null} onClick={planAllOpen} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40">
                  {busy === 'pick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Isi semua yang belum diisi ({fmt(open)})
                </button>
              )}
              {total > 1 && (
                <button type="button" onClick={() => { setPicking(true); setError(null); }} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <ListChecks className="h-4 w-4" /> Pilih beberapa trafo
                </button>
              )}
            </div>
          )}
        </div>

        {!readOnly && picking && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3">
            <span className="text-xs font-semibold text-emerald-900">{picked.size ? `${fmt(picked.size)} trafo dipilih` : 'Centang trafo di tabel, lalu isi rencananya sekaligus.'}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" disabled={!picked.size || busy !== null} onClick={() => setEditing({ targets: chosen, title: `Isi rencana untuk ${fmt(chosen.length)} trafo` })} className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
                <CalendarPlus className="h-4 w-4" /> Isi rencana{picked.size ? ` (${fmt(picked.size)})` : ''}
              </button>
              {withOwnPlan.length > 0 && (
                <button type="button" disabled={busy !== null} onClick={() => removePlans(withOwnPlan.map(([, row]) => row.ownPlan!))} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
                  <Trash2 className="h-4 w-4" /> Hapus rencana ({fmt(withOwnPlan.length)})
                </button>
              )}
              <button type="button" onClick={stopPicking} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
            </div>
          </div>
        )}
        {error && !editing && <p className="text-xs font-medium text-rose-700">{error}</p>}
      </div>

      {list === null ? <p className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
        : list.length === 0 ? <p className="p-5 text-sm text-slate-500">{filter === 'all' ? `Tidak ada trafo yang ${title.toLowerCase()}.` : filter === 'noplan' ? 'Semua trafo sudah punya rencana.' : 'Tidak ada rencana yang terlambat.'}</p> : (
          <div className="px-5 py-4">
            {picking && allShownPicked && filterTotal > list.length && picked.size < filterTotal && (
              <p className="mb-3 rounded-xl bg-slate-50 px-4 py-2 text-xs text-slate-600">
                {fmt(list.length)} trafo yang tampil dipilih.{' '}
                <button type="button" disabled={busy !== null} onClick={pickAll} className="font-semibold text-emerald-700 underline">{busy === 'pick' ? 'Memilih…' : `Pilih semua ${fmt(filterTotal)} trafo`}</button>
              </p>
            )}
            {/* A grid of boxes, as in the Excel template: lines between every cell, rows striped. */}
            <div className="overflow-x-auto rounded-xl border border-slate-300">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs [&_td]:border [&_td]:border-slate-200 [&_th]:border [&_th]:border-slate-300 [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0 [&_thead_tr>*]:border-t-0 [&_tbody_tr:last-child>*]:border-b-0">
              <thead className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  {picking && <th className="w-10 px-3 py-3 text-center"><input type="checkbox" aria-label="Pilih semua yang tampil" checked={allShownPicked} onChange={toggleShown} className="accent-emerald-700" /></th>}
                  <th className="w-12 px-3 py-3 text-center">No</th>
                  <th className="px-3 py-2.5">Trafo</th><th className="px-3 py-2.5">Tahun</th><th className="px-3 py-2.5">Lokasi</th>{withPpm && <th className="px-3 py-2.5 text-right">Hasil uji</th>}<th className="px-3 py-2.5 text-right">Rencana</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row, index) => {
                  const state = planState(row);
                  return (
                    <tr key={row.id} className={picked.has(row.id) ? 'bg-emerald-50' : !state ? 'bg-rose-50/60' : index % 2 ? 'bg-slate-50' : 'bg-white'}>
                      {picking && <td className="px-3 py-3 text-center"><input type="checkbox" aria-label="Pilih" checked={picked.has(row.id)} onChange={() => toggle(row)} className="accent-emerald-700" /></td>}
                      <td className="px-3 py-3 text-center tabular-nums text-slate-500">{index + 1}</td>
                      <td className="px-3 py-3 text-slate-800">{row.nama_merek || '–'}<span className="block text-slate-500">{row.nomor_serial || '–'}</span></td>
                      <td className="px-3 py-3 tabular-nums">{row.tahun_pembuatan ?? <span className="text-amber-700">tidak ada</span>}</td>
                      <td className="max-w-56 px-3 py-3 text-slate-600"><span className="line-clamp-2">{[row.unit, row.lokasi].filter(Boolean).join(' · ') || '–'}</span></td>
                      {withPpm && <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-orange-800">{row.ppm?.toLocaleString('id-ID')} ppm</td>}
                      <td className="px-3 py-3 text-right">
                        {!state ? (
                          readOnly || picking ? <span className="font-semibold text-rose-700">Belum diisi</span> : (
                            <button type="button" onClick={() => { setError(null); setEditing({ row }); }} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">
                              <CalendarPlus className="h-4 w-4" /> Isi rencana
                            </button>
                          )
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${state.className}`}>{state.label}</span>
                            {!readOnly && !picking && (
                              <button type="button" onClick={() => { setError(null); setEditing({ row }); }} title="Ubah rencana" aria-label="Ubah rencana" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-emerald-300 hover:text-emerald-700"><Pencil className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        )}
                        {row.rencana_catatan && <span title={row.rencana_catatan} className="mt-1 ml-auto line-clamp-2 block max-w-64 text-[11px] text-slate-500">{row.rencana_catatan}</span>}
                        {row.rencana_tanggal && !row.rencana_untuk_alat && <span className="mt-0.5 block text-[10px] text-slate-400">rencana bersama (lama)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {rows?.more && <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-slate-50">Muat {PAGE} lagi</button>}
          </div>
        )}
      {dialog}
    </div>
  );
}
