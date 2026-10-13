'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { CheckCircle2, ChevronDown, Loader2, Map as MapIcon, MapPin, X } from 'lucide-react';
import { parseDMSCoordinate } from '@/lib/dms';
import type { FormEntry, FormField, FormSection } from '@/lib/form-fields';

// Leaflet needs the window.
const CoordinatePicker = dynamic(() => import('@/components/CoordinatePicker'), { ssr: false });

const inputClass = 'w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600';

/** Decimal or degree-minute-second coordinate, with what it reads as. */
function CoordinatePreview({ value }: { value: string }) {
  if (!value.trim()) return <p className="mt-1 text-[11px] text-slate-400">Contoh: -6.2088, 106.8456 atau S 6°12&apos;31&quot; E 106°50&apos;44&quot;</p>;
  const parsed = parseDMSCoordinate(value);
  if (!parsed.isValid) return <p className="mt-1 text-[11px] font-medium text-amber-700">Koordinat belum terbaca.</p>;
  const lat = parsed.latitude as number;
  const lng = parsed.longitude as number;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
      <MapPin className="h-3 w-3" /> {lat.toFixed(6)}, {lng.toFixed(6)}
      <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="ml-1 font-semibold underline">cek di peta</a>
    </p>
  );
}

export function FieldInput({ field, entry, error, onChange, onUnknownYear }: { field: FormField; entry: FormEntry; error?: string; onChange: (value: string) => void; onUnknownYear: (unknown: boolean) => void }) {
  const value = entry.values[field.key] ?? '';
  const border = error ? 'border-rose-300' : 'border-slate-200';
  const listId = field.options && field.input === 'text' ? `options-${field.key}` : undefined;
  // The point to open the map on, fixed when the map opens (null: no point yet).
  const [picking, setPicking] = useState<{ initial: { lat: number; lng: number } | null } | null>(null);
  const openMap = () => {
    const parsed = parseDMSCoordinate(value);
    setPicking({ initial: parsed.isValid ? { lat: parsed.latitude as number, lng: parsed.longitude as number } : null });
  };
  let control: React.ReactNode;
  if (field.input === 'select') {
    control = (
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} ${border}`}>
        <option value="">{field.required ? 'Pilih…' : 'Tidak diisi'}</option>
        {field.options!.map((option) => <option key={option}>{option}</option>)}
      </select>
    );
  } else if (field.input === 'year') {
    control = (
      <div className="flex items-center gap-3">
        <input type="number" min={1900} max={new Date().getFullYear()} value={value} disabled={entry.unknownYear} onChange={(event) => onChange(event.target.value)} className={`${inputClass} ${border} max-w-32 disabled:bg-slate-100`} />
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={Boolean(entry.unknownYear)} onChange={(event) => onUnknownYear(event.target.checked)} className="accent-emerald-700" /> Tidak diketahui</label>
      </div>
    );
  } else {
    control = (
      <div className={`flex items-center rounded-lg border bg-white focus-within:border-emerald-600 ${border}`}>
        <input
          type={field.input === 'number' ? 'number' : field.input === 'date' ? 'date' : 'text'}
          step={field.input === 'number' ? 'any' : undefined}
          min={field.input === 'number' ? 0 : undefined}
          list={listId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none"
        />
        {field.unit && <span className="pr-3 text-xs text-slate-400">{field.unit}</span>}
        {listId && <datalist id={listId}>{field.options!.map((option) => <option key={option} value={option} />)}</datalist>}
        {field.input === 'coordinate' && (
          <button type="button" onClick={openMap} className="mr-1 flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800">
            <MapIcon className="h-3.5 w-3.5" /> Pilih di peta
          </button>
        )}
      </div>
    );
  }
  return (
    <label className={`block text-xs font-medium text-slate-700 ${field.input === 'coordinate' || field.key === 'lokasi_peralatan' || field.key === 'lokasi_penyimpanan' ? 'sm:col-span-2' : ''}`}>
      {field.label}{field.required && <span className="text-rose-600"> *</span>}
      <div className="mt-1">{control}</div>
      {field.input === 'coordinate' && <CoordinatePreview value={value} />}
      {error ? <p className="mt-1 text-[11px] font-medium text-rose-700">{error}</p> : field.hint && field.input !== 'coordinate' && <p className="mt-1 text-[11px] text-slate-400">{field.hint}</p>}
      {/* In a portal: inside the label, clicks on the map would focus the input. */}
      {picking && createPortal(<CoordinatePicker initial={picking.initial} onClose={() => setPicking(null)} onPick={(picked) => { onChange(picked); setPicking(null); }} />, document.body)}
    </label>
  );
}

/**
 * One entry of a form, its sections folded open or shut. `validate` returns
 * the errors per field; saving is refused while there are any, and the
 * sections holding them open.
 */
export default function FormEditor({ sections, initial, validate, title, saveLabel, saving = false, children, onSave, onCancel }: {
  sections: FormSection[];
  initial: FormEntry;
  validate: (entry: FormEntry) => Record<string, string>;
  title: string;
  saveLabel: string;
  saving?: boolean;
  /** Shown between the sections and the buttons. */
  children?: React.ReactNode;
  onSave: (entry: FormEntry) => void;
  onCancel: () => void;
}) {
  const [entry, setEntry] = useState(initial);
  const [tried, setTried] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.map((section) => [section.title, !section.collapsed || section.fields.some((field) => initial.values[field.key])])));
  const errors = tried ? validate(entry) : {};
  const set = (key: string, value: string) => setEntry((current) => ({ ...current, values: { ...current.values, [key]: value } }));

  const save = () => {
    setTried(true);
    const found = validate(entry);
    if (Object.keys(found).length === 0) onSave(entry);
    else setOpen((current) => ({ ...current, ...Object.fromEntries(sections.filter((section) => section.fields.some((field) => found[field.key])).map((section) => [section.title, true])) }));
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <button type="button" onClick={onCancel} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.title} className="rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setOpen((current) => ({ ...current, [section.title]: !current[section.title] }))} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4">
              <span>
                <span className="block text-sm font-semibold text-slate-800">{section.title}</span>
                {section.note && <span className="text-[11px] text-slate-500">{section.note}</span>}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open[section.title] ? 'rotate-180' : ''}`} />
            </button>
            {open[section.title] && (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 sm:grid-cols-2 sm:p-4">
                {section.fields.map((field) => (
                  <FieldInput key={field.key} field={field} entry={entry} error={errors[field.key]} onChange={(value) => set(field.key, value)}
                    onUnknownYear={(unknown) => setEntry((current) => ({ ...current, unknownYear: unknown, values: { ...current.values, [field.key]: unknown ? '' : current.values[field.key] ?? '' } }))} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {children}
      {tried && Object.keys(errors).length > 0 && <p className="mt-3 text-xs font-medium text-rose-700">Masih ada {Object.keys(errors).length} isian yang perlu diperbaiki.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700">Batal</button>
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {saveLabel}</button>
      </div>
    </div>
  );
}
