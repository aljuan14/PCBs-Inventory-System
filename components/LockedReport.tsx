'use client';

import { useState } from 'react';
import { FileSignature, Lock } from 'lucide-react';
import AddDataCard, { ManualChoice, UploadChoice } from '@/components/AddDataCard';
import FormEditor from '@/components/FormEditor';
import FormTabs, { OTHER_FORMS, type ReportTab } from '@/components/FormTabs';
import { CHECKLISTS, type ChecklistKey } from '@/lib/checklists';
import { BALANCE_SECTIONS, FORM_SPECS, REDUCTION_SECTIONS, STORAGE_SECTIONS, TRAFO_FOCUS_YEAR, type FormSection } from '@/lib/form-fields';

const noop = () => {};
const QUESTIONS_SHOWN = 5;

/** The note on every locked part: what opens it. */
function LockNote({ text = 'Pilih perusahaan di atas untuk mengisi.' }: { text?: string }) {
  return <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Lock className="h-3.5 w-3.5" /> {text}</p>;
}

/** A form's sections as the editor shows them, every field disabled. */
function FormPreview({ sections }: { sections: FormSection[] }) {
  return (
    <fieldset disabled className="pointer-events-none select-none opacity-70" aria-label="Contoh formulir, terkunci">
      <FormEditor sections={sections} initial={{ id: 'preview', values: {} }} validate={() => ({})} title="Contoh isian" saveLabel="Simpan" onSave={noop} onCancel={noop} inline />
    </fieldset>
  );
}

function ChecklistPreview({ checklist }: { checklist: ChecklistKey }) {
  const spec = CHECKLISTS[checklist];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{spec.title}</h3>
      <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white opacity-70">
        {spec.questions.slice(0, QUESTIONS_SHOWN).map((question, index) => (
          <li key={question} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs text-slate-700">
            <span><span className="mr-1.5 font-semibold text-slate-400">{index + 1}.</span>{question}</span>
            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-400">Ya / Tidak</span>
          </li>
        ))}
      </ol>
      {spec.questions.length > QUESTIONS_SHOWN && <p className="text-xs text-slate-500">… dan {spec.questions.length - QUESTIONS_SHOWN} ketentuan lainnya.</p>}
    </div>
  );
}

/** The card that adds data, its two choices shown but closed. */
function LockedAddCard() {
  return (
    <div className="pointer-events-none select-none" aria-hidden>
      <AddDataCard manual={<ManualChoice hint="Satu per satu, untuk data sedikit." disabled onClick={noop} />} upload={<div className="grid opacity-50"><UploadChoice hint="Banyak data sekaligus." onFile={noop} /></div>} />
    </div>
  );
}

function TabPreview({ tab }: { tab: ReportTab }) {
  const spec = FORM_SPECS.find((form) => form.category === tab);
  if (spec) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Formulir {spec.code}: {spec.title}</h2>
            <p className="text-xs text-slate-500">Isi lewat formulir atau unggah template Excel{tab.startsWith('transformator') ? `, hanya trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau yang tahunnya tidak diketahui` : ''}. Di bawahnya: data tersimpan dan bukti dukung.</p>
          </div>
        </div>
        <LockedAddCard />
        <FormPreview sections={spec.sections} />
      </div>
    );
  }
  const label = OTHER_FORMS.find(([key]) => key === tab)?.[1] ?? '';
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-slate-900">Formulir {label}</h2>
      {tab === 'pengurangan' && <FormPreview sections={REDUCTION_SECTIONS} />}
      {tab === 'penyimpanan' && <><FormPreview sections={STORAGE_SECTIONS} /><ChecklistPreview checklist="3_penyimpanan" /></>}
      {tab === 'pengolahan' && <ChecklistPreview checklist="4_2_pengolahan" />}
      {tab === 'pelaporan' && <FormPreview sections={BALANCE_SECTIONS} />}
    </div>
  );
}

/**
 * A company's report before a company is picked (Isi formulir): the statement
 * and every form laid out as they will be, locked. The tabs
 * still open, to show what each form asks.
 */
export default function LockedReport() {
  const [tab, setTab] = useState<ReportTab>('transformator_digunakan');
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><FileSignature className="h-4 w-4" /></div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pernyataan perusahaan</h2>
            <LockNote />
          </div>
        </div>
        <fieldset disabled className="mt-4 grid gap-2 opacity-60 sm:grid-cols-2">
          {['Memiliki peralatan', 'Tidak memiliki peralatan (dengan surat pernyataan)'].map((label) => (
            <label key={label} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input type="radio" name="locked-owns" className="mt-0.5" />
              <span className="text-sm font-semibold text-slate-700">{label}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-5">
        <FormTabs value={tab} onChange={setTab} withRoadmap={false} />
        <LockNote text="Pratinjau formulir. Pilih perusahaan di atas untuk mengisinya." />
        <TabPreview tab={tab} />
      </section>
    </div>
  );
}
