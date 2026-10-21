'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

const SEEN_KEY = 'pcbs-preloader';
// The progress line ends at 3.2 s from the first paint (globals.css, .preloader-bar);
// a short hold after it, then the fade out.
const BAR_END_MS = 3200;
const HOLD_MS = 250;
const LEAVE_MS = 600;

/**
 * The KLH logo opening the app once per browser session: rings drawn in the
 * logo's colours, the logo revealed, the app's name, a progress line, then a
 * fade. It always plays to the end: no skipping, and the page behind takes no
 * clicks or keys until it has gone. Rendered by the server so it covers the
 * page from the first paint; the script in the layout hides it at once on a
 * later load.
 */
export default function Preloader() {
  const [stage, setStage] = useState<'show' | 'leave' | 'done'>('show');
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Seen before: already hidden by the CSS, taken out of the page right away.
    if (document.documentElement.dataset.preloaded) {
      const done = setTimeout(() => setStage('done'), 0);
      return () => clearTimeout(done);
    }
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: shown again next time */ }

    // Nothing behind it can be reached while it plays.
    const page = [...document.body.children].filter((element) => element !== rootRef.current);
    page.forEach((element) => element.setAttribute('inert', ''));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const release = () => {
      page.forEach((element) => element.removeAttribute('inert'));
      document.body.style.overflow = overflow;
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    let leaving = false;
    const leave = () => {
      if (leaving) return;
      leaving = true;
      timers.push(setTimeout(() => setStage('leave'), HOLD_MS));
      timers.push(setTimeout(() => { release(); setStage('done'); }, HOLD_MS + LEAVE_MS));
    };
    // Leaves once the progress line is full; the timer covers a line that
    // finished before this code ran (a slow load), counted from the navigation.
    const bar = barRef.current;
    bar?.addEventListener('animationend', leave);
    timers.push(setTimeout(leave, Math.max(0, BAR_END_MS + 100 - performance.now())));
    return () => {
      bar?.removeEventListener('animationend', leave);
      timers.forEach(clearTimeout);
      release();
    };
  }, []);

  if (stage === 'done') return null;

  return (
    <div ref={rootRef} role="status" aria-label="Memuat Sistem Inventarisasi PCBs" className={`preloader fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#f4f5f2] px-4 ${stage === 'leave' ? 'preloader-leave' : ''}`}>
      {/* A soft glow behind the logo, breathing. */}
      <div className="preloader-glow pointer-events-none absolute h-[min(520px,120vw)] w-[min(520px,120vw)] rounded-full" />

      <div className="relative flex h-44 w-44 items-center justify-center">
        <svg viewBox="0 0 176 176" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="88" cy="88" r="84" fill="none" stroke="#e2e8e4" strokeWidth="1" />
          <circle className="preloader-ring preloader-ring-1" cx="88" cy="88" r="84" fill="none" stroke="#025a52" strokeWidth="3" strokeLinecap="round" pathLength="100" />
          <circle className="preloader-ring preloader-ring-2" cx="88" cy="88" r="76" fill="none" stroke="#1a7ff0" strokeWidth="2.5" strokeLinecap="round" pathLength="100" />
          <circle className="preloader-ring preloader-ring-3" cx="88" cy="88" r="68" fill="none" stroke="#f47b16" strokeWidth="2" strokeLinecap="round" pathLength="100" />
        </svg>
        <div className="preloader-logo relative h-28 w-28 overflow-hidden rounded-full bg-white shadow-[0_10px_40px_-10px_rgba(2,90,82,0.45)]">
          <Image src="/logo-klh.jpg" alt="Logo Kementerian Lingkungan Hidup" width={112} height={112} priority className="h-full w-full" />
        </div>
      </div>

      <div className="relative mt-8 text-center">
        <p className="preloader-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-700" style={{ animationDelay: '1.1s' }}>Kementerian Lingkungan Hidup</p>
        <h1 className="preloader-rise mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl" style={{ animationDelay: '1.3s' }}>Sistem Inventarisasi PCBs</h1>
        <p className="preloader-rise mt-1.5 text-sm text-slate-500" style={{ animationDelay: '1.5s' }}>Direktorat Pengelolaan B3</p>
      </div>

      <div className="preloader-rise relative mt-8 h-1 w-56 overflow-hidden rounded-full bg-slate-200" style={{ animationDelay: '1.6s' }}>
        <div ref={barRef} className="preloader-bar h-full rounded-full" />
      </div>
    </div>
  );
}
