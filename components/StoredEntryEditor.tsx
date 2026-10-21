'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import FormEditor from '@/components/FormEditor';
import { alertDialog, confirmDialog } from '@/components/Dialog';
import { fieldErrors, formFields, formSpec, type FormEntry } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';
import type { createClient } from '@/lib/supabase/client';

export type StoredRow = Record<string, unknown> & { id: string };

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** A stored row as the form's entry, so it opens in the same editor. */
function entryOf(category: InventoryCategory, row: StoredRow): FormEntry {
  const fields = formFields(category);
  return {
    id: row.id,
    unknownYear: fields.some((field) => field.input === 'year') && (row.tahun_pembuatan === null || row.tahun_pembuatan === undefined),
    values: Object.fromEntries(fields.map((field) => [field.key, field.input === 'date' ? text(row[field.key]).slice(0, 10) : text(row[field.key])])),
  };
}

/**
 * A company's stored row in the form's editor (a pop-up), saved through the
 * same check as a new entry (PATCH /api/formulir).
 */
export function StoredEntryEditor({ category, row, onClose, onSaved }: { category: InventoryCategory; row: StoredRow; onClose: () => void; onSaved: () => void }) {
  const spec = formSpec(category);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const save = async (entry: FormEntry) => {
    setSaving(true);
    setErrors([]);
    try {
      const response = await fetch('/api/formulir', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, id: row.id, entry }) });
      const body = await response.json() as { saved?: boolean; errors?: string[]; error?: string };
      if (!response.ok) { setErrors(body.errors ?? [body.error ?? 'Gagal menyimpan perubahan.']); return; }
      onSaved();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormEditor key={row.id} sections={spec.sections} initial={entryOf(category, row)} validate={(entry) => fieldErrors(formFields(category), entry)}
      title={`Ubah data no. ${text(row.no)}`} subtitle={`Formulir ${spec.code}: ${spec.title}`} saveLabel="Simpan perubahan" saving={saving} onSave={save} onCancel={onClose}
      notice={errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> Perubahan belum tersimpan:</p>
          <ul className="mt-1 list-disc pl-5">{errors.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )} />
  );
}

/** Deletes a stored row after asking; true when it is gone. */
export async function removeStoredEntry(supabase: ReturnType<typeof createClient>, category: InventoryCategory, row: StoredRow): Promise<boolean> {
  const name = text(category === 'minyak_dielektrik' ? row.merek_minyak_dielektrik : row.nama_merek) || 'data ini';
  if (!(await confirmDialog({ title: `Hapus ${name}${row.nomor_serial ? ` (${row.nomor_serial})` : ''}?`, message: 'Data ini dihapus dari formulir dan tidak dapat dibatalkan.', tone: 'danger', confirmLabel: 'Hapus' }))) return false;
  const { error, count } = await supabase.from(category).delete({ count: 'exact' }).eq('id', row.id);
  if (error || count === 0) {
    await alertDialog({ title: 'Gagal menghapus', message: error?.message ?? 'Data tidak ditemukan; mungkin sudah dihapus.' });
    return false;
  }
  return true;
}
