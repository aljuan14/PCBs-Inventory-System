'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import CompanyPcbStatusCard from '@/components/CompanyPcbStatusCard';
import CompanyStatementCard, { type CompanyStatement } from '@/components/CompanyStatementCard';
import InventoryFormPanel from '@/components/InventoryFormPanel';
import ReductionFormPanel from '@/components/ReductionFormPanel';
import RoadmapPanels from '@/components/RoadmapPanels';
import { ProcessingFormPanel, ReportingFormPanel, StorageFormPanel } from '@/components/WasteFormPanels';
import TemplateUpload from '@/components/TemplateUpload';
import { declaresNone, type StatusTarget } from '@/lib/company-pcb-status';
import FormTabs, { OTHER_FORMS, REPORT_TABS, type OtherForm, type ReportTab } from '@/components/FormTabs';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';


/**
 * Everything a company reports, for one company: its PCBs status, the
 * statement, then the forms (1.1-1.4 entry by entry, 2 maintenance log, 3
 * storage, 4.2 processing, 5 balance). Shown to the admin on "Isi formulir"
 * and to the company itself on /lapor/<ID SIMPEL>. The parent keys it by
 * company. ?tab= and ?bagian= open a tab and scroll to a part of it (the
 * PCBs status links here from the dashboard and the roadmap).
 */
export default function CompanyReport({ supabase, companyId, onRoadmap, onChanged }: {
  supabase: SupabaseClient;
  companyId: string;
  /** Where the roadmap has its own page (the company's area): its tab is left out and roadmap links go there. */
  onRoadmap?: () => void;
  /** After any save that may change the company's status. */
  onChanged?: () => void;
}) {
  const params = useSearchParams();
  // A form 1.x by its category, one of forms 2-5, or the roadmap.
  const [category, setCategory] = useState<ReportTab>(() => {
    const tab = params.get('tab');
    return REPORT_TABS.includes(tab as ReportTab) && !(onRoadmap && tab === 'roadmap') ? tab as ReportTab : 'transformator_digunakan';
  });
  // The part of the page to bring into view once it is there (a status message was clicked).
  const [scrollTo, setScrollTo] = useState<string | null>(() => params.get('bagian') ?? (params.get('tab') ? 'formulir' : null));
  const [statement, setStatement] = useState<CompanyStatement | null>(null);
  // Stored units per form, tagged with their company so another company's counts never show.
  const [counts, setCounts] = useState<{ companyId: string; values: Partial<Record<InventoryCategory, number>> } | null>(null);
  const [reload, setReloadKey] = useState(0);
  const setReload = useCallback((next: (value: number) => number) => { setReloadKey(next); onChanged?.(); }, [onChanged]);
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

  const go = (target: StatusTarget) => {
    if (target.tab === 'roadmap' && onRoadmap) return onRoadmap();
    if (target.tab) setCategory(target.tab);
    setScrollTo(target.section ?? 'formulir');
  };

  // The part may still be loading after the tab opens, and what loads above it
  // moves it down: bring it into view again until it stays put (about 1.5 s).
  useEffect(() => {
    if (!scrollTo) return;
    let ticks = 0;
    const timer = window.setInterval(() => {
      const element = document.getElementById(scrollTo);
      if (element && Math.abs(element.getBoundingClientRect().top - 16) > 24) element.scrollIntoView({ block: 'start' });
      if (++ticks >= 15) {
        window.clearInterval(timer);
        setScrollTo(null);
      }
    }, 100);
    // Scrolling by hand takes over.
    const stop = () => { window.clearInterval(timer); setScrollTo(null); };
    window.addEventListener('wheel', stop, { once: true });
    window.addEventListener('touchmove', stop, { once: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
    };
  }, [scrollTo, category]);

  return (
    <div className="space-y-6">
      <CompanyPcbStatusCard supabase={supabase} companyId={companyId} reloadKey={reload} onGo={go} />
      <div id="pernyataan" className="scroll-mt-4"><CompanyStatementCard supabase={supabase} companyId={companyId} reloadKey={reload} onStatement={onStatement} onSaved={() => setReload((value) => value + 1)} /></div>

      <section id="formulir" className="scroll-mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-5">
            <FormTabs value={category} onChange={setCategory} withRoadmap={!onRoadmap} />
            {OTHER_FORMS.some(([key]) => key === category) && (
              <TemplateUpload key={`${companyId}:${category}`} supabase={supabase} companyId={companyId} kind={category as OtherForm} onImported={() => { setImported((value) => value + 1); setReload((value) => value + 1); }} />
            )}
            {category === 'roadmap' ? <RoadmapPanels supabase={supabase} companyId={companyId} reloadKey={reload} onChange={() => setReload((value) => value + 1)} />
              : category === 'pengurangan' ? <ReductionFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} onSaved={() => setReload((value) => value + 1)} />
              : category === 'penyimpanan' ? <StorageFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} onSaved={() => setReload((value) => value + 1)} />
                : category === 'pengolahan' ? <ProcessingFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} onSaved={() => setReload((value) => value + 1)} />
                  : category === 'pelaporan' ? <ReportingFormPanel key={companyId} supabase={supabase} companyId={companyId} refreshKey={imported} onSaved={() => setReload((value) => value + 1)} />
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
