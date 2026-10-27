'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, Map as MapIcon, MapPin, Plus, X } from 'lucide-react';
import { confirmDialog } from '@/components/Dialog';
import { parseDMSCoordinate } from '@/lib/dms';
import { isShown, type FormEntry, type FormField, type FormSection } from '@/lib/form-fields';

// Leaflet needs the window.
const CoordinatePicker = dynamic(() => import('@/components/CoordinatePicker'), { ssr: false });

// Grey fields on the white pop-up, white with a green ring while typed in.
const fieldClass = (error: boolean, within = false) => {
  const focus = within
    ? 'focus-within:border-emerald-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-600/10'
    : 'focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10';
  return `rounded-xl border transition-colors ${error ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-100 hover:border-slate-300'} ${focus}`;
};
const inputClass = 'w-full px-3.5 py-2.5 text-sm outline-none placeholder:text-slate-400';

/** What an empty field shows, by its kind. */
function placeholderOf(field: FormField): string {
  if (field.input === 'coordinate') return '-6.2088, 106.8456';
  if (field.input === 'year') return 'mis. 1985';
  if (field.input === 'number') return '0';
  if (field.options) return 'Pilih atau ketik…';
  return '…';
}

/** A field's total of its parts when all of them hold a number, else null. */
function sumOf(field: FormField, values: Record<string, string>): number | null {
  if (!field.sumOf) return null;
  const parts = field.sumOf.keys.map((key) => (values[key]?.trim() ? Number(values[key]) : NaN));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return Number((parts.reduce((total, part) => total + part, 0) / field.sumOf.divisor).toFixed(4));
}

/**
 * The entry with each total of parts filled in; one the parts filled in before
 * is cleared when a part is emptied, while a total typed in by hand stays.
 */
function withTotals(sections: FormSection[], entry: FormEntry, before?: FormEntry): FormEntry {
  const values = { ...entry.values };
  for (const field of sections.flatMap((section) => section.fields)) {
    const total = sumOf(field, values);
    if (total !== null) values[field.key] = String(total);
    else if (before && sumOf(field, before.values) !== null) values[field.key] = '';
  }
  return { ...entry, values };
}

