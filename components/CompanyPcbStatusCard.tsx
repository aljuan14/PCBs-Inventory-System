'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { STATUS_COLORS, evaluateStatus, fetchPcbStatus, formatPlanDate, summarySentence, type PcbStatusCounts, type StatusColor } from '@/lib/company-pcb-status';

const ICONS: Record<StatusColor, typeof CircleAlert> = { red: CircleAlert, yellow: AlertTriangle, green: CheckCircle2 };

/**
 * The company's PCBs status: what it owns in one sentence, the red / yellow /
 * green light for its transformers before 1997, and what to do next.
 */
export default function CompanyPcbStatusCard({ supabase, companyId, reloadKey = 0, roadmapLink = true, onRoadmap }: {
  supabase: SupabaseClient;
  companyId: string;
  reloadKey?: number;
  roadmapLink?: boolean;
  /** Opens the roadmap in place (the company's report) instead of linking to the Roadmap page. */
  onRoadmap?: () => void;
}) {
  const [result, setResult] = useState<{ key: string; counts?: PcbStatusCounts; error?: string } | null>(null);
  const requestKey = `${companyId}|${reloadKey}`;

  useEffect(() => {
    let active = true;
    fetchPcbStatus(supabase, companyId)
      .then((counts) => { if (active) setResult({ key: requestKey, counts }); })
      .catch((err: Error) => { if (active) setResult({ key: requestKey, error: err.message }); });
    return () => { active = false; };
  }, [supabase, companyId, requestKey]);

  if (!result || result.key !== requestKey) {
    return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Menghitung status perusahaan…</div>;
  }
  if (result.error || !result.counts) {
    return <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Status perusahaan gagal dimuat: {result.error}</p>;
  }

  const counts = result.counts;
  const { color, messages } = evaluateStatus(counts);
  const style = STATUS_COLORS[color];
  const Icon = ICONS[color];
  return (
    <section className={`rounded-2xl border p-5 ${style.card}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${style.dot}`}><Icon className="h-5 w-5" /></span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status PCBs</p>
            <p className={`text-lg font-semibold ${style.text}`}>{style.label}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm leading-relaxed text-slate-800">{summarySentence(counts)}</p>
          <ul className="space-y-1.5">
            {messages.map((message) => {
              const MessageIcon = ICONS[message.tone];
              return (
                <li key={message.text} className={`flex items-start gap-2 text-xs font-medium ${STATUS_COLORS[message.tone].text}`}>
                  <MessageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {message.text}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {counts.rencana_berikut && <span className="flex items-center gap-1.5 text-slate-600"><CalendarClock className="h-3.5 w-3.5" /> Rencana terdekat: {formatPlanDate(counts.rencana_berikut)}</span>}
            {onRoadmap
              ? <button type="button" onClick={onRoadmap} className="font-semibold text-emerald-800 underline">Atur roadmap uji dan penanganan</button>
              : roadmapLink && <Link href={`/roadmap?company=${companyId}`} className="font-semibold text-emerald-800 underline">Atur roadmap uji dan penanganan</Link>}
          </div>
        </div>
      </div>
    </section>
  );
}
