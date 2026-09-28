'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useState } from 'react';
import { ChevronRight, CircleDashed, OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';

interface ChartProps {
  distributionData: {
    category: string;
    transformator: number;
    kapasitor: number;
    minyak: number;
  }[];
  riskCounts: RiskCounts;
  loading?: boolean;
  /** Clicking a risk class shows its rows in the table. */
  onSelectRisk?: (risk: keyof RiskCounts) => void;
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
const formatPercent = (value: number) => `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

function RiskProportion({ counts, loading, onSelectRisk }: { counts: RiskCounts; loading?: boolean; onSelectRisk?: (risk: keyof RiskCounts) => void }) {
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
    </div>
  );
}

export default function DashboardCharts({ distributionData, riskCounts, loading, onSelectRisk }: ChartProps) {
  const tooltipStyle = {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
    fontSize: '12px',
    padding: '8px 12px',
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 1. Bar Chart: Distribusi Konsentrasi PCBs */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="mb-4">
          <h3 className="text-base font-bold text-slate-900">
            Distribusi Kategori Bahaya PCBs per Jenis Alat
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Perbandingan tingkat kontaminasi sesuai standar Konvensi Stockholm
          </p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
              <Bar dataKey="transformator" name="Transformator" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="kapasitor" name="Kapasitor" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              <Bar dataKey="minyak" name="Minyak Dielektrik" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <RiskProportion counts={riskCounts} loading={loading} onSelectRisk={onSelectRisk} />
    </div>
  );
}
