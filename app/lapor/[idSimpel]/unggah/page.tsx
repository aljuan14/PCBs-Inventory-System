'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, History, Info } from 'lucide-react';
import { UPLOAD_STATUS } from '@/components/InventoryUpload';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';
import type { UploadMode, UploadSummary } from '@/lib/company-upload-shared';
import { formSpec } from '@/lib/form-fields';
import type { InventoryCategory } from '@/lib/inventory';

type Upload = { id: string; kategori: InventoryCategory; mode: UploadMode; nama_file: string; status: keyof typeof UPLOAD_STATUS; catatan: string | null; created_at: string; diperiksa_at: string | null; ringkasan: UploadSummary | null };

const fmt = (value: number) => value.toLocaleString('id-ID');
const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Every Excel upload of forms 1.1–1.4 the company sent, with the admin's answer. */
function UploadHistory() {
  const { supabase, company, href } = useCompanyPortal();
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
        <h2 className="text-sm font-semibold text-slate-900">Unggahan formulir 1.1–1.4</h2>
        <p className="text-xs text-slate-500">Terbaru di atas. Data baru masuk setelah unggahannya diterima KLH.</p>
      </div>
      {list === null ? <p className="p-5 text-sm text-slate-500">Memuat…</p> : list.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><History className="h-7 w-7" /></span>
          <p className="mt-4 text-sm font-semibold text-slate-900">Belum ada unggahan</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">Unggahan template Excel formulir 1.1–1.4 dan hasil pemeriksaan KLH-nya akan tercatat di sini.</p>
          <Link href={href('/template')} className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><FileSpreadsheet className="h-4 w-4" /> Lihat template Excel</Link>
        </div>
      ) : (
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

/** Every Excel upload of forms 1.1–1.4 the company sent and what KLH answered. */
export default function CompanyUploads() {
  const { href } = useCompanyPortal();
  return (
    <>
      <PortalHeader title="Riwayat unggahan" description="Unggahan Excel formulir 1.1–1.4 yang dikirim ke KLH: menunggu pemeriksaan, diterima, atau ditolak beserta alasannya." />
      <UploadHistory />
      <p className="flex items-start gap-2 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Unggahan formulir 2–5 langsung tersimpan setelah lolos pemeriksaan otomatis, jadi tidak tercatat di sini. Butuh template? Unduh di menu <Link href={href('/template')} className="font-semibold text-emerald-700 hover:underline">Template Excel</Link>.</span></p>
    </>
  );
}
