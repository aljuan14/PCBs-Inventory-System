'use client';

import dynamic from 'next/dynamic';
import { AlertCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import DataTable, { type EditableInventoryFields, type InventoryItem } from '@/components/DataTable';
import DashboardCharts from '@/components/DashboardCharts';
import MapNotice from '@/components/MapNotice';
import { useDashboardData } from '@/components/useDashboardData';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

function getCategory(category: InventoryCategory) {
  return INVENTORY_CATEGORIES.find((item) => item.key === category) ?? INVENTORY_CATEGORIES[0];
}

const formatNumber = (value: number) => value.toLocaleString('id-ID');

export default function InventoryCategoryDashboard({ category }: { category: InventoryCategory }) {
  const config = getCategory(category);
  const { supabase, stats, companies, points, pointTotal, loading, refreshing, error, reloadKey, reload } = useDashboardData(category);

  const handleEdit = async (item: InventoryItem, changes: EditableInventoryFields) => {
    const payload: Record<string, string | number | null> = {};
    if (category === 'minyak_dielektrik') {
      payload.merek_minyak_dielektrik = changes.name.trim() || null;
      payload.uji_konsentrasi_ppm = changes.pcbConcentration;
      payload.lokasi_penyimpanan = changes.location.trim() || null;
      payload.status_minyak = changes.status.trim() || null;
    } else if (category === 'kapasitor') {
      payload.nama_merek = changes.name.trim() || null;
      payload.nomor_serial = changes.serialNumber.trim() || null;
      payload.lokasi_peralatan = changes.location.trim() || null;
      payload.status_alat = changes.status.trim() || null;
    } else {
      payload.nama_merek = changes.name.trim() || null;
      payload.nomor_serial = changes.serialNumber.trim() || null;
      payload.uji_konsentrasi_ppm = changes.pcbConcentration;
      payload.lokasi_peralatan = changes.location.trim() || null;
      if (category === 'transformator_tidak_digunakan') payload.status_kondisi = changes.status.trim() || null;
    }
    const { error: updateError } = await supabase.from(category).update(payload).eq('id', item.id);
    if (updateError) throw updateError;
    await reload();
  };

  const handleDelete = async (item: InventoryItem) => {
    const { error: deleteError } = await supabase.from(category).delete().eq('id', item.id);
    if (deleteError) throw deleteError;
    await reload();
  };

  const summary = stats?.[category];
  const total = summary?.total ?? 0;
  const tested = summary?.tested ?? 0;
  const moderate = summary?.risk_moderate ?? 0;
  const high = summary?.risk_high ?? 0;
  const distributionData = [{ category: 'Risiko PCB', transformator: category.startsWith('transformator') ? total : 0, kapasitor: category === 'kapasitor' ? total : 0, minyak: category === 'minyak_dielektrik' ? total : 0 }];
  const riskData = [{ name: 'Bebas PCB (<50)', value: summary?.risk_safe ?? 0, color: '#10b981' }, { name: 'Terkontaminasi', value: moderate, color: '#f59e0b' }, { name: 'Bahaya Tinggi', value: high, color: '#ef4444' }, { name: 'Belum diuji', value: total - tested, color: '#94a3b8' }];

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Inventarisasi kategori</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{config.label}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{config.description}</p></div>
      <div className="flex gap-2"><button type="button" onClick={reload} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button><a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a></div>
    </header>
    {error && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800"><AlertCircle className="h-4 w-4" /> {error}</div>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Total data</div><div className="mt-2 text-3xl font-semibold">{loading ? '...' : formatNumber(total)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Sudah diuji</div><div className="mt-2 text-3xl font-semibold">{loading ? '...' : formatNumber(tested)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Terkontaminasi</div><div className="mt-2 text-3xl font-semibold text-amber-700">{loading ? '...' : formatNumber(moderate)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Bahaya tinggi</div><div className="mt-2 text-3xl font-semibold text-rose-700">{loading ? '...' : formatNumber(high)}</div></div></section>
    <DashboardCharts distributionData={distributionData} riskCategoryData={riskData} />
    <DataTable category={category} companies={companies} reloadKey={reloadKey} onEdit={handleEdit} onDelete={handleDelete} />
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-1 text-base font-semibold">Peta sebaran {config.shortLabel}</h2><MapNotice shown={points.length} total={pointTotal} /><MapLeaflet points={points} height="360px" /></div>
  </div>;
}
