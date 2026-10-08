'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { INVENTORY_CATEGORIES, PCB_CLASSES, hasPcbConcentration, type InventoryCategory } from '@/lib/inventory';
import { ALL_SCOPE, PRE_1997_FILTER, TRAFO_CATEGORIES, issueTableFilter, mapPointFilter, pre1997RiskCounts, type InventoryFilters, type IssueLink } from '@/lib/inventory-query';
import DataTable, { type EditableInventoryFields, type InventoryItem } from '@/components/DataTable';
import DashboardCharts from '@/components/DashboardCharts';
import DistributionCharts from '@/components/DistributionCharts';
import MapNotice from '@/components/MapNotice';
import { useDashboardData } from '@/components/useDashboardData';
import { deleteInventoryItem, updateInventoryItem } from '@/lib/inventory-edit';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

function getCategory(category: InventoryCategory) {
  return INVENTORY_CATEGORIES.find((item) => item.key === category) ?? INVENTORY_CATEGORIES[0];
}

const formatNumber = (value: number) => value.toLocaleString('id-ID');

export default function InventoryCategoryDashboard({ category, issue }: { category: InventoryCategory; issue?: IssueLink }) {
  const config = getCategory(category);
  const { supabase, stats, companies, points, pointTotal, loading, refreshing, error, reloadKey, reload } = useDashboardData(category);

  // Clicking a risk class filters the table and brings it into view; a link
  // from the upload history opens with the rows of one finding.
  const [tablePreset, setTablePreset] = useState<{ key: number; filters: Partial<InventoryFilters> } | undefined>(() =>
    issue ? { key: 1, filters: { batchId: issue.batchId, ...issueTableFilter(issue.key, issue.label) } } : undefined);
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (issue) tableRef.current?.scrollIntoView({ block: 'start' });
  }, [issue]);
  const showRows = (filters: Partial<InventoryFilters>) => {
    setTablePreset((prev) => ({ key: (prev?.key ?? 0) + 1, filters }));
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleEdit = async (item: InventoryItem, changes: EditableInventoryFields) => {
    await updateInventoryItem(supabase, item, changes);
    await reload();
  };

  const handleDelete = async (item: InventoryItem) => {
    await deleteInventoryItem(supabase, item);
    await reload();
  };

  const summary = stats?.[category];
  const total = summary?.total ?? 0;
  const tested = summary?.tested ?? 0;
  const moderate = summary?.risk_moderate ?? 0;
  const high = summary?.risk_high ?? 0;
  const riskCounts = hasPcbConcentration(category) ? { safe: summary?.risk_safe ?? 0, moderate, high, untested: total - tested } : null;
  const pre1997 = TRAFO_CATEGORIES.includes(category)
    ? [{ counts: pre1997RiskCounts(stats, [category]), unknownYear: summary?.unknown_year ?? 0, onSelectRisk: (pcbRange: InventoryFilters['pcbRange']) => showRows({ pcbRange, ...PRE_1997_FILTER }) }]
    : undefined;

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Inventarisasi kategori</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{config.label}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{config.description}</p></div>
      <div className="flex gap-2"><button type="button" onClick={reload} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button><a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a></div>
    </header>
    {error && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800"><AlertCircle className="h-4 w-4" /> {error}</div>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Total data</div><div className="mt-2 text-3xl font-semibold">{loading ? '...' : formatNumber(total)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Sudah diuji</div><div className="mt-2 text-3xl font-semibold">{loading ? '...' : formatNumber(tested)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">{PCB_CLASSES.moderate.label} ({PCB_CLASSES.moderate.range})</div><div className="mt-2 text-3xl font-semibold text-amber-700">{loading ? '...' : formatNumber(moderate)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">{PCB_CLASSES.high.label} ({PCB_CLASSES.high.range})</div><div className="mt-2 text-3xl font-semibold text-rose-700">{loading ? '...' : formatNumber(high)}</div></div></section>
    <DashboardCharts riskCounts={riskCounts} loading={loading} onSelectRisk={(pcbRange) => showRows({ pcbRange })} pre1997={pre1997} />
    {TRAFO_CATEGORIES.includes(category) && (
      <DistributionCharts
        scope={ALL_SCOPE}
        category={category}
        reloadKey={reloadKey}
        onSelectGroup={(target, pcbRange) => showRows({ companyId: target.companyId, unit: target.unit, subUnit: target.subUnit, pcbRange })}
        onSelectYears={showRows}
      />
    )}
    <div ref={tableRef} className="scroll-mt-6"><DataTable category={category} companies={companies} reloadKey={reloadKey} preset={tablePreset} onEdit={handleEdit} onDelete={handleDelete} /></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-1 text-base font-semibold">Peta sebaran {config.shortLabel}</h2><MapNotice shown={points.length} total={pointTotal} /><MapLeaflet points={points} height="360px" onSelectPoint={(selected) => showRows({ mapPoint: mapPointFilter(selected) })} /></div>
  </div>;
}
