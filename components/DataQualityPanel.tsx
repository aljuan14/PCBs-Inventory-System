'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, ChevronDown, ChevronRight, ClipboardCheck, Download, FileSpreadsheet, FileText, History, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchInventoryQuality, type DashboardScope, type InventoryFilters, type InventoryQuality, type QualityFigures, type QualityGroup } from '@/lib/inventory-query';
import {
  applicableIndicators,
  completenessScore,
  formatCount,
  formatShare,
  GROUP_LEVEL_LABELS,
  QUALITY_GROUPS,
  QUALITY_STATUS_LABELS,
  qualityStatus,
  SCORE_DEFINITION,
  unitLabel,
  type QualityIndicator,
  type QualityStatus,
} from '@/lib/data-quality';
import { exportQualityWorkbook } from '@/lib/quality-export';
import type { CompanyOption } from '@/components/DataTable';

const STATUS_STYLES: Record<QualityStatus, { ring: string; badge: string; dot: string }> = {
  baik: { ring: '#059669', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  perhatian: { ring: '#d97706', badge: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  kritis: { ring: '#e11d48', badge: 'border-rose-200 bg-rose-50 text-rose-800', dot: 'bg-rose-500' },
};

/** Soft background for a share in the unit comparison, stronger as more data is missing. */
function heatClass(count: number, base: number) {
  if (base <= 0 || count === 0) return 'text-slate-400';
  const share = count / base;
  if (share < 0.05) return 'text-slate-700';
  if (share < 0.15) return 'bg-amber-50 text-amber-900';
  if (share < 0.3) return 'bg-amber-100/70 text-amber-900';
  return 'bg-rose-100/70 text-rose-900';
}

function ScoreRing({ score, status }: { score: number; status: QualityStatus }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke={STATUS_STYLES[status].ring} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${circumference * score} ${circumference}`} />
    </svg>
  );
}

function IndicatorRow({ indicator, figures, onSelect }: { indicator: QualityIndicator; figures: QualityFigures; onSelect: () => void }) {
  const count = figures[indicator.key];
  const base = indicator.base(figures);
  const width = base > 0 ? Math.max((count / base) * 100, count > 0 ? 1.5 : 0) : 0;
  const bar = indicator.tone === 'info' ? 'bg-sky-400' : count / base >= 0.15 ? 'bg-rose-400' : count / base >= 0.05 ? 'bg-amber-400' : 'bg-emerald-400';
  const content = (
    <>
      <span className={`min-w-0 flex-1 truncate ${count === 0 ? 'text-slate-400' : 'text-slate-700'}`}>{indicator.label}</span>
      <span className="w-16 text-right font-semibold tabular-nums text-slate-900">{formatCount(count)}</span>
      <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 sm:block"><span className={`block h-full rounded-full ${bar}`} style={{ width: `${width}%` }} /></span>
      <span className="w-14 text-right tabular-nums text-slate-500">{formatShare(count, base)}</span>
      <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${count > 0 ? 'text-slate-400 group-hover:text-emerald-700' : 'text-transparent'}`} />
    </>
  );
  if (count === 0) return <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs">{content}</div>;
  return (
    <button type="button" onClick={onSelect} title={`${indicator.description} Klik untuk melihat datanya di tabel.`} className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-50">
      {content}
    </button>
  );
}

type GroupSort = 'score' | 'total' | 'name';

interface DataQualityPanelProps {
  scope: DashboardScope;
  /** Company › unit › sub-unit in words, for the heading and the report. */
  scopeLabel: string;
  companies: CompanyOption[];
  reloadKey: number;
  /** Narrow the dashboard to a company, unit or sub-unit from the comparison table. */
  onDrill: (scope: DashboardScope) => void;
  /** Show the rows behind an indicator in the table. */
  onShowRows: (filters: Partial<InventoryFilters>) => void;
}

