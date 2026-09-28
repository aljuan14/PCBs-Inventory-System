import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ValidationIssue } from '@/lib/import-transform';

const formatNumber = (value: number) => value.toLocaleString('id-ID');

function IssueRow({ issue, dataRows }: { issue: ValidationIssue; dataRows: number }) {
  const isWarning = issue.level === 'warning';
  const share = dataRows > 0 ? Math.round((issue.count / dataRows) * 100) : 0;
  return (
    <li className="flex gap-3 py-2.5">
      {isWarning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className={`font-semibold ${isWarning ? 'text-slate-900' : 'text-slate-700'}`}>{issue.label}</span>
          <span className="font-semibold tabular-nums text-slate-700">{formatNumber(issue.count)} baris{share > 0 ? ` (${share}%)` : ''}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          Baris Excel: {issue.rows.join(', ')}{issue.count > issue.rows.length ? ', …' : ''}
          {issue.examples.length > 0 && <> &bull; contoh: {issue.examples.map((example) => `"${example}"`).join(', ')}</>}
        </div>
      </div>
    </li>
  );
}

/** Findings of the pre-import check, as shown at upload and in the upload history. */
export default function CheckIssueList({ issues, dataRows }: { issues: ValidationIssue[]; dataRows: number }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Tidak ada masalah data yang ditemukan.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-200/70 rounded-xl border border-slate-200 bg-white px-4">
      {issues.map((issue) => <IssueRow key={issue.key} issue={issue} dataRows={dataRows} />)}
    </ul>
  );
}
