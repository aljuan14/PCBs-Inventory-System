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
    after: 'langsung tersimpan',
    files: TEMPLATE_FILES.filter((entry) => isInventory(entry.form)),
    tone: { icon: 'bg-emerald-50 text-emerald-700', code: 'bg-emerald-50 text-emerald-800', download: 'border-emerald-200 bg-white text-emerald-800 hover:border-emerald-600 hover:bg-emerald-700 hover:text-white', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  },
  {
    title: 'Pengelolaan',
    description: 'Formulir 2–5: perawatan, penyimpanan, pengolahan, dan neraca limbah PCBs.',
    after: 'langsung tersimpan',
    files: TEMPLATE_FILES.filter((entry) => !isInventory(entry.form)),
    tone: { icon: 'bg-sky-50 text-sky-700', code: 'bg-sky-50 text-sky-800', download: 'border-sky-200 bg-white text-sky-800 hover:border-sky-600 hover:bg-sky-700 hover:text-white', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
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

      {/* How a template is used, in three green steps with a line between them. */}
      <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-5">
        <ol className="grid divide-y divide-emerald-200/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STEPS.map(([Icon, title, text], index) => (
            <li key={title} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0 sm:px-5 sm:py-0 sm:first:pl-0 sm:last:pr-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm ring-4 ring-emerald-100"><Icon className="h-4.5 w-4.5" /></span>
              <span className="min-w-0 pt-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Langkah {index + 1}</span>
                <span className="block text-sm font-semibold text-slate-900">{title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${group.tone.icon}`}><FileSpreadsheet className="h-5 w-5" /></span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Template {group.title.toLowerCase()}</h2>
                <p className="text-xs text-slate-500">{group.description}</p>
              </div>
            </div>
            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${group.tone.badge}`}><CheckCircle2 className="h-3.5 w-3.5" /> Setelah diunggah: {group.after}</span>
          </header>
          <ul className="divide-y divide-slate-100">
            {group.files.map((entry) => (
              <li key={entry.form} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/80">
                <span className={`w-11 shrink-0 rounded-lg py-1 text-center text-xs font-bold ${group.tone.code}`}>{entry.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{entry.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{entry.description}</span>
                </span>
                <a href={entry.file} download className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${group.tone.download}`}><Download className="h-4 w-4" /> Unduh</a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-500"><Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span>Baris contoh di template (bertanda CONTOH) tidak ikut terbaca. Jangan memindah, menghapus, atau mengganti nama kolom, karena sistem mengenali kolom dari judulnya. Status unggahan formulir 1.1–1.4 terlihat di menu <Link href={href('/unggah')} className="font-semibold text-emerald-700 hover:underline">Riwayat unggahan</Link>.</span></p>
    </>
  );
}
