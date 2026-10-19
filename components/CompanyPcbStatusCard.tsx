'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleAlert, Loader2 } from 'lucide-react';
import { STATUS_COLORS, evaluateStatus, fetchPcbStatus, formatPlanDate, type PcbStatusCounts, type StatusColor, type StatusTarget } from '@/lib/company-pcb-status';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';

const ICONS: Record<StatusColor, typeof CircleAlert> = { red: CircleAlert, yellow: AlertTriangle, green: CheckCircle2 };
const fmt = (value: number) => value.toLocaleString('id-ID');

/**
 * Where a message is fixed, from a page other than the report: the report on
 * Isi formulir (?tab=, ?bagian=), or for a pemantau account, which changes
 * nothing, the roadmap only. `onRoadmap`: the roadmap page needs no link to itself.
 */
export function reportHref(companyId: string, target: StatusTarget, { readOnly, onRoadmap = false }: { readOnly: boolean; onRoadmap?: boolean }): string | null {
  if (target.tab === 'roadmap') return onRoadmap ? null : `/roadmap?company=${companyId}`;
  if (readOnly) return null;
  const query = new URLSearchParams({ company: companyId });
  if (target.tab) query.set('tab', target.tab);
  if (target.section) query.set('bagian', target.section);
  return `/formulir?${query}`;
}

/** One figure: a number with what it counts, coloured when it needs something. */
function Figure({ value, label, tone, done = 0, doneLabel }: { value: number; label: string; tone?: 'red' | 'amber' | 'green'; done?: number; doneLabel?: string }) {
  // All of them handled: nothing left to colour.
  const settled = done > 0 && done >= value;
  const color = value === 0 ? 'text-slate-400' : settled || tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-rose-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
      <p className={`text-lg font-semibold tabular-nums leading-tight ${color}`}>{fmt(value)}</p>
      <p className="text-[11px] leading-snug text-slate-500">{label}</p>
      {done > 0 && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700"><CheckCircle2 className="h-3 w-3" /> {fmt(done)} {doneLabel}</p>}
    </div>
  );
}

/**
 * The company's PCBs status: the red / yellow / green light, what it owns
 * and how its transformers before 1997 stand as figures, then what to do,
 * each item leading to where it is fixed. In the company's report `onGo`
 * opens the tab there; elsewhere `hrefFor` links to the report.
 */
export default function CompanyPcbStatusCard({ supabase, companyId, reloadKey = 0, onGo, hrefFor, showOwned = true }: {
  supabase: SupabaseClient;
  companyId: string;
  reloadKey?: number;
  /** Opens the tab of the report on this page. */
  onGo?: (target: StatusTarget) => void;
  /** Where to fix a message on another page; null leaves it as text. */
  hrefFor?: (target: StatusTarget) => string | null;
  /** False where the equipment counts show elsewhere on the page (the company's home). */
  showOwned?: boolean;
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
  const todo = messages.filter((message) => message.tone !== 'green');
  const statement = counts.pernyataan;

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${style.card}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${style.dot}`}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status PCBs</p>
          <p className={`text-lg font-semibold ${style.text}`}>{style.label}</p>
        </div>
        {counts.rencana_berikut && <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs text-slate-600"><CalendarClock className="h-3.5 w-3.5" /> Rencana terdekat {formatPlanDate(counts.rencana_berikut)}</span>}
      </div>

      <div className={`mt-4 grid gap-3 ${showOwned ? 'lg:grid-cols-2' : ''}`}>
        {showOwned && <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Peralatan tercatat</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Figure value={counts.trafo_digunakan} label="Trafo digunakan" />
            <Figure value={counts.trafo_tidak_digunakan} label="Trafo tidak digunakan" />
            <Figure value={counts.kapasitor} label="Kapasitor" />
            <Figure value={counts.minyak} label="Data minyak" />
          </div>
        </div>}
        {counts.fokus > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trafo sebelum {TRAFO_FOCUS_YEAR} atau tanpa tahun · {fmt(counts.fokus)}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure value={counts.aman} label="Aman (≤ 50 ppm)" tone="green" />
              <Figure value={counts.tinggi} label="> 50 ppm" tone="red" done={counts.tinggi_selesai} doneLabel="sudah ditangani" />
              <Figure value={counts.belum_uji} label="Belum diuji" tone="amber" />
              <Figure value={counts.kelola ?? 0} label="Tidak digunakan (wajib dikelola)" tone="red" done={counts.kelola_selesai ?? 0} doneLabel="sudah dikelola" />
            </div>
          </div>
        )}
      </div>
      {statement?.punya_trafo_1997_keatas && (
        <p className="mt-2 text-xs text-slate-600">Menurut pernyataan, ada {fmt(statement.jumlah_trafo_1997_keatas ?? 0)} trafo buatan {TRAFO_FOCUS_YEAR} ke atas ({(statement.tonase_trafo_1997_keatas_ton ?? 0).toLocaleString('id-ID')} ton).</p>
      )}

      {todo.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Yang perlu dilakukan · {fmt(todo.length)}</p>
          <ul className="overflow-hidden rounded-xl border border-white/70 bg-white/90 divide-y divide-slate-100">
            {todo.map((message) => {
              const MessageIcon = ICONS[message.tone];
              const tone = STATUS_COLORS[message.tone];
              const href = message.go && !onGo ? hrefFor?.(message.go) ?? null : null;
              const body = (
                <>
                  <MessageIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.text}`} />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-slate-800">{message.text}</span>
                  {message.action && (onGo || href) && (
                    <span className={`flex shrink-0 items-center gap-0.5 self-center rounded-lg px-2 py-1 text-[11px] font-semibold ${message.tone === 'red' ? 'bg-rose-50 text-rose-800 group-hover:bg-rose-100' : 'bg-amber-50 text-amber-900 group-hover:bg-amber-100'}`}>
                      {message.action} <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </>
              );
              const rowClass = 'group flex w-full items-start gap-2.5 px-3 py-2.5 text-left';
              return (
                <li key={message.text} className={`border-l-4 ${message.tone === 'red' ? 'border-l-rose-500' : 'border-l-amber-400'}`}>
                  {onGo && message.go
                    ? <button type="button" onClick={() => onGo(message.go!)} className={`${rowClass} hover:bg-slate-50`}>{body}</button>
                    : href ? <Link href={href} className={`${rowClass} hover:bg-slate-50`}>{body}</Link>
                      : <div className={rowClass}>{body}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2.5 text-xs font-medium text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {messages[0]?.text}</p>
      )}
    </section>
  );
}
