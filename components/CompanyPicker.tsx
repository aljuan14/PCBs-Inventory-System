'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { FEEDBACK_STATUSES, STATUS_ORDER, formatDate, statusOf, type CompanyStatus, type FeedbackStatus } from '@/lib/company-status';
import type { CompanyOption } from '@/components/DataTable';

const ALL = '__all__';

/**
 * Company dropdown with search and, when `statuses` is given, a coloured dot
 * per company showing whether its check results were sent (a native <select>
 * cannot be coloured reliably). Companies are listed in the order given.
 * `allLabel: null` drops the "all companies" option (a company must be picked);
 * `describe` replaces the status text shown on the right of each company.
 */
export default function CompanyPicker({ companies, value, onChange, statuses = null, allLabel, describe, placeholder = 'Pilih perusahaan', className = 'w-72', disabled = false }: {
  companies: CompanyOption[];
  value: string | null;
  onChange: (companyId: string | null) => void;
  statuses?: Map<string, CompanyStatus> | null;
  allLabel?: string | null;
  describe?: (companyId: string) => string | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | null>(null);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close on a click outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const allText = allLabel === undefined ? `Semua perusahaan (${companies.length.toLocaleString('id-ID')})` : allLabel;

  const counts = useMemo(() => {
    const result: Record<FeedbackStatus, number> = { pending: 0, new_data: 0, sent: 0, empty: 0 };
    for (const company of companies) result[statusOf(statuses, company.id)]++;
    return result;
  }, [companies, statuses]);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = companies.filter((company) => (!needle || company.name.toLowerCase().includes(needle)) && (!statusFilter || statusOf(statuses, company.id) === statusFilter));
    return [...(allText !== null && !needle && !statusFilter ? [ALL] : []), ...matches.map((company) => company.id)];
  }, [companies, statuses, query, statusFilter, allText]);

  const names = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const selected = value ? names.get(value) : null;

  const toggle = () => {
    if (!open) {
      setQuery('');
      setStatusFilter(null);
      setActive(0);
    }
    setOpen(!open);
  };

  const choose = (id: string) => {
    onChange(id === ALL ? null : id);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(0, Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && options[active]) {
      event.preventDefault();
      choose(options[active]);
    }
  };

  const dot = (id: string) => FEEDBACK_STATUSES[statusOf(statuses, id)].dot;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button type="button" onClick={toggle} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label="Perusahaan" className={`flex ${className} max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none disabled:opacity-60`}>
        {value && statuses && <span className={`h-2 w-2 shrink-0 rounded-full ${dot(value)}`} />}
        <span className={`min-w-0 flex-1 truncate ${selected || allText !== null ? '' : 'text-slate-400'}`}>{selected ?? allText ?? placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" onKeyDown={onKeyDown}>
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 focus-within:border-emerald-500">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} placeholder="Cari perusahaan…" className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
            </div>
            {statuses && (
              <div className="mt-2 flex flex-wrap gap-1">
                {STATUS_ORDER.map((status) => (
                  <button key={status} type="button" aria-pressed={statusFilter === status} onClick={() => { setStatusFilter(statusFilter === status ? null : status); setActive(0); }} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusFilter === status ? FEEDBACK_STATUSES[status].badge : 'border-slate-200 text-slate-500 hover:text-slate-800'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${FEEDBACK_STATUSES[status].dot}`} /> {FEEDBACK_STATUSES[status].label} ({counts[status]})
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul ref={listRef} role="listbox" aria-label="Perusahaan" className="max-h-80 overflow-y-auto py-1">
            {options.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">Tidak ada perusahaan yang cocok.</li>}
            {options.map((id, index) => {
              const isAll = id === ALL;
              const status = statuses?.get(id);
              const isSelected = isAll ? value === null : value === id;
              const note = isAll ? null : describe ? describe(id) : statuses ? (status?.lastSentAt ? `dikirim ${formatDate(status.lastSentAt)}` : FEEDBACK_STATUSES[statusOf(statuses, id)].label) : null;
              return (
                <li key={id} role="option" aria-selected={isSelected} onMouseEnter={() => setActive(index)} onClick={() => choose(id)} className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs ${index === active ? 'bg-slate-50' : ''}`}>
                  {(isAll || !statuses) ? <span className="h-2 w-2 shrink-0" /> : <span className={`h-2 w-2 shrink-0 rounded-full ${dot(id)}`} />}
                  <span className={`min-w-0 flex-1 truncate ${isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{isAll ? allText : names.get(id)}</span>
                  {note && <span className="shrink-0 text-[10px] text-slate-400">{note}</span>}
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
