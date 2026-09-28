'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, FileSpreadsheet, History, Info, Search, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import type { CheckReport } from '@/lib/import-transform';
import CheckIssueList from '@/components/CheckIssueList';

const PAGE_SIZE = 50;
const SELECT_CLASS = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none';

interface HistoryBatch {
  id: string;
  company_id: string;
  jenis_data: InventoryCategory;
  nama_file_asli: string;
  sheet_name: string | null;
  uploaded_at: string;
  status: string;
  data_rows: number | null;
  laporan_pemeriksaan: CheckReport | null;
}

const formatNumber = (value: number) => value.toLocaleString('id-ID');
const formatDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

function IssueCounts({ report }: { report: CheckReport | null }) {
  if (!report) return <span className="text-[11px] italic text-slate-400">tidak tersimpan</span>;
  const warnings = report.issues.filter((issue) => issue.level === 'warning').length;
  const infos = report.issues.length - warnings;
  if (report.issues.length === 0) return <span className="text-[11px] font-semibold text-emerald-700">Tidak ada temuan</span>;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold">
      {warnings > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{warnings} peringatan</span>}
      {infos > 0 && <span className="inline-flex items-center gap-1 text-slate-500"><Info className="h-3.5 w-3.5" />{infos} info</span>}
    </span>
  );
}

/** Imported sheets, newest first, each with the check report kept at upload. */
export default function UploadHistory({ initialCompanyId }: { initialCompanyId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [batches, setBatches] = useState<HistoryBatch[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan')
      .then(({ data }) => setCompanies((data ?? []).map((row) => ({ id: row.id as string, name: row.nama_perusahaan as string }))));
  }, [supabase]);

  const requestKey = `${companyId}|${limit}`;
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    let cancelled = false;
    let request = supabase
      .from('import_batches')
      .select('id, company_id, jenis_data, nama_file_asli, sheet_name, uploaded_at, status, data_rows, laporan_pemeriksaan')
      .in('status', ['imported', 'error'])
      .order('uploaded_at', { ascending: false })
      .limit(limit + 1);
    if (companyId) request = request.eq('company_id', companyId);
    request.then(({ data, error: loadError }) => {
      if (cancelled) return;
      if (loadError) setError(loadError.message);
      else {
        const rows = (data ?? []) as HistoryBatch[];
        setBatches(rows.slice(0, limit));
        setHasMore(rows.length > limit);
        setError(null);
      }
      setLoadedKey(requestKey);
    });
    return () => { cancelled = true; };
  }, [supabase, companyId, limit, requestKey]);

  const companyNames = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const term = search.trim().toLowerCase();
  const visible = term ? batches.filter((batch) => `${batch.nama_file_asli} ${batch.sheet_name ?? ''}`.toLowerCase().includes(term)) : batches;
  const totals = visible.reduce((sum, batch) => ({
    rows: sum.rows + (batch.laporan_pemeriksaan?.importedRows ?? 0),
    warnings: sum.warnings + (batch.laporan_pemeriksaan?.issues.filter((issue) => issue.level === 'warning').length ?? 0),
  }), { rows: 0, warnings: 0 });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Upload data</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900"><History className="h-7 w-7 text-slate-400" /> Riwayat upload</h1>
          <p className="mt-2 text-sm text-slate-500">Setiap sheet yang diimpor beserta hasil pemeriksaan datanya saat diunggah.</p>
        </div>
        <Link href="/upload" className="flex items-center gap-2 self-start rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" /> Upload data</Link>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <select aria-label="Perusahaan" value={companyId ?? 'all'} onChange={(e) => { setCompanyId(e.target.value === 'all' ? null : e.target.value); setLimit(PAGE_SIZE); setExpanded(null); }} className={SELECT_CLASS}>
          <option value="all">Semua perusahaan</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <div className="relative min-w-56 flex-1 sm:max-w-72">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama berkas atau sheet…" className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none" />
        </div>
        <span className="ml-auto text-xs text-slate-500">{loading ? 'Memuat…' : `${formatNumber(visible.length)} sheet · ${formatNumber(totals.rows)} baris diimpor · ${formatNumber(totals.warnings)} jenis peringatan`}</span>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}

      <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white ${loading ? 'opacity-60' : ''}`}>
        <table className="w-full min-w-[860px] text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-3 py-3" />
              <th className="px-3 py-3 text-left font-semibold">Diunggah</th>
              <th className="px-3 py-3 text-left font-semibold">Berkas › Sheet</th>
              <th className="px-3 py-3 text-left font-semibold">Perusahaan</th>
              <th className="px-3 py-3 text-left font-semibold">Kategori</th>
              <th className="px-3 py-3 text-right font-semibold">Diimpor</th>
              <th className="px-3 py-3 text-right font-semibold">Duplikat dilewati</th>
              <th className="px-3 py-3 text-left font-semibold">Hasil pemeriksaan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">Belum ada upload{term ? ' yang cocok dengan pencarian' : ''}.</td></tr>
            )}
            {visible.map((batch) => {
              const report = batch.laporan_pemeriksaan;
              const open = expanded === batch.id;
              return (
                <Fragment key={batch.id}>
                  <tr className={`cursor-pointer hover:bg-slate-50/70 ${open ? 'bg-slate-50/70' : ''}`} onClick={() => setExpanded(open ? null : batch.id)}>
                    <td className="px-3 py-3 text-slate-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(batch.uploaded_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 font-semibold text-slate-900"><FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" /><span className="truncate">{batch.nama_file_asli}</span></div>
                      {batch.sheet_name && <div className="ml-6 text-[11px] text-slate-500">{batch.sheet_name}</div>}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{companyNames.get(batch.company_id) ?? '–'}</td>
                    <td className="px-3 py-3 text-slate-700">{getCategoryLabel(batch.jenis_data)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-800">{batch.status === 'error' ? <span className="font-semibold text-rose-700">Gagal</span> : report ? formatNumber(report.importedRows) : formatNumber(batch.data_rows ?? 0)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">{report ? formatNumber(report.skippedDuplicates) : '–'}</td>
                    <td className="px-3 py-3"><IssueCounts report={report} /></td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50/70">
                      <td />
                      <td colSpan={7} className="px-3 pb-5 pt-1">
                        {report ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500">
                              <span>Diperiksa {formatDate(report.checkedAt)}</span>
                              <span>{formatNumber(report.dataRows)} baris data</span>
                              <span>{formatNumber(report.importedRows)} diimpor</span>
                              {report.skippedDuplicates > 0 && <span>{formatNumber(report.skippedDuplicates)} duplikat dilewati</span>}
                              {report.skippedEmpty > 0 && <span>{formatNumber(report.skippedEmpty)} baris kosong dilewati</span>}
                            </div>
                            <CheckIssueList issues={report.issues} dataRows={report.dataRows} />
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">Laporan pemeriksaan tidak tersimpan untuk sheet ini (diunggah sebelum fitur riwayat pemeriksaan tersedia).</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} disabled={loading} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50">Muat lebih banyak</button>
        </div>
      )}
    </div>
  );
}
