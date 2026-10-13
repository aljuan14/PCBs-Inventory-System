'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, ExternalLink, FileSignature, Loader2, Upload, XCircle } from 'lucide-react';
import { declaresNone, fetchPcbStatus, hasInventory, type PcbStatusCounts } from '@/lib/company-pcb-status';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';

export type CompanyStatement = {
  id: string;
  punya_trafo_sebelum_1997: boolean;
  punya_trafo_1997_keatas: boolean;
  jumlah_trafo_1997_keatas: number | null;
  tonase_trafo_1997_keatas_ton: number | null;
  tidak_memiliki_peralatan: boolean;
  surat_path: string | null;
  surat_nama_file: string | null;
  surat_tanggal: string | null;
  verifikasi: 'menunggu' | 'diterima' | 'ditolak' | null;
  verifikasi_catatan: string | null;
  created_at: string;
};

const BUCKET = 'surat-pernyataan';
const MAX_LETTER_BYTES = 2 * 1024 * 1024;
const LETTER_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const fmt = (value: number) => value.toLocaleString('id-ID');
const fmtDate = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const inputClass = 'min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none';

const VERIFICATION = {
  menunggu: { label: 'Menunggu verifikasi KLH', icon: Clock, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  diterima: { label: 'Diterima KLH', icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ditolak: { label: 'Ditolak', icon: XCircle, className: 'border-rose-200 bg-rose-50 text-rose-800' },
} as const;

type Loaded = { key: string; counts: PcbStatusCounts; statement: CompanyStatement | null; admin: boolean };

/**
 * What the company owns. With inventory data the data says it, and only
 * the transformers from 1997 on that it does not list one by one may be added.
 * Without data the company says it owns equipment (data to follow) or none,
 * the latter with its own signed letter, which the admin verifies. Every save
 * adds a statement row (company_statements, migration 20261013000012).
 */
export default function CompanyStatementCard({ supabase, companyId, reloadKey = 0, onStatement, onSaved }: {
  supabase: SupabaseClient;
  companyId: string;
  reloadKey?: number;
  /** The latest statement, each time it is read. */
  onStatement?: (statement: CompanyStatement | null) => void;
  /** After a save or a verification: the status and the rest may change. */
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [owns, setOwns] = useState<boolean | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [count, setCount] = useState('');
  const [tonnage, setTonnage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [letterDate, setLetterDate] = useState('');
  const key = `${companyId}|${reloadKey}`;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchPcbStatus(supabase, companyId),
      supabase.from('company_statements').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc('is_admin'),
    ]).then(([counts, { data: statement }, { data: admin }]) => {
      if (!active) return;
      setLoaded({ key, counts, statement: (statement as CompanyStatement | null) ?? null, admin: admin === true });
      onStatement?.((statement as CompanyStatement | null) ?? null);
    }, (err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [supabase, companyId, key, onStatement]);

  if (!loaded || loaded.key !== key) {
    return <section className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{error ? <><AlertTriangle className="h-4 w-4 text-amber-600" /> {error}</> : <><Loader2 className="h-4 w-4 animate-spin" /> Memuat kepemilikan peralatan…</>}</section>;
  }

  const { counts, statement, admin } = loaded;
  const withData = hasInventory(counts);
  const trafo = counts.trafo_digunakan + counts.trafo_tidak_digunakan;
  const choice = owns ?? (statement ? !declaresNone(statement) : null);

  const save = async (row: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('company_statements').insert({ company_id: companyId, ...row });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setOwns(null);
    setFile(null);
    setLetterDate('');
    onSaved();
  };

  // Transformers from 1997 on that the company does not list one by one.
  const saveExtra = () => {
    const units = count.trim() === '' ? 0 : Number(count);
    const tons = tonnage.trim() === '' ? 0 : Number(tonnage.replace(',', '.'));
    if (!Number.isInteger(units) || units < 0) return setError('Jumlah harus bilangan bulat, 0 atau lebih.');
    if (!Number.isFinite(tons) || tons < 0) return setError('Tonase harus angka, 0 atau lebih.');
    save({ punya_trafo_sebelum_1997: counts.fokus > 0, punya_trafo_1997_keatas: units > 0, jumlah_trafo_1997_keatas: units > 0 ? units : null, tonase_trafo_1997_keatas_ton: units > 0 ? tons : null });
  };

  const saveOwns = () => save({ punya_trafo_sebelum_1997: false, punya_trafo_1997_keatas: false, tidak_memiliki_peralatan: false });

  const saveNone = async () => {
    if (!file) return setError('Pilih berkas surat pernyataan (PDF, JPG, atau PNG).');
    if (!LETTER_TYPES.includes(file.type)) return setError('Surat pernyataan harus PDF, JPG, atau PNG.');
    if (file.size > MAX_LETTER_BYTES) return setError('Ukuran surat pernyataan maksimal 2 MB.');
    if (!letterDate) return setError('Isi tanggal surat.');
    setSaving(true);
    setError(null);
    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${companyId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (uploadError) {
      setSaving(false);
      return setError(`Gagal mengunggah surat: ${uploadError.message}`);
    }
    await save({ punya_trafo_sebelum_1997: false, punya_trafo_1997_keatas: false, tidak_memiliki_peralatan: true, surat_path: path, surat_nama_file: file.name, surat_tanggal: letterDate });
  };

  const openLetter = async () => {
    if (!statement?.surat_path) return;
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(statement.surat_path, 300);
    if (urlError || !data) return setError(`Surat tidak dapat dibuka: ${urlError?.message ?? 'berkas tidak ditemukan'}. Surat hanya tersimpan di perangkat tempat ia diunggah sampai sistem online.`);
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const verify = async (result: 'diterima' | 'ditolak') => {
    if (!statement) return;
    const reason = result === 'ditolak' ? window.prompt('Alasan penolakan (ditampilkan ke perusahaan):')?.trim() : null;
    if (result === 'ditolak' && !reason) return;
    setSaving(true);
    const { error: verifyError } = await supabase.from('company_statements').update({ verifikasi: result, verifikasi_catatan: reason ?? null }).eq('id', statement.id);
    setSaving(false);
    if (verifyError) return setError(verifyError.message);
    onSaved();
  };

  const header = (title: string, subtitle: string) => (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FileSignature className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );

  const letter = statement?.surat_path && declaresNone(statement) ? statement : null;
  const status = letter?.verifikasi ? VERIFICATION[letter.verifikasi] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      {withData ? (
        <>
          {header('Kepemilikan peralatan', 'Dari data yang dilaporkan. Tidak perlu mengisi pernyataan; perbarui datanya di formulir bila ada yang berubah.')}
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Transformator</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{fmt(trafo)}</dd>
              {trafo > 0 && <dd className="mt-1 text-xs text-slate-600">{fmt(counts.fokus - counts.fokus_tahun_kosong)} sebelum {TRAFO_FOCUS_YEAR} · {fmt(trafo - counts.fokus)} {TRAFO_FOCUS_YEAR} ke atas{counts.fokus_tahun_kosong ? ` · ${fmt(counts.fokus_tahun_kosong)} tanpa tahun` : ''}</dd>}
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kapasitor</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{fmt(counts.kapasitor)}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Minyak dielektrik</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{fmt(counts.minyak)} <span className="text-xs font-normal text-slate-500">data</span></dd>
            </div>
          </dl>
          {statement && declaresNone(statement) && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Pernyataan sebelumnya menyebut tidak memiliki peralatan, tetapi datanya ada. Periksa datanya.</p>
          )}
          <div className="mt-4 rounded-xl border border-slate-200">
            <button type="button" onClick={() => { setExtraOpen((value) => !value); setCount(statement?.jumlah_trafo_1997_keatas?.toString() ?? ''); setTonnage(statement?.tonase_trafo_1997_keatas_ton?.toString() ?? ''); }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
              <span>
                <span className="block text-sm font-semibold text-slate-800">Trafo {TRAFO_FOCUS_YEAR} ke atas yang tidak didata satu per satu <span className="font-normal text-slate-500">(opsional)</span></span>
                <span className="text-xs text-slate-500">{statement?.punya_trafo_1997_keatas ? `Tercatat ${fmt(statement.jumlah_trafo_1997_keatas ?? 0)} unit, ${(statement.tonase_trafo_1997_keatas_ton ?? 0).toLocaleString('id-ID')} ton.` : 'Cukup jumlah dan tonasenya.'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${extraOpen ? 'rotate-180' : ''}`} />
            </button>
            {extraOpen && (
              <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 p-4">
                <label className="text-xs font-medium text-slate-600">Jumlah
                  <span className="mt-1 flex w-36 items-center rounded-lg border border-slate-200 focus-within:border-emerald-600"><input type="number" min={0} step={1} value={count} onChange={(event) => setCount(event.target.value)} className={inputClass} /><span className="pr-3 text-xs text-slate-400">unit</span></span>
                </label>
                <label className="text-xs font-medium text-slate-600">Total tonase
                  <span className="mt-1 flex w-36 items-center rounded-lg border border-slate-200 focus-within:border-emerald-600"><input type="number" min={0} step="any" value={tonnage} onChange={(event) => setTonnage(event.target.value)} className={inputClass} /><span className="pr-3 text-xs text-slate-400">ton</span></span>
                </label>
                <button type="button" onClick={saveExtra} disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {header('Pernyataan perusahaan', statement ? `Pernyataan terakhir: ${fmtDate(statement.created_at)}.` : 'Belum ada data peralatan. Nyatakan dulu apakah perusahaan memiliki trafo, kapasitor, atau minyak dielektrik.')}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {([[true, 'Memiliki peralatan', 'Trafo, kapasitor, atau minyak dielektrik. Datanya diisi di formulir di bawah.'], [false, 'Tidak memiliki peralatan', 'Tidak memiliki trafo, kapasitor, maupun minyak dielektrik yang dimaksud Permen LHK P.29/2020. Wajib surat pernyataan.']] as const).map(([value, title, detail]) => (
              <label key={title} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${choice === value ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name={`owns-${companyId}`} checked={choice === value} onChange={() => setOwns(value)} className="mt-0.5 accent-emerald-700" />
                <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="text-xs text-slate-500">{detail}</span></span>
              </label>
            ))}
          </div>

          {choice === true && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {statement && !declaresNone(statement) && owns === null
                ? <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Sudah dinyatakan. Lanjutkan dengan mengisi formulir di bawah.</p>
                : <button type="button" onClick={saveOwns} disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan pernyataan</button>}
            </div>
          )}

          {choice === false && (
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              {letter && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <FileSignature className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{letter.surat_nama_file ?? 'Surat pernyataan'}</span>
                    <span className="text-xs text-slate-500">{letter.surat_tanggal ? `Tanggal surat ${fmtDate(letter.surat_tanggal)} · ` : ''}diunggah {fmtDate(letter.created_at)}</span>
                  </span>
                  {status && <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}><status.icon className="h-3.5 w-3.5" /> {status.label}</span>}
                  <button type="button" onClick={openLetter} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink className="h-3.5 w-3.5" /> Lihat file</button>
                  {letter.verifikasi === 'ditolak' && letter.verifikasi_catatan && <p className="w-full text-xs text-rose-800">Alasan: {letter.verifikasi_catatan}</p>}
                  {admin && (
                    <div className="flex w-full gap-2 border-t border-slate-100 pt-3">
                      <span className="flex-1 self-center text-xs text-slate-500">Verifikasi admin KLH:</span>
                      <button type="button" disabled={saving || letter.verifikasi === 'diterima'} onClick={() => verify('diterima')} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Terima</button>
                      <button type="button" disabled={saving || letter.verifikasi === 'ditolak'} onClick={() => verify('ditolak')} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40">Tolak</button>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-600">{letter ? 'Unggah surat baru untuk mengganti.' : 'Unggah surat pernyataan bertanda tangan dan bermeterai, dengan kop dan format perusahaan sendiri.'} PDF, JPG, atau PNG, maksimal 2 MB.</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-600 hover:border-emerald-500">
                  <Upload className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{file ? file.name : 'Pilih berkas surat…'}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                </label>
                <label className="text-xs font-medium text-slate-600">Tanggal surat
                  <input type="date" value={letterDate} onChange={(event) => setLetterDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-600" />
                </label>
                <button type="button" onClick={saveNone} disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Kirim surat pernyataan</button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}
    </section>
  );
}
