'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardPen, FileSpreadsheet, Info, MapPinOff } from 'lucide-react';
import CompanyPcbStatusCard from '@/components/CompanyPcbStatusCard';
import InventorySummary, { YearToggle } from '@/components/InventorySummary';
import TonnageCard from '@/components/TonnageCard';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';
import { UPLOAD_STATUS } from '@/components/InventoryUpload';
import type { StatusTarget } from '@/lib/company-pcb-status';
import { formSpec } from '@/lib/form-fields';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { fetchInventoryStats, sumStats, type CategoryFilter, type InventoryStats, type YearScope } from '@/lib/inventory-query';

// Leaflet needs the window.
const MapLeaflet = dynamic(() => import('@/components/MapLeaflet'), { ssr: false });

type Upload = { id: string; kategori: InventoryCategory; nama_file: string; status: keyof typeof UPLOAD_STATUS; catatan: string | null; created_at: string };

const fmt = (value: number) => value.toLocaleString('id-ID');
const fmtDate = (value: string) => new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const ALL_CATEGORIES = INVENTORY_CATEGORIES.map((category) => category.key);

/** The company's Excel uploads still waiting or refused, the ones it may need to act on. */
function UploadsToWatch() {
  const { supabase, company, href } = useCompanyPortal();
  const [uploads, setUploads] = useState<{ key: string; list: Upload[] } | null>(null);
  useEffect(() => {
    let active = true;
    supabase.from('unggahan_perusahaan').select('id, kategori, nama_file, status, catatan, created_at').eq('company_id', company.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        if (!active) return;
        // The latest upload per form, if it is waiting or refused.
        const seen = new Set<string>();
        const list = ((data ?? []) as Upload[]).filter((upload) => { if (seen.has(upload.kategori)) return false; seen.add(upload.kategori); return upload.status === 'menunggu' || upload.status === 'ditolak'; });
        setUploads({ key: company.id, list });
      });
    return () => { active = false; };
  }, [supabase, company.id]);
  const list = uploads?.key === company.id ? uploads.list : [];
  if (list.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Unggahan Excel</h2>
        <Link href={href('/unggah')} className="text-xs font-semibold text-emerald-700 hover:underline">Lihat semua</Link>
      </div>
      <ul className="mt-3 space-y-2">
        {list.map((upload) => {
          const status = UPLOAD_STATUS[upload.status];
          const Icon = status.icon;
          return (
            <li key={upload.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${status.className}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">Formulir {formSpec(upload.kategori).code}: {status.label}</span> · {upload.nama_file} · {fmtDate(upload.created_at)}
                {upload.status === 'ditolak' && upload.catatan && <span className="mt-0.5 block">Alasan: {upload.catatan}. Perbaiki berkasnya lalu unggah lagi.</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A company with nothing recorded yet: where to start, instead of empty charts. */
function StartHere() {
  const { href } = useCompanyPortal();
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <h2 className="text-base font-semibold text-slate-900">Belum ada peralatan yang tercatat</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">Mulai dengan mengisi kepemilikan peralatan dan formulir 1.1–1.4, satu per satu atau dengan template Excel. Ringkasan, grafik, dan peta akan muncul di sini setelah ada data.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href={href('/formulir')} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><ClipboardPen className="h-4 w-4" /> Isi formulir</Link>
        <Link href={href('/unggah')} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet className="h-4 w-4" /> Unggah Excel</Link>
      </div>
    </section>
  );
}

/**
 * The company's home, its own dashboard: the PCBs status with what to do
 * (each item leading to where it is done), uploads to watch, its equipment
 * by production year with the oil test results and tonnage (one year
 * switch), and its equipment on the map. A figure opens the form it comes from.
 */
export default function CompanyHome() {
  const { supabase, company, href } = useCompanyPortal();
  const router = useRouter();
  const [stats, setStats] = useState<{ key: string; value: InventoryStats | null; noPoint: number } | null>(null);
  const [years, setYears] = useState<YearScope>('all');
  const scope = useMemo(() => ({ companyId: company.id, unit: null, subUnit: null }), [company.id]);
  const keepScope = useCallback(() => {}, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchInventoryStats(supabase, scope).catch(() => null),
      Promise.resolve(supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('company_id', company.id).is('lat', null)),
    ]).then(([value, { count }]) => { if (active) setStats({ key: company.id, value, noPoint: count ?? 0 }); });
    return () => { active = false; };
  }, [supabase, scope, company.id]);

  const loaded = stats?.key === company.id ? stats : null;
  const total = loaded?.value ? sumStats(loaded.value, ALL_CATEGORIES, 'total') : 0;
  const where = (target: StatusTarget) => target.tab === 'roadmap' ? href('/roadmap')
    : href('/formulir', { ...(target.tab ? { tab: target.tab } : {}), ...(target.section ? { bagian: target.section } : {}) });
  // A figure opens the form its rows come from ("all transformers" the first one).
  const openForm = (_filters: unknown, category: CategoryFilter) => {
    const tab = ALL_CATEGORIES.includes(category as InventoryCategory) ? category : 'transformator_digunakan';
    router.push(href('/formulir', { tab: tab as string, bagian: 'formulir' }));
  };

  return (
    <>
      <PortalHeader title="Beranda" description="Status laporan PCBs perusahaan, ringkasan peralatan, dan letaknya di peta." />
      <CompanyPcbStatusCard supabase={supabase} companyId={company.id} hrefFor={where} showOwned={false} />
      <UploadsToWatch />

      {loaded === null ? <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
        : total === 0 ? <StartHere /> : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <span className="text-sm font-semibold text-slate-800">Tahun pembuatan</span>
              <YearToggle value={years} onChange={setYears} />
              <span className="text-xs text-slate-500">{years === 'all' ? 'Semua peralatan, termasuk yang tahunnya tidak diketahui.' : `Hanya peralatan ${years === 'pre1997' ? 'buatan sebelum 1997' : 'buatan 1997 ke atas'}; yang tahunnya tidak diketahui tidak dihitung.`} Klik angka untuk membuka formulirnya.</span>
            </div>
            <InventorySummary stats={loaded.value} scope={years} loading={false} onSelect={openForm} />
            <TonnageCard stats={loaded.value} scope={years} loading={false} supabase={supabase} companyId={company.id} />

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 text-base font-semibold text-slate-900">Peta peralatan</h2>
              <p className="mb-3 flex items-start gap-1.5 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Periksa apakah titiknya berada di lokasi yang benar. Titik di laut biasanya karena lintang selatan ditulis tanpa tanda minus (-).</p>
              {loaded.noPoint > 0 && (
                <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" /> {fmt(loaded.noPoint)} peralatan belum punya titik koordinat yang terbaca, jadi tidak tampil di peta. Lengkapi koordinatnya di formulir (bagian Data tersimpan, tombol ubah).
                </p>
              )}
              <MapLeaflet supabase={supabase} companies={[{ id: company.id, name: company.nama_perusahaan }]} scope={scope} onScopeChange={keepScope} fixedCompany height="520px" />
            </section>
          </>
        )}
    </>
  );
}
