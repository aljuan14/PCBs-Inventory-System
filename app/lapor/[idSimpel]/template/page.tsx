'use client';

import Link from 'next/link';
import { CheckCircle2, ClipboardList, Download, FileSpreadsheet, Info, Upload } from 'lucide-react';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';
import { INVENTORY_CATEGORIES } from '@/lib/inventory';
import { TEMPLATE_FILES } from '@/lib/templates';

const isInventory = (form: string) => INVENTORY_CATEGORIES.some((category) => category.key === form);

// The two groups of the form tabs, each its own colour.
const GROUPS = [
  {
    title: 'Inventarisasi',
    description: 'Formulir 1.1–1.4: peralatan yang dimiliki perusahaan.',
    after: 'diperiksa KLH dulu',
    files: TEMPLATE_FILES.filter((entry) => isInventory(entry.form)),
    tone: { icon: 'bg-emerald-50 text-emerald-700', download: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100', badge: 'border-amber-200 bg-amber-50 text-amber-900', hover: 'hover:border-emerald-300' },
  },
  {
    title: 'Pengelolaan',
    description: 'Formulir 2–5: perawatan, penyimpanan, pengolahan, dan neraca limbah PCBs.',
    after: 'langsung tersimpan',
    files: TEMPLATE_FILES.filter((entry) => !isInventory(entry.form)),
    tone: { icon: 'bg-sky-50 text-sky-700', download: 'bg-sky-50 text-sky-800 hover:bg-sky-100', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', hover: 'hover:border-sky-300' },
  },
];

const STEPS: Array<[typeof Download, string, string]> = [
  [Download, 'Unduh', 'Unduh template resmi formulir yang akan diisi.'],
  [ClipboardList, 'Isi', 'Isi mulai baris di bawah contoh. Jangan mengubah judul kolom.'],
  [Upload, 'Unggah', 'Unggah di card Tambah data pada formulirnya, di menu Isi formulir.'],
];

/** The official Excel templates, a row each, the two groups of forms one under the other. */
export default function CompanyTemplates() {
  const { href } = useCompanyPortal();

  return (
    <>
      <PortalHeader title="Template Excel" description="Template resmi KLH untuk mengisi data dalam jumlah banyak sekaligus. Unduh, isi, lalu unggah di formulir yang sesuai." />

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map(([Icon, title, text], index) => (
          <li key={title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Icon className="h-4 w-4 text-slate-400" /> {title}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{text}</span>
            </span>
          </li>
        ))}
      </ol>

      {GROUPS.map((group) => (
        <section key={group.title} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Template {group.title.toLowerCase()}</h2>
              <p className="text-xs text-slate-500">{group.description}</p>
            </div>
            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${group.tone.badge}`}><CheckCircle2 className="h-3.5 w-3.5" /> Setelah diunggah: {group.after}</span>
          </div>
          <ul className="mt-4 space-y-2">
            {group.files.map((entry) => (
              <li key={entry.form} className={`flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition-colors ${group.tone.hover}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${group.tone.icon}`}><FileSpreadsheet className="h-4.5 w-4.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-900"><span className="font-bold">{entry.code}</span> <span className="font-medium">{entry.title}</span></span>
                  <span className="block truncate text-xs text-slate-500" title={entry.description}>{entry.description}</span>
                </span>
                <a href={entry.file} download className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${group.tone.download}`}><Download className="h-3.5 w-3.5" /> Unduh</a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span>Baris contoh di template (bertanda CONTOH) tidak ikut terbaca. Jangan memindah, menghapus, atau mengganti nama kolom, karena sistem mengenali kolom dari judulnya. Status unggahan formulir 1.1–1.4 terlihat di menu <Link href={href('/unggah')} className="font-semibold text-emerald-700 hover:underline">Riwayat unggahan</Link>.</span></p>
    </>
  );
}
