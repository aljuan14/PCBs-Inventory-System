'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { categoryTint, getCategoryColor, getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import { PRE_1997_FILTER, SCOPE_FIGURES, TRAFO_CATEGORIES, riskCountsFor, sumStats, type CategoryFilter, type InventoryFilters, type InventoryStats, type YearScope } from '@/lib/inventory-query';
import { RISK_CLASSES, formatPercent, type RiskCounts } from '@/components/DashboardCharts';

const formatNumber = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Opens the rows behind a figure in the table. */
type SelectRows = (filters: Partial<InventoryFilters>, category: CategoryFilter) => void;

/** What each year scope covers, for subtitles and notes. */
export const SCOPE_TEXT: Record<YearScope, string> = { all: 'semua tahun produksi, termasuk yang tidak diketahui', pre1997: 'buatan sebelum 1997', from1997: 'buatan 1997 ke atas' };

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
export const PRE_1997_COLOR = '#eb6834';
export const NEWER_COLOR = '#2a9d8f';
export const UNKNOWN_COLOR = '#b4b2a9';

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white p-5';

function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
    </div>
  );
}

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
              {/* The range on its own line, so a narrow card never cuts it off. */}
              <span className="min-w-0 flex-1 text-slate-600">
                <span className="block truncate">{segment.label}</span>
                {segment.hint && <span className="block truncate text-[11px] leading-tight text-slate-400">{segment.hint}</span>}
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

const YEAR_OPTIONS: { key: YearScope; label: string; hint: string; color: string }[] = [
  { key: 'all', label: 'Semua', hint: 'Semua tahun', color: '#64748b' },
  { key: 'pre1997', label: '< 1997', hint: 'Sebelum 1997', color: PRE_1997_COLOR },
  { key: 'from1997', label: '≥ 1997', hint: '1997 ke atas', color: NEWER_COLOR },
];

/**
 * The same switch floating on the right edge, for when the bar at the top
 * has scrolled away: the choice stays in sight beside the cards it drives.
 * Hidden on small screens for now.
 */
