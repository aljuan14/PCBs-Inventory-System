'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, Download, Loader2, XCircle } from 'lucide-react';
import { UPLOAD_STATUS, UploadFindings, UploadSample } from '@/components/InventoryUpload';
import type { UploadMode, UploadSummary } from '@/lib/company-upload-shared';
import { formSpec } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';
import { STORAGE_BUCKET } from '@/lib/upload-store';

type Upload = {
  id: string; company_id: string; kategori: InventoryCategory; mode: UploadMode; nama_file: string; file_path: string;
  status: keyof typeof UPLOAD_STATUS; catatan: string | null; created_at: string; diperiksa_at: string | null; ringkasan: UploadSummary | null;
  companies: { nama_perusahaan: string; id_simpel: string | null } | null;
};

const fmt = (value: number) => value.toLocaleString('id-ID');
const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** One upload: what the check found when it was sent, the file, and the answer. */
function UploadCard({ upload, onAnswered }: { upload: Upload; onAnswered: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(upload.status === 'menunggu');
  const [busy, setBusy] = useState<'terima' | 'tolak' | 'file' | null>(null);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const summary = upload.ringkasan;
  const status = UPLOAD_STATUS[upload.status];
  const spec = formSpec(upload.kategori);

  const answer = async (action: 'terima' | 'tolak') => {
    let catatan: string | undefined;
    if (action === 'tolak') {
      catatan = window.prompt('Alasan penolakan (ditampilkan ke perusahaan):')?.trim();
      if (!catatan) return;
    } else if (!window.confirm(upload.mode === 'ganti'
      ? `Terima dan GANTI semua data formulir ${spec.code} ${upload.companies?.nama_perusahaan ?? ''} dengan isi berkas ini?`
      : `Terima dan tambahkan data berkas ini ke formulir ${spec.code} ${upload.companies?.nama_perusahaan ?? ''}?`)) return;
    setBusy(action);
    setResult(null);
    const response = await fetch(`/api/unggahan/${upload.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, catatan }) });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setResult({ tone: 'error', text: body.error ?? 'Gagal memproses unggahan.' });
    setResult({ tone: 'ok', text: action === 'tolak' ? 'Unggahan ditolak.' : `${fmt(body.imported)} baris masuk${body.skipped ? `, ${fmt(body.skipped)} sudah ada dan dilewati` : ''}${upload.mode === 'ganti' ? `, ${fmt(body.replacedRows)} data lama diganti` : ''}.` });
    onAnswered();
  };

  const download = async () => {
    setBusy('file');
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(upload.file_path, 300, { download: upload.nama_file });
    setBusy(null);
    if (error || !data) return setResult({ tone: 'error', text: `Berkas tidak dapat diunduh: ${error?.message ?? 'tidak ditemukan'}` });
    window.location.href = data.signedUrl;
  };

  return (
    <li className="rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{upload.companies?.nama_perusahaan ?? 'Perusahaan'} · Formulir {spec.code}</span>
          <span className="block text-xs text-slate-500">{upload.nama_file} · {upload.mode === 'ganti' ? 'mengganti semua data' : 'ditambahkan'}{summary ? ` · ${fmt(summary.rows)} baris` : ''} · dikirim {fmtDate(upload.created_at)}</span>
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{upload.status === 'menunggu' ? 'Menunggu' : status.label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          {summary && (
            <>
              <p className="text-xs text-slate-700">
                Saat dikirim: <span className="font-semibold">{fmt(summary.rows)} baris</span> dari sheet &quot;{summary.sheetName}&quot;
                {upload.mode === 'tambah' && summary.alreadyStored > 0 && `, ${fmt(summary.alreadyStored)} sudah ada dan akan dilewati`}
                {upload.mode === 'ganti' && `, menggantikan ${fmt(summary.currentRows)} data lama perusahaan`}.
                {' '}Berkas dibaca ulang saat diterima.
              </p>
              <UploadFindings summary={summary} />
              <UploadSample summary={summary} />
            </>
          )}
          {upload.catatan && <p className="text-xs text-rose-800">Alasan penolakan: {upload.catatan}</p>}
          {result && <p className={`rounded-xl border px-3 py-2 text-xs ${result.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{result.text}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={download} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {busy === 'file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Unduh berkas
            </button>
            {upload.companies?.id_simpel && <Link href={`/lapor/${encodeURIComponent(upload.companies.id_simpel)}`} className="text-xs font-semibold text-emerald-700 underline">Buka laporan perusahaan</Link>}
            <span className="flex-1" />
            {upload.status === 'menunggu' && (
              <>
                <button type="button" disabled={busy !== null} onClick={() => answer('tolak')} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40">
                  {busy === 'tolak' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Tolak
                </button>
                <button type="button" disabled={busy !== null} onClick={() => answer('terima')} className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
                  {busy === 'terima' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {busy === 'terima' ? 'Mengimpor…' : 'Terima'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The admin's queue of companies' Excel uploads of forms 1.1-1.4
 * (unggahan_perusahaan): the waiting ones first, then the latest answered.
 */
export default function CompanyUploadsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reload, setReload] = useState(0);
  const [uploads, setUploads] = useState<{ key: number; list: Upload[]; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from('unggahan_perusahaan').select('id, company_id, kategori, mode, nama_file, file_path, status, catatan, created_at, diperiksa_at, ringkasan, companies(nama_perusahaan, id_simpel)')
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (active) setUploads({ key: reload, list: (data ?? []) as unknown as Upload[], error: error?.message ?? null }); });
    return () => { active = false; };
  }, [supabase, reload]);

  const list = uploads?.key === reload ? uploads.list : null;
  const waiting = list?.filter((upload) => upload.status === 'menunggu') ?? [];
  const answered = list?.filter((upload) => upload.status !== 'menunggu' && upload.status !== 'dibatalkan') ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Data masuk</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Unggahan perusahaan</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Template Excel formulir 1.1–1.4 yang dikirim perusahaan dari halaman laporannya. Data baru masuk ke inventaris setelah diterima di sini; penolakan disertai alasan untuk perusahaan.</p>
      </header>
      {uploads?.error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Gagal memuat: {uploads.error}. Pastikan migrasi 20261014000006_company_uploads.sql sudah dijalankan.</p>}
      {list === null ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p> : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Menunggu pemeriksaan ({fmt(waiting.length)})</h2>
            {waiting.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Tidak ada unggahan yang menunggu.</p>
              : <ul className="space-y-3">{waiting.map((upload) => <UploadCard key={upload.id} upload={upload} onAnswered={() => setReload((value) => value + 1)} />)}</ul>}
          </section>
          {answered.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-800">Sudah diperiksa</h2>
              <ul className="space-y-3">{answered.map((upload) => <UploadCard key={upload.id} upload={upload} onAnswered={() => setReload((value) => value + 1)} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
