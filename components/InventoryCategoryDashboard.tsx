'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import DataTable, { type EditableInventoryFields, type InventoryItem } from '@/components/DataTable';
import DashboardCharts from '@/components/DashboardCharts';
import type { MapPoint } from '@/components/MapLeaflet';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

function getCategory(category: InventoryCategory) {
  return INVENTORY_CATEGORIES.find((item) => item.key === category) ?? INVENTORY_CATEGORIES[0];
}

function toItem(category: InventoryCategory, row: Record<string, any>, companyNames: Map<string, string>): InventoryItem {
  const isTrafo = category.startsWith('transformator');
  return {
    id: row.id,
    no: row.no,
    type: category,
    name: row.nama_merek || row.merek_minyak_dielektrik || 'Tanpa nama',
    companyName: companyNames.get(row.company_id) || 'Perusahaan',
    serialNumber: row.nomor_serial || '',
    location: row.lokasi_peralatan || row.lokasi_penyimpanan || '',
    latitude: row.koordinat_lat,
    longitude: row.koordinat_lng,
    pcbConcentration: row.uji_konsentrasi_ppm ?? null,
    status: row.status_alat || row.status_minyak || (isTrafo ? (category.endsWith('digunakan') ? 'Masih digunakan' : 'Tidak digunakan') : null),
    capacity: row.daya_kva ? `${row.daya_kva} kVA` : row.volume_l ? `${row.volume_l} L` : null,
    createdAt: row.created_at,
    details: row,
  };
}

export default function InventoryCategoryDashboard({ category }: { category: InventoryCategory }) {
  const supabase = createClient();
  const config = getCategory(category);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    const [{ data: rows, error: rowsError }, { data: companyRows }] = await Promise.all([
      supabase.from(category).select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan'),
    ]);
    if (rowsError) setError(rowsError.message);
    const companyMap = new Map((companyRows || []).map((company) => [company.id, company.nama_perusahaan]));
    const nextItems = (rows || []).map((row) => toItem(category, row, companyMap));
    setCompanies([...new Set(nextItems.map((item) => item.companyName))]);
    setItems(nextItems);
    setMapPoints(nextItems.filter((item): item is InventoryItem & { latitude: number; longitude: number } => item.latitude != null && item.longitude != null).map((item) => ({ ...item, latitude: item.latitude, longitude: item.longitude })));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, [category]);

  const handleEdit = async (item: InventoryItem, changes: EditableInventoryFields) => {
    const payload: Record<string, string | number | null> = {};
    if (category === 'minyak_dielektrik') {
      payload.merek_minyak_dielektrik = changes.name.trim();
      payload.uji_konsentrasi_ppm = changes.pcbConcentration;
      payload.lokasi_penyimpanan = changes.location.trim() || null;
      payload.status_minyak = changes.status.trim() || null;
    } else if (category === 'kapasitor') {
      payload.nama_merek = changes.name.trim();
      payload.nomor_serial = changes.serialNumber.trim() || null;
      payload.lokasi_peralatan = changes.location.trim() || null;
      payload.status_alat = changes.status.trim() || null;
    } else {
      payload.nama_merek = changes.name.trim();
      payload.nomor_serial = changes.serialNumber.trim() || null;
      payload.uji_konsentrasi_ppm = changes.pcbConcentration;
      payload.lokasi_peralatan = changes.location.trim() || null;
      if (category === 'transformator_tidak_digunakan') payload.status_kondisi = changes.status.trim() || null;
    }
    const { error: updateError } = await supabase.from(category).update(payload).eq('id', item.id);
    if (updateError) throw updateError;
    await loadData();
  };

  const handleDelete = async (item: InventoryItem) => {
    const { error: deleteError } = await supabase.from(category).delete().eq('id', item.id);
    if (deleteError) throw deleteError;
    await loadData();
  };

  const tested = items.filter((item) => item.pcbConcentration != null);
  const high = items.filter((item) => (item.pcbConcentration || 0) > 500).length;
  const moderate = items.filter((item) => (item.pcbConcentration || 0) >= 50 && (item.pcbConcentration || 0) <= 500).length;
  const safe = tested.length - high - moderate;
  const distributionData = [{ category: 'Risiko PCB', transformator: category.startsWith('transformator') ? items.length : 0, kapasitor: category === 'kapasitor' ? items.length : 0, minyak: category === 'minyak_dielektrik' ? items.length : 0 }];
  const riskData = [{ name: 'Bebas PCB (<50)', value: safe, color: '#10b981' }, { name: 'Terkontaminasi', value: moderate, color: '#f59e0b' }, { name: 'Bahaya Tinggi', value: high, color: '#ef4444' }, { name: 'Belum diuji', value: items.length - tested.length, color: '#94a3b8' }];

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Inventarisasi kategori</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{config.label}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{config.description}</p></div>
      <div className="flex gap-2"><button type="button" onClick={() => { setRefreshing(true); loadData(); }} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button><a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a></div>
    </header>
    {error && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800"><AlertCircle className="h-4 w-4" /> {error}</div>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Total data</div><div className="mt-2 text-3xl font-semibold">{loading ? '...' : items.length}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Sudah diuji</div><div className="mt-2 text-3xl font-semibold">{tested.length}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Terkontaminasi</div><div className="mt-2 text-3xl font-semibold text-amber-700">{moderate}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Bahaya tinggi</div><div className="mt-2 text-3xl font-semibold text-rose-700">{high}</div></div></section>
    <DashboardCharts distributionData={distributionData} riskCategoryData={riskData} />
    <DataTable items={items} companies={companies} onEdit={handleEdit} onDelete={handleDelete} />
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-base font-semibold">Peta sebaran {config.shortLabel}</h2><MapLeaflet points={mapPoints} height="360px" /></div>
  </div>;
}
