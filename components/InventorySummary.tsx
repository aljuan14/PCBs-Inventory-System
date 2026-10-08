'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { getCategoryColor, getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import { PRE_1997_FILTER, TRAFO_CATEGORIES, pre1997RiskCounts, type CategoryFilter, type InventoryFilters, type InventoryStats } from '@/lib/inventory-query';
import { RISK_CLASSES, formatPercent, type RiskCounts } from '@/components/DashboardCharts';

const formatNumber = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Opens the rows behind a figure in the table. */
type SelectRows = (filters: Partial<InventoryFilters>, category: CategoryFilter) => void;

/** Status PCBs over the transformers made before 1997, or over all of them. */
type StatusScope = 'pre1997' | 'all';

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

// Production years: orange for the years that may hold PCBs, teal for the
// newer ones, warm gray for "not known" (the same gray as "Belum diuji").
// Checked with the dataviz palette validator against the white card: CVD
// ΔE 9.6, normal vision 16.7; the legend beside always carries the values.
const PRE_1997_COLOR = '#eb6834';
const NEWER_COLOR = '#2a9d8f';
const UNKNOWN_COLOR = '#b4b2a9';

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white p-5';
const TRAFO_LABEL: Record<string, string> = { transformator_digunakan: 'Masih digunakan', transformator_tidak_digunakan: 'Tidak digunakan' };

function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
    </div>
  );
}

/** The thin line joining a card to the one it breaks down. */
const Connector = () => <div aria-hidden className="mx-auto h-4 w-px bg-slate-300" />;

const Skeleton = ({ className }: { className: string }) => <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;

