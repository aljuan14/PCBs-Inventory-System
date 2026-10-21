'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, RotateCw, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ALL_SCOPE, fetchCompanyUnits, type DashboardScope, type UnitSummary } from '@/lib/inventory-query';
import type { CompanyOption } from '@/components/DataTable';
import CompanyPicker from '@/components/CompanyPicker';
import type { CompanyStatus } from '@/lib/company-status';

const SELECT_CLASS = 'min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none';

/**
 * Company › unit › sub-unit filter for a whole dashboard (PLN: Unit Induk ›
 * Unit Pelaksana). Units are listed once a company is chosen. Further filter
 * rows (children) sit in the same card under a line, their labels in line.
 */
export default function DashboardScopeFilter({ companies, scope, onChange, reloadKey = 0, statuses = null, children }: { companies: CompanyOption[]; scope: DashboardScope; onChange: (scope: DashboardScope) => void; reloadKey?: number; statuses?: Map<string, CompanyStatus> | null; children?: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [units, setUnits] = useState<{ companyId: string; rows: UnitSummary[]; failed?: boolean } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const companyId = scope.companyId;
    if (!companyId) return;
    let cancelled = false;
    fetchCompanyUnits(supabase, companyId)
      .then((rows) => { if (!cancelled) setUnits({ companyId, rows }); })
      // Said in the filter: an empty list would read as a company without units.
      .catch(() => { if (!cancelled) setUnits({ companyId, rows: [], failed: true }); });
    return () => { cancelled = true; };
  }, [supabase, scope.companyId, reloadKey, retryKey]);

  // Only the units of the selected company (a previous company's list may still be loaded).
  const companyUnits = useMemo(() => (units && units.companyId === scope.companyId ? units.rows : []), [units, scope.companyId]);
  const unitOptions = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of companyUnits) totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.total);
    return [...totals].map(([name, total]) => ({ name, total }));
  }, [companyUnits]);
  const subUnitOptions = companyUnits.filter((row) => row.unit === scope.unit && row.sub_unit);
  const unitsFailed = units?.companyId === scope.companyId && units.failed;

  return <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
    <FilterRow icon={<Building2 className="h-4 w-4" />} label="Tampilkan data">
    <CompanyPicker companies={companies} value={scope.companyId} statuses={statuses} onChange={(companyId) => onChange({ companyId, unit: null, subUnit: null })} />
    {unitOptions.length > 0 && (
      <select aria-label="Unit" value={scope.unit ?? 'all'} onChange={(e) => onChange({ ...scope, unit: e.target.value === 'all' ? null : e.target.value, subUnit: null })} className={SELECT_CLASS}>
        <option value="all">Semua unit ({unitOptions.length})</option>
        {unitOptions.map((option) => <option key={option.name} value={option.name}>{option.name} · {option.total.toLocaleString('id-ID')}</option>)}
      </select>
    )}
    {unitsFailed && (
      <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100">
        Daftar unit gagal dimuat <RotateCw className="h-3.5 w-3.5" /> Coba lagi
      </button>
    )}
    {subUnitOptions.length > 0 && (
      <select aria-label="Sub-unit" value={scope.subUnit ?? 'all'} onChange={(e) => onChange({ ...scope, subUnit: e.target.value === 'all' ? null : e.target.value })} className={SELECT_CLASS}>
        <option value="all">Semua sub-unit ({subUnitOptions.length})</option>
        {subUnitOptions.map((option) => <option key={option.sub_unit} value={option.sub_unit as string}>{option.sub_unit} · {option.total.toLocaleString('id-ID')}</option>)}
      </select>
    )}
    {scope.companyId && (
      <button type="button" onClick={() => onChange(ALL_SCOPE)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"><X className="h-3 w-3" /> Semua data</button>
    )}
    </FilterRow>
    {children}
  </div>;
}

/** One row of the filter card: an icon and label in a fixed column, then its controls. */
export function FilterRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
    <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-800 sm:w-40"><span className="text-emerald-700">{icon}</span>{label}</div>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">{children}</div>
  </div>;
}
