'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { STAGE_LABELS, progressShare, remainingMs, type ProgressState } from '@/lib/progress';

const formatNumber = (value: number) => value.toLocaleString('id-ID');

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} dtk`;
  return `${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`;
}

const formatStep = (ms: number) => (ms < 1000 ? `${Math.max(1, Math.round(ms / 100)) / 10} dtk` : formatDuration(ms)).replace('.', ',');

/** Steps of a running check or import, with the overall share, time spent and a rough estimate of the time left. */
export default function ProgressPanel({ title, state }: { title: string; state: ProgressState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const share = progressShare(state);
  const left = remainingMs(state, now);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold text-slate-900">{title}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{Math.round(share * 100)}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${Math.max(share * 100, 2)}%` }} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {state.stages.map((entry) => {
          const running = entry.stage === state.current && !entry.endedAt;
          return (
            <li key={entry.stage} className="flex items-center gap-2 text-xs">
              {entry.endedAt
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                : running
                  ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600" />
                  : <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
              <span className={entry.endedAt || running ? 'text-slate-800' : 'text-slate-400'}>{STAGE_LABELS[entry.stage]}</span>
              {running && state.total > 0 && (
                <span className="tabular-nums text-slate-500">{formatNumber(state.done)} / {formatNumber(state.total)} baris</span>
              )}
              {entry.endedAt && entry.startedAt && (
                <span className="ml-auto tabular-nums text-slate-400">{formatStep(entry.endedAt - entry.startedAt)}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-slate-500">
        <span>Berjalan {formatDuration(now - state.startedAt)}</span>
        {left !== null && <span>· sekitar {formatDuration(left)} lagi</span>}
      </div>
    </div>
  );
}
