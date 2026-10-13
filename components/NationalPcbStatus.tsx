'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronRight, Loader2, ShieldAlert } from 'lucide-react';
import { EMPTY_STATUS, STATUS_COLORS, evaluateStatus, fetchAllPcbStatus, nationalColor, onlyStatementMissing, openActions, type NationalColor, type PcbStatusCounts } from '@/lib/company-pcb-status';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';

const ORDER: NationalColor[] = ['red', 'yellow', 'green', 'empty'];
const styleOf = (color: NationalColor) => (color === 'empty' ? EMPTY_STATUS : STATUS_COLORS[color]);
const fmt = (value: number) => value.toLocaleString('id-ID');
const SHOWN = 8;

type Row = { id: string; name: string; color: NationalColor; counts: PcbStatusCounts; open: number };

/**
 * How many companies are red, yellow, green or have not reported, with the
 * national figures behind it and the companies of one colour, most urgent
 * first. Picking a company narrows the dashboard to it.
 */
export default function NationalPcbStatus({ supabase, companies, reloadKey, onSelectCompany }: {
  supabase: SupabaseClient;
  companies: Array<{ id: string; name: string }>;
  reloadKey: number;
  onSelectCompany: (companyId: string) => void;
}) {
  const [statuses, setStatuses] = useState<{ key: number; map?: Map<string, PcbStatusCounts>; error?: string } | null>(null);
  const [color, setColor] = useState<NationalColor>('red');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAllPcbStatus(supabase)
      .then((map) => { if (active) setStatuses({ key: reloadKey, map }); })
      .catch((err: Error) => { if (active) setStatuses({ key: reloadKey, error: err.message }); });
    return () => { active = false; };
  }, [supabase, reloadKey]);

  const rows = useMemo<Row[]>(() => {
    if (!statuses?.map) return [];
    const names = new Map(companies.map((company) => [company.id, company.name]));
    return [...statuses.map].map(([id, counts]) => ({ id, name: names.get(id) ?? '–', color: nationalColor(counts), counts, open: openActions(counts) }));
  }, [statuses, companies]);

  const byColor = useMemo(() => Object.fromEntries(ORDER.map((key) => [key, rows.filter((row) => row.color === key)])) as Record<NationalColor, Row[]>, [rows]);
  const totals = useMemo(() => rows.reduce((sum, { counts: s }) => ({
    focus: sum.focus + s.fokus,
    untested: sum.untested + s.belum_uji,
    untestedOpen: sum.untestedOpen + s.belum_uji - s.belum_uji_terjadwal - s.belum_uji_lewat,
    high: sum.high + s.tinggi,
    highOpen: sum.highOpen + s.tinggi - s.tinggi_selesai - s.tinggi_terjadwal - s.tinggi_lewat,
    late: sum.late + s.belum_uji_lewat + s.tinggi_lewat,
  }), { focus: 0, untested: 0, untestedOpen: 0, high: 0, highOpen: 0, late: 0 }), [rows]);

  if (!statuses) return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Menghitung status PCBs perusahaan…</div>;
  if (statuses.error) return <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Status PCBs perusahaan gagal dimuat: {statuses.error}</p>;

  // Most yellow companies only lack the statement (introduced 2026-10-12); said on the tile so it is not read as a data problem.
  const statementOnly = byColor.yellow.filter((row) => onlyStatementMissing(row.counts)).length;
  const list = [...byColor[color]].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const visible = showAll ? list : list.slice(0, SHOWN);
  const figures: Array<[string, number, string | null]> = [
    [`Trafo sebelum ${TRAFO_FOCUS_YEAR} / tanpa tahun`, totals.focus, null],
    ['Belum diuji', totals.untested, totals.untestedOpen ? `${fmt(totals.untestedOpen)} tanpa rencana` : null],
    ['> 50 ppm', totals.high, totals.highOpen ? `${fmt(totals.highOpen)} tanpa rencana` : null],
    ['Rencana lewat tanggal', totals.late, null],
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        <div>
          <h2 className="text-base font-semibold text-slate-900">Status PCBs perusahaan</h2>
          <p className="text-xs text-slate-500">Untuk trafo buatan sebelum {TRAFO_FOCUS_YEAR} atau tanpa tahun. Merah: ada yang belum diuji atau &gt; 50 ppm tanpa rencana, atau rencananya lewat tanggal.</p>
        </div>
      </div>

      {/* One bar split by colour, then a tile per colour that also picks the list below. */}
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={ORDER.map((key) => `${styleOf(key).label} ${byColor[key].length}`).join(', ')}>
        {ORDER.map((key) => byColor[key].length > 0 && <div key={key} className={styleOf(key).dot} style={{ width: `${(byColor[key].length / rows.length) * 100}%` }} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ORDER.map((key) => {
          const style = styleOf(key);
          return (
            <button key={key} type="button" aria-pressed={color === key} onClick={() => { setColor(key); setShowAll(false); }}
              className={`rounded-xl border p-3 text-left transition-shadow ${style.card} ${color === key ? 'ring-2 ring-slate-900/15' : 'hover:brightness-[0.98]'}`}>
              <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${style.text}`}><span className={`h-2 w-2 rounded-full ${style.dot}`} />{style.label}</span>
              <span className="mt-1 flex items-baseline gap-1.5"><span className="text-2xl font-semibold tabular-nums text-slate-900">{fmt(byColor[key].length)}</span><span className="text-xs text-slate-500">perusahaan</span></span>
              {key === 'yellow' && statementOnly > 0 && <span className="mt-0.5 block text-[11px] text-amber-800">{fmt(statementOnly)} hanya karena belum mengisi pernyataan</span>}
            </button>
          );
        })}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
        {figures.map(([label, value, note]) => (
          <div key={label}>
            <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{fmt(value)}</dd>
            {note && <dd className="text-[11px] font-medium text-rose-700">{note}</dd>}
          </div>
        ))}
      </dl>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700">{styleOf(color).label}: {fmt(list.length)} perusahaan{color === 'red' && list.length > 0 ? ', paling banyak tindakan terbuka di atas' : ''}</div>
        {list.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">Tidak ada perusahaan.</p> : visible.map((row) => {
          const first = row.color === 'empty' ? 'Belum ada data maupun pernyataan.' : evaluateStatus(row.counts).messages[0]?.text;
          return (
            <button key={row.id} type="button" onClick={() => onSelectCompany(row.id)} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50">
              <span className={`h-2 w-2 shrink-0 rounded-full ${styleOf(row.color).dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                {first && <span className="block truncate text-xs text-slate-500">{first}</span>}
              </span>
              {row.open > 0 && <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmt(row.open)} trafo perlu tindakan</span>}
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          );
        })}
        {list.length > SHOWN && (
          <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full border-t border-slate-100 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-slate-50">
            {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua ${fmt(list.length)}`}
          </button>
        )}
      </div>
    </section>
  );
}
