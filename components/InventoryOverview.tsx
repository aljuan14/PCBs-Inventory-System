'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { INVENTORY_CATEGORIES } from '@/lib/inventory';
import { ALL_SCOPE, sumStats, type DashboardScope, type InventoryFilters } from '@/lib/inventory-query';
import DataTable from '@/components/DataTable';
import DashboardCharts from '@/components/DashboardCharts';
import DashboardScopeFilter from '@/components/DashboardScopeFilter';
import DataQualityPanel from '@/components/DataQualityPanel';
import InventorySummary from '@/components/InventorySummary';
import MapNotice from '@/components/MapNotice';
import { useDashboardData } from '@/components/useDashboardData';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

const ALL_CATEGORIES = INVENTORY_CATEGORIES.map((category) => category.key);

export default function InventoryOverview() {
  const [scope, setScope] = useState<DashboardScope>(ALL_SCOPE);
  const { stats, companies, points, pointTotal, loading, refreshing, error, reloadKey, reload } = useDashboardData(undefined, scope);
  const companyName = companies.find((company) => company.id === scope.companyId)?.name;
  const scopeLabel = [companyName, scope.unit, scope.subUnit].filter(Boolean).join(' › ');

  // Clicking a data quality indicator filters the table and brings it into view.
  const [tablePreset, setTablePreset] = useState<{ key: number; filters: Partial<InventoryFilters> } | undefined>();
  const tableRef = useRef<HTMLDivElement>(null);
  const showRows = (filters: Partial<InventoryFilters>) => {
    setTablePreset((prev) => ({ key: (prev?.key ?? 0) + 1, filters }));
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const byCategory = INVENTORY_CATEGORIES.map((category) => {
    const total = stats?.[category.key].total ?? 0;
    return { category: category.shortLabel, transformator: category.key.startsWith('transformator') ? total : 0, kapasitor: category.key === 'kapasitor' ? total : 0, minyak: category.key === 'minyak_dielektrik' ? total : 0 };
  });
  const total = stats ? sumStats(stats, ALL_CATEGORIES, 'total') : 0;
  const tested = stats ? sumStats(stats, ALL_CATEGORIES, 'tested') : 0;
  const riskData = [
    { name: 'Bebas PCB (<50)', value: stats ? sumStats(stats, ALL_CATEGORIES, 'risk_safe') : 0, color: '#10b981' },
    { name: 'Terkontaminasi', value: stats ? sumStats(stats, ALL_CATEGORIES, 'risk_moderate') : 0, color: '#f59e0b' },
    { name: 'Bahaya Tinggi', value: stats ? sumStats(stats, ALL_CATEGORIES, 'risk_high') : 0, color: '#ef4444' },
    { name: 'Belum diuji', value: total - tested, color: '#94a3b8' },
  ];

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Ringkasan nasional</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Dashboard nasional</h1><p className="mt-2 text-sm text-slate-500">Ringkasan inventarisasi PCBs seluruh kategori{scopeLabel ? <> untuk <span className="font-semibold text-slate-700">{scopeLabel}</span></> : ''}.</p></div><div className="flex gap-2"><button type="button" onClick={reload} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button><a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a></div></header>
    {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {error}</div>}
    <DashboardScopeFilter companies={companies} scope={scope} onChange={setScope} reloadKey={reloadKey} />
    <InventorySummary stats={stats} loading={loading} />
    <DashboardCharts distributionData={byCategory} riskCategoryData={riskData} />
    <DataQualityPanel scope={scope} scopeLabel={scopeLabel} companies={companies} reloadKey={reloadKey} onDrill={setScope} onShowRows={showRows} />
    <div ref={tableRef} className="scroll-mt-6"><DataTable companies={companies} reloadKey={reloadKey} scope={scope} preset={tablePreset} /></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-1 text-base font-semibold">Peta gabungan sebaran inventaris</h2><MapNotice shown={points.length} total={pointTotal} /><MapLeaflet points={points} height="400px" /></div>
  </div>;
}
