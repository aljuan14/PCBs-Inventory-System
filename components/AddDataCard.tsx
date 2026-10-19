'use client';

import { useState } from 'react';
import { Clock, Download, FileSpreadsheet, Loader2, PencilLine } from 'lucide-react';

/**
 * The "add data" card of a form: filling the form (green) beside uploading
 * the official Excel template (blue), each a large choice of its own colour,
 * with what the choice made shows below them (`children`).
 */

/** Renders a form's card, given what opens its form. */
export type AddCard = (open: () => void) => React.ReactNode;

// Each choice its own colour, its icon, title and line centred.
const tileClass = 'group flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-5 text-center transition';
const tileActive = 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md';

export default function AddDataCard({ title, manual, upload, children }: { title?: string; manual?: React.ReactNode; upload?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      {title && <h3 className="px-1 text-sm font-semibold text-slate-900">{title}</h3>}
      {(manual || upload) && <div className={`grid gap-3 ${manual && upload ? 'sm:grid-cols-2' : ''}`}>{manual}{upload}</div>}
      {children}
    </div>
  );
}

export function ManualChoice({ label = 'Isi lewat formulir', hint, disabled = false, onClick }: { label?: string; hint: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${tileClass} border-emerald-200 bg-emerald-50 ${disabled ? 'opacity-50' : `${tileActive} hover:border-emerald-400`}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm"><PencilLine className="h-5 w-5" /></span>
      <span className="block text-sm font-semibold text-emerald-950">{label}</span>
      <span className="block text-xs text-emerald-800/80">{hint}</span>
    </button>
  );
}

/** The Excel choice: click to pick a file or drop one on it. */
export function UploadChoice({ hint, busy = false, accept = '.xlsx,.xls', template, onFile }: { hint: string; busy?: boolean; accept?: string; /** The empty template to download. */ template?: string; onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file && !busy) onFile(file); }}
      className={`${tileClass} border-dashed ${dragging ? 'border-sky-500 bg-sky-100 ring-4 ring-sky-600/10' : 'border-sky-300 bg-sky-50'} ${busy ? 'pointer-events-none opacity-60' : `${tileActive} hover:border-sky-500`}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white shadow-sm">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5" />}</span>
      <span className="block text-sm font-semibold text-sky-950">{dragging ? 'Lepaskan berkas di sini' : 'Unggah template Excel'}</span>
      <span className="block text-xs text-sky-800/80">{hint} Klik atau seret berkas ke sini.</span>
      {template && <a href={template} download onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 underline-offset-2 hover:underline"><Download className="h-3.5 w-3.5" /> Unduh template</a>}
      <input type="file" accept={accept} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
    </label>
  );
}

/** The Excel choice while an earlier upload awaits KLH. */
export function WaitingChoice() {
  return (
    <div className={`${tileClass} border-amber-200 bg-amber-50`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Clock className="h-5 w-5" /></span>
      <span className="block text-sm font-semibold text-amber-950">Unggah template Excel</span>
      <span className="block text-xs text-amber-800">Menunggu pemeriksaan KLH atas unggahan sebelumnya.</span>
    </div>
  );
}