export default function DataQualityPanel({ scope, scopeLabel, companies, reloadKey, onDrill, onShowRows }: DataQualityPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [quality, setQuality] = useState<InventoryQuality | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<GroupSort>('score');
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<{ rowsRead: number } | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { companyId, unit, subUnit } = scope;
  const requestKey = `${companyId}|${unit}|${subUnit}|${reloadKey}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    fetchInventoryQuality(supabase, { companyId, unit, subUnit })
      .then((next) => { if (!cancelled) { setQuality(next); setError(null); } })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadedKey(requestKey); });
    return () => { cancelled = true; };
  }, [supabase, companyId, unit, subUnit, requestKey]);

  // Close the download menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const companyNames = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const summary = quality?.summary;
  const score = summary ? completenessScore(summary) : null;
  const status = score === null ? null : qualityStatus(score);
  const indicators = summary ? applicableIndicators(summary) : [];
  const level = quality?.level ?? 'company';

  const groups = useMemo(() => {
    const rows = [...(quality?.groups ?? [])];
    if (sort === 'score') rows.sort((a, b) => (completenessScore(a) ?? 1) - (completenessScore(b) ?? 1));
    else if (sort === 'total') rows.sort((a, b) => b.total - a.total);
    else rows.sort((a, b) => unitLabel(a.label).localeCompare(unitLabel(b.label), 'id'));
    return rows;
  }, [quality, sort]);
  // Columns of the comparison: the indicators that apply, coordinates combined.
  const columns = indicators.filter((indicator) => indicator.tone === 'issue' && indicator.key !== 'unreadable_coordinates' && indicator.key !== 'cleared_values');

  const drill = (group: QualityGroup) => {
    if (group.key === null) return;
    if (level === 'company') onDrill({ companyId: group.key, unit: null, subUnit: null });
    else if (level === 'unit') onDrill({ ...scope, unit: group.key, subUnit: null });
  };

  const download = async (format: 'excel' | 'pdf') => {
    setMenuOpen(false);
    setExportMessage(null);
    if (format === 'pdf') {
      const params = new URLSearchParams();
      if (companyId) params.set('company', companyId);
      if (unit) params.set('unit', unit);
      if (subUnit) params.set('sub', subUnit);
      window.open(`/laporan/kualitas${params.size > 0 ? `?${params}` : ''}`, '_blank');
      return;
    }
    if (!quality) return;
    setExporting({ rowsRead: 0 });
    try {
      const result = await exportQualityWorkbook(supabase, { scope, scopeLabel, quality, companyNames, onProgress: (rowsRead) => setExporting({ rowsRead }) });
      setExportMessage(`Laporan Excel berisi ${formatCount(result.findings)} temuan dari ${formatCount(result.rowsRead)} data${result.truncated ? ' (dipotong karena batas baris Excel; pilih unit untuk daftar lengkap)' : ''}.`);
    } catch (err) {
      setExportMessage((err as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const empty = !loading && summary !== undefined && summary.total === 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="data-quality-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="data-quality-title" className="flex items-center gap-2 text-base font-semibold text-slate-900"><ClipboardCheck className="h-4.5 w-4.5 text-emerald-700" /> Kualitas Data</h2>
          <p className="mt-1 text-xs text-slate-500">Kelengkapan dan keterbacaan data inventaris{scopeLabel ? <> · <span className="font-semibold text-slate-700">{scopeLabel}</span></> : ' · semua perusahaan'}</p>
        </div>
        <div ref={menuRef} className="relative">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} disabled={!!exporting || loading || empty} aria-haspopup="menu" aria-expanded={menuOpen} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? `Menyiapkan… ${formatCount(exporting.rowsRead)} data` : 'Unduh laporan'}
            {!exporting && <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <button type="button" role="menuitem" onClick={() => download('excel')} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span><span className="block text-xs font-semibold text-slate-900">Excel · daftar temuan</span><span className="block text-[11px] text-slate-500">Ringkasan, daftar data yang perlu dilengkapi / diperbaiki per kode alat, dan keterangan.</span></span>
              </button>
              <button type="button" role="menuitem" onClick={() => download('pdf')} className="flex w-full items-start gap-3 border-t border-slate-100 px-4 py-3 text-left hover:bg-slate-50">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
                <span><span className="block text-xs font-semibold text-slate-900">PDF · ringkasan</span><span className="block text-[11px] text-slate-500">Laporan siap cetak: skor, indikator, dan peringkat {GROUP_LEVEL_LABELS[level].toLowerCase()}.</span></span>
              </button>
            </div>
          )}
        </div>
      </header>

      {exportMessage && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{exportMessage}</div>}
      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}

      {loading && !quality ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[240px_1fr]" aria-busy>
          <div className="h-56 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-56 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : empty ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Belum ada data untuk dinilai pada cakupan ini.</div>
      ) : summary && score !== null && status ? (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mt-5 grid gap-4 lg:grid-cols-[240px_1fr]">
            {/* Skor kelengkapan */}
            <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50/50 p-5 text-center" title={SCORE_DEFINITION}>
              <div className="relative">
                <ScoreRing score={score} status={status} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{formatShare(summary.complete, summary.total)}</span>
                </div>
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Skor kelengkapan</div>
              <div className="mt-0.5 text-xs text-slate-500"><span className="font-semibold tabular-nums text-slate-700">{formatCount(summary.complete)}</span> dari {formatCount(summary.total)} data lengkap</div>
              <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status].badge}`}><span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[status].dot}`} /> {QUALITY_STATUS_LABELS[status]}</span>
            </div>

            {/* Indikator */}
            <div className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
              {QUALITY_GROUPS.map((group) => {
                const items = indicators.filter((indicator) => indicator.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
                    {items.map((indicator) => <IndicatorRow key={indicator.key} indicator={indicator} figures={summary} onSelect={() => onShowRows(indicator.filters)} />)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Perbandingan antar kelompok */}
          {groups.length > 1 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Perbandingan antar {GROUP_LEVEL_LABELS[level].toLowerCase()}</h3>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <select aria-label="Urutkan perbandingan" value={sort} onChange={(e) => setSort(e.target.value as GroupSort)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                    <option value="score">Skor terendah</option>
                    <option value="total">Data terbanyak</option>
                    <option value="name">Nama A–Z</option>
                  </select>
                </label>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">{GROUP_LEVEL_LABELS[level]}</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Data</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Skor</th>
                      {columns.map((indicator) => <th key={indicator.key} className="px-3 py-2.5 text-right font-semibold">{indicator.label.replace('Koordinat tidak diisi', 'Tanpa koordinat')}</th>)}
                      <th className="px-3 py-2.5 text-right font-semibold">Koordinat bermasalah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groups.map((group) => {
                      const groupScore = completenessScore(group);
                      const groupStatus = groupScore === null ? null : qualityStatus(groupScore);
                      const canDrill = group.key !== null && level !== 'sub_unit';
                      return (
                        <tr key={group.key ?? '(none)'} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2.5 font-semibold text-slate-800">
                            {canDrill
                              ? <button type="button" onClick={() => drill(group)} className="text-left hover:text-emerald-700 hover:underline" title={`Tampilkan dashboard untuk ${unitLabel(group.label)}`}>{unitLabel(group.label)}</button>
                              : <span className={group.key === null ? 'italic text-slate-500' : ''}>{unitLabel(group.label)}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatCount(group.total)}</td>
                          <td className="px-3 py-2.5">
                            {groupStatus && <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-slate-800"><span className={`h-2 w-2 rounded-full ${STATUS_STYLES[groupStatus].dot}`} />{formatShare(group.complete, group.total)}</span>}
                          </td>
                          {columns.map((indicator) => (
                            <td key={indicator.key} className="px-1 py-1 text-right tabular-nums"><span className={`block rounded-md px-2 py-1.5 ${heatClass(group[indicator.key], indicator.base(group))}`}>{formatShare(group[indicator.key], indicator.base(group))}</span></td>
                          ))}
                          <td className="px-1 py-1 text-right tabular-nums"><span className={`block rounded-md px-2 py-1.5 ${heatClass(group.unreadable_coordinates, group.total)}`}>{formatShare(group.unreadable_coordinates, group.total)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <footer className="mt-4 flex flex-col gap-2 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Klik indikator untuk menampilkan datanya di tabel{groups.length > 1 && level !== 'sub_unit' ? `, atau nama ${GROUP_LEVEL_LABELS[level].toLowerCase()} untuk menelusuri lebih dalam` : ''}.</span>
            <Link href={`/upload/riwayat${companyId ? `?company=${companyId}` : ''}`} className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-900"><History className="h-3.5 w-3.5" /> Laporan pemeriksaan per upload <ChevronRight className="h-3.5 w-3.5" /></Link>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
