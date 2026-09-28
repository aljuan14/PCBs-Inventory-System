'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchInventoryQuality, type DashboardScope, type InventoryQuality } from '@/lib/inventory-query';
import {
  applicableIndicators,
  completenessScore,
  formatCount,
  formatShare,
  GROUP_LEVEL_LABELS,
  QUALITY_GROUPS,
  QUALITY_INDICATORS,
  QUALITY_STATUS_LABELS,
  qualityStatus,
  SCORE_DEFINITION,
  STATUS_DEFINITION,
  unitLabel,
  type QualityStatus,
} from '@/lib/data-quality';

const STATUS_TEXT: Record<QualityStatus, string> = { baik: 'text-emerald-700', perhatian: 'text-amber-700', kritis: 'text-rose-700' };

/**
 * Data quality summary laid out as an A4 document. The browser's print
 * dialog opens once the figures are loaded, to save it as PDF.
 */
export default function QualityReport({ scope }: { scope: DashboardScope }) {
  const supabase = useMemo(() => createClient(), []);
  const [quality, setQuality] = useState<InventoryQuality | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set in the browser once loaded: the server renders in another time zone.
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    Promise.all([
      fetchInventoryQuality(supabase, scope),
      scope.companyId ? supabase.from('companies').select('nama_perusahaan').eq('id', scope.companyId).single() : Promise.resolve(null),
    ])
      .then(([nextQuality, company]) => {
        setQuality(nextQuality);
        setGeneratedAt(new Date());
        setCompanyName((company?.data?.nama_perusahaan as string | undefined) ?? null);
      })
      .catch((err: Error) => setError(err.message));
  }, [supabase, scope]);

  useEffect(() => {
    if (!quality || printed.current) return;
    printed.current = true;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [quality]);

  const scopeLabel = [companyName, scope.unit, scope.subUnit].filter(Boolean).join(' › ') || 'Semua perusahaan';
  const summary = quality?.summary;
  const score = summary ? completenessScore(summary) : null;
  const status = score === null ? null : qualityStatus(score);
  const indicators = summary ? applicableIndicators(summary) : [];
  const level = quality?.level ?? 'company';
  const groups = [...(quality?.groups ?? [])].sort((a, b) => (completenessScore(a) ?? 1) - (completenessScore(b) ?? 1));
  const columns = indicators.filter((indicator) => indicator.tone === 'issue' && indicator.key !== 'cleared_values');

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{'@media print { @page { size: A4; margin: 14mm; } body { background: white !important; } }'}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-2 print:hidden">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Kembali ke dashboard</Link>
        <button type="button" onClick={() => window.print()} disabled={!quality} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Printer className="h-4 w-4" /> Cetak / simpan PDF</button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[14mm] text-slate-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-emerald-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Direktorat B3 · Inventarisasi PCBs</div>
              <h1 className="text-xl font-semibold tracking-tight">Laporan Kualitas Data Inventarisasi PCBs</h1>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <div>Dibuat</div>
            <div className="font-semibold text-slate-700">{generatedAt?.toLocaleDateString('id-ID', { dateStyle: 'long' }) ?? '…'}</div>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-1 text-xs">
          <dt className="text-slate-500">Cakupan</dt><dd className="font-semibold">{scopeLabel}</dd>
          <dt className="text-slate-500">Jumlah data</dt><dd className="font-semibold tabular-nums">{summary ? formatCount(summary.total) : '…'}</dd>
        </dl>

        {error && <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
        {!quality && !error && <p className="mt-6 text-xs text-slate-500">Memuat data…</p>}

        {summary && score !== null && status && (
          <>
            <section className="mt-6 break-inside-avoid">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">1. Ringkasan</h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">Skor kelengkapan</div>
                  <div className={`text-2xl font-semibold tabular-nums ${STATUS_TEXT[status]}`}>{formatShare(summary.complete, summary.total)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">Status</div>
                  <div className={`text-2xl font-semibold ${STATUS_TEXT[status]}`}>{QUALITY_STATUS_LABELS[status]}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">Data lengkap</div>
                  <div className="text-2xl font-semibold tabular-nums">{formatCount(summary.complete)}<span className="text-sm font-normal text-slate-500"> / {formatCount(summary.total)}</span></div>
                </div>
              </div>
            </section>

            <section className="mt-6 break-inside-avoid">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">2. Indikator kualitas data</h2>
              <table className="mt-3 w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-2 font-semibold">Kelompok</th>
                    <th className="py-1.5 pr-2 font-semibold">Indikator</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Jumlah</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Dari</th>
                    <th className="py-1.5 text-right font-semibold">Persentase</th>
                  </tr>
                </thead>
                <tbody>
                  {QUALITY_GROUPS.flatMap((group) => indicators.filter((indicator) => indicator.group === group)).map((indicator) => (
                    <tr key={indicator.key} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-500">{indicator.group}</td>
                      <td className="py-1.5 pr-2">{indicator.label}{indicator.tone === 'info' && <span className="text-slate-400"> (info)</span>}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCount(summary[indicator.key])}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{formatCount(indicator.base(summary))}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{formatShare(summary[indicator.key], indicator.base(summary))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {groups.length > 1 && (
              <section className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">3. Peringkat per {GROUP_LEVEL_LABELS[level].toLowerCase()} (skor terendah lebih dulu)</h2>
                <table className="mt-3 w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-300 text-left text-[9px] uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-2 font-semibold">No</th>
                      <th className="py-1.5 pr-2 font-semibold">{GROUP_LEVEL_LABELS[level]}</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Data</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Skor</th>
                      <th className="py-1.5 pr-2 font-semibold">Status</th>
                      {columns.map((indicator) => <th key={indicator.key} className="py-1.5 pr-2 text-right font-semibold">{indicator.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group, index) => {
                      const groupScore = completenessScore(group);
                      const groupStatus = groupScore === null ? null : qualityStatus(groupScore);
                      return (
                        <tr key={group.key ?? '(none)'} className="break-inside-avoid border-b border-slate-100">
                          <td className="py-1.5 pr-2 tabular-nums text-slate-500">{index + 1}</td>
                          <td className="py-1.5 pr-2 font-semibold">{unitLabel(group.label)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{formatCount(group.total)}</td>
                          <td className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${groupStatus ? STATUS_TEXT[groupStatus] : ''}`}>{formatShare(group.complete, group.total)}</td>
                          <td className={`py-1.5 pr-2 ${groupStatus ? STATUS_TEXT[groupStatus] : ''}`}>{groupStatus ? QUALITY_STATUS_LABELS[groupStatus] : '–'}</td>
                          {columns.map((indicator) => <td key={indicator.key} className="py-1.5 pr-2 text-right tabular-nums">{formatShare(group[indicator.key], indicator.base(group))}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}

            <section className="mt-6 break-inside-avoid">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{groups.length > 1 ? '4' : '3'}. Keterangan</h2>
              <dl className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
                <div><dt className="inline font-semibold text-slate-800">Skor kelengkapan. </dt><dd className="inline">{SCORE_DEFINITION}</dd></div>
                <div><dt className="inline font-semibold text-slate-800">Status. </dt><dd className="inline">{STATUS_DEFINITION}</dd></div>
                {QUALITY_INDICATORS.filter((indicator) => indicators.includes(indicator)).map((indicator) => (
                  <div key={indicator.key}><dt className="inline font-semibold text-slate-800">{indicator.label}. </dt><dd className="inline">{indicator.description}</dd></div>
                ))}
                <div>Daftar data per kode alat yang perlu dilengkapi atau diperbaiki tersedia pada laporan Excel &ldquo;daftar temuan&rdquo; dari dashboard.</div>
              </dl>
            </section>
          </>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
          Dihasilkan otomatis oleh Sistem Inventarisasi PCBs{generatedAt ? ` pada ${generatedAt.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}` : ''}.
        </footer>
      </article>
    </div>
  );
}
