'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ALL_SCOPE, type DashboardScope, type InventoryFilters } from '@/lib/inventory-query';
import DataTable, { type CompanyOption, type EditableInventoryFields, type InventoryItem, type TablePreset } from '@/components/DataTable';
import DashboardScopeFilter from '@/components/DashboardScopeFilter';
import DataQualityPanel from '@/components/DataQualityPanel';
import { fetchCompanyStatuses, type CompanyStatus } from '@/lib/company-status';
import { deleteInventoryItem, updateInventoryItem } from '@/lib/inventory-edit';

/** Data quality per company / unit / sub-unit, with the table its indicators open. */
export default function DataQualityOverview() {
  const supabase = useMemo(() => createClient(), []);
  const [scope, setScope] = useState<DashboardScope>(ALL_SCOPE);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [statuses, setStatuses] = useState<Map<string, CompanyStatus> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const companyName = companies.find((company) => company.id === scope.companyId)?.name;
  const scopeLabel = [companyName, scope.unit, scope.subUnit].filter(Boolean).join(' › ');

  useEffect(() => {
    let cancelled = false;
    supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan').then(({ data, error: companyError }) => {
      if (cancelled) return;
      if (companyError) setError(companyError.message);
      else setCompanies((data ?? []).map((row) => ({ id: row.id as string, name: row.nama_perusahaan as string })));
    });
    fetchCompanyStatuses(supabase).then((result) => { if (!cancelled) setStatuses(result); }, () => { if (!cancelled) setStatuses(null); });
    return () => { cancelled = true; };
  }, [supabase, reloadKey]);

  // Clicking an indicator filters the table and brings it into view.
  const [tablePreset, setTablePreset] = useState<TablePreset | undefined>();
  const tableRef = useRef<HTMLDivElement>(null);
  const showRows = (filters: Partial<InventoryFilters>, type?: TablePreset['type']) => {
    setTablePreset((prev) => ({ key: (prev?.key ?? 0) + 1, filters, type }));
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleEdit = async (item: InventoryItem, changes: EditableInventoryFields) => {
    await updateInventoryItem(supabase, item, changes);
    setReloadKey((key) => key + 1);
  };
  const handleDelete = async (item: InventoryItem) => {
    await deleteInventoryItem(supabase, item);
    setReloadKey((key) => key + 1);
  };

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Laporan</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Kualitas data</h1>
      <p className="mt-2 text-sm text-slate-500">Kelengkapan data inventarisasi{scopeLabel ? <> untuk <span className="font-semibold text-slate-700">{scopeLabel}</span></> : ' seluruh perusahaan'}.</p>
    </header>
    {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {error}</div>}
    <DashboardScopeFilter companies={companies} scope={scope} onChange={setScope} reloadKey={reloadKey} statuses={statuses} />
    <DataQualityPanel scope={scope} scopeLabel={scopeLabel} companies={companies} reloadKey={reloadKey} onDrill={setScope} onShowRows={showRows} />
    <div ref={tableRef} className="scroll-mt-6"><DataTable companies={companies} reloadKey={reloadKey} scope={scope} preset={tablePreset} onEdit={handleEdit} onDelete={handleDelete} /></div>
  </div>;
}
