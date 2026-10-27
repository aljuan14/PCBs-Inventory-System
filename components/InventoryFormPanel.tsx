'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, CheckCircle2, Copy, Info, Loader2, Pencil, Save, Trash2 } from 'lucide-react';
import EvidencePanel from '@/components/EvidencePanel';
import InventoryUpload from '@/components/InventoryUpload';
import StoredEntriesPanel from '@/components/StoredEntriesPanel';
import FormEditor from '@/components/FormEditor';
import { MAX_FORM_ROWS, NOT_TESTED, entryErrors, formSpec, isTrafo, TRAFO_FOCUS_YEAR, type EntryCheck, type FormEntry } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
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

type Result = { saved: boolean; savedRows?: number; blocked: number; checks: EntryCheck[] };

/**
 * One form (1.1–1.4) of a company: a list of entries kept as a draft in the
 * browser, each typed in the editor, then saved together with one button
 * (none is saved while any is refused).
 */
export default function InventoryFormPanel({ companyId, category, noTrafoBefore1997, onSaved, onRoadmap }: {
  companyId: string;
  category: InventoryCategory;
  /** The company stated it has no transformer made before 1997. */
  noTrafoBefore1997: boolean;
  onSaved: () => void;
  /** Opens the roadmap, offered once untested transformers are saved. */
  onRoadmap?: () => void;
}) {
  const spec = formSpec(category);
  const key = draftKey(companyId, category);
  // The parent keys this panel by company and form, so the draft is read once per pair.
  // Bumped when entries are sent, so the stored list below loads them.
  const [sentKey, setSentKey] = useState(0);
  const [entries, setEntries] = useState<FormEntry[]>(() => readDraft(key));
  const [editing, setEditing] = useState<FormEntry | null>(null);
  const [checks, setChecks] = useState<Map<string, EntryCheck>>(new Map());
  const [busy, setBusy] = useState(false);
  // `untested`: transformers in use just saved as "belum diuji", now on the roadmap.
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string; untested?: number } | null>(null);
  // After "Simpan & tambah lagi": how many entries the list holds now.
  const [added, setAdded] = useState<number | null>(null);

  const update = (next: FormEntry[]) => {
    setEntries(next);
    writeDraft(key, next);
    setChecks(new Map());
    setMessage(null);
  };

  const saveEntry = (entry: FormEntry) => {
    update(entries.some((item) => item.id === entry.id) ? entries.map((item) => (item.id === entry.id ? entry : item)) : [...entries, entry]);
    setEditing(null);
    setAdded(null);
  };
  const saveAndNew = (entry: FormEntry) => {
    const next = [...entries, entry];
    update(next);
    setAdded(next.length);
    setEditing({ id: newId(), values: {} });
  };
  // A copy keeps the shared details (brand, oil, location) and clears what identifies the unit.
  const duplicate = (entry: FormEntry) => setEditing({ id: newId(), unknownYear: entry.unknownYear, values: { ...entry.values, nomor_serial: '', kode_alat: '', koordinat_raw: entry.values.koordinat_raw ?? '' } });

  // Checks every entry and saves them all when none is refused; otherwise nothing is saved and the refused ones say why.
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/formulir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, category, entries, dryRun: false }) });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Gagal memproses formulir.');
      if (body.saved) {
        const untested = category === 'transformator_digunakan' ? entries.filter((entry) => entry.values.sudah_diuji === NOT_TESTED).length : 0;
        update([]);
        setMessage({ tone: 'ok', text: `${body.savedRows} isian tersimpan.`, untested });
        setSentKey((value) => value + 1);
        onSaved();
        return;
      }
      setChecks(new Map(body.checks.map((check) => [check.id, check])));
      setMessage({ tone: 'warn', text: `${body.blocked} dari ${entries.length} isian perlu diperbaiki. Belum ada yang tersimpan; perbaiki lalu klik "Simpan ke data" lagi.` });
    } catch (err) {
      setMessage({ tone: 'warn', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(() => (category === 'minyak_dielektrik'
    ? [['merek_minyak_dielektrik', 'Merek minyak'], ['volume_l', 'Volume (L)'], ['lokasi_penyimpanan', 'Lokasi']]
    : [['nama_merek', 'Merek'], ['nomor_serial', 'No. serial'], ['tahun_pembuatan', 'Tahun'], ['lokasi_peralatan', 'Lokasi']]), [category]);

  return (
    <div className="space-y-4">
      <InventoryUpload companyId={companyId} category={category} onSent={() => { setSentKey((value) => value + 1); onSaved(); }} onManual={() => setEditing({ id: newId(), values: {} })} manualFull={entries.length >= MAX_FORM_ROWS} />

      {isTrafo(category) && noTrafoBefore1997 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Menurut pernyataannya, perusahaan ini tidak memiliki trafo buatan sebelum {TRAFO_FOCUS_YEAR}. Ubah pernyataan dulu bila ternyata ada.</p>
      )}

      {editing && (
        <FormEditor key={editing.id} sections={spec.sections} initial={editing} validate={(entry) => entryErrors(category, entry)}
          title={entries.some((item) => item.id === editing.id) ? 'Ubah isian' : 'Isian baru'} subtitle={`Formulir ${spec.code}: ${spec.title}`} saveLabel="Simpan ke daftar"
          notice={added !== null && <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Isian sebelumnya masuk ke daftar ({added} isian). Lanjutkan isian berikutnya.</p>}
          onSave={saveEntry} onSaveAndNew={entries.some((item) => item.id === editing.id) || entries.length + 1 >= MAX_FORM_ROWS ? undefined : saveAndNew}
          onCancel={() => { setEditing(null); setAdded(null); }} />
      )}

      {entries.length > 0 && <p className="-mb-2 px-1 text-xs text-slate-500"><span className="font-semibold text-slate-800">Belum tersimpan · {entries.length} isian</span> · klik &ldquo;Simpan ke data&rdquo; di bawah daftar ini. Sampai itu, isian hanya ada di browser ini.</p>}
      {entries.length === 0 ? null : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="w-10 px-3 py-2.5">No</th>{columns.map(([field, label]) => <th key={field} className="px-3 py-2.5">{label}</th>)}<th className="px-3 py-2.5">Status</th><th className="w-28 px-3 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry, index) => {
                const check = checks.get(entry.id);
                return (
                  <tr key={entry.id} className={check?.errors.length ? 'bg-rose-50/40' : ''}>
                    <td className="px-3 py-2.5 align-top tabular-nums text-slate-400">{index + 1}</td>
                    {columns.map(([field]) => <td key={field} className="max-w-48 truncate px-3 py-2.5 align-top text-slate-800">{entry.values[field] || (field === 'tahun_pembuatan' && entry.unknownYear ? 'Tidak diketahui' : '–')}</td>)}
                    <td className="px-3 py-2.5 align-top">
                      {!check ? <span className="text-slate-400">Belum tersimpan</span>
                        : check.errors.length ? <ul className="space-y-0.5 text-rose-700">{check.errors.map((text) => <li key={text} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{text}</li>)}</ul>
                          : <span className="flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Sudah benar</span>}
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
          <span>
            {message.text}{message.tone === 'ok' && entries.length === 0 && ' Lihat di daftar data tersimpan di bawah.'}
            {message.untested ? <> <b>{message.untested} trafo belum diuji</b> sudah masuk Roadmap; isi kapan akan diuji.</> : null}
          </span>
          {message.untested && onRoadmap ? (
            <button type="button" onClick={onRoadmap} className="ml-auto flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">
              <CalendarPlus className="h-4 w-4" /> Isi rencana uji
            </button>
          ) : null}
        </p>
      )}

      {entries.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={submit} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {busy ? 'Menyimpan…' : `Simpan ${entries.length} isian ke data`}
          </button>
        </div>
      )}
      <StoredEntriesPanel companyId={companyId} category={category} refreshKey={sentKey} onChanged={onSaved} />
      <EvidencePanel companyId={companyId} category={category} onSaved={onSaved} />
    </div>
  );
}
