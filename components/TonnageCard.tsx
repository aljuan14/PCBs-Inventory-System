'use client';

import { useState } from 'react';
import { ChevronRight, Scale } from 'lucide-react';
import { INVENTORY_CATEGORIES, getCategoryColor } from '@/lib/inventory';
import { PRE_1997_FILTER, sumStats, TRAFO_CATEGORIES, type CategoryFilter, type CategoryStats, type InventoryFilters, type InventoryStats } from '@/lib/inventory-query';
import { formatPercent } from '@/components/DashboardCharts';

/** kg as tons: one decimal below 100 t, whole tons above. */
const formatTons = (kg: number) => (kg / 1000).toLocaleString('id-ID', { maximumFractionDigits: kg < 100_000 ? 1 : 0 });
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Tonnage of transformers from the total weight in the inventory form
 * (migration 20260929000004): all of it, per equipment type, and of the
 * equipment made before 1997.
 */
export default function TonnageCard({ stats, loading, onSelect }: {
  stats: InventoryStats | null;
  loading: boolean;
  onSelect?: (filters: Partial<InventoryFilters>, type: CategoryFilter) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const sum = (key: keyof CategoryStats) => (stats ? sumStats(stats, TRAFO_CATEGORIES, key) : 0);
  const total = sum('weight_kg');
  const weighed = sum('with_weight');
  const units = sum('total');
  const pre1997 = sum('pre1997_weight_kg');
  const types = TRAFO_CATEGORIES.map((category) => ({ category, label: INVENTORY_CATEGORIES.find((entry) => entry.key === category)?.shortLabel ?? category, color: getCategoryColor(category), kg: stats?.[category].weight_kg ?? 0, pre1997Kg: stats?.[category].pre1997_weight_kg ?? 0 }));

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5 flex items-start gap-3">
        <Scale className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        <div>
          <h3 className="text-base font-bold text-slate-900">Tonase Transformator</h3>
          <p className="text-xs font-medium text-slate-500">Berat total dari formulir inventarisasi{onSelect ? ' · klik untuk melihat datanya di tabel' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
      ) : weighed === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-8 text-center text-xs text-slate-500">Belum ada berat yang tercatat untuk transformator.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight text-slate-900">{formatTons(total)}</span>
              <span className="text-sm text-slate-500">ton</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              dari {weighed.toLocaleString('id-ID')} trafo yang beratnya tercatat ({formatPercent(share(weighed, units))} dari {units.toLocaleString('id-ID')} trafo)
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Per jenis trafo</div>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded" onMouseLeave={() => setActive(null)}>
              {types.filter((type) => type.kg > 0).map((type) => (
                <div
                  key={type.category}
                  title={`${type.label}: ${formatTons(type.kg)} ton (${formatPercent(share(type.kg, total))})`}
                  onMouseEnter={() => setActive(type.category)}
                  className="h-full min-w-[3px] transition-opacity"
                  style={{ flexGrow: type.kg, flexBasis: 0, backgroundColor: type.color, opacity: active && active !== type.category ? 0.35 : 1 }}
                />
              ))}
            </div>
            <ul className="mt-2">
              {types.map((type) => (
                <li key={type.category}>
                  <button
                    type="button"
                    disabled={!onSelect || type.kg === 0}
                    onClick={() => onSelect?.({}, type.category)}
                    onMouseEnter={() => setActive(type.category)}
                    onMouseLeave={() => setActive(null)}
                    className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${active === type.category ? 'bg-slate-50' : ''}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: type.color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-600">{type.label}</span>
                    <span className="font-semibold tabular-nums text-slate-800">{formatTons(type.kg)} ton</span>
                    <span className="w-12 text-right tabular-nums text-slate-500">{formatPercent(share(type.kg, total))}</span>
                    {onSelect && <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            disabled={!onSelect || pre1997 === 0}
            onClick={() => onSelect?.(PRE_1997_FILTER, 'transformator')}
            className="group flex flex-col justify-start rounded-xl bg-slate-50 px-4 py-3 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-500"
          >
            <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Trafo buatan sebelum 1997
              {onSelect && <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-enabled:group-hover:text-slate-500" />}
            </span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">{formatTons(pre1997)}</span>
              <span className="text-sm text-slate-500">ton</span>
              <span className="ml-1 text-xs text-slate-500">({formatPercent(share(pre1997, total))} dari total)</span>
            </span>
            <span className="mt-1 text-[11px] text-slate-500">
              {types.map((type) => `${formatTons(type.pre1997Kg)} ton ${type.label.toLowerCase()}`).join(' · ')}
            </span>
          </button>
        </div>
      )}
      {!loading && weighed > 0 && (
        <p className="mt-4 text-[11px] text-slate-400">
          Trafo tanpa berat tercatat tidak termasuk; berat 0 di formulir dianggap kosong. Rincian berat kering dan minyak ada di tabel.
        </p>
      )}
    </section>
  );
}