/** Legend rows; each opens its rows in the table. */
function Legend({ segments, total, active, setActive, onSelect }: { segments: Segment[]; total: number; active: string | null; setActive: (key: string | null) => void; onSelect?: (filters: Partial<InventoryFilters>, key: string) => void }) {
  return (
    <ul className="w-full min-w-0">
      {segments.map((segment) => {
        const Icon = segment.icon;
        return (
          <li key={segment.key}>
            <button
              type="button"
              disabled={!onSelect || segment.value === 0}
              onClick={() => onSelect?.(segment.filters, segment.key)}
              onMouseEnter={() => setActive(segment.key)}
              onMouseLeave={() => setActive(null)}
              className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${active === segment.key ? 'bg-slate-50' : ''}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
              {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${segment.iconClass ?? ''}`} />}
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
  );
}

/** A part-to-whole bar with its legend. */
function CompositionBar({ total, segments, onSelect }: { total: number; segments: Segment[]; onSelect?: (filters: Partial<InventoryFilters>, key: string) => void }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded bg-slate-50" onMouseLeave={() => setActive(null)}>
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
      <div className="mt-2"><Legend segments={segments} total={total} active={active} setActive={setActive} onSelect={onSelect} /></div>
    </div>
  );
}

/** A donut with its legend beside; the centre shows `center`, or the hovered share. */
function Donut({ total, segments, center, onSelect }: { total: number; segments: Segment[]; center: { value: string; label: string }; onSelect?: (filters: Partial<InventoryFilters>, key: string) => void }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = segments.filter((segment) => segment.value > 0);
  const activeSegment = segments.find((segment) => segment.key === active);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0" onMouseLeave={() => setActive(null)}>
        <PieChart width={144} height={144}>
          <Pie
            data={shown.map((segment) => ({ key: segment.key, name: segment.label, value: segment.value }))}
            dataKey="value"
            innerRadius="64%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive={false}
            onMouseEnter={(_, index) => setActive(shown[index].key)}
            onClick={(_, index) => onSelect?.(shown[index].filters, shown[index].key)}
            className={onSelect ? 'cursor-pointer' : undefined}
          >
            {shown.map((segment) => (
              <Cell key={segment.key} fill={segment.color} fillOpacity={active && active !== segment.key ? 0.35 : 1} />
            ))}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {activeSegment ? (
            <>
              <span className="text-xl font-semibold tabular-nums text-slate-900">{formatPercent(share(activeSegment.value, total))}</span>
              <span className="max-w-20 text-[10px] leading-tight text-slate-500">{activeSegment.label}</span>
            </>
          ) : (
            <>
              <span className="text-xl font-semibold tabular-nums text-slate-900">{center.value}</span>
              <span className="max-w-20 text-[10px] leading-tight text-slate-500">{center.label}</span>
            </>
          )}
        </div>
      </div>
      <Legend segments={segments} total={total} active={active} setActive={setActive} onSelect={onSelect} />
    </div>
  );
}

function ScopeToggle({ value, onChange }: { value: StatusScope; onChange: (value: StatusScope) => void }) {
  const options: { key: StatusScope; label: string }[] = [{ key: 'pre1997', label: '< 1997' }, { key: 'all', label: 'Semua' }];
  return (
    <div role="group" aria-label="Cakupan status PCBs" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-500 ${value === option.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Used / not used transformers: their count, then production years, then Status PCBs. */
function TransformerColumn({ category, stats, grandTotal, statusScope, setStatusScope, loading, onSelect }: {
  category: InventoryCategory;
  stats: InventoryStats | null;
  grandTotal: number;
  statusScope: StatusScope;
  setStatusScope: (value: StatusScope) => void;
  loading: boolean;
  onSelect?: SelectRows;
}) {
  const color = getCategoryColor(category);
  const summary = stats?.[category];
  const total = summary?.total ?? 0;
  const select = onSelect && ((filters: Partial<InventoryFilters>) => onSelect(filters, category));

  const years: Segment[] = [
    { key: 'pre1997', label: 'Sebelum 1997', value: summary?.before_1997 ?? 0, color: PRE_1997_COLOR, filters: PRE_1997_FILTER },
    { key: 'from1997', label: '1997 ke atas', value: summary?.from_1997 ?? 0, color: NEWER_COLOR, filters: { yearRange: 'from1997' } },
    { key: 'unknown', label: 'Tidak diketahui', value: summary?.unknown_year ?? 0, color: UNKNOWN_COLOR, filters: { yearRange: 'unknown' } },
  ];

  const pre1997 = statusScope === 'pre1997';
  const counts: RiskCounts = pre1997
    ? pre1997RiskCounts(stats, [category])
    : { safe: summary?.risk_safe ?? 0, moderate: summary?.risk_moderate ?? 0, high: summary?.risk_high ?? 0, untested: total - (summary?.tested ?? 0) };
  const statusTotal = RISK_CLASSES.reduce((sum, risk) => sum + counts[risk.key], 0);
  const statusTested = statusTotal - counts.untested;
  const results: Segment[] = RISK_CLASSES.map((risk) => ({
    key: risk.key,
    label: risk.label,
    hint: risk.key === 'untested' ? undefined : risk.range,
    value: counts[risk.key],
    color: risk.color,
    icon: risk.icon,
    iconClass: risk.iconClass,
    filters: { pcbRange: risk.key, ...(pre1997 ? PRE_1997_FILTER : {}) },
  }));

  return (
    <div className="flex flex-col">
      <button
        type="button"
        disabled={!onSelect}
        onClick={() => onSelect?.({}, category)}
        className={`${CARD_CLASS} group text-left transition-colors enabled:cursor-pointer enabled:hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-emerald-500`}
      >
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-slate-900">{getCategoryLabel(category)}</span>
          {onSelect && <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />}
        </span>
        <span className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight text-slate-900">{loading ? '…' : formatNumber(total)}</span>
          <span className="text-xs text-slate-500">trafo</span>
          {!loading && <span className="ml-auto text-xs font-semibold tabular-nums text-slate-500">{formatPercent(share(total, grandTotal))} dari total</span>}
        </span>
      </button>

      <Connector />

      <div className={CARD_CLASS}>
        <CardTitle title="Menurut tahun produksi" subtitle="Klik untuk melihat datanya di tabel" />
        <div className="mt-4">
          {loading ? <Skeleton className="h-36" /> : total === 0
            ? <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500">Belum ada data.</p>
            : <Donut total={total} segments={years} center={{ value: formatNumber(total), label: 'trafo' }} onSelect={select} />}
        </div>
      </div>

      <Connector />

      <div className={CARD_CLASS}>
        <div className="flex items-start justify-between gap-3">
          <CardTitle
            title="Status PCBs"
            subtitle={pre1997 ? 'Trafo buatan sebelum 1997' : 'Semua trafo, termasuk yang tahun produksinya tidak diketahui'}
          />
          <ScopeToggle value={statusScope} onChange={setStatusScope} />
        </div>
        <div className="mt-4">
          {loading ? <Skeleton className="h-36" /> : statusTotal === 0
            ? <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500">{pre1997 ? 'Belum ada trafo buatan sebelum 1997.' : 'Belum ada data.'}</p>
            : <>
                <Donut total={statusTotal} segments={results} center={{ value: formatPercent(share(statusTested, statusTotal)), label: 'sudah diuji' }} onSelect={select} />
                <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">{formatPercent(share(statusTested, statusTotal))}</span> sudah diuji ({formatNumber(statusTested)} dari {formatNumber(statusTotal)} trafo)
                </p>
              </>}
        </div>
      </div>
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

/**
 * The transformers read top to bottom: all of them, used / not used, their
 * production years, then their Status PCBs. Each card breaks down the one
 * above it. Kapasitor and minyak dielektrik sit beside the total.
 */
export default function InventorySummary({ stats, loading, onSelect }: { stats: InventoryStats | null; loading: boolean; onSelect?: SelectRows }) {
  // One switch for both columns, so their Status PCBs always compare the same transformers.
  const [statusScope, setStatusScope] = useState<StatusScope>('pre1997');
  const oil = stats?.minyak_dielektrik;
  const grandTotal = TRAFO_CATEGORIES.reduce((sum, category) => sum + (stats?.[category].total ?? 0), 0);
  const split: Segment[] = TRAFO_CATEGORIES.map((category) => ({
    key: category,
    label: TRAFO_LABEL[category],
    value: stats?.[category].total ?? 0,
    color: getCategoryColor(category),
    filters: {},
  }));

  return (
    <section>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <div className={CARD_CLASS}>
          <CardTitle title="Total Transformator" subtitle="Masih digunakan dan tidak digunakan" />
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-slate-900">{loading ? '…' : formatNumber(grandTotal)}</span>
            <span className="text-xs text-slate-500">trafo</span>
          </div>
          <div className="mt-4">
            {loading ? <Skeleton className="h-20" /> : (
              <CompositionBar
                total={grandTotal}
                segments={split}
                onSelect={onSelect && ((filters, key) => onSelect(filters, key as InventoryCategory))}
              />
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <FigureTile category="kapasitor" value={formatNumber(stats?.kapasitor.total ?? 0)} unit="unit" loading={loading} onSelect={onSelect} />
          <FigureTile category="minyak_dielektrik" value={formatNumber(oil?.volume_l ?? 0)} unit="liter" note={`${formatNumber(oil?.total ?? 0)} data wadah/sampel`} loading={loading} onSelect={onSelect} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-3 md:grid-cols-2">
        {TRAFO_CATEGORIES.map((category) => (
          <div key={category}>
            <Connector />
            <TransformerColumn
              category={category}
              stats={stats}
              grandTotal={grandTotal}
              statusScope={statusScope}
              setStatusScope={setStatusScope}
              loading={loading}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
