'use client';

import { useRouter } from 'next/navigation';
import CompanyReport from '@/components/CompanyReport';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';

/** The company's report: status, statement and forms 1.1–5 (the roadmap has its own page). */
export default function CompanyForms() {
  const { supabase, company, href, refresh } = useCompanyPortal();
  const router = useRouter();
  return (
    <>
      <PortalHeader title="Isi formulir" description="Isi satu per satu lewat formulir, atau unggah template Excel di tiap formulir. Data tersimpan dapat diubah kapan saja." />
      <CompanyReport key={company.id} supabase={supabase} companyId={company.id} onRoadmap={() => router.push(href('/roadmap'))} onChanged={refresh} helpHref={`${href('/bantuan')}#arti-status`} />
    </>
  );
}
