'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { GROUP_LEVEL_LABELS, unitLabel } from '@/lib/data-quality';
import type { InventoryCategory } from '@/lib/inventory';
import { fetchInventoryCharts, type ChartFigures, type ChartGroup, type ChartYearBand, type DashboardScope, type InventoryCharts, type InventoryFilters, type PcbRange } from '@/lib/inventory-query';
import { RISK_CLASSES, formatPercent, type RiskCounts } from '@/components/DashboardCharts';
import { formatTons } from '@/components/TonnageCard';

type Measure = 'count' | 'weight';
type RiskKey = keyof RiskCounts;

// Bars beyond this fold into one "Lainnya" bar: PLN has hundreds of sub-units.
const MAX_GROUPS = 12;

const formatNumber = (value: number) => value.toLocaleString('id-ID');
const valueOf = (figures: ChartFigures, risk: RiskKey, measure: Measure) => (measure === 'count' ? figures[risk] : figures[`${risk}_kg`]);
const totalOf = (figures: ChartFigures, measure: Measure) => RISK_CLASSES.reduce((sum, risk) => sum + valueOf(figures, risk.key, measure), 0);
const formatValue = (value: number, measure: Measure) => (measure === 'count' ? `${formatNumber(value)} unit` : `${formatTons(value)} t`);

/** Top of the value axis: the next 1, 2 or 5 × 10ⁿ at or above the largest bar. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

const sumFigures = (rows: ChartFigures[]) =>
  rows.reduce<ChartFigures>(
    (sum, row) => Object.fromEntries(Object.entries(sum).map(([key, value]) => [key, value + row[key as keyof ChartFigures]])) as unknown as ChartFigures,
    { safe: 0, moderate: 0, high: 0, untested: 0, safe_kg: 0, moderate_kg: 0, high_kg: 0, untested_kg: 0 },
  );

/** Five-year band as words, e.g. "1992–1996". */
function bandLabel(band: ChartYearBand) {
  if (band.yearFrom === null) return 'Tanpa tahun produksi';
  if (band.yearFrom === 0) return 'Sebelum 1972';
  return `${band.yearFrom}–${band.yearFrom + 4}`;
}

/** Table filter for the transformers of one year band. */
function bandFilter(band: ChartYearBand): Partial<InventoryFilters> {
  if (band.yearFrom === null) return { yearRange: 'unknown' };
  if (band.yearFrom === 0) return { yearRange: 'custom', yearMin: null, yearMax: 1971 };
  return { yearRange: 'custom', yearMin: band.yearFrom, yearMax: band.yearFrom + 4 };
}

