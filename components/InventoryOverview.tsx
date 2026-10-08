'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { INVENTORY_CATEGORIES, hasPcbConcentration } from '@/lib/inventory';
import { ALL_SCOPE, PRE_1997_FILTER, TRAFO_CATEGORIES, mapPointFilter, pre1997RiskCounts, sumStats, type DashboardScope, type InventoryFilters } from '@/lib/inventory-query';
import DataTable, { type EditableInventoryFields, type InventoryItem, type TablePreset } from '@/components/DataTable';
import CompanyCheckCard from '@/components/CompanyCheckCard';
import DashboardCharts, { type Pre1997Donut } from '@/components/DashboardCharts';
import DashboardScopeFilter from '@/components/DashboardScopeFilter';
import DistributionCharts from '@/components/DistributionCharts';
import InventorySummary from '@/components/InventorySummary';
import TestMethodCard from '@/components/TestMethodCard';
import TonnageCard from '@/components/TonnageCard';
import MapNotice from '@/components/MapNotice';
import { useDashboardData } from '@/components/useDashboardData';
import { fetchCompanyStatuses, type CompanyStatus } from '@/lib/company-status';
import { deleteInventoryItem, updateInventoryItem } from '@/lib/inventory-edit';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

const MEASURED_CATEGORIES = INVENTORY_CATEGORIES.map((category) => category.key).filter(hasPcbConcentration);

export default function InventoryOverview() {
  const [scope, setScope] = useState<DashboardScope>(ALL_SCOPE);
  const { supabase, stats, companies, points, pointTotal, loading, refreshing, error, reloadKey, reload } = useDashboardData(undefined, scope);
  const companyName = companies.find((company) => company.id === scope.companyId)?.name;

  const handleEdit = async (item: InventoryItem, changes: EditableInventoryFields) => {
    await updateInventoryItem(supabase, item, changes);
    await reload();
  };
  const handleDelete = async (item: InventoryItem) => {
    await deleteInventoryItem(supabase, item);
    await reload();
  };

  // Sent / not sent per company, for the dots in the company picker.
  const [statuses, setStatuses] = useState<Map<string, CompanyStatus> | null>(null);
  const [statusKey, setStatusKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchCompanyStatuses(supabase).then((result) => { if (!cancelled) setStatuses(result); }, () => { if (!cancelled) setStatuses(null); });
    return () => { cancelled = true; };
  }, [supabase, reloadKey, statusKey]);
  const scopeLabel = [companyName, scope.unit, scope.subUnit].filter(Boolean).join(' › ');

  // Clicking a data quality indicator filters the table and brings it into view.
  const [tablePreset, setTablePreset] = useState<TablePreset | undefined>();
  const tableRef = useRef<HTMLDivElement>(null);
  const showRows = (filters: Partial<InventoryFilters>, type?: TablePreset['type']) => {
    setTablePreset((prev) => ({ key: (prev?.key ?? 0) + 1, filters, type }));
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // The donut leaves out kapasitor, whose rows can never be tested for PCBs.
  const total = stats ? sumStats(stats, MEASURED_CATEGORIES, 'total') : 0;
  const tested = stats ? sumStats(stats, MEASURED_CATEGORIES, 'tested') : 0;
  const riskCounts = {
    safe: stats ? sumStats(stats, MEASURED_CATEGORIES, 'risk_safe') : 0,
    moderate: stats ? sumStats(stats, MEASURED_CATEGORIES, 'risk_moderate') : 0,
    high: stats ? sumStats(stats, MEASURED_CATEGORIES, 'risk_high') : 0,
    untested: total - tested,
  };
  // One donut per transformer type: combined, the pre-1997 figures read as
  // belonging to the "Transformator Masih Digunakan" card above them.
  const pre1997: Pre1997Donut[] = TRAFO_CATEGORIES.map((category) => {
    const label = category === 'transformator_digunakan' ? 'Masih Digunakan' : 'Tidak Digunakan';
    return {
      title: `Trafo ${label}`,
      subtitle: `Transformator ${label.toLowerCase()} dengan tahun produksi sebelum 1997`,
      counts: pre1997RiskCounts(stats, [category]),
      unknownYear: stats?.[category].unknown_year ?? 0,
      onSelectRisk: (pcbRange: InventoryFilters['pcbRange']) => showRows({ pcbRange, ...PRE_1997_FILTER }, category),
    };
  });

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Ringkasan nasional</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Dashboard nasional</h1><p className="mt-2 text-sm text-slate-500">Ringkasan inventarisasi PCBs seluruh kategori{scopeLabel ? <> untuk <span className="font-semibold text-slate-700">{scopeLabel}</span></> : ''}.</p></div><div className="flex gap-2"><button type="button" onClick={reload} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button><a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a></div></header>
    {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {error}</div>}
    <DashboardScopeFilter companies={companies} scope={scope} onChange={setScope} reloadKey={reloadKey} statuses={statuses} />
    {scope.companyId && companyName && <CompanyCheckCard companyId={scope.companyId} companyName={companyName} reloadKey={reloadKey} onSendsChange={() => setStatusKey((key) => key + 1)} />}
    <InventorySummary stats={stats} loading={loading} onSelect={(filters, category) => showRows(filters, category)} />
    <TonnageCard stats={stats} loading={loading} onSelect={(filters, type) => showRows(filters, type)} />
    <DashboardCharts riskCounts={riskCounts} riskFootnote="Kapasitor tidak termasuk karena templatenya tidak memuat kolom konsentrasi PCBs." loading={loading} onSelectRisk={(pcbRange, category) => showRows({ pcbRange }, category)} pre1997={pre1997} />
    <TestMethodCard stats={stats} loading={loading} onSelect={(filters, type) => showRows(filters, type)} />
    <DistributionCharts
      scope={scope}
      reloadKey={reloadKey}
      onDrill={setScope}
      onSelectGroup={(target, pcbRange) => { setScope(target); showRows({ pcbRange }, 'transformator'); }}
      onSelectYears={(filters) => showRows(filters, 'transformator')}
    />
    <div ref={tableRef} className="scroll-mt-6"><DataTable companies={companies} reloadKey={reloadKey} scope={scope} preset={tablePreset} onEdit={handleEdit} onDelete={handleDelete} /></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-1 text-base font-semibold">Peta gabungan sebaran inventaris</h2><MapNotice shown={points.length} total={pointTotal} /><MapLeaflet points={points} height="400px" onSelectPoint={(selected) => showRows({ mapPoint: mapPointFilter(selected) })} /></div>
  </div>;
}
