'use client';

import { useEffect, useMemo, useState } from 'react';
import CompanyPicker from '@/components/CompanyPicker';
import CompanyReport from '@/components/CompanyReport';
import type { CompanyOption } from '@/components/DataTable';
import { createClient } from '@/lib/supabase/client';

/**
 * The admin filling in a company's report (components/CompanyReport.tsx);
 * the company itself reaches the same on /lapor/<ID SIMPEL>.
 */
export default function FormulirPage() {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan')
      .then(({ data }) => setCompanies((data ?? []).map((company) => ({ id: company.id as string, name: company.nama_perusahaan as string }))));
  }, [supabase]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pelaporan</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Isi formulir</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Laporan inventarisasi PCBs langsung lewat formulir, sesuai template KLHK. Isiannya diperiksa dengan aturan yang sama seperti unggahan Excel.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-semibold text-slate-700">Perusahaan</span>
        <CompanyPicker companies={companies} value={companyId} onChange={setCompanyId} allLabel={null} placeholder="Pilih perusahaan" className="w-full sm:w-96" />
      </div>

      {companyId && <CompanyReport key={companyId} supabase={supabase} companyId={companyId} />}
    </div>
  );
}
