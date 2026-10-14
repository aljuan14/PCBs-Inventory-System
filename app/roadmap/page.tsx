'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import CompanyPicker from '@/components/CompanyPicker';
import CompanyPcbStatusCard, { reportHref } from '@/components/CompanyPcbStatusCard';
import { useReadOnly } from '@/components/useAccess';
import type { CompanyOption } from '@/components/DataTable';
import RoadmapPanels from '@/components/RoadmapPanels';
import { RoadmapSchedule } from '@/components/CompanyOverviewLists';
import { readLastCompany, writeLastCompany } from '@/lib/last-company';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { createClient } from '@/lib/supabase/client';
import { loadCompanyOptions } from '@/lib/company-sort';

function RoadmapContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const companyId = params.get('company');
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const readOnly = useReadOnly();
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    loadCompanyOptions(supabase).then(({ data }) => setCompanies(data));
  }, [supabase]);

  // Back to the company opened last time (shared with Isi formulir), if it still exists.
  useEffect(() => {
    if (companyId || !companies) return;
    const last = readLastCompany();
    if (last && companies.some((company) => company.id === last)) router.replace(`/roadmap?company=${last}`);
  }, [companyId, companies, router]);

  const pick = (id: string | null) => {
    writeLastCompany(id);
    router.replace(id ? `/roadmap?company=${id}` : '/roadmap');
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pelaporan</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Roadmap uji, penanganan &amp; pengelolaan</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Untuk trafo sebelum {TRAFO_FOCUS_YEAR}: trafo masih digunakan yang belum diuji (kapan diuji) atau &gt; 50 ppm (kapan diretrofilling atau diganti), dan trafo yang sudah tidak digunakan (kapan dikelola). Status perusahaan menjadi merah bila ada yang belum punya rencana atau lewat tanggalnya.</p>
      </header>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-semibold text-slate-700">Perusahaan</span>
        <CompanyPicker companies={companies ?? []} value={companyId} onChange={pick} allLabel={null} className="w-full sm:w-96" />
        {companyId && <button type="button" onClick={() => pick(null)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" /> Semua perusahaan</button>}
      </div>
      {!companyId && companies && <RoadmapSchedule supabase={supabase} companies={companies} onPick={pick} />}
      {companyId && (
        <>
          <CompanyPcbStatusCard supabase={supabase} companyId={companyId} reloadKey={reloadKey} hrefFor={(target) => reportHref(companyId, target, { readOnly, onRoadmap: true })} />
          <RoadmapPanels supabase={supabase} companyId={companyId} reloadKey={reloadKey} onChange={reload} />
        </>
      )}
    </div>
  );
}

export default function RoadmapPage() {
  return <Suspense fallback={null}><RoadmapContent /></Suspense>;
}
