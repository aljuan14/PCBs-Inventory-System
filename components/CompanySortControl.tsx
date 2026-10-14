'use client';

import { ArrowDownUp } from 'lucide-react';
import { COMPANY_SORTS, type CompanySort } from '@/lib/company-sort';

/** "Urutkan": last edited, A-Z, Z-A. Without edit times the first is left out. */
export default function CompanySortControl({ value, onChange, withEdited = true, compact = false }: { value: CompanySort; onChange: (value: CompanySort) => void; withEdited?: boolean; compact?: boolean }) {
  const options = COMPANY_SORTS.filter(([key]) => withEdited || key !== 'terbaru');
  const current = !withEdited && value === 'terbaru' ? 'az' : value;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`flex items-center gap-1 font-semibold text-slate-500 ${compact ? 'text-[11px]' : 'text-xs'}`}><ArrowDownUp className="h-3 w-3" /> Urutkan</span>
      <div role="group" aria-label="Urutkan perusahaan" className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {options.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={current === key} onClick={() => onChange(key)}
            className={`rounded-md px-2 py-0.5 font-semibold ${compact ? 'text-[11px]' : 'text-xs'} ${current === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
