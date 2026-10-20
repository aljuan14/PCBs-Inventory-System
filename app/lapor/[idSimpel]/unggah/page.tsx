'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FileSpreadsheet, Info } from 'lucide-react';
import type { OtherForm } from '@/components/FormTabs';
import { UPLOAD_STATUS } from '@/components/InventoryUpload';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';
import type { UploadMode, UploadSummary } from '@/lib/company-upload-shared';
import { formSpec } from '@/lib/form-fields';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { TEMPLATE_FILES } from '@/lib/templates';

type Upload = { id: string; kategori: InventoryCategory; mode: UploadMode; nama_file: string; status: keyof typeof UPLOAD_STATUS; catatan: string | null; created_at: string; diperiksa_at: string | null; ringkasan: UploadSummary | null };

const fmt = (value: number) => value.toLocaleString('id-ID');
const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const isInventory = (form: InventoryCategory | OtherForm): form is InventoryCategory => INVENTORY_CATEGORIES.some((category) => category.key === form);

/** Every Excel upload of forms 1.1–1.4 the company sent, with the admin's answer. */
function UploadHistory() {
  const { supabase, company } = useCompanyPortal();
  const [uploads, setUploads] = useState<{ key: string; list: Upload[] } | null>(null);
  const key = company.id;
  useEffect(() => {
    let active = true;
    supabase.from('unggahan_perusahaan').select('id, kategori, mode, nama_file, status, catatan, created_at, diperiksa_at, ringkasan').eq('company_id', company.id).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { if (active) setUploads({ key, list: (data ?? []) as Upload[] }); });
    return () => { active = false; };
  }, [supabase, company.id, key]);
  const list = uploads?.key === key ? uploads.list : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Riwayat unggahan formulir 1.1–1.4</h2>
        <p className="text-xs text-slate-500">Unggahan ini diperiksa KLH dulu sebelum masuk ke data. Formulir 2–5 langsung tersimpan setelah diunggah.</p>
      </div>
      {list === null ? <p className="p-5 text-sm text-slate-500">Memuat…</p> : list.length === 0 ? <p className="p-5 text-sm text-slate-500">Belum ada unggahan.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">Formulir</th><th className="px-4 py-2.5">Berkas</th><th className="px-4 py-2.5">Data</th><th className="px-4 py-2.5">Dikirim</th><th className="px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((upload) => {
                const status = UPLOAD_STATUS[upload.status];
                return (
                  <tr key={upload.id} className="align-top">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{formSpec(upload.kategori).code}</td>
                    <td className="max-w-56 px-4 py-2.5 text-slate-700"><span className="line-clamp-2">{upload.nama_file}</span></td>
                    <td className="px-4 py-2.5 text-slate-600">{upload.ringkasan ? `${fmt(upload.ringkasan.rows)} baris` : '–'}<span className="block text-[11px] text-slate-400">{upload.mode === 'ganti' ? 'mengganti semua data' : 'ditambahkan'}</span></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{fmtDate(upload.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                      {upload.status === 'ditolak' && upload.catatan && <span className="mt-1 block max-w-64 text-[11px] text-rose-800">Alasan: {upload.catatan}</span>}
                      {upload.diperiksa_at && <span className="mt-0.5 block text-[10px] text-slate-400">diperiksa {fmtDate(upload.diperiksa_at)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The templates in the two groups of the form tabs. */
const TEMPLATE_GROUPS = [
  { title: 'Inventarisasi', description: 'Formulir 1.1–1.4: peralatan yang dimiliki. Unggahan diperiksa KLH dulu.', files: TEMPLATE_FILES.filter((entry) => isInventory(entry.form)) },
  { title: 'Pengelolaan', description: 'Formulir 2–5: perawatan, penyimpanan, pengolahan, dan neraca. Unggahan langsung tersimpan.', files: TEMPLATE_FILES.filter((entry) => !isInventory(entry.form)) },
];

/**
 * The official templates to download, in the two groups of forms, and the
 * history of the uploads sent. Uploading itself is done on each form's card
 * on Isi formulir.
 */
export default function CompanyUploads() {
  const { href } = useCompanyPortal();

  return (
    <>
      <PortalHeader title="Template & riwayat" description="Unduh template resmi, isi tanpa mengubah judul kolomnya, lalu unggah di card Tambah data pada formulir yang sesuai." />

      <div className="grid gap-4 lg:grid-cols-2">
        {TEMPLATE_GROUPS.map((group) => (
          <section key={group.title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Template {group.title.toLowerCase()}</h2>
            <p className="text-xs text-slate-500">{group.description}</p>
            <ul className="mt-3 space-y-2">
              {group.files.map((entry) => (
                <li key={entry.form} className="flex items-center gap-2 rounded-xl border border-slate-200 py-1.5 pl-3 pr-1.5 text-xs">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span className="min-w-0 flex-1"><span className="font-bold text-slate-900">{entry.code}</span> <span className="text-slate-700">{entry.title}</span></span>
                  <Link href={href('/formulir', { tab: entry.form })} className="shrink-0 rounded-lg px-2 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">Buka formulir</Link>
                  <a href={entry.file} download className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100"><Download className="h-3.5 w-3.5" /> Unduh</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="-mt-2 flex items-start gap-1.5 text-[11px] text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Baris contoh di template (bertanda CONTOH) tidak ikut terbaca. Jangan memindah, menghapus, atau mengganti nama kolom.</p>

      <UploadHistory />
    </>
  );
}
