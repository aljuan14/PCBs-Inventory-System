'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Trash2, X, type LucideIcon } from 'lucide-react';

/**
 * The app's own confirm / prompt / alert, in place of the browser's (which
 * shows "localhost:3000 says…"). Called from anywhere, awaited like the
 * browser ones; one DialogHost in the root layout shows them.
 *
 *   if (!(await confirmDialog({ title: 'Hapus baris ini?', tone: 'danger', confirmLabel: 'Hapus' }))) return;
 *   const reason = await promptDialog({ title: 'Tolak unggahan', label: 'Alasan penolakan' });
 *   await alertDialog({ title: 'Gagal menghapus', message: error.message });
 */

type Tone = 'danger' | 'primary' | 'info';
type Request = {
  id: number;
  kind: 'confirm' | 'prompt' | 'alert';
  title: string;
  message?: ReactNode;
  tone: Tone;
  confirmLabel: string;
  cancelLabel: string;
  /** In place of the tone's icon (a refusal is no deletion). */
  icon?: LucideIcon;
  /** prompt: the field's label and hint. */
  label?: string;
  placeholder?: string;
  resolve: (value: boolean | string | null) => void;
};
type Options = { title: string; message?: ReactNode; tone?: Tone; confirmLabel?: string; cancelLabel?: string; icon?: LucideIcon };

let current: Request | null = null;
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function open(request: Omit<Request, 'resolve' | 'id'>) {
  return new Promise<boolean | string | null>((resolve) => {
    // A dialog already open answers "no" before the next one shows.
    current?.resolve(current.kind === 'prompt' ? null : false);
    current = { ...request, id: ++counter, resolve };
    emit();
  });
}

export function confirmDialog({ title, message, tone = 'primary', confirmLabel = 'Lanjutkan', cancelLabel = 'Batal', icon }: Options) {
  return open({ kind: 'confirm', title, message, tone, confirmLabel, cancelLabel, icon }) as Promise<boolean>;
}

/** Asks for a text (a reason); null when cancelled or left empty. */
export function promptDialog({ title, message, tone = 'danger', confirmLabel = 'Kirim', cancelLabel = 'Batal', icon, label, placeholder }: Options & { label?: string; placeholder?: string }) {
  return open({ kind: 'prompt', title, message, tone, confirmLabel, cancelLabel, icon, label, placeholder }) as Promise<string | null>;
}

export function alertDialog({ title, message, tone = 'info', confirmLabel = 'Tutup' }: Options) {
  return open({ kind: 'alert', title, message, tone, confirmLabel, cancelLabel: '' }).then(() => undefined);
}

const TONES: Record<Tone, { icon: typeof Info; badge: string; button: string; ring: string }> = {
  danger: { icon: Trash2, badge: 'bg-rose-50 text-rose-700', button: 'bg-rose-700 hover:bg-rose-800', ring: 'focus:border-rose-500 focus:ring-rose-500/10' },
  primary: { icon: CheckCircle2, badge: 'bg-emerald-50 text-emerald-700', button: 'bg-emerald-700 hover:bg-emerald-800', ring: 'focus:border-emerald-600 focus:ring-emerald-600/10' },
  info: { icon: AlertTriangle, badge: 'bg-amber-50 text-amber-700', button: 'bg-slate-900 hover:bg-slate-800', ring: 'focus:border-emerald-600 focus:ring-emerald-600/10' },
};

function DialogCard({ request }: { request: Request }) {
  const [text, setText] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const tone = TONES[request.tone];
  const Icon = request.icon ?? tone.icon;
  const isPrompt = request.kind === 'prompt';
  const finish = (value: boolean | string | null) => {
    if (current !== request) return;
    current = null;
    emit();
    request.resolve(value);
  };
  const cancel = () => finish(isPrompt ? null : false);
  const accept = () => {
    if (isPrompt) {
      if (text.trim()) finish(text.trim());
      return;
    }
    finish(true);
  };

  useEffect(() => {
    if (!isPrompt) confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); finish(isPrompt ? null : false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 p-4" onClick={cancel}>
      <div role={request.kind === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="app-dialog-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}><Icon className="h-4 w-4" /></div>
            <h2 id="app-dialog-title" className="pt-1.5 text-base font-semibold text-slate-900">{request.title}</h2>
          </div>
          <button type="button" onClick={cancel} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        {request.message && <div className="mt-3 text-sm leading-relaxed text-slate-600">{request.message}</div>}
        {isPrompt && (
          <label className="mt-4 block text-xs font-medium text-slate-600">
            {request.label}
            <textarea autoFocus rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder={request.placeholder}
              onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) accept(); }}
              className={`mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:bg-white focus:ring-4 ${tone.ring}`} />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          {request.kind !== 'alert' && <button type="button" onClick={cancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">{request.cancelLabel}</button>}
          <button ref={confirmRef} type="button" onClick={accept} disabled={isPrompt && !text.trim()} className={`rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 ${tone.button}`}>{request.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Shows the dialog asked for, if any; mounted once in the root layout. */
export function DialogHost() {
  const request = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
    () => null,
  );
  // Keyed by the request, so a new dialog starts with an empty field.
  return request ? <DialogCard key={request.id} request={request} /> : null;
}
