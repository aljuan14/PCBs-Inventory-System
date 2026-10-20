'use client';

import { useState } from 'react';
import RoadmapPanels from '@/components/RoadmapPanels';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';

/** The company's roadmap: the transformers before 1997 needing a test, handling or management, and their dates. */
export default function CompanyRoadmap() {
  const { supabase, company, refresh } = useCompanyPortal();
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <>
      <PortalHeader title="Roadmap" description={`Untuk setiap trafo buatan sebelum ${TRAFO_FOCUS_YEAR} (atau tanpa tahun): kapan diuji bila belum diuji, kapan diretrofilling atau diganti bila 50 ppm atau lebih, dan kapan dikelola bila sudah tidak digunakan.`} />
      <RoadmapPanels supabase={supabase} companyId={company.id} reloadKey={reloadKey} onChange={() => { setReloadKey((value) => value + 1); refresh(); }} />
    </>
  );
}
