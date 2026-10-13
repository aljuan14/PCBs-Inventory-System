'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import CompanyPcbStatusCard from '@/components/CompanyPcbStatusCard';
import CompanyStatementCard, { type CompanyStatement } from '@/components/CompanyStatementCard';
import InventoryFormPanel from '@/components/InventoryFormPanel';
import ReductionFormPanel from '@/components/ReductionFormPanel';
import RoadmapPanels from '@/components/RoadmapPanels';
import { ProcessingFormPanel, ReportingFormPanel, StorageFormPanel } from '@/components/WasteFormPanels';
import TemplateUpload from '@/components/TemplateUpload';
import { declaresNone } from '@/lib/company-pcb-status';
import FormTabs, { OTHER_FORMS, type OtherForm, type ReportTab } from '@/components/FormTabs';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';


/**
 * Everything a company reports, for one company: its PCBs status, the
 * statement, then the forms (1.1-1.4 entry by entry, 2 maintenance log, 3
 * storage, 4.2 processing, 5 balance). Shown to the admin on "Isi formulir"
 * and to the company itself on /lapor/<ID SIMPEL>. The parent keys it by
 * company.
 */
export default function CompanyReport({ supabase, companyId }: { supabase: SupabaseClient; companyId: string }) {
  // A form 1.x by its category, one of forms 2-5, or the roadmap.
  const [category, setCategory] = useState<ReportTab>('transformator_digunakan');
  const [statement, setStatement] = useState<CompanyStatement | null>(null);
  // Stored units per form, tagged with their company so another company's counts never show.
  const [counts, setCounts] = useState<{ companyId: string; values: Partial<Record<InventoryCategory, number>> } | null>(null);
  const [reload, setReload] = useState(0);
  // Bumped after an Excel template is stored, so the panels below load it.
  const [imported, setImported] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all(INVENTORY_CATEGORIES.map(async ({ key }) => {
      const { count } = await supabase.from(key).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
      return [key, count ?? 0] as const;
    })).then((entries) => { if (active) setCounts({ companyId, values: Object.fromEntries(entries) }); });
    return () => { active = false; };
  }, [supabase, companyId, reload]);

  const onStatement = useCallback((value: CompanyStatement | null) => setStatement(value), []);

  return (
    <div className="space-y-6">
      <CompanyPcbStatusCard supabase={supabase} companyId={companyId} reloadKey={reload} onRoadmap={() => setCategory('roadmap')} />
      <CompanyStatementCard supabase={supabase} companyId={companyId} reloadKey={reload} onStatement={onStatement} onSaved={() => setReload((value) => value + 1)} />

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-5">
            <FormTabs value={category} onChange={setCategory} />
            {OTHER_FORMS.some(([key]) => key === category) && (
              <TemplateUpload key={`${companyId}:${category}`} supabase={supabase} companyId={companyId} kind={category as OtherForm} onImported={() => { setImported((value) => value + 1); setReload((value) => value + 1); }} />
            )}
            {category === 'roadmap' ? <RoadmapPanels supabase={supabase} companyId={companyId} reloadKey={reload} onChange={() => setReload((value) => value + 1)} />
              : category === 'pengurangan' ? <ReductionFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} onSaved={() => setReload((value) => value + 1)} />
              : category === 'penyimpanan' ? <StorageFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} />
                : category === 'pengolahan' ? <ProcessingFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} />
                  : category === 'pelaporan' ? <ReportingFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} />
                    : <InventoryFormPanel
              key={`${companyId}:${category}`}
              companyId={companyId}
              category={category}
              storedCount={counts?.companyId === companyId ? counts.values[category] ?? 0 : null}
              noTrafoBefore1997={statement !== null && (declaresNone(statement) || (!statement.punya_trafo_sebelum_1997 && statement.punya_trafo_1997_keatas))}
              onSaved={() => setReload((value) => value + 1)}
            />}
      </section>
    </div>
  );
}
