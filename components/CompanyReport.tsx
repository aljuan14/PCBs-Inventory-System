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
import { FORM_SPECS } from '@/lib/form-fields';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';

type OtherForm = 'pengurangan' | 'penyimpanan' | 'pengolahan' | 'pelaporan';
const OTHER_FORMS: Array<[OtherForm, string]> = [['pengurangan', '2 Pengurangan'], ['penyimpanan', '3 Penyimpanan'], ['pengolahan', '4.2 Pengolahan'], ['pelaporan', '5 Pelaporan']];

/**
 * Everything a company reports, for one company: its PCBs status, the
 * statement, then the forms (1.1-1.4 entry by entry, 2 maintenance log, 3
 * storage, 4.2 processing, 5 balance). Shown to the admin on "Isi formulir"
 * and to the company itself on /lapor/<ID SIMPEL>. The parent keys it by
 * company.
 */
export default function CompanyReport({ supabase, companyId }: { supabase: SupabaseClient; companyId: string }) {
  // A form 1.x by its category, one of forms 2-5, or the roadmap.
  const [category, setCategory] = useState<InventoryCategory | OtherForm | 'roadmap'>('transformator_digunakan');
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

  const onStatement = useCallback((value: CompanyStatement | null) => { setStatement(value); setReload((key) => key + 1); }, []);

  return (
    <div className="space-y-6">
      <CompanyPcbStatusCard supabase={supabase} companyId={companyId} reloadKey={reload} onRoadmap={() => setCategory('roadmap')} />
      <CompanyStatementCard supabase={supabase} companyId={companyId} onSaved={onStatement} />

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-5">
            {/* On a phone the eleven tabs take six rows: a dropdown instead. */}
            <label className="block sm:hidden">
              <span className="sr-only">Formulir</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600">
                {FORM_SPECS.map((spec) => <option key={spec.code} value={spec.category}>{spec.code} {spec.title}</option>)}
                {OTHER_FORMS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                <option value="roadmap">Roadmap uji &amp; penanganan</option>
              </select>
            </label>
            <div role="tablist" aria-label="Formulir" className="hidden flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1 sm:flex">
              {FORM_SPECS.map((spec) => (
                <button key={spec.code} type="button" role="tab" aria-selected={category === spec.category} onClick={() => setCategory(spec.category)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${category === spec.category ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  {spec.code} {spec.title}
                </button>
              ))}
              {OTHER_FORMS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={category === key} onClick={() => setCategory(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${category === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  {label}
                </button>
              ))}
              <button type="button" role="tab" aria-selected={category === 'roadmap'} onClick={() => setCategory('roadmap')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${category === 'roadmap' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                Roadmap uji &amp; penanganan
              </button>
            </div>
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
              noTrafoBefore1997={statement !== null && !statement.punya_trafo_sebelum_1997}
              onSaved={() => setReload((value) => value + 1)}
            />}
      </section>
    </div>
  );
}
