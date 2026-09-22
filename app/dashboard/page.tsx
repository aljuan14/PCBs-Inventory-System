'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { 
  Building2, 
  Cpu, 
  BatteryCharging, 
  Droplet, 
  AlertTriangle, 
  UploadCloud, 
  RefreshCw
} from 'lucide-react';
import DataTable, { InventoryItem } from '@/components/DataTable';
import DashboardCharts from '@/components/DashboardCharts';
import { MapPoint } from '@/components/MapLeaflet';

// Import Leaflet Map dynamically with SSR disabled
const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-xs">
      <p className="text-xs font-medium animate-pulse">Memuat Peta Spasial Leaflet...</p>
    </div>
  ),
});

export default function DashboardPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dbNotice, setDbNotice] = useState<string | null>(null);

  // Metrics
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [trafoStats, setTrafoStats] = useState({ total: 0, aktif: 0, nonAktif: 0 });
  const [totalKapasitor, setTotalKapasitor] = useState(0);
  const [totalMinyak, setTotalMinyak] = useState(0);

  // Items for Table and Map
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);

  // Chart data
  const [distributionData, setDistributionData] = useState([
    { category: 'Aman (<50 ppm)', transformator: 0, kapasitor: 0, minyak: 0 },
    { category: 'Terkontaminasi (50-500)', transformator: 0, kapasitor: 0, minyak: 0 },
    { category: 'Bahaya (>500 ppm)', transformator: 0, kapasitor: 0, minyak: 0 },
    { category: 'Belum Diuji', transformator: 0, kapasitor: 0, minyak: 0 },
  ]);

  const [riskData, setRiskData] = useState([
    { name: 'Bebas PCB (<50)', value: 0, color: '#10b981' },
    { name: 'Terkontaminasi (50-500)', value: 0, color: '#f59e0b' },
    { name: 'Bahaya Tinggi (>500)', value: 0, color: '#ef4444' },
    { name: 'Belum Diuji', value: 0, color: '#94a3b8' },
  ]);

  const loadDashboardData = async () => {
    try {
      setDbNotice(null);

      // 1. Fetch Perusahaan
      const { data: companies, error: compErr } = await supabase
        .from('companies')
        .select('*');

      if (compErr) {
        if (compErr.code === '42P01') {
          setDbNotice('Tabel belum dibuat di Supabase. Silakan jalankan file SQL migration di Supabase SQL Editor.');
        }
        return;
      }

      const compMap = new Map<string, string>();
      const compList: string[] = [];
      if (companies) {
        setTotalCompanies(companies.length);
        for (const c of companies) {
          compMap.set(c.id, c.nama_perusahaan);
          compList.push(c.nama_perusahaan);
        }
        setCompanyNames(compList);
      }

      // 2. Fetch Transformator
      const { data: trafos } = await supabase.from('transformator').select('*');
      // 3. Fetch Kapasitor
      const { data: kapasitors } = await supabase.from('kapasitor').select('*');
      // 4. Fetch Minyak
      const { data: minyaks } = await supabase.from('minyak_dielektrik').select('*');

      const allItems: InventoryItem[] = [];
      const points: MapPoint[] = [];

      let trafoAktif = 0;
      let trafoNonAktif = 0;

      // Stats counters for charts
      let tSafe = 0, tMod = 0, tHigh = 0, tUntested = 0;
      let kSafe = 0, kMod = 0, kHigh = 0, kUntested = 0;
      let mSafe = 0, mMod = 0, mHigh = 0, mUntested = 0;

      // Process Transformator
      if (trafos) {
        for (const t of trafos) {
          const cName = compMap.get(t.company_id) || 'Perusahaan';
          const isAktif = t.status?.toLowerCase() !== 'non_aktif' && t.status?.toLowerCase() !== 'rusak';
          if (isAktif) trafoAktif++;
          else trafoNonAktif++;

          // Risk stats
          const ppm = t.konsentrasi_pcb_ppm;
          if (ppm === null || ppm === undefined) tUntested++;
          else if (ppm > 500) tHigh++;
          else if (ppm >= 50) tMod++;
          else tSafe++;

          allItems.push({
            id: t.id,
            type: 'transformator',
            name: t.nama_merek,
            companyName: cName,
            serialNumber: t.nomor_serial,
            location: t.lokasi_peralatan,
            latitude: t.latitude,
            longitude: t.longitude,
            pcbConcentration: t.konsentrasi_pcb_ppm,
            status: t.status,
            capacity: t.daya_kva ? `${t.daya_kva} kVA` : null,
            createdAt: t.created_at,
          });

          if (t.latitude !== null && t.longitude !== null && !isNaN(t.latitude) && !isNaN(t.longitude)) {
            points.push({
              id: t.id,
              type: 'transformator',
              name: t.nama_merek,
              companyName: cName,
              serialNumber: t.nomor_serial,
              location: t.lokasi_peralatan,
              latitude: Number(t.latitude),
              longitude: Number(t.longitude),
              pcbConcentration: t.konsentrasi_pcb_ppm,
              status: t.status,
            });
          }
        }
        setTrafoStats({
          total: trafos.length,
          aktif: trafoAktif,
          nonAktif: trafoNonAktif,
        });
      }

      // Process Kapasitor
      if (kapasitors) {
        setTotalKapasitor(kapasitors.length);
        for (const k of kapasitors) {
          const cName = compMap.get(k.company_id) || 'Perusahaan';
          kUntested++;

          allItems.push({
            id: k.id,
            type: 'kapasitor',
            name: k.nama_merek,
            companyName: cName,
            serialNumber: k.nomor_serial,
            location: k.lokasi,
            latitude: k.latitude,
            longitude: k.longitude,
            status: k.status_alat,
            createdAt: k.created_at,
          });

          if (k.latitude !== null && k.longitude !== null && !isNaN(k.latitude) && !isNaN(k.longitude)) {
            points.push({
              id: k.id,
              type: 'kapasitor',
              name: k.nama_merek,
              companyName: cName,
              serialNumber: k.nomor_serial,
              location: k.lokasi,
              latitude: Number(k.latitude),
              longitude: Number(k.longitude),
              status: k.status_alat,
            });
          }
        }
      }

      // Process Minyak Dielektrik
      if (minyaks) {
        setTotalMinyak(minyaks.length);
        for (const m of minyaks) {
          const cName = compMap.get(m.company_id) || 'Perusahaan';
          const ppm = m.konsentrasi_pcb_ppm;
          if (ppm === null || ppm === undefined) mUntested++;
          else if (ppm > 500) mHigh++;
          else if (ppm >= 50) mMod++;
          else mSafe++;

          allItems.push({
            id: m.id,
            type: 'minyak_dielektrik',
            name: m.merek,
            companyName: cName,
            location: m.lokasi_penyimpanan,
            latitude: m.latitude,
            longitude: m.longitude,
            pcbConcentration: m.konsentrasi_pcb_ppm,
            status: m.status,
            capacity: m.volume_l ? `${m.volume_l} Liter` : null,
            createdAt: m.created_at,
          });

          if (m.latitude !== null && m.longitude !== null && !isNaN(m.latitude) && !isNaN(m.longitude)) {
            points.push({
              id: m.id,
              type: 'minyak_dielektrik',
              name: m.merek,
              companyName: cName,
              location: m.lokasi_penyimpanan,
              latitude: Number(m.latitude),
              longitude: Number(m.longitude),
              pcbConcentration: m.konsentrasi_pcb_ppm,
              status: m.status,
            });
          }
        }
      }

      setInventoryItems(allItems);
      setMapPoints(points);

      // Update Chart Data
      setDistributionData([
        { category: 'Aman (<50 ppm)', transformator: tSafe, kapasitor: kSafe, minyak: mSafe },
        { category: 'Terkontaminasi (50-500)', transformator: tMod, kapasitor: kMod, minyak: mMod },
        { category: 'Bahaya (>500 ppm)', transformator: tHigh, kapasitor: kHigh, minyak: mHigh },
        { category: 'Belum Diuji', transformator: tUntested, kapasitor: kUntested, minyak: mUntested },
      ]);

      const sumSafe = tSafe + kSafe + mSafe;
      const sumMod = tMod + kMod + mMod;
      const sumHigh = tHigh + kHigh + mHigh;
      const sumUntested = tUntested + kUntested + mUntested;

      setRiskData([
        { name: 'Bebas PCB (<50)', value: sumSafe, color: '#10b981' },
        { name: 'Terkontaminasi (50-500)', value: sumMod, color: '#f59e0b' },
        { name: 'Bahaya Tinggi (>500)', value: sumHigh, color: '#ef4444' },
        { name: 'Belum Diuji', value: sumUntested, color: '#94a3b8' },
      ]);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  return (
    <div className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Top Banner & Refresh */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl">
            Dashboard Inventarisasi PCBs Nasional
          </h1>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Monitoring sebaran transformator, kapasitor, dan minyak dielektrik berpotensi PCBs
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan Data</span>
          </button>

          <Link
            href="/upload"
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Upload File Excel</span>
          </Link>
        </div>
      </div>

      {/* Database Warning Notice if SQL not run yet */}
      {dbNotice && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-bold text-amber-950">Database Belum Dikonfigurasi di Supabase</div>
              <div className="text-amber-800">{dbNotice}</div>
            </div>
          </div>
          <a
            href="https://supabase.com/dashboard/project/fifjrfzwqhmexnanaoag"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-amber-600 px-3.5 py-1.5 font-bold text-white shadow-xs hover:bg-amber-700 transition-colors shrink-0 text-center"
          >
            Buka Supabase SQL Editor
          </a>
        </div>
      )}

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Perusahaan */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Perusahaan Terdaftar
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {totalCompanies}
            </span>
            <span className="text-xs text-slate-400 font-medium">Entitas Industri</span>
          </div>
        </div>

        {/* Transformator */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Transformator
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Cpu className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900">
              {trafoStats.total}
            </span>
            <div className="text-[11px] font-semibold text-slate-500">
              <span className="text-emerald-700">{trafoStats.aktif} Aktif</span> &bull;{' '}
              <span className="text-slate-400">{trafoStats.nonAktif} Non-Aktif</span>
            </div>
          </div>
        </div>

        {/* Kapasitor */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Kapasitor Unit
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <BatteryCharging className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {totalKapasitor}
            </span>
            <span className="text-xs text-slate-400 font-medium">Bank / Unit Terdata</span>
          </div>
        </div>

        {/* Minyak Dielektrik */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Minyak Dielektrik
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Droplet className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {totalMinyak}
            </span>
            <span className="text-xs text-slate-400 font-medium">Wadah / Drum Simpan</span>
          </div>
        </div>
      </div>

      {/* Peta GIS Leaflet */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Peta Sebaran Spasial Lokasi Peralatan
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Menampilkan {mapPoints.length} titik koordinat yang berhasil di-parse dari string DMS Excel
          </p>
        </div>

        <MapLeaflet points={mapPoints} height="440px" />
      </div>

      {/* Charts Section */}
      <DashboardCharts
        distributionData={distributionData}
        riskCategoryData={riskData}
      />

      {/* Data Table Section */}
      <DataTable items={inventoryItems} companies={companyNames} />
    </div>
  );
}
