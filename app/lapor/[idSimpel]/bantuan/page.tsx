'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CircleAlert, Download, FileText, MessageCircle } from 'lucide-react';
import { PortalHeader, useCompanyPortal } from '@/components/company/CompanyPortal';
import { adminContactLink } from '@/lib/contact';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { REGULATION_FILE } from '@/lib/templates';

const HIGHLIGHT = ['ring-4', 'ring-emerald-500/40'];

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  // Opened by a link to it (#id, e.g. from the status card): outlined for a moment so the eye finds it.
  useEffect(() => {
    const element = ref.current;
    if (!id || !element || window.location.hash !== `#${id}`) return;
    element.classList.add(...HIGHLIGHT);
    const timer = window.setTimeout(() => element.classList.remove(...HIGHLIGHT), 2500);
    return () => window.clearTimeout(timer);
  }, [id]);
  return (
    <section ref={ref} id={id} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 transition-shadow duration-700">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-2 text-sm text-slate-700">{children}</div>
    </section>
  );
}

const FAQ: Array<[string, string]> = [
  ['Perusahaan kami tidak memiliki trafo, kapasitor, maupun minyak dielektrik. Apa yang diisi?', 'Di menu Isi formulir, pilih "Tidak memiliki peralatan" pada bagian Kepemilikan peralatan dan unggah surat pernyataan yang ditandatangani. KLH akan memverifikasi suratnya.'],
  ['Trafo kami buatan 1997 ke atas. Apakah harus diisi satu per satu?', `Tidak. Formulir 1.1 dan 1.2 hanya untuk trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau yang tahunnya tidak diketahui. Trafo ${TRAFO_FOCUS_YEAR} ke atas cukup jumlah dan tonasenya di bagian Kepemilikan peralatan.`],
  ['Kenapa unggahan Excel kami belum masuk ke data?', 'Unggahan formulir 1.1–1.4 diperiksa KLH dulu. Statusnya terlihat di menu Unggah Excel: menunggu, diterima, atau ditolak beserta alasannya.'],
  ['Unggahan kami ditolak karena "bukan template resmi". Kenapa?', 'Sistem mengenali kolom dari judulnya. Unduh template resmi di menu Unggah Excel dan jangan memindah, menghapus, atau mengganti nama kolomnya.'],
  ['Titik trafo kami muncul di laut pada peta.', 'Biasanya karena lintang selatan ditulis tanpa tanda minus. Tulis koordinat seperti -6.2088, 106.8456, lalu perbaiki di formulir (Data tersimpan, tombol ubah).'],
  ['Data yang sudah tersimpan salah. Bagaimana mengubahnya?', 'Buka formulirnya di menu Isi formulir, lalu di bagian Data tersimpan klik ikon ubah pada baris yang salah.'],
];

/** How to report, what the status means, the documents, and who to ask. */
export default function CompanyHelp() {
  const { href } = useCompanyPortal();
  const contact = adminContactLink('Halo admin, saya butuh bantuan pengisian laporan Inventarisasi PCBs.');

  return (
    <>
      <PortalHeader title="Bantuan" description="Langkah pengisian laporan, arti status, dokumen pendukung, dan kontak admin." />

      <Section title="Langkah melapor">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><span className="font-semibold">Kepemilikan peralatan</span> di menu <Link href={href('/formulir', { bagian: 'pernyataan' })} className="font-semibold text-emerald-700 underline">Isi formulir</Link>: nyatakan apakah perusahaan memiliki peralatan yang berpotensi mengandung PCBs.</li>
          <li><span className="font-semibold">Formulir 1.1–1.4</span>: data trafo yang masih digunakan, trafo yang tidak digunakan, kapasitor, dan minyak dielektrik. Isi satu per satu atau <Link href={href('/unggah')} className="font-semibold text-emerald-700 underline">unggah template Excel</Link>.</li>
          <li><span className="font-semibold">Bukti dukung</span>: tempel tautan Google Drive untuk dokumentasi di bawah setiap formulir 1.x.</li>
          <li><span className="font-semibold"><Link href={href('/roadmap')} className="text-emerald-700 underline">Roadmap</Link></span>: beri tanggal rencana untuk trafo buatan sebelum {TRAFO_FOCUS_YEAR}.</li>
          <li><span className="font-semibold">Formulir 2–5</span> bila ada kegiatannya: perawatan (pengurangan), penyimpanan limbah, pengolahan, dan neraca pelaporan.</li>
        </ol>
      </Section>

      <Section id="arti-status" title="Arti status PCBs">
        <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /><span><span className="font-semibold text-rose-800">Perlu tindakan (merah)</span>: ada trafo yang belum punya rencana atau sudah lewat tanggal rencananya, atau menyimpan limbah PCBs tanpa izin TPS.</span></p>
        <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span><span className="font-semibold text-amber-900">Perlu perhatian (kuning)</span>: semua sudah terjadwal, tetapi ada yang perlu dilengkapi, misalnya bukti dukung, izin yang hampir berakhir, atau tahun pembuatan yang kosong.</span></p>
        <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span><span className="font-semibold text-emerald-800">Aman (hijau)</span>: tidak ada yang perlu dilakukan.</span></p>
        <p className="text-xs text-slate-500">Setiap peringatan di Beranda bisa diklik untuk langsung membuka bagian yang perlu dilengkapi.</p>
      </Section>

      <Section title={`Roadmap trafo buatan sebelum ${TRAFO_FOCUS_YEAR}`}>
        <ul className="list-disc space-y-1 pl-5">
          <li>Trafo <span className="font-semibold">masih digunakan dan belum diuji</span>: kapan akan diuji kandungan PCBs-nya.</li>
          <li>Trafo <span className="font-semibold">masih digunakan, hasil uji 50 ppm atau lebih</span>: kapan akan diretrofilling atau diganti.</li>
          <li>Trafo <span className="font-semibold">sudah tidak digunakan</span>: kapan akan dikelola (diserahkan ke pengolah berizin), berapa pun hasil ujinya.</li>
        </ul>
      </Section>

      <Section title="Pertanyaan yang sering diajukan">
        <dl className="space-y-3">
          {FAQ.map(([question, answer]) => (
            <div key={question}><dt className="font-semibold text-slate-900">{question}</dt><dd className="mt-0.5 text-slate-600">{answer}</dd></div>
          ))}
        </dl>
      </Section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Dokumen">
          <a href={REGULATION_FILE.file} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-semibold text-emerald-700 hover:underline"><FileText className="h-4 w-4" /> {REGULATION_FILE.title}</a>
          <Link href={href('/unggah')} className="flex items-center gap-2 font-semibold text-emerald-700 hover:underline"><Download className="h-4 w-4" /> Template Excel formulir 1.1–5</Link>
        </Section>
        <Section title="Kontak admin">
          <p>Direktorat Pengelolaan B3, Kementerian Lingkungan Hidup.</p>
          {contact
            ? <a href={contact} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"><MessageCircle className="h-4 w-4" /> Hubungi admin</a>
            : <p className="text-xs text-slate-500">Hubungi admin melalui kontak yang diberikan KLH kepada perusahaan.</p>}
        </Section>
      </div>
    </>
  );
}
