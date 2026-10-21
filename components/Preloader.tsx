'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const SEEN_KEY = 'pcbs-preloader';
// The whole show, then the fade out (globals.css, .preloader-*).
const SHOW_MS = 3200;
const LEAVE_MS = 600;

/**
 * The KLH logo opening the app once per browser session: rings drawn in the
 * logo's colours, the logo revealed, the app's name, a progress line, then a
 * fade. A click skips it. Rendered by the server so it covers the page from
 * the first paint; the script in the layout hides it at once on a later load.
 */
export default function Preloader() {
  const [stage, setStage] = useState<'show' | 'leave' | 'done'>('show');

  useEffect(() => {
    // Seen before: already hidden by the CSS, taken out of the page right away.
    const seen = Boolean(document.documentElement.dataset.preloaded);
    if (!seen) try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: shown again next time */ }
    const leave = setTimeout(() => setStage('leave'), seen ? 0 : SHOW_MS);
    const done = setTimeout(() => setStage('done'), seen ? 0 : SHOW_MS + LEAVE_MS);
    return () => { clearTimeout(leave); clearTimeout(done); };
  }, []);

  if (stage === 'done') return null;
  const skip = () => { setStage('leave'); setTimeout(() => setStage('done'), LEAVE_MS); };

  return (
    <div role="status" aria-label="Memuat Sistem Inventarisasi PCBs" onClick={skip} className={`preloader fixed inset-0 z-[9999] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#f4f5f2] ${stage === 'leave' ? 'preloader-leave' : ''}`}>
      {/* A soft glow behind the logo, breathing. */}
      <div className="preloader-glow pointer-events-none absolute h-[520px] w-[520px] rounded-full" />

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
        <div className="preloader-bar h-full rounded-full" />
      </div>
    </div>
  );
}
