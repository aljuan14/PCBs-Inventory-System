'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CompanyPicker from '@/components/CompanyPicker';
import CompanyStatementCard, { type CompanyStatement } from '@/components/CompanyStatementCard';
import InventoryFormPanel from '@/components/InventoryFormPanel';
import ReductionFormPanel from '@/components/ReductionFormPanel';
import { ProcessingFormPanel, ReportingFormPanel, StorageFormPanel } from '@/components/WasteFormPanels';
import type { CompanyOption } from '@/components/DataTable';
import { FORM_SPECS } from '@/lib/form-fields';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';

/**
 * Reporting form: the company's statement, then forms 1.1–1.4 of the KLHK
 * templates typed in entry by entry, form 2 (maintenance log), form 3
 * (storage logbook and checklist), 4.2 (processing checklist) and 5 (balance). For now the admin fills it in for a
 * company; later the company itself, logged in through PILAR.
 */
type OtherForm = 'pengurangan' | 'penyimpanan' | 'pengolahan' | 'pelaporan';
const OTHER_FORMS: Array<[OtherForm, string]> = [['pengurangan', '2 Pengurangan'], ['penyimpanan', '3 Penyimpanan'], ['pengolahan', '4.2 Pengolahan'], ['pelaporan', '5 Pelaporan']];

export default function FormulirPage() {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  // A form 1.x by its category, or one of forms 2-5.
  const [category, setCategory] = useState<InventoryCategory | OtherForm>('transformator_digunakan');
  const [statement, setStatement] = useState<CompanyStatement | null>(null);
  // Stored units per form, tagged with their company so another company's counts never show.
  const [counts, setCounts] = useState<{ companyId: string; values: Partial<Record<InventoryCategory, number>> } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan')
      .then(({ data }) => setCompanies((data ?? []).map((company) => ({ id: company.id as string, name: company.nama_perusahaan as string }))));
  }, [supabase]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    Promise.all(INVENTORY_CATEGORIES.map(async ({ key }) => {
      const { count } = await supabase.from(key).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
      return [key, count ?? 0] as const;
    })).then((entries) => { if (active) setCounts({ companyId, values: Object.fromEntries(entries) }); });
    return () => { active = false; };
  }, [supabase, companyId, reload]);

  const onStatement = useCallback((value: CompanyStatement | null) => setStatement(value), []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pelaporan</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Isi formulir</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Laporan inventarisasi PCBs langsung lewat formulir, sesuai template KLHK 1.1–1.4. Isiannya diperiksa dengan aturan yang sama seperti unggahan Excel.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-semibold text-slate-700">Perusahaan</span>
        <CompanyPicker companies={companies} value={companyId} onChange={setCompanyId} allLabel={null} placeholder="Pilih perusahaan" className="w-full sm:w-96" />
      </div>

      {companyId && (
        <>
          <CompanyStatementCard key={companyId} supabase={supabase} companyId={companyId} onSaved={onStatement} />

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <div role="tablist" aria-label="Formulir" className="flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
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
            </div>
            {category === 'pengurangan' ? <ReductionFormPanel key={companyId} supabase={supabase} companyId={companyId} onSaved={() => setReload((value) => value + 1)} />
              : category === 'penyimpanan' ? <StorageFormPanel key={companyId} supabase={supabase} companyId={companyId} />
                : category === 'pengolahan' ? <ProcessingFormPanel key={companyId} supabase={supabase} companyId={companyId} />
                  : category === 'pelaporan' ? <ReportingFormPanel key={companyId} supabase={supabase} companyId={companyId} />
                    : <InventoryFormPanel
              key={`${companyId}:${category}`}
              companyId={companyId}
              category={category}
              storedCount={counts?.companyId === companyId ? counts.values[category] ?? 0 : null}
              noTrafoBefore1997={statement !== null && !statement.punya_trafo_sebelum_1997}
              onSaved={() => setReload((value) => value + 1)}
            />}
          </section>
        </>
      )}
    </div>
  );
}
