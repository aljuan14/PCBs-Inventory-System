'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CircleAlert, CircleHelp, CircleCheck, FileText } from 'lucide-react';
import { MATCH_STATUS_LABELS, PCB_CAPACITOR_BRANDS, matchCapacitor, type CapacitorMatchStatus } from '@/lib/pcb-capacitor-brands';
import type { InventoryFilters } from '@/lib/inventory-query';

const PAGE = 1000;
// The table filters these rows by id in the request URL; past this many ids
// the URL grows beyond what the API gateway accepts, so the count is not a link.
const MAX_LINK_IDS = 150;

const STATUSES: Array<{ key: CapacitorMatchStatus; icon: typeof CircleAlert; badge: string }> = [
  { key: 'potential', icon: CircleAlert, badge: 'border-rose-200 bg-rose-50 text-rose-800' },
  { key: 'check', icon: CircleHelp, badge: 'border-amber-200 bg-amber-50 text-amber-800' },
  { key: 'after', icon: CircleCheck, badge: 'border-slate-200 bg-slate-50 text-slate-600' },
];

type Found = Record<CapacitorMatchStatus, string[]>;
const emptyFound = (): Found => ({ potential: [], check: [], after: [] });

/** Every capacitor's id, brand and production year, a page at a time. */
async function fetchCapacitors(supabase: SupabaseClient) {
  const rows: Array<{ id: string; nama_merek: string | null; tahun_pembuatan: number | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('kapasitor').select('id, nama_merek, tahun_pembuatan').order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Lampiran II of Permen LHK 29/2020 (trade names of capacitors containing
 * PCBs), each matched against the brands in the inventory: how many units
 * are within its production years, have no year, or are made after it.
 */
export default function PcbCapacitorBrands({ supabase, reloadKey, onShowRows }: { supabase: SupabaseClient; reloadKey: number; onShowRows: (filters: Partial<InventoryFilters>) => void }) {
  const [found, setFound] = useState<Found[] | null>(null);
  const [brands, setBrands] = useState<Array<Set<string>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [onlyFound, setOnlyFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCapacitors(supabase)
      .then((rows) => {
        if (cancelled) return;
        const next = PCB_CAPACITOR_BRANDS.map(emptyFound);
        const names = PCB_CAPACITOR_BRANDS.map(() => new Set<string>());
        for (const row of rows) {
          const match = matchCapacitor(row.nama_merek, row.tahun_pembuatan);
          if (!match) continue;
          next[match.index][match.status].push(row.id);
          names[match.index].add(row.nama_merek!.trim());
        }
        setFound(next);
        setBrands(names);
        setError(null);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [supabase, reloadKey]);

  const totals = useMemo(() => {
    const sum = emptyFound();
    for (const entry of found ?? []) for (const { key } of STATUSES) sum[key].push(...entry[key]);
    return sum;
  }, [found]);
  const matchedBrands = (found ?? []).filter((entry) => STATUSES.some(({ key }) => entry[key].length > 0)).length;

  const show = (ids: string[], label: string) => onShowRows({ mapPoint: { ids, label } });
  const countLink = (ids: string[], status: CapacitorMatchStatus, label: string, className: string) => {
    const { icon: Icon } = STATUSES.find((entry) => entry.key === status)!;
    const content = <><Icon className="h-3 w-3 shrink-0" />{ids.length.toLocaleString('id-ID')}</>;
    return ids.length > 0 && ids.length <= MAX_LINK_IDS
      ? <button type="button" onClick={() => show(ids, label)} title={`${MATCH_STATUS_LABELS[status]}: lihat datanya di tabel`} className={`${className} cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-emerald-500`}>{content}</button>
      : <span title={MATCH_STATUS_LABELS[status]} className={className}>{content}</span>;
  };

  const rows = PCB_CAPACITOR_BRANDS.map((entry, index) => ({ entry, index, found: found?.[index] ?? emptyFound() }))
    .filter((row) => !onlyFound || STATUSES.some(({ key }) => row.found[key].length > 0));

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Daftar Nama Dagang Kapasitor yang Mengandung PCBs</h3>
            <p className="text-xs font-medium text-slate-500">Lampiran II Permen LHK No. P.29/MENLHK/SETJEN/PLB.3/12/2020, dicocokkan dengan nama merek kapasitor di data</p>
          </div>
        </div>
        <div role="group" aria-label="Tampilkan" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
          {[{ key: false, label: `Semua (${PCB_CAPACITOR_BRANDS.length})` }, { key: true, label: `Ditemukan di data (${matchedBrands})` }].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={onlyFound === option.key}
              onClick={() => setOnlyFound(option.key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-500 ${onlyFound === option.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Gagal memuat data kapasitor: {error}</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STATUSES.map(({ key, icon: Icon, badge }) => {
              const ids = totals[key];
              const clickable = found !== null && ids.length > 0 && ids.length <= MAX_LINK_IDS;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => show(ids, `Lampiran II: ${MATCH_STATUS_LABELS[key].toLowerCase()}`)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors enabled:cursor-pointer enabled:hover:brightness-95 focus-visible:outline-2 focus-visible:outline-emerald-500 ${badge}`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"><Icon className="h-3.5 w-3.5" /> {MATCH_STATUS_LABELS[key]}</span>
                  <span className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tracking-tight">{found ? ids.length.toLocaleString('id-ID') : '…'}</span>
                    <span className="text-sm opacity-80">unit</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5">No</th>
                  <th className="px-3 py-2.5">Nama dagang kapasitor</th>
                  <th className="px-3 py-2.5">Tahun produksi</th>
                  <th className="px-3 py-2.5">Ditemukan di data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ entry, index, found: hits }) => {
                  const any = STATUSES.some(({ key }) => hits[key].length > 0);
                  return (
                    <tr key={index} className={any ? 'bg-amber-50/30' : ''}>
                      <td className="px-3 py-2.5 align-top tabular-nums text-slate-400">{index + 1}</td>
                      <td className="px-3 py-2.5 align-top font-medium text-slate-800">{entry.name}</td>
                      <td className="px-3 py-2.5 align-top text-slate-600">
                        {entry.rule}
                        {entry.labelNote && <span className="mt-0.5 block text-[11px] text-slate-400">Cek label di lapangan: {entry.labelNote.toLowerCase()}</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {found === null ? <span className="text-slate-400">…</span> : !any ? <span className="text-slate-400">–</span> : (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {STATUSES.filter(({ key }) => hits[key].length > 0).map(({ key, badge }) =>
                                <span key={key}>{countLink(hits[key], key, `Lampiran II: ${entry.name} · ${MATCH_STATUS_LABELS[key].toLowerCase()}`, `inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${badge}`)}</span>)}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400" title={[...brands[index]].join(', ')}>
                              Merek di data: {[...brands[index]].slice(0, 3).join(', ')}{brands[index].size > 3 ? `, +${brands[index].size - 3} lainnya` : ''}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Dicocokkan dari kata pada nama merek, lalu tahun pembuatan dibandingkan dengan batas tahun di lampiran. Merek ABB tidak dicocokkan dengan BICC karena merek ABB baru ada sejak 1988.
            Klik angka untuk melihat datanya di tabel (hingga {MAX_LINK_IDS} unit).
          </p>
        </>
      )}
    </section>
  );
}
