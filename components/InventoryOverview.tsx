'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { ALL_SCOPE, mapPointFilter, type DashboardScope, type InventoryFilters, type YearScope } from '@/lib/inventory-query';
import DataTable, { type EditableInventoryFields, type InventoryItem, type TablePreset } from '@/components/DataTable';
import CompanyCheckCard from '@/components/CompanyCheckCard';
import CompanyPcbStatusCard, { reportHref } from '@/components/CompanyPcbStatusCard';
import DashboardScopeFilter from '@/components/DashboardScopeFilter';
import InventorySummary, { YearRail, YearToggle } from '@/components/InventorySummary';
import TonnageCard from '@/components/TonnageCard';
import SummaryStamp from '@/components/SummaryStamp';
import { useDashboardData } from '@/components/useDashboardData';
import { useReadOnly } from '@/components/useAccess';
import { SUMMARY_MODE } from '@/lib/data-mode';
import { fetchCompanyStatuses, type CompanyStatus } from '@/lib/company-status';
import { deleteInventoryItem, updateInventoryItem } from '@/lib/inventory-edit';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

export default function InventoryOverview() {
  const [scope, setScope] = useState<DashboardScope>(ALL_SCOPE);
  const { supabase, stats, companies, loading, refreshing, error, reloadKey, reload } = useDashboardData(scope);
  const companyName = companies.find((company) => company.id === scope.companyId)?.name;
  const readOnly = useReadOnly();
  // One production-year switch for the figures, the test results and the tonnage.
  const [years, setYears] = useState<YearScope>('all');
  // The floating switch shows while the cards it drives are on screen and the bar above them is not.
  const yearBarRef = useRef<HTMLDivElement>(null);
  const yearCardsRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState({ bar: true, cards: false });
  useEffect(() => {
    const bar = yearBarRef.current;
    const cards = yearCardsRef.current;
    if (!bar || !cards) return;
    const observer = new IntersectionObserver((entries) => {
      setInView((current) => {
        const next = { ...current };
        for (const entry of entries) next[entry.target === bar ? 'bar' : 'cards'] = entry.isIntersecting;
        return next;
      });
    });
    observer.observe(bar);
    observer.observe(cards);
    return () => observer.disconnect();
  }, []);

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
    if (SUMMARY_MODE) return;
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
  // The web has no table, so figures and map points open nothing there.

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:pl-8 lg:pr-24">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Ringkasan nasional</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Dashboard nasional</h1><p className="mt-2 text-sm text-slate-500">Ringkasan inventarisasi PCBs seluruh kategori{scopeLabel ? <> untuk <span className="font-semibold text-slate-700">{scopeLabel}</span></> : ''}.</p></div><div className="flex gap-2"><button type="button" onClick={reload} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button>{!SUMMARY_MODE && !readOnly && <a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a>}</div></header>
    {SUMMARY_MODE && <SummaryStamp supabase={supabase} />}
    {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {error}</div>}
    {/* The map first: where the equipment is, before the figures. */}
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 text-base font-semibold">Peta sebaran inventaris</h2><MapLeaflet supabase={supabase} companies={companies} scope={scope} onScopeChange={setScope} reloadKey={reloadKey} height="380px" onSelectPoint={SUMMARY_MODE ? undefined : (selected) => showRows({ mapPoint: mapPointFilter(selected) })} /></div>
    <DashboardScopeFilter companies={companies} scope={scope} onChange={setScope} reloadKey={reloadKey} statuses={statuses} />
    {!SUMMARY_MODE && !readOnly && scope.companyId && companyName && <CompanyCheckCard companyId={scope.companyId} companyName={companyName} reloadKey={reloadKey} onSendsChange={() => setStatusKey((key) => key + 1)} />}
    {scope.companyId && <CompanyPcbStatusCard supabase={supabase} companyId={scope.companyId} reloadKey={reloadKey} hrefFor={SUMMARY_MODE ? undefined : (target) => reportHref(scope.companyId!, target, { readOnly })} />}
    <div ref={yearBarRef} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">Tahun pembuatan</span>
      <YearToggle value={years} onChange={setYears} />
      <span className="text-xs text-slate-500">{years === 'all' ? 'Semua peralatan, termasuk yang tahunnya tidak diketahui.' : `Hanya peralatan ${years === 'pre1997' ? 'buatan sebelum 1997' : 'buatan 1997 ke atas'}; yang tahunnya tidak diketahui tidak dihitung.`} Berlaku untuk angka, hasil pengujian, dan tonase di bawah.</span>
    </div>
    <YearRail value={years} onChange={setYears} visible={inView.cards && !inView.bar} />
    <div ref={yearCardsRef} className="space-y-6">
    <InventorySummary stats={stats} scope={years} loading={loading} onSelect={SUMMARY_MODE ? undefined : (filters, category) => showRows(filters, category)} />
    <TonnageCard stats={stats} scope={years} loading={loading} onSelect={SUMMARY_MODE ? undefined : (filters, type) => showRows(filters, type)} supabase={supabase} companyId={scope.companyId} unitPicked={Boolean(scope.unit || scope.subUnit)} reloadKey={reloadKey} />
    </div>
    {!SUMMARY_MODE && <div ref={tableRef} className="scroll-mt-6"><DataTable companies={companies} reloadKey={reloadKey} scope={scope} onScopeChange={setScope} preset={tablePreset} onEdit={handleEdit} onDelete={handleDelete} /></div>}
  </div>;
}
