'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import FormEditor from '@/components/FormEditor';
import { newId } from '@/components/InventoryFormPanel';
import { parseDMSCoordinate } from '@/lib/dms';
import { REDUCTION_FIELDS, REDUCTION_SECTIONS, fieldErrors, type FormEntry } from '@/lib/form-fields';

type Trafo = {
  id: string; nama_merek: string | null; nomor_serial: string | null; tahun_pembuatan: number | null; negara_asal: string | null;
  merek_minyak_dielektrik: string | null; volume_minyak_l: number | null; lokasi_peralatan: string | null; koordinat_raw: string | null;
  uji_jenis: string | null; uji_konsentrasi_ppm: number | null; berat_ton: number | null; peralatan_tanggap_darurat: string | null; unit: string | null;
};
type Log = {
  id: string; item_id: string | null; nama_merek: string | null; nomor_serial: string | null; perawatan_jenis: string; perawatan_waktu: string;
  uji_sebelum_ppm: number | null; uji_sesudah_ppm: number | null; pengelolaan_limbah_b3: string | null;
};

const TRAFO_COLUMNS = 'id, nama_merek, nomor_serial, tahun_pembuatan, negara_asal, merek_minyak_dielektrik, volume_minyak_l, lokasi_peralatan, koordinat_raw, uji_jenis, uji_konsentrasi_ppm, berat_ton, peralatan_tanggap_darurat, unit';
const NUMBER_FIELDS = new Set(REDUCTION_FIELDS.filter((field) => field.input === 'number').map((field) => field.key));
const fmtDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const ppm = (value: number | null) => (value === null ? '–' : `${value.toLocaleString('id-ID')} ppm`);
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** The transformer's own data as the start of an entry (columns 2-11 of the template). */
export function entryFromTrafo(trafo: Trafo): FormEntry {
  return {
    id: newId(),
    unknownYear: trafo.tahun_pembuatan === null,
    values: {
      nama_merek: text(trafo.nama_merek), nomor_serial: text(trafo.nomor_serial), tahun_pembuatan: text(trafo.tahun_pembuatan),
      negara_asal: text(trafo.negara_asal), merek_minyak_dielektrik: text(trafo.merek_minyak_dielektrik), volume_minyak_l: text(trafo.volume_minyak_l),
      lokasi_peralatan: text(trafo.lokasi_peralatan), koordinat_raw: text(trafo.koordinat_raw),
      uji_sebelum_jenis: trafo.uji_jenis === 'Uji cepat' || trafo.uji_jenis === 'Uji lab' ? trafo.uji_jenis : '', uji_sebelum_ppm: text(trafo.uji_konsentrasi_ppm),
      berat_ton: text(trafo.berat_ton), peralatan_tanggap_darurat: text(trafo.peralatan_tanggap_darurat),
    },
  };
}

/** The entry as a pengurangan_pcbs row: numbers parsed, the coordinate read. */
export function recordOf(entry: FormEntry, companyId: string, itemId: string | null) {
  const record: Record<string, string | number | null> = { company_id: companyId, item_id: itemId };
  for (const field of REDUCTION_FIELDS) {
    const value = entry.values[field.key]?.trim() ?? '';
    if (field.input === 'year') record[field.key] = value && !entry.unknownYear ? Number(value) : null;
    else if (NUMBER_FIELDS.has(field.key)) record[field.key] = value ? Number(value.replace(',', '.')) : null;
    else record[field.key] = value || null;
  }
  const coordinate = parseDMSCoordinate(entry.values.koordinat_raw ?? '');
  record.koordinat_lat = coordinate.isValid ? coordinate.latitude : null;
  record.koordinat_lng = coordinate.isValid ? coordinate.longitude : null;
  return record;
}

/**
 * Writes a maintenance log into its transformer: the latest maintenance
 * (columns 12-16 of form 1.1), the replacement oil as its oil brand, and the
 * after-test when there is one, so the PCBs status follows. An after-test of
 * 50 ppm or less also closes the transformer's open handling plans on the
 * maintenance date: the roadmap need not be marked by hand.
 */
export async function applyToTrafo(supabase: SupabaseClient, trafoId: string, record: Record<string, string | number | null>) {
  const changes: Record<string, string | number | null> = {
    perawatan_jenis: record.perawatan_jenis, perawatan_waktu: record.perawatan_waktu, perawatan_merek_oli_pengganti: record.perawatan_merek_oli_pengganti,
    perawatan_volume_ditambahkan_l: record.perawatan_volume_l, perawatan_penyedia_jasa: record.perawatan_penyedia_jasa,
  };
  if (record.perawatan_merek_oli_pengganti) changes.merek_minyak_dielektrik = record.perawatan_merek_oli_pengganti;
  if (record.uji_sesudah_ppm !== null) {
    Object.assign(changes, { uji_konsentrasi_ppm: record.uji_sesudah_ppm, uji_jenis: record.uji_sesudah_jenis, uji_metode: record.uji_sesudah_metode, uji_penyedia_jasa: record.uji_sesudah_penyedia_jasa });
  }
  const result = await supabase.from('transformator_digunakan').update(changes).eq('id', trafoId);
  if (!result.error && typeof record.uji_sesudah_ppm === 'number' && record.uji_sesudah_ppm <= 50) {
    await supabase.from('equipment_plans').update({ selesai_at: record.perawatan_waktu }).eq('item_id', trafoId).eq('jenis', 'penanganan').is('selesai_at', null);
  }
  return result;
}

