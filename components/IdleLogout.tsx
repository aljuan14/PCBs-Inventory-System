'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Timer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Signed out after this long without activity, warned this long before. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARN_MS = 60 * 1000;

// Shared by every tab of the app through localStorage: activity in one tab
// keeps them all signed in, and one tab's sign-out reaches the others.
const ACTIVITY_KEY = 'pcbs-last-activity';
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

const readActivity = () => {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0; } catch { return 0; }
};

/** Counts as activity now, in every tab (also called by the login page right after signing in). */
export function markActivity() {
  try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch { /* private mode: this tab only */ }
}

// Long work (an upload or an import) holds the timer while it runs.
let holds = 0;
/** Keeps the session alive until the returned function is called. */
export function holdIdle(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    markActivity();
  };
}

/** Holds the timer while `active` is true: for a page's busy state. */
export function useIdleHold(active: boolean) {
  useEffect(() => (active ? holdIdle() : undefined), [active]);
}

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * Signs the account out after 30 minutes without mouse, keyboard, scroll or
 * touch, so a laptop left open does not stay in the app; a minute before, a
 * pop-up counts down with "Tetap masuk". Back at the login page, the account
 * returns to the page it was on. A guard for the screen only: the data is
 * kept by the database's row-level security either way.
 */
export default function IdleLogout() {
  const pathname = usePathname();
  const active = pathname !== '/login';
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let lastWrite = 0;
    const onActivity = () => {
      // At most every few seconds: pointermove fires constantly.
      const now = Date.now();
      if (now - lastWrite < 5000) return;
      lastWrite = now;
      markActivity();
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));
    if (!readActivity()) markActivity();

    let signingOut = false;
    const tick = () => {
      if (holds > 0) markActivity();
      const remaining = readActivity() + IDLE_LIMIT_MS - Date.now();
      if (remaining <= 0 && !signingOut) {
        signingOut = true;
        const next = window.location.pathname + window.location.search;
        createClient().auth.signOut().finally(() => {
          window.location.replace(`/login?keluar=idle&next=${encodeURIComponent(next)}`);
        });
        return;
      }
      setLeft(remaining <= WARN_MS ? remaining : null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
    };
  }, [active]);

  if (!active || left === null) return null;
  const stay = () => { markActivity(); setLeft(null); };
  const leave = () => {
    const next = window.location.pathname + window.location.search;
    createClient().auth.signOut().finally(() => window.location.replace(`/login?next=${encodeURIComponent(next)}`));
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-slate-900/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-text" className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Timer className="h-6 w-6" /></div>
        <h2 id="idle-title" className="mt-4 text-base font-semibold text-slate-900">Masih di sana?</h2>
        <p id="idle-text" className="mt-1.5 text-sm text-slate-600">Tidak ada aktivitas selama hampir {IDLE_LIMIT_MS / 60000} menit. Anda akan keluar otomatis dalam</p>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-900" aria-live="polite">{clock(left)}</p>
        <p className="mt-2 text-xs text-slate-500">Simpan dulu isian yang sedang dikerjakan bila perlu.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={leave} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Keluar sekarang</button>
          <button type="button" onClick={stay} autoFocus className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">Tetap masuk</button>
        </div>
      </div>
    </div>
  );
}
