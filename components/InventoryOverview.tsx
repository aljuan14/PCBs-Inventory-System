'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { INVENTORY_CATEGORIES, hasPcbConcentration } from '@/lib/inventory';
import { ALL_SCOPE, mapPointFilter, sumStats, type DashboardScope, type InventoryFilters } from '@/lib/inventory-query';
import DataTable, { type TablePreset } from '@/components/DataTable';
import DashboardCharts, { type CategoryRisk } from '@/components/DashboardCharts';
import DashboardScopeFilter from '@/components/DashboardScopeFilter';
import DataQualityPanel from '@/components/DataQualityPanel';
import InventorySummary from '@/components/InventorySummary';
import MapNotice from '@/components/MapNotice';
import { useDashboardData } from '@/components/useDashboardData';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

const MEASURED_CATEGORIES = INVENTORY_CATEGORIES.map((category) => category.key).filter(hasPcbConcentration);

export default function InventoryOverview() {
  const [scope, setScope] = useState<DashboardScope>(ALL_SCOPE);
  const { stats, companies, points, pointTotal, loading, refreshing, error, reloadKey, reload } = useDashboardData(undefined, scope);
  const companyName = companies.find((company) => company.id === scope.companyId)?.name;
  const scopeLabel = [companyName, scope.unit, scope.subUnit].filter(Boolean).join(' › ');

  // Clicking a data quality indicator filters the table and brings it into view.
  const [tablePreset, setTablePreset] = useState<TablePreset | undefined>();
  const tableRef = useRef<HTMLDivElement>(null);
  const showRows = (filters: Partial<InventoryFilters>, type?: TablePreset['type']) => {
    setTablePreset((prev) => ({ key: (prev?.key ?? 0) + 1, filters, type }));
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const categoryRisk: CategoryRisk[] = INVENTORY_CATEGORIES.map((category) => {
    const summary = stats?.[category.key];
    return {
      category: category.key,
      label: category.label,
      counts: { safe: summary?.risk_safe ?? 0, moderate: summary?.risk_moderate ?? 0, high: summary?.risk_high ?? 0, untested: (summary?.total ?? 0) - (summary?.tested ?? 0) },
      volumeL: category.key === 'minyak_dielektrik' ? summary?.volume_l ?? 0 : undefined,
      measured: hasPcbConcentration(category.key),
    };
  });
  // The donut leaves out kapasitor, whose rows can never be tested for PCBs.
  const total = stats ? sumStats(stats, MEASURED_CATEGORIES, 'total') : 0;
  const tested = stats ? sumStats(stats, MEASURED_CATEGORIES, 'tested') : 0;
  const riskCounts = {
    safe: stats ? sumStats(stats, MEASURED_CATEGORIES, 'risk_safe') : 0,
    moderate: stats ? sumStats(stats, MEASURED_CATEGORIES, 'risk_moderate') : 0,
    high: stats ? sumStats(stats, MEASURED_CATEGORIES, 'risk_high') : 0,
    untested: total - tested,
  };

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Ringkasan nasional</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Dashboard nasional</h1><p className="mt-2 text-sm text-slate-500">Ringkasan inventarisasi PCBs seluruh kategori{scopeLabel ? <> untuk <span className="font-semibold text-slate-700">{scopeLabel}</span></> : ''}.</p></div><div className="flex gap-2"><button type="button" onClick={reload} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button><a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a></div></header>
    {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {error}</div>}
    <DashboardScopeFilter companies={companies} scope={scope} onChange={setScope} reloadKey={reloadKey} />
    <InventorySummary stats={stats} loading={loading} />
    <DashboardCharts categoryRisk={categoryRisk} riskCounts={riskCounts} riskFootnote="Kapasitor tidak termasuk karena templatenya tidak memuat kolom konsentrasi PCBs." loading={loading} onSelectRisk={(pcbRange, category) => showRows({ pcbRange }, category)} />
    <DataQualityPanel scope={scope} scopeLabel={scopeLabel} companies={companies} reloadKey={reloadKey} onDrill={setScope} onShowRows={showRows} />
    <div ref={tableRef} className="scroll-mt-6"><DataTable companies={companies} reloadKey={reloadKey} scope={scope} preset={tablePreset} /></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-1 text-base font-semibold">Peta gabungan sebaran inventaris</h2><MapNotice shown={points.length} total={pointTotal} /><MapLeaflet points={points} height="400px" onSelectPoint={(selected) => showRows({ mapPoint: mapPointFilter(selected) })} /></div>
  </div>;
}
