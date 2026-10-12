'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Info, Loader2, MapPin, Pencil, Plus, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { parseDMSCoordinate } from '@/lib/dms';
import { MAX_FORM_ROWS, entryErrors, formSpec, isTrafo, TRAFO_FOCUS_YEAR, type EntryCheck, type FormEntry, type FormField } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const draftKey = (companyId: string, category: InventoryCategory) => `formulir:${companyId}:${category}`;

// The unsent entries are kept in this browser, so a closed tab loses nothing.
function readDraft(key: string): FormEntry[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function writeDraft(key: string, entries: FormEntry[]) {
  try {
    if (entries.length) window.localStorage.setItem(key, JSON.stringify(entries));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: the entries simply live until the page closes.
  }
}

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

function FieldInput({ field, entry, error, onChange, onUnknownYear }: { field: FormField; entry: FormEntry; error?: string; onChange: (value: string) => void; onUnknownYear: (unknown: boolean) => void }) {
  const value = entry.values[field.key] ?? '';
  const border = error ? 'border-rose-300' : 'border-slate-200';
  const listId = field.options && field.input === 'text' ? `options-${field.key}` : undefined;
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
      </div>
    );
  }
  return (
    <label className={`block text-xs font-medium text-slate-700 ${field.input === 'coordinate' || field.key === 'lokasi_peralatan' || field.key === 'lokasi_penyimpanan' ? 'sm:col-span-2' : ''}`}>
      {field.label}{field.required && <span className="text-rose-600"> *</span>}
      <div className="mt-1">{control}</div>
      {field.input === 'coordinate' && <CoordinatePreview value={value} />}
      {error ? <p className="mt-1 text-[11px] font-medium text-rose-700">{error}</p> : field.hint && field.input !== 'coordinate' && <p className="mt-1 text-[11px] text-slate-400">{field.hint}</p>}
    </label>
  );
}

