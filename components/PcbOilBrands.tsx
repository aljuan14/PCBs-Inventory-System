'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CircleAlert, CircleDashed, FileText, Loader2 } from 'lucide-react';
import type { InventoryCategory } from '@/lib/inventory';
import { PCB_OIL_BRANDS, matchOil } from '@/lib/pcb-oil-brands';
import type { InventoryFilters } from '@/lib/inventory-query';

// The table filters these rows by id in the request URL; past this many ids
// the URL grows beyond what the API gateway accepts, so the count is not a link.
const MAX_LINK_IDS = 150;

const SUBJECT: Record<InventoryCategory, { what: string; unit: string }> = {
  transformator_digunakan: { what: 'merek minyak trafo', unit: 'unit' },
  transformator_tidak_digunakan: { what: 'merek minyak trafo', unit: 'unit' },
  kapasitor: { what: 'merek minyak kapasitor', unit: 'unit' },
  minyak_dielektrik: { what: 'merek minyak dielektrik', unit: 'data' },
};

interface Found {
  /** Rows and the brands as stored, per listed name. */
  counts: number[];
  brands: string[][];
  noBrand: number;
}

/**
 * Lampiran I of Permen LHK 29/2020 (trade names of dielectric oils
 * containing PCBs), each matched against the oil brands of one category.
 * No production year applies, so a listed brand is enough. The brands come
 * counted from the database (oil_brand_counts, migration 20261010000001).
 */
export default function PcbOilBrands({ supabase, category, reloadKey, onShowRows }: { supabase: SupabaseClient; category: InventoryCategory; reloadKey: number; onShowRows: (filters: Partial<InventoryFilters>) => void }) {
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Away from the oil page the list is a check, so it opens on the matches.
  const [onlyFound, setOnlyFound] = useState(category !== 'minyak_dielektrik');
  const [opening, setOpening] = useState<number | null>(null);
  const { what, unit } = SUBJECT[category];

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('oil_brand_counts', { p_table: category }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) { setError(rpcError.message); return; }
      const next: Found = { counts: PCB_OIL_BRANDS.map(() => 0), brands: PCB_OIL_BRANDS.map(() => []), noBrand: 0 };
      for (const row of (data ?? []) as Array<{ merek: string | null; total: number }>) {
        if (!row.merek) { next.noBrand += Number(row.total); continue; }
        const index = matchOil(row.merek);
        if (index < 0) continue;
        next.counts[index] += Number(row.total);
        next.brands[index].push(row.merek);
      }
      setFound(next);
      setError(null);
    });
    return () => { cancelled = true; };
  }, [supabase, category, reloadKey]);

  /** The rows of the given stored brands, opened in the table. */
  const show = async (brands: string[], label: string, key: number) => {
    setOpening(key);
    const { data, error: rowsError } = await supabase.from(category).select('id').in('merek_minyak_dielektrik', brands).limit(MAX_LINK_IDS);
    setOpening(null);
    if (rowsError) { setError(rowsError.message); return; }
    onShowRows({ mapPoint: { ids: (data ?? []).map((row) => row.id as string), label } });
  };

  const total = found ? found.counts.reduce((sum, count) => sum + count, 0) : 0;
  const allBrands = found ? found.brands.flat() : [];
  const matchedNames = found ? found.counts.filter((count) => count > 0).length : 0;
  const names = PCB_OIL_BRANDS.map((name, index) => ({ name, index, count: found?.counts[index] ?? 0 })).filter((entry) => !onlyFound || entry.count > 0);
  const linkable = (count: number) => count > 0 && count <= MAX_LINK_IDS;

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Daftar Nama Dagang Minyak Dielektrik yang Mengandung PCBs</h3>
            <p className="text-xs font-medium text-slate-500">Lampiran I Permen LHK No. P.29/MENLHK/SETJEN/PLB.3/12/2020, dicocokkan dengan {what} di data</p>
          </div>
        </div>
        <div role="group" aria-label="Tampilkan" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
          {[{ key: false, label: `Semua (${PCB_OIL_BRANDS.length})` }, { key: true, label: `Ditemukan di data (${matchedNames})` }].map((option) => (
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
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Gagal mencocokkan merek minyak: {error}. Pastikan migrasi 20261010000001_oil_brand_counts sudah dijalankan.</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!found || !linkable(total) || opening !== null}
              onClick={() => show(allBrands, 'Lampiran I: merek minyak tercantum', -1)}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-rose-800 transition-colors enabled:cursor-pointer enabled:hover:brightness-95 focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"><CircleAlert className="h-3.5 w-3.5" /> Merek minyak tercantum di lampiran</span>
              <span className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tracking-tight">{found ? total.toLocaleString('id-ID') : '…'}</span>
                <span className="text-sm opacity-80">{unit}</span>
                {opening === -1 && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </span>
            </button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"><CircleDashed className="h-3.5 w-3.5" /> Merek minyak kosong</span>
              <span className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tracking-tight">{found ? found.noBrand.toLocaleString('id-ID') : '…'}</span>
                <span className="text-sm opacity-80">{unit} · tidak bisa dicek</span>
              </span>
            </div>
          </div>

          {names.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-6 py-8 text-center text-xs text-slate-500">
              {found ? `Belum ada ${what} di data yang tercantum di Lampiran I.` : 'Mencocokkan…'}
            </p>
          ) : (
            <ol className="grid grid-cols-1 gap-x-6 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {names.map(({ name, index, count }) => (
                <li key={index} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${count > 0 ? 'bg-rose-50' : ''}`}>
                  <span className="w-7 shrink-0 text-right tabular-nums text-slate-400">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800" title={count > 0 ? `Merek di data: ${found!.brands[index].join(', ')}` : name}>{name}</span>
                  {count > 0 && (
                    <button
                      type="button"
                      disabled={!linkable(count) || opening !== null}
                      onClick={() => show(found!.brands[index], `Lampiran I: ${name}`, index)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-rose-800 enabled:cursor-pointer enabled:hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-emerald-500"
                    >
                      {opening === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleAlert className="h-3 w-3" />}{count.toLocaleString('id-ID')}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Nama dagang dicocokkan sebagai kata utuh pada merek minyak. Tulisan yang menyatakan bebas PCBs (misalnya &quot;non pcb oil&quot;) tidak dihitung sebagai nama &quot;PCB&quot;.
            Arahkan kursor ke nama yang ditemukan untuk melihat merek aslinya, dan klik angkanya untuk melihat datanya di tabel (hingga {MAX_LINK_IDS} {unit}).
          </p>
        </>
      )}
    </section>
  );
}
