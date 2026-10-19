'use client';

import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Info } from 'lucide-react';
import FormTabs, { type OtherForm, type ReportTab } from '@/components/FormTabs';
import InventoryUpload, { UPLOAD_STATUS } from '@/components/InventoryUpload';
import TemplateUpload from '@/components/TemplateUpload';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';
import type { UploadMode, UploadSummary } from '@/lib/company-upload-shared';
import { formSpec } from '@/lib/form-fields';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { TEMPLATE_FILES } from '@/lib/templates';

type Upload = { id: string; kategori: InventoryCategory; mode: UploadMode; nama_file: string; status: keyof typeof UPLOAD_STATUS; catatan: string | null; created_at: string; diperiksa_at: string | null; ringkasan: UploadSummary | null };

const fmt = (value: number) => value.toLocaleString('id-ID');
const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const isInventory = (form: ReportTab): form is InventoryCategory => INVENTORY_CATEGORIES.some((category) => category.key === form);

/** Every Excel upload of forms 1.1–1.4 the company sent, with the admin's answer. */
function UploadHistory({ reloadKey }: { reloadKey: number }) {
  const { supabase, company } = useCompanyPortal();
  const [uploads, setUploads] = useState<{ key: string; list: Upload[] } | null>(null);
  const key = `${company.id}|${reloadKey}`;
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

/**
 * Excel in one place: the official templates to download, the upload of the
 * form picked (1.1–1.4 checked by KLH first, 2–5 stored at once, as in the
 * form tabs), and the history of the uploads sent.
 */
export default function CompanyUploads() {
  const { supabase, company, refresh } = useCompanyPortal();
  const [form, setForm] = useState<ReportTab>('transformator_digunakan');
  const [reloadKey, setReloadKey] = useState(0);
  const template = TEMPLATE_FILES.find((entry) => entry.form === form);

  return (
    <>
      <PortalHeader title="Unggah Excel" description="Untuk data dalam jumlah banyak: unduh template resmi, isi tanpa mengubah judul kolomnya, lalu unggah di formulir yang sesuai." />

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Template resmi</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {TEMPLATE_FILES.map((entry) => (
            <a key={entry.form} href={entry.file} download className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-xs hover:border-emerald-300 hover:bg-emerald-50/50">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />
              <span className="min-w-0 flex-1"><span className="font-bold text-slate-900">{entry.code}</span> <span className="text-slate-700">{entry.title}</span></span>
              <Download className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </a>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Baris contoh di template (bertanda CONTOH) tidak ikut terbaca. Jangan memindah, menghapus, atau mengganti nama kolom.</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Unggah ke formulir</h2>
          <p className="text-xs text-slate-500">Pilih formulirnya, lalu unggah berkas template yang sudah diisi.</p>
        </div>
        <FormTabs value={form} onChange={setForm} withRoadmap={false} />
        {template && <a href={template.file} download className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"><Download className="h-3.5 w-3.5" /> Unduh template formulir {template.code}</a>}
        {isInventory(form)
          ? <InventoryUpload key={form} companyId={company.id} category={form} onSent={() => { setReloadKey((value) => value + 1); refresh(); }} />
          : <TemplateUpload key={form} supabase={supabase} companyId={company.id} kind={form as OtherForm} onImported={refresh} />}
      </section>

      <UploadHistory reloadKey={reloadKey} />
    </>
  );
}
