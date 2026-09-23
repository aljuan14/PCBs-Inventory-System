'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import DataTable, { type InventoryItem } from '@/components/DataTable';
import DashboardCharts from '@/components/DashboardCharts';
import type { MapPoint } from '@/components/MapLeaflet';

const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

export default function InventoryOverview() {
  const supabase = createClient();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = async () => {
    setNotice(null);
    const [{ data: companyRows, error: companyError }, ...categoryResults] = await Promise.all([
      supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan'),
      ...INVENTORY_CATEGORIES.map((category) => supabase.from(category.key).select('*')),
    ]);
    if (companyError) setNotice(companyError.message);
    const companyMap = new Map((companyRows || []).map((company) => [company.id, company.nama_perusahaan]));
    const nextItems: InventoryItem[] = [];
    const nextPoints: MapPoint[] = [];
    categoryResults.forEach((result, index) => {
      const category = INVENTORY_CATEGORIES[index].key as InventoryCategory;
      (result.data || []).forEach((row: Record<string, any>) => {
        const item: InventoryItem = {
          id: row.id,
          type: category,
          name: row.nama_merek || row.merek_minyak_dielektrik || 'Tanpa nama',
          companyName: companyMap.get(row.company_id) || 'Perusahaan',
          serialNumber: row.nomor_serial || '',
          location: row.lokasi_peralatan || row.lokasi_penyimpanan || '',
          latitude: row.koordinat_lat,
          longitude: row.koordinat_lng,
          pcbConcentration: row.uji_konsentrasi_ppm ?? null,
          status: row.status_alat || row.status_minyak || null,
          capacity: row.daya_kva ? `${row.daya_kva} kVA` : row.volume_l ? `${row.volume_l} L` : null,
          createdAt: row.created_at,
        };
        nextItems.push(item);
        if (item.latitude != null && item.longitude != null) nextPoints.push({ ...item, latitude: item.latitude, longitude: item.longitude });
      });
    });
    setItems(nextItems);
    setCompanies([...new Set(nextItems.map((item) => item.companyName))]);
    setPoints(nextPoints);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const tested = items.filter((item) => item.pcbConcentration != null);
  const high = items.filter((item) => (item.pcbConcentration || 0) > 500).length;
  const moderate = items.filter((item) => (item.pcbConcentration || 0) >= 50 && (item.pcbConcentration || 0) <= 500).length;
  const safe = tested.length - high - moderate;
  const byCategory = INVENTORY_CATEGORIES.map((category) => ({ category: category.shortLabel, transformator: category.key.startsWith('transformator') ? items.filter((item) => item.type === category.key).length : 0, kapasitor: category.key === 'kapasitor' ? items.filter((item) => item.type === category.key).length : 0, minyak: category.key === 'minyak_dielektrik' ? items.filter((item) => item.type === category.key).length : 0 }));
  const riskData = [{ name: 'Bebas PCB (<50)', value: safe, color: '#10b981' }, { name: 'Terkontaminasi', value: moderate, color: '#f59e0b' }, { name: 'Bahaya Tinggi', value: high, color: '#ef4444' }, { name: 'Belum diuji', value: items.length - tested.length, color: '#94a3b8' }];

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Ringkasan nasional</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Dashboard nasional</h1><p className="mt-2 text-sm text-slate-500">Ringkasan inventarisasi PCBs seluruh kategori.</p></div><div className="flex gap-2"><button type="button" onClick={() => { setRefreshing(true); loadData(); }} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button><a href="/upload" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</a></div></header>
    {notice && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {notice}</div>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200"><div className="text-xs text-slate-500">Total inventaris</div><div className="mt-2 text-3xl font-semibold">{loading ? '...' : items.length}</div></div>{INVENTORY_CATEGORIES.slice(0, 3).map((category) => <div key={category.key} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200"><div className="text-xs text-slate-500">{category.shortLabel}</div><div className="mt-2 text-3xl font-semibold">{items.filter((item) => item.type === category.key).length}</div></div>)}</section>
    <DashboardCharts distributionData={byCategory} riskCategoryData={riskData} />
    <DataTable items={items} companies={companies} />
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-base font-semibold">Peta gabungan sebaran inventaris</h2><MapLeaflet points={points} height="400px" /></div>
  </div>;
}
