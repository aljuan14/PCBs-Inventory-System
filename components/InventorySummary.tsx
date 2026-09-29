'use client';

import { useState } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { getCategoryColor, getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import { PRE_1997_FILTER, type CategoryStats, type InventoryFilters, type InventoryStats } from '@/lib/inventory-query';
import { RISK_CLASSES, formatPercent } from '@/components/DashboardCharts';

const formatNumber = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Opens the rows behind a figure in the table. */
type SelectRows = (filters: Partial<InventoryFilters>, category: InventoryCategory) => void;

interface Segment {
  key: string;
  label: string;
  /** Range or note after the label, e.g. "< 2 ppm". */
  hint?: string;
  value: number;
  color: string;
  icon?: LucideIcon;
  iconClass?: string;
  filters: Partial<InventoryFilters>;
}

// The pre-1997 segment wears the card's category colour; the rest are grays,
// the light one meaning "not known" as in the risk donut. Checked with the
// dataviz palette validator: every adjacent pair separates under CVD and
// normal vision; the legend below always carries the values.
const NEWER_COLOR = '#94a3b8';
const UNKNOWN_COLOR = '#cbd5e1';

/** A part-to-whole bar with its legend; every legend row opens its rows in the table. */
function CompositionBar({ title, total, segments, onSelect }: { title: string; total: number; segments: Segment[]; onSelect?: (filters: Partial<InventoryFilters>) => void }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded bg-white" onMouseLeave={() => setActive(null)}>
        {segments.filter((segment) => segment.value > 0).map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label}: ${formatNumber(segment.value)} (${formatPercent(share(segment.value, total))})`}
            onMouseEnter={() => setActive(segment.key)}
            className="h-full min-w-[3px] transition-opacity"
            style={{ flexGrow: segment.value, flexBasis: 0, backgroundColor: segment.color, opacity: active && active !== segment.key ? 0.35 : 1 }}
          />
        ))}
      </div>
      <ul className="mt-2">
        {segments.map((segment) => {
          const Icon = segment.icon;
          return (
            <li key={segment.key}>
              <button
                type="button"
                disabled={!onSelect || segment.value === 0}
                onClick={() => onSelect?.(segment.filters)}
                onMouseEnter={() => setActive(segment.key)}
                onMouseLeave={() => setActive(null)}
                className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${active === segment.key ? 'bg-slate-50' : ''}`}
              >
                {Icon
                  ? <Icon className={`h-3.5 w-3.5 shrink-0 ${segment.iconClass ?? ''}`} />
                  : <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />}
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {segment.label}
                  {segment.hint && <span className="ml-1 text-slate-400">{segment.hint}</span>}
                </span>
                <span className="font-semibold tabular-nums text-slate-800">{formatNumber(segment.value)}</span>
                <span className="w-12 text-right tabular-nums text-slate-500">{formatPercent(share(segment.value, total))}</span>
                {onSelect && <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TransformerCard({ category, summary, loading, onSelect }: { category: InventoryCategory; summary: CategoryStats | undefined; loading: boolean; onSelect?: SelectRows }) {
  const color = getCategoryColor(category);
  const total = summary?.total ?? 0;
  const tested = summary?.tested ?? 0;
  const select = onSelect && ((filters: Partial<InventoryFilters>) => onSelect(filters, category));
  const years: Segment[] = [
    { key: 'pre1997', label: 'Sebelum 1997', value: summary?.before_1997 ?? 0, color, filters: PRE_1997_FILTER },
    { key: 'from1997', label: '1997 ke atas', value: summary?.from_1997 ?? 0, color: NEWER_COLOR, filters: { yearRange: 'from1997' } },
    { key: 'unknown', label: 'Tidak diketahui', value: summary?.unknown_year ?? 0, color: UNKNOWN_COLOR, filters: { yearRange: 'unknown' } },
  ];
  const results: Segment[] = RISK_CLASSES.map((risk) => ({
    key: risk.key,
    label: risk.label,
    hint: risk.key === 'untested' ? undefined : risk.range,
    value: risk.key === 'untested' ? total - tested : summary?.[`risk_${risk.key}` as const] ?? 0,
    color: risk.color,
    icon: risk.icon,
    iconClass: risk.iconClass,
    filters: { pcbRange: risk.key },
  }));

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold text-slate-900">{getCategoryLabel(category)}</h3>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight text-slate-900">{loading ? '…' : formatNumber(total)}</span>
        <span className="text-xs text-slate-500">trafo</span>
      </div>
      {loading ? (
        <div className="mt-4 h-48 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <CompositionBar title="Jumlah trafo menurut tahun produksi" total={total} segments={years} onSelect={select} />
          <CompositionBar title={`Hasil uji PCBs (semua tahun) · ${formatPercent(share(tested, total))} sudah diuji`} total={total} segments={results} onSelect={select} />
        </div>
      )}
    </div>
  );
}

/** A category with one figure (kapasitor, minyak dielektrik), opening its rows in the table. */
function FigureTile({ category, value, unit, note, loading, onSelect }: { category: InventoryCategory; value: string; unit: string; note?: string; loading: boolean; onSelect?: SelectRows }) {
  return (
    <button
      type="button"
      disabled={!onSelect}
      onClick={() => onSelect?.({}, category)}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors enabled:cursor-pointer enabled:hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-emerald-500"
    >
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(category) }} />
        <span className="text-sm font-semibold text-slate-900">{getCategoryLabel(category)}</span>
        {onSelect && <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />}
      </span>
      <span className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-slate-900">{loading ? '…' : value}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </span>
      {note && !loading && <span className="mt-1 text-[11px] text-slate-400">{note}</span>}
    </button>
  );
}

export default function InventorySummary({ stats, loading, onSelect }: { stats: InventoryStats | null; loading: boolean; onSelect?: SelectRows }) {
  const oil = stats?.minyak_dielektrik;
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_13rem]">
      <TransformerCard category="transformator_digunakan" summary={stats?.transformator_digunakan} loading={loading} onSelect={onSelect} />
      <TransformerCard category="transformator_tidak_digunakan" summary={stats?.transformator_tidak_digunakan} loading={loading} onSelect={onSelect} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2 xl:col-span-1 xl:grid-cols-1 xl:content-start">
        <FigureTile category="kapasitor" value={formatNumber(stats?.kapasitor.total ?? 0)} unit="unit" loading={loading} onSelect={onSelect} />
        <FigureTile category="minyak_dielektrik" value={formatNumber(oil?.volume_l ?? 0)} unit="liter" note={`${formatNumber(oil?.total ?? 0)} data wadah/sampel`} loading={loading} onSelect={onSelect} />
      </div>
    </section>
  );
}
