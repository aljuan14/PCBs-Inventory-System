'use client';

import { useState } from 'react';
import { ChevronRight, FlaskConical, Zap, type LucideIcon } from 'lucide-react';
import { getCategoryLabel } from '@/lib/inventory';
import { PRE_1997_FILTER, sumStats, type CategoryFilter, type CategoryStats, type InventoryFilters, type InventoryStats, type TestFilter } from '@/lib/inventory-query';
import { RISK_CLASSES, formatPercent } from '@/components/DashboardCharts';

const formatNumber = (value: number) => value.toLocaleString('id-ID');
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

// One transformer type at a time: combined figures read as belonging to either type.
type Scope = Extract<CategoryFilter, 'transformator_digunakan' | 'transformator_tidak_digunakan'>;
const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: 'transformator_digunakan', label: 'Masih digunakan' },
  { key: 'transformator_tidak_digunakan', label: 'Tidak digunakan' },
];

// The tested classes; untested rows have no method.
const TESTED_CLASSES = RISK_CLASSES.filter((risk) => risk.key !== 'untested');
type TestedClass = (typeof TESTED_CLASSES)[number]['key'];

const METHODS: Array<{ key: 'lab' | 'quick'; test: TestFilter; label: string; icon: LucideIcon }> = [
  { key: 'lab', test: 'lab', label: 'Uji lab', icon: FlaskConical },
  { key: 'quick', test: 'cepat', label: 'Uji cepat', icon: Zap },
];

/**
 * Test results of transformers made before 1997 per method (Uji lab, Uji
 * cepat) and PCBs class, per transformer type, from inventory_stats
 * (migration 20260929000008).
 * Each class opens its rows in the table.
 */
export default function TestMethodCard({ stats, loading, onSelect }: {
  stats: InventoryStats | null;
  loading: boolean;
  onSelect?: (filters: Partial<InventoryFilters>, type: CategoryFilter) => void;
}) {
  const [scope, setScope] = useState<Scope>('transformator_digunakan');
  const categories = [scope];
  const sum = (key: keyof CategoryStats) => (stats ? sumStats(stats, categories, key) : 0);
  const methods = METHODS.map((method) => {
    const counts = Object.fromEntries(TESTED_CLASSES.map((risk) => [risk.key, sum(`pre1997_${method.key}_${risk.key}` as keyof CategoryStats)])) as Record<TestedClass, number>;
    return { ...method, counts, total: TESTED_CLASSES.reduce((total, risk) => total + counts[risk.key], 0) };
  });
  const tested = methods.reduce((total, method) => total + method.total, 0);
  const pre1997 = sum('before_1997');
  const scopeLabel = getCategoryLabel(scope).toLowerCase();

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="text-base font-bold text-slate-900">Hasil Uji PCBs per Metode · Trafo &lt; 1997</h3>
          <p className="text-xs font-medium text-slate-500">
            Transformator buatan sebelum 1997 yang sudah diuji, menurut metode uji dan hasilnya{onSelect ? ' · klik untuk melihat datanya di tabel' : ''}
          </p>
        </div>
        <div role="group" aria-label="Jenis transformator" className="flex shrink-0 rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
          {SCOPES.map((option) => (
            <button key={option.key} type="button" aria-pressed={scope === option.key} onClick={() => setScope(option.key)} className={`rounded-md px-3 py-1.5 ${scope === option.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {methods.map((method) => {
            const Icon = method.icon;
            return (
              <div key={method.key} className="rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon className="h-4 w-4 text-slate-400" /> {method.label}</span>
                  <span className="text-right">
                    <span className="block text-2xl font-semibold tabular-nums text-slate-900">{formatNumber(method.total)}</span>
                    <span className="text-[11px] text-slate-500">unit · {formatPercent(share(method.total, tested))} dari yang sudah diuji</span>
                  </span>
                </div>
                <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded bg-slate-50">
                  {TESTED_CLASSES.filter((risk) => method.counts[risk.key] > 0).map((risk) => (
                    <span key={risk.key} className="h-full min-w-[3px]" style={{ flexGrow: method.counts[risk.key], flexBasis: 0, backgroundColor: risk.color }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-0.5">
                  {TESTED_CLASSES.map((risk) => {
                    const RiskIcon = risk.icon;
                    const count = method.counts[risk.key];
                    return (
                      <li key={risk.key}>
                        <button
                          type="button"
                          disabled={!onSelect || count === 0}
                          onClick={() => onSelect?.({ test: method.test, pcbRange: risk.key, ...PRE_1997_FILTER }, scope)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors enabled:cursor-pointer enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-500"
                        >
                          <RiskIcon className={`h-4 w-4 shrink-0 ${risk.iconClass}`} />
                          <span className="min-w-0 flex-1 text-slate-700">{risk.label} <span className="text-slate-400">{risk.range}</span></span>
                          <span className="font-semibold tabular-nums text-slate-900">{formatNumber(count)}</span>
                          <span className="w-12 text-right tabular-nums text-slate-500">{formatPercent(share(count, method.total))}</span>
                          {onSelect && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {!loading && (
        <p className="mt-4 text-[11px] text-slate-500">
          Khusus {scopeLabel} buatan sebelum 1997: {formatNumber(tested)} dari {formatNumber(pre1997)} unit sudah diuji (uji lab + uji cepat), {formatNumber(pre1997 - tested)} belum diuji.
          Persentase di tiap kotak dihitung dari jumlah unit dengan metode itu.
        </p>
      )}
    </section>
  );
}
