'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ALL_SCOPE, fetchCompanyUnits, type DashboardScope, type UnitSummary } from '@/lib/inventory-query';
import type { CompanyOption } from '@/components/DataTable';

const SELECT_CLASS = 'min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none';

/**
 * Company › unit › sub-unit filter for a whole dashboard (PLN: Unit Induk ›
 * Unit Pelaksana). Units are listed once a company is chosen.
 */
export default function DashboardScopeFilter({ companies, scope, onChange, reloadKey = 0 }: { companies: CompanyOption[]; scope: DashboardScope; onChange: (scope: DashboardScope) => void; reloadKey?: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [units, setUnits] = useState<{ companyId: string; rows: UnitSummary[] } | null>(null);

  useEffect(() => {
    const companyId = scope.companyId;
    if (!companyId) return;
    let cancelled = false;
    fetchCompanyUnits(supabase, companyId)
      .then((rows) => { if (!cancelled) setUnits({ companyId, rows }); })
      .catch(() => { if (!cancelled) setUnits({ companyId, rows: [] }); });
    return () => { cancelled = true; };
  }, [supabase, scope.companyId, reloadKey]);

  // Only the units of the selected company (a previous company's list may still be loaded).
  const companyUnits = useMemo(() => (units && units.companyId === scope.companyId ? units.rows : []), [units, scope.companyId]);
  const unitOptions = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of companyUnits) totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.total);
    return [...totals].map(([name, total]) => ({ name, total }));
  }, [companyUnits]);
  const subUnitOptions = companyUnits.filter((row) => row.unit === scope.unit && row.sub_unit);

  return <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
    <div className="mr-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Building2 className="h-3.5 w-3.5" /><span>Tampilkan data:</span></div>
    <select aria-label="Perusahaan" value={scope.companyId ?? 'all'} onChange={(e) => onChange({ companyId: e.target.value === 'all' ? null : e.target.value, unit: null, subUnit: null })} className={SELECT_CLASS}>
      <option value="all">Semua perusahaan</option>
      {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
    </select>
    {unitOptions.length > 0 && (
      <select aria-label="Unit" value={scope.unit ?? 'all'} onChange={(e) => onChange({ ...scope, unit: e.target.value === 'all' ? null : e.target.value, subUnit: null })} className={SELECT_CLASS}>
        <option value="all">Semua unit ({unitOptions.length})</option>
        {unitOptions.map((option) => <option key={option.name} value={option.name}>{option.name} · {option.total.toLocaleString('id-ID')}</option>)}
      </select>
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
  </div>;
}