/** Transformers still in use, those over 50 ppm first; or those matching the search. */
function TrafoPicker({ supabase, companyId, onPick, onManual }: { supabase: SupabaseClient; companyId: string; onPick: (trafo: Trafo) => void; onManual: () => void }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ key: string; rows: Trafo[] } | null>(null);
  // Commas and brackets would break the or-filter; they never help a search here.
  const term = query.trim().replace(/[,()%]/g, ' ').trim();

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      let request = supabase.from('transformator_digunakan').select(TRAFO_COLUMNS).eq('company_id', companyId);
      if (term) request = request.or(['nama_merek', 'nomor_serial', 'kode_alat', 'lokasi_peralatan', 'unit'].map((column) => `${column}.ilike.%${term}%`).join(','));
      request.order('uji_konsentrasi_ppm', { ascending: false, nullsFirst: false }).limit(20)
        .then(({ data }) => { if (active) setResult({ key: term, rows: (data ?? []) as Trafo[] }); });
    }, term ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, companyId, term]);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Pilih trafo yang dirawat</h3>
      <p className="text-xs text-slate-500">Dari data trafo yang masih digunakan (formulir 1.1). Datanya terisi otomatis ke log.</p>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-emerald-600">
        <Search className="h-4 w-4 text-slate-400" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari merek, nomor serial, kode alat, lokasi, atau unit" className="min-w-0 flex-1 text-sm outline-none" />
      </label>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {!result || result.key !== term ? <p className="flex items-center gap-2 p-3 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Mencari…</p>
          : result.rows.length === 0 ? <p className="p-3 text-xs text-slate-500">Tidak ada trafo yang cocok.</p>
            : result.rows.map((trafo) => (
              <button key={trafo.id} type="button" onClick={() => onPick(trafo)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-emerald-50/50">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{trafo.nama_merek || '–'} · {trafo.nomor_serial || 'tanpa no. serial'}</span>
                  <span className="block truncate text-xs text-slate-500">{[trafo.tahun_pembuatan ?? 'tahun ?', trafo.unit, trafo.lokasi_peralatan].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold tabular-nums ${trafo.uji_konsentrasi_ppm !== null && trafo.uji_konsentrasi_ppm > 50 ? 'text-rose-700' : 'text-slate-500'}`}>{ppm(trafo.uji_konsentrasi_ppm)}</span>
              </button>
            ))}
      </div>
      <div className="mt-3 flex justify-between gap-2">
        <button type="button" onClick={onManual} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">Trafo belum terdaftar? Isi manual</button>
      </div>
    </div>
  );
}

/**
 * Form 2 "Pengurangan PCBs": the maintenance log of the company's
 * transformers in use. An entry made for a listed transformer can also write
 * the maintenance and the after-test into it, so its PCBs status follows.
 */
export default function ReductionFormPanel({ supabase, companyId, onSaved, refreshKey = 0 }: { supabase: SupabaseClient; companyId: string; onSaved: () => void; refreshKey?: number }) {
  const [logs, setLogs] = useState<{ key: number; rows: Log[] } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [step, setStep] = useState<'list' | 'pick' | 'edit'>('list');
  // logId: a stored log being revised; otherwise a new one.
  const [editing, setEditing] = useState<{ entry: FormEntry; trafo: Trafo | null; logId?: string } | null>(null);
  const [updateTrafo, setUpdateTrafo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from('pengurangan_pcbs').select('id, item_id, nama_merek, nomor_serial, perawatan_jenis, perawatan_waktu, uji_sebelum_ppm, uji_sesudah_ppm, pengelolaan_limbah_b3')
      .eq('company_id', companyId).order('perawatan_waktu', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => { if (active) setLogs({ key: reloadKey, rows: (data ?? []) as Log[] }); });
    return () => { active = false; };
  }, [supabase, companyId, reloadKey, refreshKey]);

  const start = (trafo: Trafo | null) => {
    setEditing({ entry: trafo ? entryFromTrafo(trafo) : { id: newId(), values: {} }, trafo });
    setUpdateTrafo(true);
    setError(null);
    setStep('edit');
  };

  const save = async (entry: FormEntry) => {
    setSaving(true);
    setError(null);
    const record = recordOf(entry, companyId, editing?.trafo?.id ?? null);
    const { error: insertError } = editing?.logId
      ? await supabase.from('pengurangan_pcbs').update(record).eq('id', editing.logId)
      : await supabase.from('pengurangan_pcbs').insert(record);
    if (insertError) {
      setSaving(false);
      return setError(`Gagal menyimpan log: ${insertError.message}`);
    }
    let updated = false;
    if (editing?.trafo && updateTrafo) {
      const { error: updateError } = await applyToTrafo(supabase, editing.trafo.id, record);
      if (updateError) setError(`Log tersimpan, tetapi data trafo gagal diperbarui: ${updateError.message}`);
      else updated = true;
    }
    setSaving(false);
    setMessage(`Log perawatan ${editing?.logId ? 'diperbarui' : 'tersimpan'}${updated ? ', dan data trafo diperbarui' : ''}.`);
    setEditing(null);
    setStep('list');
    setReloadKey((value) => value + 1);
    onSaved();
  };

  // A stored log opens in the editor with all its columns; its transformer stays the one it was made for.
  const edit = async (log: Log) => {
    const { data } = await supabase.from('pengurangan_pcbs').select('*').eq('id', log.id).single();
    if (!data) return;
    const values = Object.fromEntries(REDUCTION_FIELDS.map((field) => [field.key, field.input === 'date' ? text(data[field.key]).slice(0, 10) : text(data[field.key])]));
    const trafo = log.item_id ? ({ id: log.item_id, nama_merek: data.nama_merek, nomor_serial: data.nomor_serial } as Trafo) : null;
    setEditing({ entry: { id: newId(), values, unknownYear: data.tahun_pembuatan === null }, trafo, logId: log.id });
    // Revising the record does not rewrite the transformer unless asked.
    setUpdateTrafo(false);
    setError(null);
    setMessage(null);
    setStep('edit');
  };

  const remove = async (log: Log) => {
    if (!window.confirm('Hapus log perawatan ini? Data trafo yang sudah diperbarui tidak dikembalikan.')) return;
    await supabase.from('pengurangan_pcbs').delete().eq('id', log.id);
    setReloadKey((value) => value + 1);
  };

  const rows = logs?.key === reloadKey ? logs.rows : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Formulir 2: Pengurangan PCBs</h2>
          <p className="text-xs text-slate-500">Log perawatan trafo yang masih digunakan, mis. retrofilling, dengan hasil uji sebelum dan sesudahnya (Pasal 13–14 Permen LHK 29/2020).</p>
        </div>
        {step === 'list' && <button type="button" onClick={() => { setStep('pick'); setMessage(null); }} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> Tambah log perawatan</button>}
      </div>

      {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">{message}</p>}
      {error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{error}</p>}

      {step === 'pick' && (
        <>
          <TrafoPicker supabase={supabase} companyId={companyId} onPick={start} onManual={() => start(null)} />
          <button type="button" onClick={() => setStep('list')} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Batal</button>
        </>
      )}

      {step === 'edit' && editing && (
        <FormEditor
          key={editing.entry.id}
          sections={REDUCTION_SECTIONS}
          initial={editing.entry}
          validate={(entry) => fieldErrors(REDUCTION_FIELDS, entry)}
          title={`${editing.logId ? 'Ubah log' : 'Log perawatan'}${editing.trafo ? `: ${editing.trafo.nama_merek ?? ''} ${editing.trafo.nomor_serial ?? ''}` : ' (trafo belum terdaftar)'}`}
          saveLabel="Simpan log"
          saving={saving}
          onSave={save}
          onCancel={() => { setEditing(null); setStep('list'); }}
        >
          {editing.trafo && (
            <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <input type="checkbox" checked={updateTrafo} onChange={(event) => setUpdateTrafo(event.target.checked)} className="mt-0.5 accent-emerald-700" />
              <span><span className="font-semibold">Perbarui data trafo dengan perawatan ini.</span> Perawatan terakhir, merek oli pengganti, dan hasil uji setelah perawatan (bila diisi) menggantikan data trafo, sehingga status PCBs dan roadmap ikut berubah.</span>
            </label>
          )}
        </FormEditor>
      )}

      {step === 'list' && (rows === null ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat log…</p>
        : rows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Belum ada log perawatan.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2.5">Waktu</th><th className="px-3 py-2.5">Trafo</th><th className="px-3 py-2.5">Perawatan</th><th className="px-3 py-2.5">PCBs sebelum → sesudah</th><th className="px-3 py-2.5">Limbah B3</th><th className="w-20 px-3 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{fmtDate(log.perawatan_waktu)}</td>
                    <td className="px-3 py-2.5 text-slate-800">{log.nama_merek || '–'}<span className="block text-slate-500">{log.nomor_serial || '–'}{!log.item_id && ' · belum terdaftar'}</span></td>
                    <td className="px-3 py-2.5 text-slate-700">{log.perawatan_jenis}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{ppm(log.uji_sebelum_ppm)} <ArrowRight className="inline h-3 w-3 text-slate-400" /> <span className={log.uji_sesudah_ppm !== null && log.uji_sesudah_ppm <= 50 ? 'font-semibold text-emerald-700' : log.uji_sesudah_ppm !== null ? 'font-semibold text-rose-700' : ''}>{ppm(log.uji_sesudah_ppm)}</span></td>
                    <td className="max-w-56 px-3 py-2.5 text-slate-600"><span className="line-clamp-2">{log.pengelolaan_limbah_b3 || '–'}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => edit(log)} aria-label="Ubah log" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => remove(log)} aria-label="Hapus log" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
