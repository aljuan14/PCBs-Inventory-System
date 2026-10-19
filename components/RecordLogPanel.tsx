'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import FormEditor from '@/components/FormEditor';
import { newId } from '@/components/InventoryFormPanel';
import { fieldErrors, recordFromEntry, type FormEntry, type FormSection } from '@/lib/form-fields';
import { confirmDialog } from '@/components/Dialog';

export type LogColumn = { label: string; value: (row: Record<string, unknown>) => React.ReactNode; total?: (rows: Record<string, unknown>[]) => React.ReactNode; className?: string };

export const tons = (value: unknown) => (value === null || value === undefined ? '–' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: 4 }));
export const sumOf = (key: string) => (rows: Record<string, unknown>[]) => tons(rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0));
export const shortDate = (value: unknown) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

/**
 * A table of the company's rows (logbook, balance) with a form to add one:
 * the fields come from `sections`, `extraErrors` adds checks across fields,
 * and the columns with `total` get a TOTAL row as in the template.
 */
export default function RecordLogPanel({ supabase, companyId, table, orderBy, title, description, addLabel, sections, defaults, extraErrors, columns, refreshKey = 0, onSaved }: {
  supabase: SupabaseClient;
  companyId: string;
  table: string;
  orderBy: string;
  title: string;
  description: string;
  addLabel: string;
  sections: FormSection[];
  defaults: () => Record<string, string>;
  extraErrors?: (values: Record<string, number | null>) => Record<string, string>;
  columns: LogColumn[];
  /** Changed from outside (an Excel upload) to load the rows again. */
  refreshKey?: number;
  /** After a row is added or removed: the company status may change. */
  onSaved?: () => void;
}) {
  const fields = sections.flatMap((section) => section.fields);
  const [rows, setRows] = useState<{ key: number; list: Record<string, unknown>[] } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<FormEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from(table).select('*').eq('company_id', companyId).order(orderBy, { ascending: false }).order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        setRows({ key: reloadKey, list: (data ?? []) as Record<string, unknown>[] });
      });
    return () => { active = false; };
  }, [supabase, companyId, table, orderBy, reloadKey, refreshKey]);

  const numbers = (entry: FormEntry) => Object.fromEntries(fields.filter((field) => field.input === 'number').map((field) => {
    const value = entry.values[field.key]?.trim();
    return [field.key, value ? Number(value.replace(',', '.')) : null];
  }));
  const validate = (entry: FormEntry) => ({ ...fieldErrors(fields, entry), ...(extraErrors?.(numbers(entry)) ?? {}) });

  const save = async (entry: FormEntry) => {
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from(table).insert(recordFromEntry(fields, entry, companyId));
    setSaving(false);
    if (saveError) return setError(`Gagal menyimpan: ${saveError.message}`);
    setEditing(null);
    setReloadKey((value) => value + 1);
    onSaved?.();
  };

  const remove = async (id: unknown) => {
    if (!(await confirmDialog({ title: 'Hapus baris ini?', message: 'Baris ini dihapus dan tidak dapat dibatalkan.', tone: 'danger', confirmLabel: 'Hapus' }))) return;
    await supabase.from(table).delete().eq('id', id);
    setReloadKey((value) => value + 1);
    onSaved?.();
  };

  const list = rows?.key === reloadKey ? rows.list : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <button type="button" onClick={() => { setEditing({ id: newId(), values: defaults() }); setError(null); }} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> {addLabel}</button>
      </div>
      {error && !editing && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{error}</p>}
      {editing && <FormEditor key={editing.id} sections={sections} initial={editing} validate={validate} title={addLabel} subtitle={title} saveLabel="Simpan" saving={saving} onSave={save} onCancel={() => { setEditing(null); setError(null); }}
        notice={error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">{error}</p>} />}
      {list === null ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
        : list.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">Belum ada baris.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="w-10 px-3 py-2.5">No</th>{columns.map((column) => <th key={column.label} className={`px-3 py-2.5 ${column.className ?? ''}`}>{column.label}</th>)}<th className="w-10 px-3 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((row, index) => (
                  <tr key={String(row.id)}>
                    <td className="px-3 py-2.5 tabular-nums text-slate-400">{index + 1}</td>
                    {columns.map((column) => <td key={column.label} className={`px-3 py-2.5 align-top text-slate-700 ${column.className ?? ''}`}>{column.value(row)}</td>)}
                    <td className="px-3 py-2.5"><button type="button" onClick={() => remove(row.id)} aria-label="Hapus" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
              {columns.some((column) => column.total) && (
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <tr><td className="px-3 py-2.5" />{columns.map((column, index) => <td key={column.label} className={`px-3 py-2.5 ${column.className ?? ''}`}>{column.total ? column.total(list) : index === 0 ? 'TOTAL' : ''}</td>)}<td /></tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
    </div>
  );
}
