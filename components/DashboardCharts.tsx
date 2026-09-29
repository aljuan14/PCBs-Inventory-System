'use client';

import { PieChart, Pie, Cell } from 'recharts';
import { useState } from 'react';
import { ChevronRight, CircleDashed, OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { InventoryCategory } from '@/lib/inventory';

interface ChartProps {
  /** One row per equipment type; the distribution card is hidden when there is fewer than two. */
  categoryRisk: CategoryRisk[];
  /** Null when the category cannot be classified (no PCBs concentration in its template). */
  riskCounts: RiskCounts | null;
  /** Shown under the donut, e.g. which categories it leaves out. */
  riskFootnote?: string;
  loading?: boolean;
  /** Clicking a risk class shows its rows in the table. */
  onSelectRisk?: (risk: keyof RiskCounts, category?: InventoryCategory) => void;
}

export interface CategoryRisk {
  category: InventoryCategory;
  label: string;
  counts: RiskCounts;
  /** Total oil volume in litres, shown for dielectric oil whose rows are containers rather than units. */
  volumeL?: number;
  /** False when the category's template has no PCBs concentration column (kapasitor). */
  measured: boolean;
}

export interface RiskCounts {
  safe: number;
  moderate: number;
  high: number;
  untested: number;
}

// Same bands and wording as the table's PCBs filter; ppm = konsentrasi PCBs in the KLHK template.
const RISK_CLASSES: { key: keyof RiskCounts; label: string; range: string; color: string; icon: LucideIcon; iconClass: string }[] = [
  { key: 'safe', label: 'Bebas PCBs', range: '< 50 ppm', color: '#059669', icon: ShieldCheck, iconClass: 'text-emerald-600' },
  { key: 'moderate', label: 'Terkontaminasi PCBs', range: '50–500 ppm', color: '#f59e0b', icon: TriangleAlert, iconClass: 'text-amber-600' },
  { key: 'high', label: 'Bahaya tinggi', range: '> 500 ppm', color: '#e11d48', icon: OctagonAlert, iconClass: 'text-rose-600' },
  { key: 'untested', label: 'Belum diuji', range: 'konsentrasi kosong', color: '#cbd5e1', icon: CircleDashed, iconClass: 'text-slate-400' },
];

const formatNumber = (value: number) => value.toLocaleString('id-ID');
// A non-zero share too small for one decimal (e.g. 37 of 113.047) must not read as 0%.
const formatPercent = (value: number) => (value > 0 && value < 0.05 ? '< 0,1%' : `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);

function RiskProportion({ counts, footnote, loading, onSelectRisk }: { counts: RiskCounts; footnote?: string; loading?: boolean; onSelectRisk?: ChartProps['onSelectRisk'] }) {
  const [active, setActive] = useState<keyof RiskCounts | null>(null);
  const total = RISK_CLASSES.reduce((sum, risk) => sum + counts[risk.key], 0);
  const tested = total - counts.untested;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const segments = RISK_CLASSES.filter((risk) => counts[risk.key] > 0);
  const activeRisk = RISK_CLASSES.find((risk) => risk.key === active);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-900">
          Proporsi Status Risiko PCBs Keseluruhan
        </h3>
        <p className="text-xs text-slate-500 font-medium">
          Pengelompokan berdasarkan konsentrasi PCBs (ppm) hasil uji{onSelectRisk ? ' · klik untuk melihat datanya di tabel' : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex-1 animate-pulse rounded-xl bg-slate-100" />
      ) : total === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
          Belum ada data inventaris.
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:gap-6">
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

// Rows of dielectric oil are containers or samples, not units of equipment.
const unitOf = (row: CategoryRisk) => (row.volumeL !== undefined ? 'data' : 'unit');

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 font-medium">{subtitle}</p>
    </div>
  );
}

function unmeasuredNote(rows: CategoryRisk[]) {
  const names = rows.filter((row) => !row.measured).map((row) => row.label);
  return names.length > 0 ? `${names.join(', ')} tidak termasuk karena templatenya tidak memuat kolom konsentrasi PCBs.` : null;
}

function TestCoverage({ rows, loading, onSelectRisk }: { rows: CategoryRisk[]; loading?: boolean; onSelectRisk?: ChartProps['onSelectRisk'] }) {
  const measured = rows.filter((row) => row.measured);
  const note = unmeasuredNote(rows);

  return (
    <div className={CARD_CLASS}>
      <CardHeader
        title="Cakupan Uji PCBs per Jenis Alat"
        subtitle={`Data yang sudah memiliki hasil uji konsentrasi PCBs${onSelectRisk ? ' · klik untuk melihat yang belum diuji' : ''}`}
      />
      {loading ? (
        <div className="flex-1 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <ul className="flex flex-1 flex-col justify-center gap-2">
          {measured.map((row) => {
            const total = totalOf(row.counts);
            const tested = total - row.counts.untested;
            const share = total > 0 ? (tested / total) * 100 : 0;
            return (
              <li key={row.category}>
                <button
                  type="button"
                  disabled={!onSelectRisk || row.counts.untested === 0}
                  onClick={() => onSelectRisk?.('untested', row.category)}
                  className="group w-full rounded-lg px-2 py-2.5 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-500"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-800">{row.label}</span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900">{total > 0 ? formatPercent(share) : '–'}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-600" style={{ width: `${share}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between gap-3 text-[11px] tabular-nums text-slate-500">
                    <span>{formatNumber(tested)} dari {formatNumber(total)} {unitOf(row)} sudah diuji</span>
                    {row.counts.untested > 0 && (
                      <span className="flex items-center gap-0.5 group-enabled:group-hover:text-slate-700">
                        {formatNumber(row.counts.untested)} belum diuji
                        {onSelectRisk && <ChevronRight className="h-3 w-3" />}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {note && !loading && <p className="mt-4 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

const FINDING_CLASSES = RISK_CLASSES.filter((risk) => risk.key === 'moderate' || risk.key === 'high');

function Findings({ rows, loading, onSelectRisk }: { rows: CategoryRisk[]; loading?: boolean; onSelectRisk?: ChartProps['onSelectRisk'] }) {
  const measured = rows.filter((row) => row.measured);
  const found = measured.reduce((sum, row) => sum + row.counts.moderate + row.counts.high, 0);
  const tested = measured.reduce((sum, row) => sum + totalOf(row.counts) - row.counts.untested, 0);

  return (
    <div className={CARD_CLASS}>
      <CardHeader
        title="Temuan PCBs ≥ 50 ppm"
        subtitle={`${formatNumber(found)} temuan dari ${formatNumber(tested)} data yang sudah diuji · batas 50 ppm mengacu pada Konvensi Stockholm`}
      />
      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {measured.map((row) => {
            const rowTested = totalOf(row.counts) - row.counts.untested;
            const rowFound = row.counts.moderate + row.counts.high;
            return (
              <div key={row.category} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-800">{row.label}</span>
                  {row.volumeL !== undefined && <span className="text-[11px] tabular-nums text-slate-500">{formatNumber(Math.round(row.volumeL))} L total</span>}
                </div>
                {rowTested === 0 ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                    <CircleDashed className="h-4 w-4 text-slate-400" /> Belum ada hasil uji.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {FINDING_CLASSES.map((risk) => {
                        const Icon = risk.icon;
                        const count = row.counts[risk.key];
                        return (
                          <button
                            key={risk.key}
                            type="button"
                            disabled={!onSelectRisk || count === 0}
                            onClick={() => onSelectRisk?.(risk.key, row.category)}
                            className="rounded-lg bg-slate-50 px-3 py-2 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-500"
                          >
                            <span className={`block text-2xl font-semibold tabular-nums ${count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{formatNumber(count)}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                              <Icon className={`h-3.5 w-3.5 shrink-0 ${risk.iconClass}`} />
                              {risk.label}
                            </span>
                            <span className="block pl-[18px] text-[10px] text-slate-400">{risk.range}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      {rowFound === 0 && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                      {rowFound === 0 ? 'Tidak ada temuan dari' : `${formatPercent((rowFound / rowTested) * 100)} dari`} {formatNumber(rowTested)} {unitOf(row)} yang sudah diuji
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardCharts({ categoryRisk, riskCounts, riskFootnote, loading, onSelectRisk }: ChartProps) {
  const showByCategory = categoryRisk.length > 1;
  const donut = riskCounts ? <RiskProportion counts={riskCounts} footnote={riskFootnote} loading={loading} onSelectRisk={onSelectRisk} /> : <RiskNotMeasured />;

  if (!showByCategory) return donut;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TestCoverage rows={categoryRisk} loading={loading} onSelectRisk={onSelectRisk} />
        {donut}
      </div>
      <Findings rows={categoryRisk} loading={loading} onSelectRisk={onSelectRisk} />
    </div>
  );
}
