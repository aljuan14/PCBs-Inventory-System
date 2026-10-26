'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarClock, ChevronRight, ListChecks, Loader2 } from 'lucide-react';
import { EMPTY_STATUS, STATUS_COLORS, evaluateStatus, fetchAllPcbStatus, formatPlanMonth, hasInventory, manageOpenOf, nationalColor, openActions, type NationalColor, type PcbStatusCounts } from '@/lib/company-pcb-status';

type Company = { id: string; name: string };
type Row = { id: string; name: string; counts: PcbStatusCounts; color: NationalColor };

const fmt = (value: number) => value.toLocaleString('id-ID');
const SHOWN = 8;
const styleOf = (color: NationalColor) => (color === 'empty' ? EMPTY_STATUS : STATUS_COLORS[color]);

/** Every company's status counts with its name, loaded once (pcb_status_all, or the web summary). */
function useCompanyRows(supabase: SupabaseClient, companies: Company[]) {
  const [map, setMap] = useState<Map<string, PcbStatusCounts> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchAllPcbStatus(supabase).then((result) => { if (active) setMap(result); }, (err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [supabase]);
  const rows = useMemo<Row[] | null>(() => {
    if (!map) return null;
    const names = new Map(companies.map((company) => [company.id, company.name]));
    return [...map].filter(([id]) => names.has(id)).map(([id, counts]) => ({ id, name: names.get(id)!, counts, color: nationalColor(counts) }));
  }, [map, companies]);
  return { rows, error };
}

function Chips<K extends string>({ options, value, onChange }: { options: Array<[K, string, number]>; value: K; onChange: (key: K) => void }) {
  return (
    <div role="group" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {options.map(([key, label, count]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${value === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>
          {label} ({fmt(count)})
        </button>
      ))}
    </div>
  );
}

function ShowMore({ total, open, onToggle }: { total: number; open: boolean; onToggle: () => void }) {
  if (total <= SHOWN) return null;
  return <button type="button" onClick={onToggle} className="w-full border-t border-slate-100 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-slate-50">{open ? 'Tampilkan lebih sedikit' : `Tampilkan semua ${fmt(total)}`}</button>;
}

type AttentionFilter = 'red' | 'letter' | 'unreported' | 'all';

/**
 * Isi formulir before a company is picked: the companies needing attention,
 * most urgent first; picking one opens its report.
 */
export function CompanyAttentionList({ supabase, companies, onPick }: { supabase: SupabaseClient; companies: Company[]; onPick: (companyId: string) => void }) {
  const { rows, error } = useCompanyRows(supabase, companies);
  const [filter, setFilter] = useState<AttentionFilter>('red');
  const [open, setOpen] = useState(false);
  if (error) return <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Daftar perusahaan gagal dimuat: {error}</p>;

  const red = rows?.filter((row) => row.color === 'red').sort((a, b) => openActions(b.counts) - openActions(a.counts) || a.name.localeCompare(b.name)) ?? [];
  // A letter of "no equipment" for the admin to verify; companies with neither data nor statement.
  const letters = rows?.filter((row) => row.counts.pernyataan?.verifikasi === 'menunggu').sort((a, b) => a.name.localeCompare(b.name)) ?? [];
  const unreported = rows?.filter((row) => !hasInventory(row.counts) && !row.counts.pernyataan).sort((a, b) => a.name.localeCompare(b.name)) ?? [];
  const all = [...(rows ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const list = filter === 'red' ? red : filter === 'letter' ? letters : filter === 'unreported' ? unreported : all;
  const visible = open ? list : list.slice(0, SHOWN);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Perusahaan yang perlu perhatian</h2>
            <p className="text-xs text-slate-500">Klik perusahaan untuk membuka laporannya, atau pilih lewat kotak di atas.</p>
          </div>
        </div>
        <Chips<AttentionFilter> options={[['red', 'Perlu tindakan', red.length], ['letter', 'Surat menunggu verifikasi', letters.length], ['unreported', 'Belum melapor', unreported.length], ['all', 'Semua', all.length]]} value={filter} onChange={(key) => { setFilter(key); setOpen(false); }} />
      </div>
      {rows === null ? <p className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
        : list.length === 0 ? <p className="p-5 text-sm text-slate-500">Tidak ada perusahaan pada pilihan ini.</p>
          : visible.map((row) => {
            const message = row.color === 'empty' ? 'Belum ada data maupun pernyataan.' : evaluateStatus(row.counts).messages[0]?.text;
            return (
              <button key={row.id} type="button" onClick={() => onPick(row.id)} className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-2.5 text-left last:border-0 hover:bg-slate-50">
                <span className={`h-2 w-2 shrink-0 rounded-full ${styleOf(row.color).dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                  {message && <span className="block truncate text-xs text-slate-500">{message}</span>}
                </span>
                <span className="shrink-0 text-xs font-semibold text-emerald-700">Buka</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            );
          })}
      <ShowMore total={list.length} open={open} onToggle={() => setOpen((value) => !value)} />
    </section>
  );
}

type ScheduleFilter = 'late' | 'soon' | 'later' | 'noplan';
const DAY = 86_400_000;

/**
 * Roadmap before a company is picked: plans past their date, plans due in
 * 30 or 90 days, and companies with transformers still without a plan.
 */
export function RoadmapSchedule({ supabase, companies, onPick }: { supabase: SupabaseClient; companies: Company[]; onPick: (companyId: string) => void }) {
  const { rows, error } = useCompanyRows(supabase, companies);
  // Null until picked: the first list with companies in it.
  const [picked, setPicked] = useState<ScheduleFilter | null>(null);
  const [open, setOpen] = useState(false);
  if (error) return <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Jadwal gagal dimuat: {error}</p>;

  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const daysTo = (date: string | null) => (date ? Math.round((new Date(date).getTime() - today) / DAY) : null);
  const late = (s: PcbStatusCounts) => s.belum_uji_lewat + s.tinggi_lewat + (s.kelola_lewat ?? 0);
  const noPlan = (s: PcbStatusCounts) => openActions(s) - late(s);
  const all = rows ?? [];
  const lists: Record<ScheduleFilter, Row[]> = {
    late: all.filter((row) => late(row.counts) > 0).sort((a, b) => late(b.counts) - late(a.counts)),
    soon: all.filter((row) => { const days = daysTo(row.counts.rencana_berikut); return days !== null && days <= 30; }).sort((a, b) => (a.counts.rencana_berikut ?? '').localeCompare(b.counts.rencana_berikut ?? '')),
    later: all.filter((row) => { const days = daysTo(row.counts.rencana_berikut); return days !== null && days <= 90; }).sort((a, b) => (a.counts.rencana_berikut ?? '').localeCompare(b.counts.rencana_berikut ?? '')),
    noplan: all.filter((row) => noPlan(row.counts) > 0).sort((a, b) => noPlan(b.counts) - noPlan(a.counts)),
  };
  const filter = picked ?? (['late', 'soon', 'later', 'noplan'] as const).find((key) => lists[key].length > 0) ?? 'late';
  const list = lists[filter];
  const visible = open ? list : list.slice(0, SHOWN);
  const totals = all.reduce((sum, row) => ({ late: sum.late + late(row.counts), noPlan: sum.noPlan + noPlan(row.counts), planned: sum.planned + (row.counts.rencana_berikut ? 1 : 0) }), { late: 0, noPlan: 0, planned: 0 });

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-4 border-b border-slate-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Jadwal uji, penanganan &amp; pengelolaan, semua perusahaan</h2>
            <p className="text-xs text-slate-500">Untuk trafo buatan sebelum 1997 atau tanpa tahun. Klik perusahaan untuk membuka roadmap-nya.</p>
          </div>
        </div>
        {rows && (
          <dl className="grid grid-cols-3 gap-3">
            <div><dt className="text-[11px] font-medium text-slate-500">Trafo lewat waktu rencana</dt><dd className={`text-xl font-semibold tabular-nums ${totals.late ? 'text-rose-700' : 'text-slate-900'}`}>{fmt(totals.late)}</dd></div>
            <div><dt className="text-[11px] font-medium text-slate-500">Perusahaan dengan rencana berjalan</dt><dd className="text-xl font-semibold tabular-nums text-slate-900">{fmt(totals.planned)}</dd></div>
            <div><dt className="text-[11px] font-medium text-slate-500">Trafo belum punya rencana</dt><dd className={`text-xl font-semibold tabular-nums ${totals.noPlan ? 'text-rose-700' : 'text-slate-900'}`}>{fmt(totals.noPlan)}</dd></div>
          </dl>
        )}
        <Chips<ScheduleFilter> options={[['late', 'Lewat waktu', lists.late.length], ['soon', '30 hari ke depan', lists.soon.length], ['later', '90 hari ke depan', lists.later.length], ['noplan', 'Belum punya rencana', lists.noplan.length]]} value={filter} onChange={(key) => { setPicked(key); setOpen(false); }} />
      </div>
      {rows === null ? <p className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
        : list.length === 0 ? <p className="p-5 text-sm text-slate-500">{filter === 'late' ? 'Tidak ada rencana yang lewat tanggal.' : filter === 'noplan' ? 'Semua trafo yang perlu tindakan sudah punya rencana.' : 'Tidak ada rencana pada rentang ini.'}</p>
          : visible.map((row) => {
            const s = row.counts;
            const detail = filter === 'late' ? `${fmt(late(s))} trafo lewat waktu rencana`
              : filter === 'noplan' ? `${fmt(noPlan(s))} trafo belum punya rencana (${fmt(s.belum_uji - s.belum_uji_terjadwal - s.belum_uji_lewat)} uji, ${fmt(s.tinggi - s.tinggi_selesai - s.tinggi_terjadwal - s.tinggi_lewat)} penanganan, ${fmt(manageOpenOf(s))} pengelolaan)`
                : `Rencana terdekat ${formatPlanMonth(s.rencana_berikut!)}`;
            return (
              <button key={row.id} type="button" onClick={() => onPick(row.id)} className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-2.5 text-left last:border-0 hover:bg-slate-50">
                <span className={`h-2 w-2 shrink-0 rounded-full ${styleOf(row.color).dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                  <span className={`block truncate text-xs ${filter === 'late' || filter === 'noplan' ? 'text-rose-700' : 'text-slate-500'}`}>{detail}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-emerald-700">Buka</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            );
          })}
      <ShowMore total={list.length} open={open} onToggle={() => setOpen((value) => !value)} />
    </section>
  );
}