/** Decimal or degree-minute-second coordinate, with what it reads as. */
export function CoordinatePreview({ value }: { value: string }) {
  if (!value.trim()) return <p className="mt-1 text-[11px] text-slate-400">Desimal, atau derajat-menit-detik seperti S 6°12&apos;31&quot; E 106°50&apos;44&quot;</p>;
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
  const locked = sumOf(field, entry.values) !== null;
  const listId = field.options && field.input === 'text' ? `options-${field.key}` : undefined;
  // The point to open the map on, fixed when the map opens (null: no point yet).
  const [picking, setPicking] = useState<{ initial: { lat: number; lng: number } | null } | null>(null);
  const openMap = () => {
    const parsed = parseDMSCoordinate(value);
    setPicking({ initial: parsed.isValid ? { lat: parsed.latitude as number, lng: parsed.longitude as number } : null });
  };
  let control: React.ReactNode;
  if (field.input === 'choice') {
    // Big buttons for a question anyone answers.
    return (
      <div data-field={field.key} role="radiogroup" aria-label={field.label} className="scroll-mt-4 text-[13px] font-medium text-slate-800 sm:col-span-2">
        {field.label}{field.required && <span className="text-rose-600"> *</span>}
        <div className="mt-1.5 flex flex-wrap gap-2">
          {field.options!.map((option) => (
            <label key={option} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${value === option ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : error ? 'border-rose-300 bg-rose-50 text-slate-700' : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300'}`}>
              <input type="radio" name={field.key} value={option} checked={value === option} onChange={() => onChange(option)} className="accent-emerald-700" /> {option}
            </label>
          ))}
        </div>
        {error && <p className="mt-1 text-[11px] font-medium text-rose-700">{error}</p>}
        {field.notes?.[value] && <p className="mt-2 flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-xs font-normal text-sky-900"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {field.notes[value]}</p>}
      </div>
    );
  }
  if (field.input === 'select') {
    control = (
      <div className="relative">
        <select value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} ${fieldClass(Boolean(error))} appearance-none pr-10 ${value ? 'text-slate-900' : 'text-slate-400'}`}>
          <option value="">{field.required ? 'Pilih…' : 'Pilih… (boleh kosong)'}</option>
          {field.options!.map((option) => <option key={option} className="text-slate-900">{option}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
    );
  } else if (field.input === 'year') {
    control = (
      <div className="flex items-center gap-3">
        <input type="number" min={1900} max={new Date().getFullYear()} value={value} disabled={entry.unknownYear} placeholder={entry.unknownYear ? '' : placeholderOf(field)} onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} ${fieldClass(Boolean(error))} max-w-36 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50`} />
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={Boolean(entry.unknownYear)} onChange={(event) => onUnknownYear(event.target.checked)} className="accent-emerald-700" /> Tidak diketahui</label>
      </div>
    );
  } else {
    control = (
      <div className={`flex items-center ${fieldClass(Boolean(error), true)}`}>
        <input
          type={field.input === 'number' ? 'number' : field.input === 'date' ? 'date' : 'text'}
          step={field.input === 'number' ? 'any' : undefined}
          min={field.input === 'number' ? 0 : undefined}
          list={listId}
          value={value}
          readOnly={locked}
          placeholder={field.input === 'date' ? undefined : placeholderOf(field)}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} min-w-0 flex-1 bg-transparent ${locked ? 'cursor-not-allowed text-slate-500' : field.input === 'date' && !value ? 'text-slate-400' : 'text-slate-900'}`}
        />
        {field.unit && <span className="self-stretch flex items-center border-l border-slate-200 px-3.5 text-xs font-semibold text-slate-500">{field.unit}</span>}
        {listId && <datalist id={listId}>{field.options!.map((option) => <option key={option} value={option} />)}</datalist>}
        {field.input === 'coordinate' && (
          <button type="button" onClick={openMap} className="mr-1.5 flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-800">
            <MapIcon className="h-3.5 w-3.5" /> Pilih di peta
          </button>
        )}
      </div>
    );
  }
  return (
    <label data-field={field.key} className={`block scroll-mt-4 text-[13px] font-medium text-slate-800 ${field.input === 'coordinate' || field.key === 'lokasi_peralatan' || field.key === 'lokasi_penyimpanan' ? 'sm:col-span-2' : ''}`}>
      {field.label}{field.required && <span className="text-rose-600"> *</span>}
      <div className="mt-1.5">{control}</div>
      {field.input === 'coordinate' && <CoordinatePreview value={value} />}
      {error ? <p className="mt-1 text-[11px] font-medium text-rose-700">{error}</p>
        : field.sumOf && value.trim() && Number.isFinite(Number(value))
          ? <p className={`mt-1 text-[11px] font-normal ${locked ? 'text-emerald-700' : 'text-slate-400'}`}>{locked ? `Dihitung dari ${field.sumOf.label}` : 'Setara'} = {(Number(value) * field.sumOf.divisor).toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</p>
          : field.hint && field.input !== 'coordinate' && <p className="mt-1 text-[11px] font-normal text-slate-400">{field.hint}</p>}
      {/* In a portal: inside the label, clicks on the map would focus the input. */}
      {picking && createPortal(<CoordinatePicker initial={picking.initial} onClose={() => setPicking(null)} onPick={(picked) => { onChange(picked); setPicking(null); }} />, document.body)}
    </label>
  );
}

/**
 * One entry of a form, in a pop-up over the page: the title and the buttons
 * stay put while the sections between them scroll, with a row of chips to
 * jump between sections. `validate` returns the errors per field; saving is
 * refused while there are any, and the first of them is scrolled to.
 * Closing with something typed asks first. `inline` shows it in the page
 * (the locked preview).
 */
export default function FormEditor({ sections, initial, validate, title, subtitle, saveLabel, saving = false, notice, children, onSave, onSaveAndNew, onCancel, inline = false }: {
  sections: FormSection[];
  initial: FormEntry;
  validate: (entry: FormEntry) => Record<string, string>;
  title: string;
  /** Under the title, e.g. which form. */
  subtitle?: string;
  saveLabel: string;
  saving?: boolean;
  /** Above the buttons, e.g. why the last save failed. */
  notice?: React.ReactNode;
  /** Shown after the sections. */
  children?: React.ReactNode;
  onSave: (entry: FormEntry) => void;
  /** Saves and opens an empty entry; the button shows only when given. */
  onSaveAndNew?: (entry: FormEntry) => void;
  onCancel: () => void;
  inline?: boolean;
}) {
  // An entry opened with both parts of a total shows the total they make.
  const [start] = useState(() => withTotals(sections, initial));
  const [entry, setEntry] = useState(start);
  const [tried, setTried] = useState(false);
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const errors = tried ? validate(entry) : {};
  const errorCount = Object.keys(errors).length;
  const dirty = JSON.stringify(entry) !== JSON.stringify(start);
  const set = (key: string, value: string) => setEntry((current) => withTotals(sections, { ...current, values: { ...current.values, [key]: value } }, current));

  useEffect(() => {
    if (inline) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    bodyRef.current?.querySelector<HTMLElement>('input:not([type=checkbox]):not(:disabled), select')?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = before; };
  }, [inline]);

  const goTo = (index: number) => {
    setActive(index);
    bodyRef.current?.querySelector(`[data-section="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // The chip of the section at the top of the scroll, or the last one at the bottom.
  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
    const blocks = Array.from(body.querySelectorAll<HTMLElement>('[data-section]'));
    const index = atEnd ? blocks.length - 1 : blocks.reduce((found, block, i) => (block.getBoundingClientRect().top - top <= 40 ? i : found), 0);
    setActive(index);
  };

  /** True when the entry has no errors; otherwise brings the first one into view. */
  const check = () => {
    setTried(true);
    const found = validate(entry);
    const first = sections.flatMap((section) => section.fields).find((field) => found[field.key]);
    if (!first) return true;
    requestAnimationFrame(() => {
      const field = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${first.key}"]`);
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true });
    });
    return false;
  };
  const save = () => { if (check()) onSave(entry); };
  const saveAndNew = () => { if (check()) onSaveAndNew?.(entry); };
  const close = async () => {
    if (saving) return;
    if (dirty && !(await confirmDialog({ title: 'Buang isian ini?', message: 'Yang sudah diketik belum disimpan dan akan hilang.', tone: 'danger', icon: X, confirmLabel: 'Buang', cancelLabel: 'Lanjut mengisi' }))) return;
    onCancel();
  };

  const sectionErrors = sections.map((section) => section.fields.filter((field) => errors[field.key]).length);
  const sectionDone = sections.map((section) => {
    const required = section.fields.filter((field) => field.required && isShown(field, entry.values));
    return required.length > 0 && required.every((field) => entry.values[field.key]?.trim() || (field.input === 'year' && entry.unknownYear));
  });

  const header = (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h3 id="form-editor-title" className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <button type="button" onClick={close} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
    </div>
  );
  const chips = sections.length > 1 && (
    <nav className="flex flex-wrap gap-1.5 px-5 pb-3 pt-3" aria-label="Bagian formulir">
      {sections.map((section, index) => (
        <button key={section.title} type="button" onClick={() => goTo(index)}
          className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${active === index ? 'border-emerald-700 bg-emerald-700 text-white' : sectionErrors[index] ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
          {sectionErrors[index] > 0 ? <AlertTriangle className="h-3 w-3" /> : sectionDone[index] && <CheckCircle2 className="h-3 w-3" />}
          {section.title}
          {sectionErrors[index] > 0 && <span className={`rounded-full px-1.5 tabular-nums ${active === index ? 'bg-white/20' : 'bg-rose-100'}`}>{sectionErrors[index]}</span>}
        </button>
      ))}
    </nav>
  );
  const fields = (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <section key={section.title} data-section={index} className="scroll-mt-4">
          <div className="mb-3 flex items-baseline gap-2 border-b border-slate-100 pb-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-800">{index + 1}</span>
            <div>
              <h4 className="text-sm font-semibold text-slate-800">{section.title}</h4>
              {section.note && <p className="text-[11px] text-slate-500">{section.note}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            {section.fields.filter((field) => isShown(field, entry.values)).map((field) => (
              <FieldInput key={field.key} field={field} entry={entry} error={errors[field.key]} onChange={(value) => set(field.key, value)}
                onUnknownYear={(unknown) => setEntry((current) => ({ ...current, unknownYear: unknown, values: { ...current.values, [field.key]: unknown ? '' : current.values[field.key] ?? '' } }))} />
            ))}
          </div>
        </section>
      ))}
      {children}
    </div>
  );
  const footer = (
    <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3">
      {notice && <div className="mb-3">{notice}</div>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {errorCount > 0 && <p className="mr-auto flex items-center gap-1.5 text-xs font-medium text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /> {errorCount} isian perlu diperbaiki</p>}
        <button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Batal</button>
        {onSaveAndNew && <button type="button" onClick={saveAndNew} disabled={saving} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"><Plus className="h-4 w-4" /> Simpan & tambah lagi</button>}
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {saveLabel}</button>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {header}{chips}
        <div className="border-t border-slate-100 px-5 py-4">{fields}</div>
        {footer}
      </div>
    );
  }

  return createPortal(
    <div className="form-modal-backdrop fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] sm:p-4"
      onMouseDown={(event) => { downOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => { if (downOnBackdrop.current && event.target === event.currentTarget) close(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="form-editor-title" tabIndex={-1}
        onKeyDown={(event) => {
          // Not from the map picker, which sits outside the panel.
          if (event.key === 'Escape' && panelRef.current?.contains(event.target as Node)) { event.preventDefault(); close(); }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
        }}
        className="form-modal-panel flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl outline-none sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        <div className="border-b border-slate-200">{header}{chips || <div className="h-3" />}</div>
        <div ref={bodyRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{fields}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}