function EntryEditor({ category, initial, onSave, onCancel }: { category: InventoryCategory; initial: FormEntry; onSave: (entry: FormEntry) => void; onCancel: () => void }) {
  const spec = formSpec(category);
  const [entry, setEntry] = useState(initial);
  const [tried, setTried] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(spec.sections.map((section) => [section.title, !section.collapsed || section.fields.some((field) => initial.values[field.key])])));
  const errors = tried ? entryErrors(category, entry) : {};
  const set = (key: string, value: string) => setEntry((current) => ({ ...current, values: { ...current.values, [key]: value } }));

  const save = () => {
    setTried(true);
    const found = entryErrors(category, entry);
    if (Object.keys(found).length === 0) onSave(entry);
    else setOpen((current) => ({ ...current, ...Object.fromEntries(spec.sections.filter((section) => section.fields.some((field) => found[field.key])).map((section) => [section.title, true])) }));
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{initial.values.nama_merek || initial.values.merek_minyak_dielektrik ? 'Ubah isian' : 'Isian baru'}</h3>
        <button type="button" onClick={onCancel} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        {spec.sections.map((section) => (
          <div key={section.title} className="rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setOpen((current) => ({ ...current, [section.title]: !current[section.title] }))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
              <span>
                <span className="block text-sm font-semibold text-slate-800">{section.title}</span>
                {section.note && <span className="text-[11px] text-slate-500">{section.note}</span>}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open[section.title] ? 'rotate-180' : ''}`} />
            </button>
            {open[section.title] && (
              <div className="grid gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <FieldInput key={field.key} field={field} entry={entry} error={errors[field.key]} onChange={(value) => set(field.key, value)}
                    onUnknownYear={(unknown) => setEntry((current) => ({ ...current, unknownYear: unknown, values: { ...current.values, [field.key]: unknown ? '' : current.values[field.key] ?? '' } }))} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {tried && Object.keys(errors).length > 0 && <p className="mt-3 text-xs font-medium text-rose-700">Masih ada {Object.keys(errors).length} isian yang perlu diperbaiki.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700">Batal</button>
        <button type="button" onClick={save} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><CheckCircle2 className="h-4 w-4" /> Simpan ke daftar</button>
      </div>
    </div>
  );
}

type Result = { saved: boolean; savedRows?: number; blocked: number; checks: EntryCheck[] };

/**
 * One form (1.1–1.4) of a company: a list of entries kept as a draft in the
 * browser, each typed in the editor, then checked and sent together.
 */
export default function InventoryFormPanel({ companyId, category, storedCount, noTrafoBefore1997, onSaved }: {
  companyId: string;
  category: InventoryCategory;
  storedCount: number | null;
  /** The company stated it has no transformer made before 1997. */
  noTrafoBefore1997: boolean;
  onSaved: () => void;
}) {
  const spec = formSpec(category);
  const key = draftKey(companyId, category);
  // The parent keys this panel by company and form, so the draft is read once per pair.
  const [entries, setEntries] = useState<FormEntry[]>(() => readDraft(key));
  const [editing, setEditing] = useState<FormEntry | null>(null);
  const [checks, setChecks] = useState<Map<string, EntryCheck>>(new Map());
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const update = (next: FormEntry[]) => {
    setEntries(next);
    writeDraft(key, next);
    setChecks(new Map());
    setMessage(null);
  };

  const saveEntry = (entry: FormEntry) => {
    update(entries.some((item) => item.id === entry.id) ? entries.map((item) => (item.id === entry.id ? entry : item)) : [...entries, entry]);
    setEditing(null);
  };
  // A copy keeps the shared details (brand, oil, location) and clears what identifies the unit.
  const duplicate = (entry: FormEntry) => setEditing({ id: newId(), unknownYear: entry.unknownYear, values: { ...entry.values, nomor_serial: '', kode_alat: '', koordinat_raw: entry.values.koordinat_raw ?? '' } });

  const submit = async (dryRun: boolean) => {
    setBusy(dryRun ? 'check' : 'send');
    setMessage(null);
    try {
      const response = await fetch('/api/formulir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, category, entries, dryRun }) });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Gagal memproses formulir.');
      if (body.saved) {
        update([]);
        setMessage({ tone: 'ok', text: `${body.savedRows} isian tersimpan ke database.` });
        onSaved();
        return;
      }
      setChecks(new Map(body.checks.map((check) => [check.id, check])));
      setMessage(body.blocked > 0
        ? { tone: 'warn', text: `${body.blocked} dari ${entries.length} isian perlu diperbaiki sebelum dikirim.` }
        : { tone: 'ok', text: `Semua ${entries.length} isian lolos pemeriksaan. Klik "Kirim" untuk menyimpan.` });
    } catch (err) {
      setMessage({ tone: 'warn', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const allChecked = entries.length > 0 && entries.every((entry) => checks.get(entry.id)?.errors.length === 0);
  const columns = useMemo(() => (category === 'minyak_dielektrik'
    ? [['merek_minyak_dielektrik', 'Merek minyak'], ['volume_l', 'Volume (L)'], ['lokasi_penyimpanan', 'Lokasi']]
    : [['nama_merek', 'Merek'], ['nomor_serial', 'No. serial'], ['tahun_pembuatan', 'Tahun'], ['lokasi_peralatan', 'Lokasi']]), [category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Formulir {spec.code}: {spec.title}</h2>
          <p className="text-xs text-slate-500">
            {storedCount === null ? 'Menghitung data tersimpan…' : `Sudah tersimpan di database: ${storedCount.toLocaleString('id-ID')} unit.`}
            {isTrafo(category) && ` Hanya trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau yang tahunnya tidak diketahui.`}
          </p>
        </div>
        {!editing && entries.length < MAX_FORM_ROWS && (
          <button type="button" onClick={() => setEditing({ id: newId(), values: {} })} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> Tambah isian</button>
        )}
      </div>

      {isTrafo(category) && noTrafoBefore1997 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Menurut pernyataannya, perusahaan ini tidak memiliki trafo buatan sebelum {TRAFO_FOCUS_YEAR}. Ubah pernyataan dulu bila ternyata ada.</p>
      )}

      {editing && <EntryEditor key={editing.id} category={category} initial={editing} onSave={saveEntry} onCancel={() => setEditing(null)} />}

      {entries.length === 0 ? (
        !editing && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Belum ada isian. Klik &quot;Tambah isian&quot; untuk mulai. Isian tersimpan sebagai draf di browser ini sampai dikirim.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="w-10 px-3 py-2.5">No</th>{columns.map(([field, label]) => <th key={field} className="px-3 py-2.5">{label}</th>)}<th className="px-3 py-2.5">Pemeriksaan</th><th className="w-28 px-3 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry, index) => {
                const check = checks.get(entry.id);
                return (
                  <tr key={entry.id} className={check?.errors.length ? 'bg-rose-50/40' : ''}>
                    <td className="px-3 py-2.5 align-top tabular-nums text-slate-400">{index + 1}</td>
                    {columns.map(([field]) => <td key={field} className="max-w-48 truncate px-3 py-2.5 align-top text-slate-800">{entry.values[field] || (field === 'tahun_pembuatan' && entry.unknownYear ? 'Tidak diketahui' : '–')}</td>)}
                    <td className="px-3 py-2.5 align-top">
                      {!check ? <span className="text-slate-400">Belum diperiksa</span>
                        : check.errors.length ? <ul className="space-y-0.5 text-rose-700">{check.errors.map((text) => <li key={text} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{text}</li>)}</ul>
                          : <span className="flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Lolos</span>}
                      {check?.notes.map((text) => <p key={text} className="mt-0.5 text-[11px] text-slate-500">{text}</p>)}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditing(entry)} title="Ubah" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => duplicate(entry)} title="Salin sebagai isian baru" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Copy className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => update(entries.filter((item) => item.id !== entry.id))} title="Hapus" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {message && (
        <p className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {message.tone === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>{message.text}{message.tone === 'ok' && entries.length === 0 && <> Lihat di <Link href="/upload/riwayat" className="font-semibold underline">Riwayat upload</Link>.</>}</span>
        </p>
      )}

      {entries.length > 0 && !editing && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy !== null} onClick={() => submit(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Periksa {entries.length} isian
          </button>
          <button type="button" disabled={busy !== null || !allChecked} onClick={() => submit(false)} title={allChecked ? undefined : 'Periksa dulu; semua isian harus lolos.'} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
            {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim ke database
          </button>
        </div>
      )}
    </div>
  );
}
