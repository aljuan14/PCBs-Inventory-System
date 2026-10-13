'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CompanyPicker from '@/components/CompanyPicker';
import CompanyPcbStatusCard from '@/components/CompanyPcbStatusCard';
import type { CompanyOption } from '@/components/DataTable';
import RoadmapPanels from '@/components/RoadmapPanels';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { createClient } from '@/lib/supabase/client';

function RoadmapContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const companyId = params.get('company');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan')
      .then(({ data }) => setCompanies((data ?? []).map((company) => ({ id: company.id as string, name: company.nama_perusahaan as string }))));
  }, [supabase]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pelaporan</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Roadmap uji &amp; penanganan</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Tanggal rencana uji PCBs untuk trafo sebelum {TRAFO_FOCUS_YEAR} yang belum diuji, dan rencana penanganan untuk yang &gt; 50 ppm. Status perusahaan menjadi merah bila ada yang belum punya rencana atau lewat tanggalnya.</p>
      </header>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-semibold text-slate-700">Perusahaan</span>
        <CompanyPicker companies={companies} value={companyId} onChange={(id) => router.replace(id ? `/roadmap?company=${id}` : '/roadmap')} allLabel={null} className="w-full sm:w-96" />
      </div>
      {companyId && (
        <>
          <CompanyPcbStatusCard supabase={supabase} companyId={companyId} reloadKey={reloadKey} roadmapLink={false} />
          <RoadmapPanels supabase={supabase} companyId={companyId} reloadKey={reloadKey} onChange={reload} />
        </>
      )}
    </div>
  );
}

export default function RoadmapPage() {
  return <Suspense fallback={null}><RoadmapContent /></Suspense>;
}
