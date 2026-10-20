'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import CompanyPicker from '@/components/CompanyPicker';
import CompanyReport from '@/components/CompanyReport';
import { CompanyAttentionList } from '@/components/CompanyOverviewLists';
import LockedReport from '@/components/LockedReport';
import type { CompanyOption } from '@/components/DataTable';
import { readLastCompany, writeLastCompany } from '@/lib/last-company';
import { createClient } from '@/lib/supabase/client';
import { loadCompanyOptions } from '@/lib/company-sort';

/**
 * The admin filling in a company's report (components/CompanyReport.tsx), as
 * the company sees it on /lapor/<ID SIMPEL>: the status is on the dashboard,
 * the roadmap on its own page. Before a company
 * is picked: the companies needing attention and the report laid out, locked.
 * The company is in the address (?company=) and remembered for next time.
 */
function FormulirContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const companyId = useSearchParams().get('company');
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);

  useEffect(() => {
    loadCompanyOptions(supabase).then(({ data }) => setCompanies(data));
  }, [supabase]);

  // Back to the company opened last time, if it still exists.
  useEffect(() => {
    if (companyId || !companies) return;
    const last = readLastCompany();
    if (last && companies.some((company) => company.id === last)) router.replace(`/formulir?company=${last}`);
  }, [companyId, companies, router]);

  const pick = (id: string | null) => {
    writeLastCompany(id);
    router.replace(id ? `/formulir?company=${id}` : '/formulir');
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pelaporan</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Isi formulir</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Isi satu per satu lewat formulir, atau unggah template Excel di tiap formulir. Data tersimpan dapat diubah kapan saja. Status PCBs perusahaan ada di Dashboard, roadmap di menu Roadmap.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-semibold text-slate-700">Perusahaan</span>
        <CompanyPicker companies={companies ?? []} value={companyId} onChange={pick} allLabel={null} placeholder="Pilih perusahaan" className="w-full sm:w-96" />
        {companyId && <button type="button" onClick={() => pick(null)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" /> Semua perusahaan</button>}
      </div>

      {companyId ? <CompanyReport key={companyId} supabase={supabase} companyId={companyId} onRoadmap={() => router.push(`/roadmap?company=${companyId}`)} showStatus={false} /> : (
        <>
          {companies && <CompanyAttentionList supabase={supabase} companies={companies} onPick={pick} />}
          <LockedReport />
        </>
      )}
    </div>
  );
}

export default function FormulirPage() {
  return <Suspense fallback={null}><FormulirContent /></Suspense>;
}
