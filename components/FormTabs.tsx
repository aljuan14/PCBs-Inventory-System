'use client';

import type { InventoryCategory } from '@/lib/inventory';

export type OtherForm = 'pengurangan' | 'penyimpanan' | 'pengolahan' | 'pelaporan';
export const OTHER_FORMS: Array<[OtherForm, string]> = [['pengurangan', '2 Pengurangan'], ['penyimpanan', '3 Penyimpanan'], ['pengolahan', '4.2 Pengolahan'], ['pelaporan', '5 Pelaporan']];
/** A form 1.x by its category, one of forms 2-5, or the roadmap. */
export type ReportTab = InventoryCategory | OtherForm | 'roadmap';

type Item = { key: ReportTab; code: string | null; label: string };

// The forms in three groups, each button with a short name; the full titles stay on the forms themselves.
const GROUPS: Array<{ title: string; items: Item[] }> = [
  { title: 'Inventarisasi', items: [
    { key: 'transformator_digunakan', code: '1.1', label: 'Trafo masih digunakan' },
    { key: 'transformator_tidak_digunakan', code: '1.2', label: 'Trafo tidak digunakan' },
    { key: 'kapasitor', code: '1.3', label: 'Kapasitor' },
    { key: 'minyak_dielektrik', code: '1.4', label: 'Minyak dielektrik' },
  ] },
  { title: 'Pengelolaan', items: [
    { key: 'pengurangan', code: '2', label: 'Pengurangan' },
    { key: 'penyimpanan', code: '3', label: 'Penyimpanan' },
    { key: 'pengolahan', code: '4.2', label: 'Pengolahan' },
    { key: 'pelaporan', code: '5', label: 'Pelaporan' },
  ] },
  { title: 'Rencana', items: [{ key: 'roadmap', code: null, label: 'Roadmap rencana' }] },
];

/** Every tab, to check one read from the address. */
export const REPORT_TABS: ReportTab[] = GROUPS.flatMap((group) => group.items.map((item) => item.key));

/**
 * The parts of a company's report: on a laptop a grid of equal buttons in
 * three labelled rows (inventory forms, management forms, the roadmap); on a
 * phone one dropdown with the same groups.
 */
export default function FormTabs({ value, onChange }: { value: ReportTab; onChange: (tab: ReportTab) => void }) {
  return (
    <>
      <label className="block sm:hidden">
        <span className="sr-only">Formulir</span>
        <select value={value} onChange={(event) => onChange(event.target.value as ReportTab)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600">
          {GROUPS.map((group) => (
            <optgroup key={group.title} label={group.title}>
              {group.items.map((item) => <option key={item.key} value={item.key}>{item.code ? `${item.code} ` : ''}{item.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div role="tablist" aria-label="Formulir" className="hidden space-y-2 sm:block">
        {GROUPS.map((group) => (
          <div key={group.title} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</span>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {group.items.map((item) => {
                const active = value === item.key;
                return (
                  <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => onChange(item.key)} title={item.label}
                    className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${active ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-2xs' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}>
                    {item.code && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${active ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.code}</span>}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
