'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, FileSpreadsheet, Loader2, MailCheck, Send, Undo2 } from 'lucide-react';
import { buildCompanyFeedback, feedbackMessage, type CompanyFeedback, type FeedbackBatch } from '@/lib/company-feedback';
import { FEEDBACK_STATUSES, deriveStatus, formatDate } from '@/lib/company-status';
import type { CheckReport } from '@/lib/import-transform';
import { getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';

/** Clipboard API, falling back to a hidden textarea where the API is unavailable. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

type SendEntry = { id: string; sent_at: string; sent_by: string | null; findings: number; imported_rows: number };

/**
 * Check results of one company's imports, worded for the company, with a
 * message the admin copies into an email and a record of when it was sent.
 * Shown when a company is selected. `onSendsChange` lets the page refresh the
 * company statuses after marking or undoing a send.
 */
export default function CompanyCheckCard({ companyId, companyName, reloadKey = 0, onSendsChange }: { companyId: string; companyName: string; reloadKey?: number; onSendsChange?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<{ companyId: string; feedback: CompanyFeedback | null; lastImportAt: string | null; error?: string } | null>(null);
  const [sends, setSends] = useState<{ companyId: string; entries: SendEntry[]; error?: string } | null>(null);
  const [sendsKey, setSendsKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('company_feedback_log')
      .select('id, sent_at, sent_by, findings, imported_rows')
      .eq('company_id', companyId)
      .order('sent_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled) setSends({ companyId, entries: (data ?? []) as SendEntry[], error: error?.message });
      });
    return () => { cancelled = true; };
  }, [supabase, companyId, reloadKey, sendsKey]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('import_batches')
      .select('nama_file_asli, sheet_name, jenis_data, laporan_pemeriksaan, uploaded_at')
      .eq('company_id', companyId)
      .eq('status', 'imported')
      .order('uploaded_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ companyId, feedback: null, lastImportAt: null, error: error.message });
          return;
        }
        const batches: FeedbackBatch[] = (data ?? []).map((row) => ({
          fileName: row.nama_file_asli as string | null,
          sheetName: row.sheet_name as string | null,
          category: row.jenis_data as InventoryCategory,
          report: row.laporan_pemeriksaan as CheckReport | null,
        }));
        const lastImportAt = (data ?? []).reduce<string | null>((last, row) => (last === null || new Date(row.uploaded_at) > new Date(last) ? row.uploaded_at : last), null);
        setState({ companyId, feedback: buildCompanyFeedback(batches), lastImportAt });
      });
    return () => { cancelled = true; };
  }, [supabase, companyId, reloadKey]);

  const current = state?.companyId === companyId ? state : null;
  const feedback = current?.feedback ?? null;
  const message = feedback ? feedbackMessage(companyName, feedback) : '';
  const needsFix = (feedback?.findings ?? 0) > 0;

  const entries = sends?.companyId === companyId ? sends.entries : null;
  const status = feedback && entries ? FEEDBACK_STATUSES[deriveStatus({ rows: feedback.importedRows, lastImportAt: current?.lastImportAt ?? null, lastSentAt: entries[0]?.sent_at ?? null })] : null;

  const markSent = async () => {
    if (!feedback) return;
    setSaving(true);
    const { error } = await supabase.from('company_feedback_log').insert({ company_id: companyId, findings: feedback.findings, imported_rows: feedback.importedRows });
    setSaving(false);
    if (error) {
      setSends({ companyId, entries: entries ?? [], error: error.message });
      return;
    }
    setSendsKey((key) => key + 1);
    onSendsChange?.();
  };

  const undoSend = async (entry: SendEntry) => {
    if (!window.confirm(`Batalkan tanda terkirim tanggal ${formatDate(entry.sent_at)}?`)) return;
    setSaving(true);
    const { error } = await supabase.from('company_feedback_log').delete().eq('id', entry.id);
    setSaving(false);
    if (error) {
      setSends({ companyId, entries: entries ?? [], error: error.message });
      return;
    }
    setSendsKey((key) => key + 1);
    onSendsChange?.();
  };

  const copy = async () => {
    if (await copyText(message)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="company-check-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="company-check-title" className="flex items-center gap-2 text-base font-semibold text-slate-900"><MailCheck className="h-4.5 w-4.5 text-emerald-700" /> Hasil pemeriksaan data</h2>
          <p className="mt-1 text-xs text-slate-500">
            {feedback
              ? <>{feedback.files.length.toLocaleString('id-ID')} berkas · {feedback.importedRows.toLocaleString('id-ID')} baris diterima · <span className="font-semibold text-slate-700">{companyName}</span></>
              : <span className="font-semibold text-slate-700">{companyName}</span>}
          </p>
        </div>
        {feedback && feedback.files.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            {needsFix
              ? <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> Perlu perbaikan · {feedback.findings} temuan</span>
              : <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Data lengkap</span>}
            <button type="button" onClick={copy} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-2xs ${copied ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Pesan tersalin' : 'Salin pesan'}
            </button>
          </div>
        )}
      </header>

      {!current && <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat hasil pemeriksaan…</div>}
      {current?.error && <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Hasil pemeriksaan gagal dimuat: {current.error}</div>}
      {feedback && feedback.files.length === 0 && <p className="mt-4 text-xs text-slate-500">Belum ada data yang diimpor untuk perusahaan ini.</p>}

      {feedback && feedback.files.length > 0 && (
        <>
          <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
            {feedback.files.map((file, index) => (
              <li key={index} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="min-w-0 break-all font-semibold text-slate-800">{file.fileName}</span>
                  {file.sheetName && <span className="text-slate-500">· sheet “{file.sheetName}”</span>}
                  <span className="text-slate-500">· {getCategoryLabel(file.category)} · {file.importedRows.toLocaleString('id-ID')} baris</span>
                </div>
                {file.points.length > 0
                  ? <ul className="mt-2 list-disc space-y-1 pl-6 text-xs text-slate-700">{file.points.map((point) => <li key={point}>{point}</li>)}</ul>
                  : <p className="mt-1.5 flex items-center gap-1.5 pl-5 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> Tidak ada temuan</p>}
              </li>
            ))}
          </ul>

          <button type="button" onClick={() => setShowMessage((open) => !open)} aria-expanded={showMessage} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
            <ChevronDown className={`h-3.5 w-3.5 transition ${showMessage ? 'rotate-180' : ''}`} /> {showMessage ? 'Sembunyikan' : 'Lihat'} pesan yang akan disalin
          </button>
          {showMessage && <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-xs leading-relaxed text-slate-700">{message}</pre>}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">Status pengiriman:</span>
                {status
                  ? <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.badge}`}><span className={`h-2 w-2 rounded-full ${status.dot}`} />{status.label}</span>
                  : <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              </div>
              <button type="button" onClick={markSent} disabled={saving || !entries} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Tandai sudah dikirim
              </button>
            </div>
            {sends?.error && <p className="mt-2 text-xs font-semibold text-amber-800">Riwayat pengiriman gagal disimpan/dimuat: {sends.error}</p>}
            {entries && entries.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                {entries.map((entry, index) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="font-semibold text-slate-700">Dikirim {formatDate(entry.sent_at)}</span>
                    <span className="text-slate-500">· {entry.findings === 0 ? 'data lengkap' : `${entry.findings} temuan`} · {entry.imported_rows.toLocaleString('id-ID')} baris{entry.sent_by ? ` · oleh ${entry.sent_by}` : ''}</span>
                    {index === 0 && <button type="button" onClick={() => undoSend(entry)} disabled={saving} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Undo2 className="h-3 w-3" /> Batalkan</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