export function YearRail({ value, onChange, visible }: { value: YearScope; onChange: (value: YearScope) => void; visible: boolean }) {
  return (
    <div
      role="group"
      aria-label="Tahun pembuatan"
      aria-hidden={!visible}
      className={`fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur transition-all duration-200 lg:flex ${visible ? 'opacity-100' : 'pointer-events-none translate-x-4 opacity-0'}`}
    >
      <span className="px-1 pb-0.5 pt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tahun</span>
      {YEAR_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          tabIndex={visible ? 0 : -1}
          aria-pressed={value === option.key}
          title={option.hint}
          onClick={() => onChange(option.key)}
          className={`flex w-16 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-500 ${value === option.key ? 'text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
          style={value === option.key ? { backgroundColor: option.color } : undefined}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: value === option.key ? '#ffffff' : option.color }} />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The dashboard's one production-year switch: all, before 1997, 1997 on. */
export function YearToggle({ value, onChange }: { value: YearScope; onChange: (value: YearScope) => void }) {
  const options: { key: YearScope; label: string }[] = [{ key: 'all', label: 'Semua' }, { key: 'pre1997', label: '< 1997' }, { key: 'from1997', label: '≥ 1997' }];
  return (
    <div role="group" aria-label="Tahun pembuatan" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-500 ${value === option.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Used / not used transformers: their count, then production years, then Status PCBs. */
function TransformerColumn({ category, stats, grandTotal, scope, loading, onSelect }: {
  category: InventoryCategory;
  stats: InventoryStats | null;
  grandTotal: number;
  scope: YearScope;
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

  const counts: RiskCounts = riskCountsFor(stats, [category], scope);
  const statusTotal = RISK_CLASSES.reduce((sum, risk) => sum + counts[risk.key], 0);
  const statusTested = statusTotal - counts.untested;
  // Three results only: at or under the 50 ppm threshold, above it, not tested.
  const [safe, , high, untested] = RISK_CLASSES;
  const scoped = SCOPE_FIGURES[scope].filters;
  const results: Segment[] = [
    { key: 'upto50', label: 'Di bawah ambang', hint: '≤ 50 ppm', value: counts.safe + counts.moderate, color: safe.color, icon: safe.icon, iconClass: safe.iconClass, filters: { pcbRange: 'upto50', ...scoped } },
    { key: 'high', label: high.label, hint: high.range, value: counts.high, color: high.color, icon: high.icon, iconClass: high.iconClass, filters: { pcbRange: 'high', ...scoped } },
    { key: 'untested', label: untested.label, value: counts.untested, color: untested.color, icon: untested.icon, iconClass: untested.iconClass, filters: { pcbRange: 'untested', ...scoped } },
  ];

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border p-3" style={categoryTint(category)}>
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

      <div className={CARD_CLASS}>
        <CardTitle title="Menurut tahun produksi" subtitle="Klik untuk melihat datanya di tabel" />
        <div className="mt-4">
          {loading ? <Skeleton className="h-36" /> : total === 0
            ? <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500">Belum ada data.</p>
            : <Donut total={total} segments={years} center={{ value: formatNumber(total), label: 'trafo' }} onSelect={select} />}
        </div>
      </div>

      <div className={CARD_CLASS}>
        <CardTitle
          title="Hasil Pengujian Minyak Dielektrik"
          subtitle={`Pada trafo yang ${category === 'transformator_digunakan' ? 'masih digunakan' : 'sudah tidak digunakan'}, ${SCOPE_TEXT[scope]}`}
        />
        <div className="mt-4">
          {loading ? <Skeleton className="h-36" /> : statusTotal === 0
            ? <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500">{scope === 'all' ? 'Belum ada data.' : `Belum ada trafo ${SCOPE_TEXT[scope]}.`}</p>
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

/** One headline figure (all transformers, kapasitor, minyak dielektrik), opening its rows in the table. */
function FigureTile({ category, label, color, value, unit, note, filters = {}, loading, onSelect }: { category: CategoryFilter; label: string; color?: string; value: string; unit: string; note?: string; filters?: Partial<InventoryFilters>; loading: boolean; onSelect?: SelectRows }) {
  return (
    <button
      type="button"
      disabled={!onSelect}
      onClick={() => onSelect?.(filters, category)}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors enabled:cursor-pointer enabled:hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-emerald-500"
    >
      <span className="flex items-center gap-2">
        {color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        {onSelect && <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />}
      </span>
      <span className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight text-slate-900">{loading ? '…' : value}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </span>
      {note && !loading && <span className="mt-1 text-[11px] text-slate-400">{note}</span>}
    </button>
  );
}

/**
 * The transformers read top to bottom: all of them, used / not used, their
 * production years, then their Status PCBs. Each card breaks down the one
 * above it. Kapasitor and minyak dielektrik sit beside the total as figures.
 */
export default function InventorySummary({ stats, scope, loading, onSelect }: { stats: InventoryStats | null; scope: YearScope; loading: boolean; onSelect?: SelectRows }) {
  const { count, volume, filters } = SCOPE_FIGURES[scope];
  const grandTotal = TRAFO_CATEGORIES.reduce((sum, category) => sum + (stats?.[category].total ?? 0), 0);
  const figure = (categories: InventoryCategory[], key: keyof InventoryStats[InventoryCategory]) => (stats ? sumStats(stats, categories, key) : 0);
  // Rows without a production year are in "all" only; said under the figure.
  const withoutYear = (categories: InventoryCategory[], unit: string) => {
    const missing = figure(categories, 'unknown_year');
    return scope !== 'all' && missing > 0 ? `${formatNumber(missing)} ${unit} tanpa tahun tidak dihitung` : null;
  };
  const oilRows = figure(['minyak_dielektrik'], count);

  return (
    <section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FigureTile category="transformator" label="Total Transformator" value={formatNumber(figure(TRAFO_CATEGORIES, count))} unit="trafo" note={withoutYear(TRAFO_CATEGORIES, 'trafo') ?? 'Masih digunakan dan tidak digunakan'} filters={filters} loading={loading} onSelect={onSelect} />
        <FigureTile category="kapasitor" label={getCategoryLabel('kapasitor')} color={getCategoryColor('kapasitor')} value={formatNumber(figure(['kapasitor'], count))} unit="unit" note={withoutYear(['kapasitor'], 'unit') ?? undefined} filters={filters} loading={loading} onSelect={onSelect} />
        <FigureTile category="minyak_dielektrik" label={getCategoryLabel('minyak_dielektrik')} color={getCategoryColor('minyak_dielektrik')} value={formatNumber(figure(['minyak_dielektrik'], volume))} unit="liter" note={`${formatNumber(oilRows)} data wadah/sampel${withoutYear(['minyak_dielektrik'], 'data') ? ` · ${withoutYear(['minyak_dielektrik'], 'data')}` : ''}`} filters={filters} loading={loading} onSelect={onSelect} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {TRAFO_CATEGORIES.map((category) => (
          <div key={category}>
            <TransformerColumn
              category={category}
              stats={stats}
              grandTotal={grandTotal}
              scope={scope}
              loading={loading}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
