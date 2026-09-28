'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Info, Loader2 } from 'lucide-react';
import type { IssueRowDetail, ValidationIssue } from '@/lib/import-transform';

const formatNumber = (value: number) => value.toLocaleString('id-ID');

const PAGE_SIZE = 20;

/** Loads the rows behind one finding, `offset` rows in. */
export type LoadIssueRows = (key: string, offset: number, limit: number) => Promise<{ total: number; rows: IssueRowDetail[] }>;

// What the "value" of a finding is, by its key prefix.
function valueLabel(key: string) {
  if (key.startsWith('coordinate:')) return 'Koordinat (asli → hasil)';
  if (key.startsWith('invalid:')) return 'Nilai di Excel';
  if (key.startsWith('duplicate:')) return 'Keterangan';
  return 'Nilai';
}

const COLUMNS: Array<{ label: string; show: (row: IssueRowDetail) => string | null }> = [
  { label: 'Unit / UP3', show: (row) => [row.unit, row.subUnit].filter(Boolean).join(' · ') || null },
  { label: 'No', show: (row) => row.no },
  { label: 'Kode alat', show: (row) => row.code },
  { label: 'Merek', show: (row) => row.name },
  { label: 'No. seri', show: (row) => row.serial },
  { label: 'Lokasi', show: (row) => row.location },
];

function IssueRowsTable({ issueKey, load, tableHref }: { issueKey: string; load: LoadIssueRows; tableHref: string | null }) {
  const [rows, setRows] = useState<IssueRowDetail[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const page = await load(issueKey, offset, PAGE_SIZE);
      setRows((current) => [...current.slice(0, offset), ...page.rows]);
      setTotal(page.total);
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Gagal memuat baris.');
    } finally {
      setLoading(false);
    }
  };

  // First page when the finding is opened (this table only exists while it is open).
  useEffect(() => {
    let cancelled = false;
    load(issueKey, 0, PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        setRows(page.rows);
        setTotal(page.total);
      })
      .catch((err) => {
        if (!cancelled) setError((err instanceof Error && err.message) || 'Gagal memuat baris.');
      });
    return () => {
      cancelled = true;
    };
  }, [issueKey, load]);

  const columns = COLUMNS.filter((column) => rows.some((row) => column.show(row)));
  const showValue = rows.some((row) => row.value);

  if (error) return <p className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p>;
  if (total === null) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat baris…
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[520px] text-left text-[11px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2.5 py-1.5 font-semibold">Baris Excel</th>
              {columns.map((column) => <th key={column.label} className="px-2.5 py-1.5 font-semibold">{column.label}</th>)}
              {showValue && <th className="px-2.5 py-1.5 font-semibold">{valueLabel(issueKey)}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((row, index) => (
              <tr key={row.rowNumber ?? `row-${index}`}>
                <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold tabular-nums text-slate-900">{row.rowNumber ?? <span className="text-slate-300">–</span>}</td>
                {columns.map((column) => <td key={column.label} className="px-2.5 py-1.5">{column.show(row) ?? <span className="text-slate-300">–</span>}</td>)}
                {showValue && <td className="px-2.5 py-1.5 font-mono text-[10.5px] text-slate-800">{row.value ?? <span className="text-slate-300">–</span>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span>Menampilkan {formatNumber(rows.length)} dari {formatNumber(total)} baris</span>
        {rows.length < total && (
          <button
            type="button"
            onClick={() => loadMore(rows.length)}
            disabled={loading}
            className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:text-sky-900 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" />} Muat {formatNumber(Math.min(PAGE_SIZE, total - rows.length))} lagi
          </button>
        )}
        {tableHref && total > 0 && (
          <Link href={tableHref} className="ml-auto inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900">
            Buka di tabel inventaris <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function IssueRow({ issue, dataRows, load, tableHref }: { issue: ValidationIssue; dataRows: number; load?: LoadIssueRows; tableHref: string | null }) {
  const [open, setOpen] = useState(false);
  const isWarning = issue.level === 'warning';
  const share = dataRows > 0 ? Math.round((issue.count / dataRows) * 100) : 0;
  const Chevron = open ? ChevronDown : ChevronRight;

  const summary = (
    <>
      {isWarning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className={`font-semibold ${isWarning ? 'text-slate-900' : 'text-slate-700'}`}>{issue.label}</span>
          <span className="flex items-baseline gap-3">
            <span className="font-semibold tabular-nums text-slate-700">{formatNumber(issue.count)} baris{share > 0 ? ` (${share}%)` : ''}</span>
            {load && (
              <span className="inline-flex items-center gap-0.5 self-center text-[11px] font-semibold text-sky-700">
                {open ? 'Tutup' : 'Lihat baris'} <Chevron className="h-3.5 w-3.5" />
              </span>
            )}
          </span>
        </div>
        {!open && (
          <div className="mt-0.5 text-[11px] text-slate-500">
            Baris Excel: {issue.rows.join(', ')}{issue.count > issue.rows.length ? ', …' : ''}
            {issue.examples.length > 0 && <> &bull; contoh: {issue.examples.map((example) => `"${example}"`).join(', ')}</>}
          </div>
        )}
      </div>
    </>
  );

  if (!load) return <li className="flex gap-3 py-2.5">{summary}</li>;
  return (
    <li className="py-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-50"
      >
        {summary}
      </button>
      {open && <div className="pb-1 pl-7"><IssueRowsTable issueKey={issue.key} load={load} tableHref={tableHref} /></div>}
    </li>
  );
}

/**
 * Findings of the pre-import check, as shown at upload and in the upload
 * history. With `loadRows`, each finding that `canLoad` allows opens to list
 * the rows behind it; `tableHref` adds a link to those rows in the inventory table.
 */
export default function CheckIssueList({ issues, dataRows, loadRows, canLoad, tableHref }: {
  issues: ValidationIssue[];
  dataRows: number;
  loadRows?: LoadIssueRows;
  canLoad?: (issue: ValidationIssue) => boolean;
  tableHref?: (issue: ValidationIssue) => string | null;
}) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Tidak ada masalah data yang ditemukan.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-200/70 rounded-xl border border-slate-200 bg-white px-4">
      {issues.map((issue) => (
        <IssueRow
          key={issue.key}
          issue={issue}
          dataRows={dataRows}
          load={loadRows && (canLoad?.(issue) ?? true) ? loadRows : undefined}
          tableHref={tableHref?.(issue) ?? null}
        />
      ))}
    </ul>
  );
}
