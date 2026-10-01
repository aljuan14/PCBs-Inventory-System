'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, FileSpreadsheet, Loader2, MailCheck } from 'lucide-react';
import { buildCompanyFeedback, feedbackMessage, type CompanyFeedback, type FeedbackBatch } from '@/lib/company-feedback';
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

/**
 * Check results of one company's imports, worded for the company, with a
 * message the admin copies into an email. Shown when a company is selected.
 */
export default function CompanyCheckCard({ companyId, companyName, reloadKey = 0 }: { companyId: string; companyName: string; reloadKey?: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<{ companyId: string; feedback: CompanyFeedback | null; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('import_batches')
      .select('nama_file_asli, sheet_name, jenis_data, laporan_pemeriksaan')
      .eq('company_id', companyId)
      .eq('status', 'imported')
      .order('uploaded_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ companyId, feedback: null, error: error.message });
          return;
        }
        const batches: FeedbackBatch[] = (data ?? []).map((row) => ({
          fileName: row.nama_file_asli as string | null,
          sheetName: row.sheet_name as string | null,
          category: row.jenis_data as InventoryCategory,
          report: row.laporan_pemeriksaan as CheckReport | null,
        }));
        setState({ companyId, feedback: buildCompanyFeedback(batches) });
      });
    return () => { cancelled = true; };
  }, [supabase, companyId, reloadKey]);

  const current = state?.companyId === companyId ? state : null;
  const feedback = current?.feedback ?? null;
  const message = feedback ? feedbackMessage(companyName, feedback) : '';
  const needsFix = (feedback?.findings ?? 0) > 0;

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
        </>
      )}
    </section>
  );
}
