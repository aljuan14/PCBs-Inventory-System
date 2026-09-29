'use client';

import { PieChart, Pie, Cell } from 'recharts';
import { useState } from 'react';
import { ChevronRight, CircleDashed, OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { PCB_CLASSES, type InventoryCategory } from '@/lib/inventory';

interface ChartProps {
  /** Null when the category cannot be classified (no PCBs concentration in its template). */
  riskCounts: RiskCounts | null;
  /** Shown under the donut, e.g. which categories it leaves out. */
  riskFootnote?: string;
  loading?: boolean;
  /** Clicking a risk class shows its rows in the table. */
  onSelectRisk?: (risk: keyof RiskCounts, category?: InventoryCategory) => void;
  /**
   * Transformers made before 1997, which may contain PCBs: one donut per
   * entry, beside the overall one. With more than one (the national
   * dashboard), a findings card compares them below.
   */
  pre1997?: Pre1997Donut[];
}

export interface Pre1997Donut {
  /** Defaults to "Trafo < 1997"; the national dashboard names each transformer type. */
  title?: string;
  subtitle?: string;
  counts: RiskCounts;
  onSelectRisk?: (risk: keyof RiskCounts) => void;
  /** Transformers of the same type without a production year, named in the footnote. */
  unknownYear?: number;
}

export interface RiskCounts {
  safe: number;
  moderate: number;
  high: number;
  untested: number;
}

// Same bands and wording as the table's PCBs filter; ppm = konsentrasi PCBs in the KLHK template.
export const RISK_CLASSES: { key: keyof RiskCounts; label: string; range: string; color: string; icon: LucideIcon; iconClass: string }[] = [
  { key: 'safe', ...PCB_CLASSES.safe, color: '#059669', icon: ShieldCheck, iconClass: 'text-emerald-600' },
  { key: 'moderate', ...PCB_CLASSES.moderate, color: '#f59e0b', icon: TriangleAlert, iconClass: 'text-amber-600' },
  { key: 'high', ...PCB_CLASSES.high, color: '#e11d48', icon: OctagonAlert, iconClass: 'text-rose-600' },
  { key: 'untested', label: 'Belum diuji', range: 'konsentrasi kosong', color: '#cbd5e1', icon: CircleDashed, iconClass: 'text-slate-400' },
];

const formatNumber = (value: number) => value.toLocaleString('id-ID');
// A non-zero share too small for one decimal (e.g. 37 of 113.047) must not read as 0%.
export const formatPercent = (value: number) => (value > 0 && value < 0.05 ? '< 0,1%' : `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);

interface RiskProportionProps {
  title: string;
  subtitle: string;
  emptyText: string;
  counts: RiskCounts;
  footnote?: string;
  loading?: boolean;
  onSelectRisk?: (risk: keyof RiskCounts) => void;
  /** Legend under the donut on wide screens, for three donuts in a row. */
  stackWide?: boolean;
}

function RiskProportion({ title, subtitle, emptyText, counts, footnote, loading, onSelectRisk, stackWide }: RiskProportionProps) {
  const [active, setActive] = useState<keyof RiskCounts | null>(null);
  const total = RISK_CLASSES.reduce((sum, risk) => sum + counts[risk.key], 0);
  const tested = total - counts.untested;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const segments = RISK_CLASSES.filter((risk) => counts[risk.key] > 0);
  const activeRisk = RISK_CLASSES.find((risk) => risk.key === active);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 font-medium">
          {subtitle}{onSelectRisk ? ' · klik untuk melihat datanya di tabel' : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex-1 animate-pulse rounded-xl bg-slate-100" />
      ) : total === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className={`flex flex-1 flex-col items-center gap-4 sm:flex-row sm:gap-6 ${stackWide ? 'xl:flex-col xl:gap-4' : ''}`}>
          <div className="relative h-48 w-48 shrink-0" onMouseLeave={() => setActive(null)}>
            <PieChart width={192} height={192}>
              <Pie
                data={segments.map((risk) => ({ key: risk.key, name: risk.label, value: counts[risk.key] }))}
                dataKey="value"
                innerRadius="68%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
                onMouseEnter={(_, index) => setActive(segments[index].key)}
                onClick={(_, index) => onSelectRisk?.(segments[index].key)}
                className={onSelectRisk ? 'cursor-pointer' : undefined}
              >
                {segments.map((risk) => (
                  <Cell key={risk.key} fill={risk.color} fillOpacity={active && active !== risk.key ? 0.35 : 1} />
                ))}
              </Pie>
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {activeRisk ? (
                <>
                  <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatPercent(share(counts[activeRisk.key]))}</span>
                  <span className="max-w-24 text-[11px] leading-tight text-slate-500">{activeRisk.label}</span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatPercent(share(tested))}</span>
                  <span className="text-[11px] leading-tight text-slate-500">sudah diuji</span>
                  <span className="mt-0.5 text-[10px] tabular-nums text-slate-400">{formatNumber(tested)} / {formatNumber(total)}</span>
                </>
              )}
            </div>
          </div>

          <ul className="w-full min-w-0 flex-1 divide-y divide-slate-100">
            {RISK_CLASSES.map((risk) => {
              const Icon = risk.icon;
              return (
                <li key={risk.key}>
                  <button
                    type="button"
                    disabled={!onSelectRisk}
                    onClick={() => onSelectRisk?.(risk.key)}
                    onMouseEnter={() => setActive(risk.key)}
                    onMouseLeave={() => setActive(null)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${active === risk.key ? 'bg-slate-50' : ''}`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${risk.iconClass}`} />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-slate-800">{risk.label}</span>
                      <span className="block text-[11px] text-slate-500">{risk.range}</span>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-900">{formatNumber(counts[risk.key])}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-slate-500">{formatPercent(share(counts[risk.key]))}</span>
                    {onSelectRisk && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {footnote && !loading && <p className="mt-4 text-[11px] text-slate-400">{footnote}</p>}
    </div>
  );
}

function RiskNotMeasured() {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <h3 className="text-base font-bold text-slate-900">Status Risiko PCBs</h3>
      <div className="mt-4 flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center text-xs text-slate-500">
        Template tidak memuat kolom konsentrasi PCBs, jadi status risikonya tidak dapat ditentukan.
      </div>
    </div>
  );
}

const totalOf = (counts: RiskCounts) => RISK_CLASSES.reduce((sum, risk) => sum + counts[risk.key], 0);

const CARD_CLASS = 'flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs';

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 font-medium">{subtitle}</p>
    </div>
  );
}

const FINDING_CLASSES = RISK_CLASSES.filter((risk) => risk.key === 'moderate' || risk.key === 'high');

/**
 * PCBs found (≥ 2 ppm) among the tested transformers made before 1997, per
 * type. The share is of the tested units, which the donuts above (shares of
 * every unit, untested included) do not show.
 */
function Findings({ entries, loading }: { entries: Pre1997Donut[]; loading?: boolean }) {
  return (
    <div className={CARD_CLASS}>
      <CardHeader
        title="Temuan PCBs ≥ 2 ppm · Trafo < 1997"
        subtitle="Dihitung dari trafo buatan sebelum 1997 yang sudah diuji, bukan dari semua trafo · batas 50 ppm mengacu pada Konvensi Stockholm"
      />
      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {entries.map((entry, index) => {
            const tested = totalOf(entry.counts) - entry.counts.untested;
            const found = entry.counts.moderate + entry.counts.high;
            return (
              <div key={index} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-800">{entry.title ?? 'Trafo'}</span>
                  {tested > 0 && (
                    <span className="text-right">
                      <span className="block text-2xl font-semibold tabular-nums text-slate-900">{formatPercent((found / tested) * 100)}</span>
                      <span className="text-[11px] text-slate-500">{formatNumber(found)} temuan dari {formatNumber(tested)} yang sudah diuji</span>
                    </span>
                  )}
                </div>
                {tested === 0 ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                    <CircleDashed className="h-4 w-4 text-slate-400" /> Belum ada hasil uji.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {FINDING_CLASSES.map((risk) => {
                      const Icon = risk.icon;
                      const count = entry.counts[risk.key];
                      return (
                        <button
                          key={risk.key}
                          type="button"
                          disabled={!entry.onSelectRisk || count === 0}
                          onClick={() => entry.onSelectRisk?.(risk.key)}
                          className="rounded-lg bg-slate-50 px-3 py-2 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-500"
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`text-2xl font-semibold tabular-nums ${count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{formatNumber(count)}</span>
                            <span className="text-[11px] tabular-nums text-slate-500">{formatPercent((count / tested) * 100)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                            <Icon className={`h-3.5 w-3.5 shrink-0 ${risk.iconClass}`} />
                            {risk.label}
                          </span>
                          <span className="block pl-[18px] text-[10px] text-slate-400">{risk.range}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardCharts({ riskCounts, riskFootnote, loading, onSelectRisk, pre1997 }: ChartProps) {
  const subtitle = 'Pengelompokan berdasarkan konsentrasi PCBs (ppm) hasil uji';
  const stackWide = (pre1997?.length ?? 0) > 1;
  const donut = riskCounts
    ? <RiskProportion title="Proporsi Status Risiko PCBs Keseluruhan" subtitle={subtitle} emptyText="Belum ada data inventaris." counts={riskCounts} footnote={riskFootnote} loading={loading} onSelectRisk={onSelectRisk && ((risk) => onSelectRisk(risk))} stackWide={stackWide} />
    : <RiskNotMeasured />;
  const pre1997Donuts = (pre1997 ?? []).map((entry, index) => (
    <RiskProportion
      key={index}
      title={`Proporsi Status Risiko PCBs ${entry.title ?? 'Trafo'} < 1997`}
      subtitle={entry.subtitle ?? 'Transformator dengan tahun produksi sebelum 1997'}
      emptyText="Belum ada transformator dengan tahun produksi sebelum 1997."
      counts={entry.counts}
      footnote={`${entry.unknownYear !== undefined ? `${formatNumber(entry.unknownYear)} trafo` : 'Transformator'} tanpa tahun produksi tidak termasuk karena tidak diketahui apakah buatan sebelum 1997.`}
      loading={loading}
      onSelectRisk={entry.onSelectRisk}
      stackWide={stackWide}
    />
  ));
  // Side by side only when each donut keeps room for its legend (the sidebar
  // takes 256px): two with the legend beside the donut, three with it below.
  const donuts = pre1997Donuts.length > 0
    ? <div className={`grid grid-cols-1 gap-6 ${stackWide ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>{donut}{pre1997Donuts}</div>
    : donut;

  if (!stackWide) return donuts;

  return (
    <div className="space-y-6">
      {donuts}
      <Findings entries={pre1997 ?? []} loading={loading} />
    </div>
  );
}