/** Hover card of one bar: every risk class with its value and share. */
function Breakdown({ title, figures, measure, className }: { title: string; figures: ChartFigures; measure: Measure; className: string }) {
  const total = totalOf(figures, measure);
  return (
    <div role="tooltip" className={`pointer-events-none absolute z-20 hidden w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg group-hover:block group-focus-within:block ${className}`}>
      <p className="mb-2 text-xs font-semibold text-slate-900">{title}</p>
      <ul className="space-y-1">
        {RISK_CLASSES.map((risk) => {
          const value = valueOf(figures, risk.key, measure);
          return (
            <li key={risk.key} className="flex items-center gap-2 text-[11px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: risk.color }} />
              <span className="min-w-0 flex-1 truncate text-slate-600">{risk.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{formatValue(value, measure)}</span>
              <span className="w-11 text-right tabular-nums text-slate-500">{formatPercent(total > 0 ? (value / total) * 100 : 0)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span>Total</span>
        <span className="font-semibold tabular-nums text-slate-900">{formatValue(total, measure)}</span>
      </p>
    </div>
  );
}

/**
 * Risk-class segments of one bar, 2px apart, filling their container in
 * proportion to their values. Each segment is a button when `onSelect` is given.
 */
function Segments({ figures, measure, vertical, onSelect, label }: {
  figures: ChartFigures;
  measure: Measure;
  vertical?: boolean;
  onSelect?: (risk: RiskKey) => void;
  label: string;
}) {
  const segments = RISK_CLASSES.filter((risk) => valueOf(figures, risk.key, measure) > 0);
  // Stacked from the baseline: bottom-up for columns, left to right for rows.
  return (
    <div className={`flex h-full w-full gap-0.5 ${vertical ? 'flex-col-reverse' : ''}`}>
      {segments.map((risk) => {
        const value = valueOf(figures, risk.key, measure);
        const style = { backgroundColor: risk.color, flex: `${value} 1 0`, [vertical ? 'minHeight' : 'minWidth']: 2 };
        const className = `rounded-[3px] ${vertical ? 'w-full' : 'h-full'}`;
        return onSelect ? (
          <button
            key={risk.key}
            type="button"
            aria-label={`${label}: ${risk.label}, ${formatValue(value, measure)}`}
            onClick={() => onSelect(risk.key)}
            className={`${className} cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500`}
            style={style}
          />
        ) : (
          <span key={risk.key} className={className} style={style} />
        );
      })}
    </div>
  );
}

function GroupBars({ charts, scope, measure, onSelectGroup, onDrill }: {
  charts: InventoryCharts;
  scope: DashboardScope;
  measure: Measure;
  onSelectGroup?: DistributionChartsProps['onSelectGroup'];
  onDrill?: DistributionChartsProps['onDrill'];
}) {
  const rows = useMemo(() => {
    const sorted = [...charts.groups].sort((a, b) => totalOf(b, measure) - totalOf(a, measure));
    if (sorted.length <= MAX_GROUPS) return sorted.map((group) => ({ group, rest: 0 }));
    const rest = sorted.slice(MAX_GROUPS - 1);
    const other: ChartGroup = { ...sumFigures(rest), key: null, label: null };
    return [...sorted.slice(0, MAX_GROUPS - 1).map((group) => ({ group, rest: 0 })), { group: other, rest: rest.length }];
  }, [charts.groups, measure]);
  const scale = niceMax(Math.max(0, ...rows.map(({ group }) => totalOf(group, measure))));
  const levelLabel = GROUP_LEVEL_LABELS[charts.level].toLowerCase();

  // The scope a bar stands for, one level below the current one.
  const targetOf = (group: ChartGroup): DashboardScope | null => {
    if (group.key === null) return null;
    if (charts.level === 'company') return { companyId: group.key, unit: null, subUnit: null };
    if (charts.level === 'unit') return { companyId: charts.companyId, unit: group.key, subUnit: null };
    return { companyId: charts.companyId, unit: scope.unit, subUnit: group.key };
  };

  if (scope.subUnit) {
    return <p className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 text-center text-xs text-slate-500">Filter sudah sampai sub-unit. Pilih tingkat yang lebih luas untuk membandingkan antar unit.</p>;
  }

  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map(({ group, rest }, index) => {
          const target = targetOf(group);
          const name = rest > 0 ? `Lainnya (${formatNumber(rest)} ${levelLabel})` : unitLabel(group.label);
          const total = totalOf(group, measure);
          const canDrill = onDrill && target && charts.level !== 'sub_unit';
          return (
            <li key={rest > 0 ? '__rest' : group.key ?? '__none'} className="group relative flex items-center gap-3">
              {canDrill ? (
                <button type="button" onClick={() => onDrill(target)} title={`Telusuri ${name}`} className="flex w-36 shrink-0 items-center gap-0.5 truncate text-left text-xs font-medium text-slate-700 hover:text-emerald-700 sm:w-44">
                  <span className="truncate">{name}</span><ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
                </button>
              ) : (
                <span title={name} className="w-36 shrink-0 truncate text-xs font-medium text-slate-700 sm:w-44">{name}</span>
              )}
              <div className="h-5 min-w-0 flex-1">
                <div className="h-full" style={{ width: `${(total / scale) * 100}%` }}>
                <Segments
                  figures={group}
                  measure={measure}
                  label={name}
                  onSelect={onSelectGroup && target ? (risk) => onSelectGroup(target, risk) : undefined}
                />
                </div>
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-900">{formatValue(total, measure)}</span>
              <Breakdown title={name} figures={group} measure={measure} className={index > rows.length - 5 && rows.length > 6 ? 'bottom-full left-36 mb-1 sm:left-44' : 'top-full left-36 mt-1 sm:left-44'} />
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex gap-3 text-[10px] tabular-nums text-slate-400">
        <span className="w-36 shrink-0 sm:w-44" />
        <span className="flex flex-1 justify-between border-t border-slate-200 pt-1"><span>0</span><span>{formatValue(scale / 2, measure)}</span><span>{formatValue(scale, measure)}</span></span>
        <span className="w-20 shrink-0" />
      </div>
    </div>
  );
}

function YearColumns({ charts, measure, onSelectYears }: { charts: InventoryCharts; measure: Measure; onSelectYears?: DistributionChartsProps['onSelectYears'] }) {
  const bands = charts.years;
  const scale = niceMax(Math.max(0, ...bands.map((band) => totalOf(band, measure))));
  const gridlines = [1, 0.5, 0];

  return (
    <div className="flex gap-2">
      <div className="flex h-56 w-14 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-slate-400">
        {gridlines.map((step) => <span key={step} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{formatValue(scale * step, measure)}</span>)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-56">
          {gridlines.map((step) => <div key={step} className="absolute inset-x-0 border-t border-slate-100" style={{ top: `${(1 - step) * 100}%` }} />)}
          <div className="relative flex h-full items-end gap-1">
            {bands.map((band, index) => {
              const label = bandLabel(band);
              const firstFrom1997 = band.yearFrom === 1997;
              const edge = index < 3 ? 'left-0' : index > bands.length - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';
              return (
                <div key={band.yearFrom ?? 'unknown'} className={`group relative flex h-full min-w-0 flex-1 items-end ${band.yearFrom === null ? 'ml-2' : ''}`}>
                  {firstFrom1997 && (
                    <div className="pointer-events-none absolute inset-y-0 -left-[3px] border-l border-dashed border-slate-400">
                      <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-semibold text-slate-500">1997 →</span>
                    </div>
                  )}
                  <div className="w-full" style={{ height: `${(totalOf(band, measure) / scale) * 100}%` }}>
                    <Segments figures={band} measure={measure} vertical label={label} onSelect={onSelectYears ? (risk) => onSelectYears({ ...bandFilter(band), pcbRange: risk }) : undefined} />
                  </div>
                  <Breakdown title={`Tahun ${label}`} figures={band} measure={measure} className={`bottom-full mb-1 ${edge}`} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex gap-1 border-t border-slate-200 pt-1">
          {bands.map((band) => (
            <span key={band.yearFrom ?? 'unknown'} className={`min-w-0 flex-1 text-center text-[10px] leading-tight text-slate-500 ${band.yearFrom === null ? 'ml-2' : ''}`}>
              {band.yearFrom === null ? 'Tanpa tahun' : band.yearFrom === 0 ? '< 1972' : band.yearFrom}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DistributionChartsProps {
  scope: DashboardScope;
  /** One transformer category; both when left out. */
  category?: InventoryCategory;
  reloadKey: number;
  /** A risk class of one company / unit / sub-unit bar was clicked. */
  onSelectGroup?: (target: DashboardScope, pcbRange: PcbRange) => void;
  /** A bar's name was clicked: narrow the dashboard to it. */
  onDrill?: (target: DashboardScope) => void;
  /** A risk class of one year band was clicked. */
  onSelectYears?: (filters: Partial<InventoryFilters>) => void;
}

/**
 * Transformers per company / unit / sub-unit and per production year, split
 * by PCBs risk class, counted in units or tons (inventory_charts, migration
 * 20260929000006). Follows the dashboard scope.
 */
export default function DistributionCharts({ scope, category, reloadKey, onSelectGroup, onDrill, onSelectYears }: DistributionChartsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [charts, setCharts] = useState<InventoryCharts | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measure, setMeasure] = useState<Measure>('count');

  const { companyId, unit, subUnit } = scope;
  const requestKey = `${companyId}|${unit}|${subUnit}|${category}|${reloadKey}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    fetchInventoryCharts(supabase, { companyId, unit, subUnit }, category ?? null)
      .then((next) => { if (!cancelled) { setCharts(next); setError(null); } })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadedKey(requestKey); });
    return () => { cancelled = true; };
  }, [supabase, companyId, unit, subUnit, category, requestKey]);

  const empty = charts !== null && charts.years.every((band) => totalOf(band, 'count') === 0);
  const levelLabel = GROUP_LEVEL_LABELS[charts?.level ?? 'company'];
  const clickHint = onSelectGroup || onSelectYears ? ' · klik batang untuk melihat datanya di tabel' : '';

  const card = (title: string, subtitle: string, body: ReactNode) => (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 p-5">
      <h4 className="text-sm font-bold text-slate-900">{title}</h4>
      <p className="mb-4 text-[11px] text-slate-500">{subtitle}</p>
      {loading ? <div className="h-56 animate-pulse rounded-lg bg-slate-100" /> : body}
    </div>
  );

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-base font-bold text-slate-900">Sebaran Transformator</h3>
          <p className="text-xs font-medium text-slate-500">Per {levelLabel.toLowerCase()} dan per tahun produksi, dipecah menurut status risiko PCBs{clickHint}</p>
        </div>
        <div role="group" aria-label="Ukuran" className="flex shrink-0 rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
          {(['count', 'weight'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={measure === option} onClick={() => setMeasure(option)} className={`rounded-md px-3 py-1.5 ${measure === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {option === 'count' ? 'Jumlah unit' : 'Tonase'}
            </button>
          ))}
        </div>
      </div>

      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {RISK_CLASSES.map((risk) => (
          <li key={risk.key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: risk.color }} />
            {risk.label} <span className="text-slate-400">{risk.range}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">{error}. Pastikan migrasi 20260929000006_dashboard_charts sudah dijalankan.</p>
      ) : empty && !loading ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-xs text-slate-500">Belum ada data transformator.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {card(`Per ${levelLabel.toLowerCase()}`, `Diurutkan dari yang terbesar${onDrill ? ` · klik nama ${levelLabel.toLowerCase()} untuk menelusuri` : ''}`, charts && <GroupBars charts={charts} scope={scope} measure={measure} onSelectGroup={onSelectGroup} onDrill={onDrill} />)}
          {card('Per tahun produksi', 'Rentang lima tahun · garis putus-putus menandai batas 1997', charts && <YearColumns charts={charts} measure={measure} onSelectYears={onSelectYears} />)}
        </div>
      )}

      {measure === 'weight' && !loading && !error && <p className="mt-4 text-[11px] text-slate-400">Tonase dihitung dari berat total di formulir. Trafo tanpa berat total tidak ikut terhitung.</p>}
    </section>
  );
}
