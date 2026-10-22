'use client';

import { useEffect, useMemo, useState } from 'react';
import { useIdleHold } from '@/components/IdleLogout';
import { AlertTriangle, CheckCircle2, Clock, Info, Loader2, Send, X, XCircle } from 'lucide-react';
import { COMPANY_UPLOAD_FOLDER, MAX_COMPANY_UPLOAD_BYTES, type UploadMode, type UploadSummary } from '@/lib/company-upload-shared';
import { formSpec } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';
import { TEMPLATE_FILES } from '@/lib/templates';
import { STORAGE_BUCKET, isExcelFileName } from '@/lib/upload-store';
import { confirmDialog } from '@/components/Dialog';
import AddDataCard, { ManualChoice, UploadChoice, WaitingChoice } from '@/components/AddDataCard';

const fmt = (value: number) => value.toLocaleString('id-ID');
const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

type Sent = { id: string; mode: UploadMode; nama_file: string; status: 'menunggu' | 'diterima' | 'ditolak' | 'dibatalkan'; catatan: string | null; created_at: string; diperiksa_at: string | null; ringkasan: UploadSummary | null };
type Checked = { fileName: string; path: string; summary: UploadSummary };

export const UPLOAD_STATUS = {
  menunggu: { label: 'Menunggu pemeriksaan KLH', icon: Clock, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  diterima: { label: 'Diterima', icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  ditolak: { label: 'Ditolak', icon: XCircle, className: 'border-rose-200 bg-rose-50 text-rose-900' },
  dibatalkan: { label: 'Dibatalkan', icon: X, className: 'border-slate-200 bg-slate-50 text-slate-600' },
} as const;

/** The findings of the check: warnings first, then what was fixed or noted. */
export function UploadFindings({ summary }: { summary: UploadSummary }) {
  const shown = summary.issues.filter((issue) => !issue.key.startsWith('missing:')).slice(0, 8);
  const missing = summary.issues.filter((issue) => issue.key.startsWith('missing:'));
  if (shown.length === 0 && missing.length === 0) return <p className="text-xs text-emerald-800">Tidak ada temuan pemeriksaan.</p>;
  return (
    <ul className="space-y-1.5">
      {shown.map((issue) => (
        <li key={issue.key} className="flex items-start gap-2 text-xs">
          {issue.level === 'warning' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="text-slate-700">
            {issue.label}: <span className="font-semibold">{fmt(issue.count)} baris</span>
            <span className="text-slate-400"> (baris Excel {issue.rows.slice(0, 5).join(', ')}{issue.count > 5 ? ', …' : ''})</span>
            {issue.examples.length > 0 && <span className="block truncate text-[11px] text-slate-500">contoh: {issue.examples.slice(0, 2).join(' · ')}</span>}
          </span>
        </li>
      ))}
      {missing.length > 0 && <li className="text-[11px] text-slate-500">Kolom kosong: {missing.map((issue) => `${issue.label.replace(/^Tanpa /, '')} (${fmt(issue.count)})`).join(', ')}.</li>}
    </ul>
  );
}

/** The first rows as read, to see the columns landed where they belong. */
export function UploadSample({ summary }: { summary: UploadSummary }) {
  if (summary.sample.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-[11px]">
        <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
          <tr><th className="px-2 py-1.5">Baris</th><th className="px-2 py-1.5">Merek</th><th className="px-2 py-1.5">No. serial</th><th className="px-2 py-1.5">Tahun</th><th className="px-2 py-1.5">PPM</th><th className="px-2 py-1.5">Lokasi</th><th className="px-2 py-1.5">Koordinat</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {summary.sample.map((row) => (
            <tr key={row.baris}><td className="px-2 py-1.5 tabular-nums text-slate-400">{row.baris}</td><td className="px-2 py-1.5">{row.merek ?? '–'}</td><td className="px-2 py-1.5">{row.serial ?? '–'}</td><td className="px-2 py-1.5 tabular-nums">{row.tahun ?? '–'}</td><td className="px-2 py-1.5 tabular-nums">{row.ppm ?? '–'}</td><td className="max-w-40 truncate px-2 py-1.5">{row.lokasi ?? '–'}</td><td className="px-2 py-1.5 tabular-nums">{row.koordinat ?? '–'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CARD_TITLES: Record<InventoryCategory, string> = {
  transformator_digunakan: 'trafo masih digunakan',
  transformator_tidak_digunakan: 'trafo tidak digunakan',
  kapasitor: 'kapasitor',
  minyak_dielektrik: 'minyak dielektrik',
};

/**
 * Upload of the official Excel template of a form 1.x by the company: read
 * and checked on the server (app/api/unggahan), shown, then sent to the admin
 * to add to or replace the company's rows of this form. Nothing changes
 * until the admin accepts it; the company sees its uploads and their answer.
 * With `onManual` it is the form's "add data" card: filling the form one by
 * one beside the upload.
 */
export default function InventoryUpload({ companyId, category, readOnly = false, onSent, onManual, manualFull = false }: {
  companyId: string;
  category: InventoryCategory;
  readOnly?: boolean;
  /** After an upload is sent or withdrawn. */
  onSent?: () => void;
  /** Opens the form for one entry. */
  onManual?: () => void;
  /** The draft list holds as many entries as it may. */
  manualFull?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const spec = formSpec(category);
  const [sent, setSent] = useState<{ key: string; list: Sent[] } | null>(null);
  const [reload, setReload] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<UploadMode>('tambah');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [busy, setBusy] = useState<'check' | 'send' | 'cancel' | null>(null);
  useIdleHold(busy !== null);
  const [error, setError] = useState<string | null>(null);
  const listKey = `${companyId}|${category}|${reload}`;

  useEffect(() => {
    let active = true;
    supabase.from('unggahan_perusahaan').select('id, mode, nama_file, status, catatan, created_at, diperiksa_at, ringkasan').eq('company_id', companyId).eq('kategori', category).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (active) setSent({ key: listKey, list: (data ?? []) as Sent[] }); });
    return () => { active = false; };
  }, [supabase, companyId, category, listKey]);

  const list = sent?.key === listKey ? sent.list : [];
  const waiting = list.find((upload) => upload.status === 'menunggu');

  const call = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/unggahan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? 'Gagal memeriksa berkas.');
    return result as { id?: string; summary: UploadSummary };
  };

  // The file goes to the company's folder, then the server reads it from there (no request size limit).
  const check = async (chosen: File, chosenMode: UploadMode) => {
    setError(null);
    setChecked(null);
    if (!isExcelFileName(chosen.name)) return setError('Berkas harus Excel (.xlsx atau .xls).');
    if (chosen.size > MAX_COMPANY_UPLOAD_BYTES) return setError(`Ukuran berkas maksimal ${MAX_COMPANY_UPLOAD_BYTES / 1024 / 1024} MB.`);
    setBusy('check');
    try {
      const path = checked?.fileName === chosen.name ? checked.path : `${COMPANY_UPLOAD_FOLDER}/${companyId}/${crypto.randomUUID()}.${chosen.name.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'}`;
      if (checked?.path !== path) {
        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, chosen, { contentType: chosen.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (uploadError) throw new Error(`Gagal mengunggah berkas: ${uploadError.message}`);
      }
      const { summary } = await call({ companyId, category, path, fileName: chosen.name, mode: chosenMode });
      setChecked({ fileName: chosen.name, path, summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const choose = (chosen: File) => {
    setFile(chosen);
    check(chosen, mode);
  };
  // "ganti" and "tambah" count different things (rows that go, rows already there): check again.
  const changeMode = (next: UploadMode) => {
    setMode(next);
    if (file && checked) check(file, next);
  };

  const send = async () => {
    if (!checked) return;
    setBusy('send');
    setError(null);
    try {
      await call({ companyId, category, path: checked.path, fileName: checked.fileName, mode, send: true });
      setChecked(null);
      setFile(null);
      setReload((value) => value + 1);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (upload: Sent) => {
    if (!(await confirmDialog({ title: 'Batalkan unggahan ini?', message: `${upload.nama_file} tidak jadi diperiksa KLH dan datanya tidak masuk. Unggah lagi kapan saja.`, tone: 'danger', confirmLabel: 'Batalkan unggahan', cancelLabel: 'Kembali', icon: X }))) return;
    setBusy('cancel');
    const { error: cancelError } = await supabase.from('unggahan_perusahaan').update({ status: 'dibatalkan' }).eq('id', upload.id);
    setBusy(null);
    if (cancelError) return setError(cancelError.message);
    setReload((value) => value + 1);
    onSent?.();
  };

  const summary = checked?.summary;
  const template = TEMPLATE_FILES.find((item) => item.form === category);
  const blocking = summary?.issues.filter((issue) => issue.level === 'warning') ?? [];

  return (
    <AddDataCard
      title={onManual ? `Tambah data ${CARD_TITLES[category]} · formulir ${spec.code}` : undefined}
      manual={onManual && !readOnly && <ManualChoice hint={manualFull ? 'Daftar draf penuh; kirim dulu.' : 'Satu per satu, untuk data sedikit.'} disabled={manualFull} onClick={onManual} />}
      upload={!readOnly && (waiting ? <WaitingChoice /> : <UploadChoice hint="Banyak data sekaligus, diperiksa KLH dulu." busy={busy === 'check'} template={template?.file} onFile={(chosen) => { if (!busy) choose(chosen); }} />)}>

      {error && <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
      {busy === 'check' && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Membaca dan memeriksa {file?.name}…</p>}

      {summary && checked && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{checked.fileName}</p>
            <p className="text-xs text-slate-500">Sheet &quot;{summary.sheetName}&quot;</p>
          </div>
          <p className="text-xs text-slate-700">
            <span className="font-semibold">{fmt(summary.rows)} baris data</span> terbaca
            {summary.skippedCopies > 0 && `, ${fmt(summary.skippedCopies)} baris kembar di dalam berkas dilewati`}
            {mode === 'tambah' && summary.alreadyStored > 0 && `, ${fmt(summary.alreadyStored)} baris sudah ada di data perusahaan dan akan dilewati`}.
          </p>
          <UploadFindings summary={summary} />
          <UploadSample summary={summary} />

          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-semibold text-slate-800">Data ini akan:</legend>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="radio" name={`mode-${category}`} checked={mode === 'tambah'} onChange={() => changeMode('tambah')} className="mt-0.5 accent-emerald-700" />
              <span><span className="font-semibold">Ditambahkan</span> ke data formulir {spec.code} yang sudah ada.</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="radio" name={`mode-${category}`} checked={mode === 'ganti'} onChange={() => changeMode('ganti')} className="mt-0.5 accent-emerald-700" />
              <span><span className="font-semibold">Mengganti semua</span> data formulir {spec.code} perusahaan{mode === 'ganti' ? ` (${fmt(summary.currentRows)} data lama akan dihapus, termasuk yang diisi lewat formulir)` : ''}.</span>
            </label>
          </fieldset>

          {blocking.length > 0 && <p className="text-[11px] text-amber-800">Ada {fmt(blocking.length)} jenis peringatan. Data tetap bisa dikirim; KLH akan memeriksanya. Sebaiknya perbaiki dulu di Excel bila memungkinkan.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setChecked(null); setFile(null); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
            <button type="button" disabled={busy !== null || (mode === 'tambah' && summary.alreadyStored >= summary.rows)} onClick={send} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
              {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim untuk diperiksa
            </button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <ul className="space-y-1.5">
          {list.map((upload) => {
            const status = UPLOAD_STATUS[upload.status];
            const Icon = status.icon;
            return (
              <li key={upload.id} className={`flex flex-wrap items-start gap-2 rounded-xl border px-3 py-2 text-xs ${status.className}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{status.label}</span> · {upload.nama_file} · {upload.mode === 'ganti' ? 'mengganti semua data' : 'ditambahkan'}{upload.ringkasan ? ` · ${fmt(upload.ringkasan.rows)} baris` : ''}
                  <span className="block text-[11px] opacity-80">Dikirim {fmtDate(upload.created_at)}{upload.diperiksa_at ? ` · diperiksa ${fmtDate(upload.diperiksa_at)}` : ''}</span>
                  {upload.status === 'ditolak' && upload.catatan && <span className="mt-1 block font-medium">Alasan: {upload.catatan}</span>}
                </span>
                {!readOnly && upload.status === 'menunggu' && (
                  <button type="button" disabled={busy !== null} onClick={() => cancel(upload)} className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100">Batalkan</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AddDataCard>
  );
}
