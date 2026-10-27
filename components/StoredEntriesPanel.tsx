'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, Loader2, Pencil, Search, Trash2 } from 'lucide-react';
import { formSpec } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';
import { StoredEntryEditor, removeStoredEntry, type StoredRow as Row } from '@/components/StoredEntryEditor';

const PAGE = 50;

const fmt = (value: number) => value.toLocaleString('id-ID');
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/**
 * The company's stored rows of one form, a page at a time, to revise or
 * delete: the same editor as a new entry, saved through the same check
 * (PATCH /api/formulir).
 */
export default function StoredEntriesPanel({ companyId, category, refreshKey, onChanged }: { companyId: string; category: InventoryCategory; refreshKey: number; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const spec = formSpec(category);
  const oil = category === 'minyak_dielektrik';
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: Row[]; total: number } | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const term = query.trim().replace(/[,()%]/g, ' ').trim();
  const key = `${term}|${limit}|${reloadKey}|${refreshKey}`;

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      // The batch's profile tells a row from an Excel file (its own "No." and row) from one typed in the form.
      let request = supabase.from(category).select('*, import_batches(profile)', { count: 'exact' }).eq('company_id', companyId);
      const columns = oil ? ['merek_minyak_dielektrik', 'lokasi_penyimpanan', 'unit', 'kode_alat'] : ['nama_merek', 'nomor_serial', 'lokasi_peralatan', 'unit', 'kode_alat'];
      if (term) request = request.or(columns.map((column) => `${column}.ilike.%${term}%`).join(','));
      // In the order they came in: upload by upload, each in its Excel order. The "No." column of a
      // company's file restarts per plant or section, so it does not order the list.
      request.order('created_at').order('baris_excel', { nullsFirst: false }).order('id').range(0, limit - 1).then(({ data, count }) => {
        if (active) setResult({ key, rows: (data ?? []) as Row[], total: count ?? 0 });
      });
    }, term ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, category, companyId, oil, term, limit, key]);

  const changed = () => {
    setReloadKey((value) => value + 1);
    onChanged();
  };
  const remove = async (row: Row) => {
    if (await removeStoredEntry(supabase, category, row)) changed();
  };

  const rows = result?.key === key ? result.rows : null;
  const columns: Array<[string, string]> = oil
    ? [['merek_minyak_dielektrik', 'Merek minyak'], ['volume_l', 'Volume (L)'], ['lokasi_penyimpanan', 'Lokasi']]
    : [['nama_merek', 'Merek'], ['nomor_serial', 'No. serial'], ['tahun_pembuatan', 'Tahun'], ['lokasi_peralatan', 'Lokasi']];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
        <Database className="h-5 w-5 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Data tersimpan · formulir {spec.code}</h3>
          <p className="text-xs text-slate-500">{result ? `${fmt(result.total)} data${term ? ' cocok dengan pencarian' : ''}.` : 'Memuat…'} Ubah untuk memperbaiki atau melengkapi; perubahan diperiksa ulang.</p>
        </div>
        <label className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 focus-within:border-emerald-600 sm:w-72">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} placeholder="Cari merek, nomor serial, lokasi, unit" className="min-w-0 flex-1 text-xs outline-none" />
        </label>
      </div>

      {editing && <StoredEntryEditor category={category} row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />}

      {rows === null ? <p className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
        : rows.length === 0 ? <p className="p-5 text-sm text-slate-500">{term ? 'Tidak ada data yang cocok.' : 'Belum ada data tersimpan.'}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="w-24 px-3 py-2.5">No</th>{columns.map(([column, label]) => <th key={column} className="px-3 py-2.5">{label}</th>)}{!oil && category !== 'kapasitor' && <th className="px-3 py-2.5">ppm</th>}<th className="w-20 px-3 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => {
                  const notes = Array.isArray(row.catatan_impor) ? row.catatan_impor.length : 0;
                  const fromFile = (row.import_batches as { profile?: string } | null)?.profile !== 'formulir' && row.baris_excel !== null && row.baris_excel !== undefined;
                  return (
                    <tr key={row.id} className={editing?.id === row.id ? 'bg-emerald-50/50' : ''}>
                      <td className="px-3 py-2.5 tabular-nums text-slate-500">
                        {index + 1}
                        {fromFile && <span title="Nomor dan baris di berkas Excel yang diunggah" className="block whitespace-nowrap text-[10px] text-slate-400">Excel: no. {text(row.no) || '–'} · baris {text(row.baris_excel)}</span>}
                      </td>
                      {columns.map(([column]) => <td key={column} className="max-w-48 truncate px-3 py-2.5 text-slate-800">{text(row[column]) || (column === 'tahun_pembuatan' ? <span className="text-amber-700">tidak ada</span> : '–')}</td>)}
                      {!oil && category !== 'kapasitor' && <td className="px-3 py-2.5 tabular-nums text-slate-700">{text(row.uji_konsentrasi_ppm) || '–'}</td>}
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {notes > 0 && <span title={`${notes} catatan pemeriksaan (lihat Kualitas data)`} className="self-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{notes}</span>}
                          <button type="button" onClick={() => setEditing(row)} title="Ubah" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => remove(row)} title="Hapus" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {result && rows.length < result.total && (
              <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="w-full border-t border-slate-100 py-3 text-xs font-semibold text-emerald-700 hover:bg-slate-50">Muat {PAGE} lagi ({fmt(result.total - rows.length)} tersisa)</button>
            )}
          </div>
        )}
    </div>
  );
}
