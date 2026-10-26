'use client';

import Link from 'next/link';
import {
  AlertTriangle, BookOpen, CalendarClock, CheckCircle2, CircleAlert, ClipboardPen, Download, FileSpreadsheet, FileText,
  Gauge, HelpCircle, ListOrdered, MapPin, MessageCircle, Paperclip,
} from 'lucide-react';
import { PortalHeader, PortalSubnav, useCompanyPortal } from '@/components/company/CompanyPortal';
import { Contents, FaqList, HelpSection, Note, type FaqGroup, type HelpPart } from '@/components/help/HelpParts';
import { adminContactLink } from '@/lib/contact';
import { MAX_STORAGE_DAYS, PERMIT_WARNING_DAYS } from '@/lib/company-pcb-status';
import { MAX_COMPANY_UPLOAD_BYTES } from '@/lib/company-upload-shared';
import { EVIDENCE_ITEMS } from '@/lib/evidence';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { REGULATION_FILE } from '@/lib/templates';

const UPLOAD_MB = MAX_COMPANY_UPLOAD_BYTES / 1024 / 1024;
const linkClass = 'font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900';

const FAQ_GROUPS: FaqGroup[] = [
  { title: 'Umum', items: [
    { id: 'wajib', q: 'Siapa yang wajib mengisi laporan ini?', a: `Setiap perusahaan yang memiliki atau pernah memiliki peralatan yang berpotensi mengandung PCBs: transformator (trafo), kapasitor, atau minyak dielektrik, sesuai ${REGULATION_FILE.title}. Perusahaan yang tidak memiliki peralatan tersebut tetap melapor dengan menyatakan "Tidak memiliki peralatan" disertai surat pernyataan.` },
    { id: 'tidak-punya', q: 'Perusahaan kami tidak memiliki trafo. Apa yang diisi?', a: 'Tidak perlu melakukan inventarisasi. Di Beranda (atau menu Isi formulir, bagian Kepemilikan peralatan), jawab "Tidak memiliki trafo", isi tanggal surat, lalu unggah surat pernyataan tidak memiliki trafo bertanda tangan dan bermeterai dengan kop perusahaan (PDF, maksimal 2 MB). KLH akan memverifikasi suratnya. Bila ditolak, alasannya tampil di kartu yang sama dan surat yang sudah diperbaiki bisa diunggah ulang.', go: { label: 'Buka Kepemilikan peralatan', path: '/formulir', query: { bagian: 'pernyataan' } } },
    { id: 'tahun-1997', q: `Trafo kami buatan ${TRAFO_FOCUS_YEAR} ke atas. Apakah harus diisi satu per satu?`, a: `Tidak. Formulir 1.1 dan 1.2 hanya untuk trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau yang tahun pembuatannya tidak diketahui. Trafo ${TRAFO_FOCUS_YEAR} ke atas cukup dicatat jumlah dan total tonasenya di bagian "Trafo ${TRAFO_FOCUS_YEAR} ke atas yang tidak didata satu per satu" pada Kepemilikan peralatan.` },
    { id: 'unit', q: 'Perusahaan kami punya beberapa unit dengan ID SIMPEL yang sama.', a: 'Setiap unit dilaporkan terpisah. Pilih unit yang akan diisi di awal; nama unit yang sedang dibuka tampil di kartu kiri atas sidebar. Semua menu (Beranda, Isi formulir, Roadmap) hanya menampilkan data unit tersebut.' },
    { id: 'batas-waktu', q: 'Apakah data bisa diubah setelah disimpan?', a: 'Bisa, kapan saja. Laporan ini bersifat berkelanjutan: perbarui datanya setiap ada perubahan, misalnya trafo baru diuji, diganti, atau sudah dikelola.' },
  ] },
  { title: 'Mengisi formulir', items: [
    { id: 'ubah-data', q: 'Data yang sudah tersimpan salah. Bagaimana mengubahnya?', a: 'Cari datanya di tabel Beranda, atau buka formulirnya di menu Isi formulir bagian "Data tersimpan". Klik ikon ubah pada baris yang salah, perbaiki di jendela yang muncul, lalu Simpan. Ikon tempat sampah menghapus baris tersebut setelah dikonfirmasi.', go: { label: 'Buka Isi formulir', path: '/formulir' } },
    { id: 'wajib-isi', q: 'Kolom mana saja yang wajib diisi?', a: 'Kolom wajib ditandai bintang (*). Untuk formulir 1.1 misalnya: nama/merek, nomor serial, tahun pembuatan, lokasi peralatan, dan titik koordinat. Bila ada yang terlewat, formulir tidak tersimpan dan kolom yang kurang ditandai merah serta langsung ditampilkan.' },
    { id: 'banyak-data', q: 'Kami punya puluhan trafo. Apakah ada cara lebih cepat dari mengisi satu per satu?', a: 'Ada dua cara. Pertama, tombol "Simpan & tambah lagi" di jendela formulir menyimpan data lalu langsung membuka formulir kosong berikutnya (pintasan Ctrl+Enter untuk menyimpan). Kedua, unggah template Excel: unduh template resmi, isi semua baris, lalu unggah di card "Tambah data" pada formulir yang sesuai.' },
    { id: 'draf', q: 'Jendela formulir tertutup sebelum disimpan. Apakah isiannya hilang?', a: 'Bila ada isian yang belum disimpan, aplikasi menanyakan dulu sebelum menutup jendela. Isian yang sudah disimpan selalu tampil di "Data tersimpan".' },
    { id: 'belum-diuji', q: 'Trafo kami belum pernah diuji kandungan PCBs-nya. Apa yang diisi?', a: 'Kosongkan bagian hasil uji. Trafo tersebut dihitung "Belum diuji" dan perlu diberi rencana uji (bulan dan tahun) di menu Roadmap. Setelah diuji, ubah datanya dan isi jenis uji, metode, penyedia jasa, serta konsentrasi PCBs (ppm).' },
  ] },
  { title: 'Template Excel', items: [
    { id: 'unggah-belum-masuk', q: 'Apakah unggahan Excel langsung masuk ke data?', a: 'Ya. Setelah berkas dipilih, sistem membaca dan memeriksanya, lalu menampilkan jumlah baris dan temuannya. Begitu Anda menekan "Simpan ke data", datanya langsung masuk dan tampil di Beranda serta tabel. Setiap unggahan formulir 1.1–1.4 tercatat di menu Riwayat unggahan.', go: { label: 'Lihat riwayat unggahan', path: '/unggah' } },
    { id: 'bukan-template', q: 'Muncul pesan "bukan template resmi" saat mengunggah. Kenapa?', a: 'Sistem mengenali kolom dari judulnya. Unduh template resmi di menu Template Excel, isi mulai baris di bawah contoh, dan jangan memindah, menghapus, menggabungkan, atau mengganti nama kolomnya.', go: { label: 'Unduh template resmi', path: '/template' } },
    { id: 'tambah-ganti', q: 'Apa beda "Menambahkan" dan "Mengganti semua" saat mengunggah formulir 1.1–1.4?', a: '"Menambahkan" memasukkan baris baru dan melewati baris yang sudah ada di data perusahaan. "Mengganti semua" menghapus seluruh data formulir itu (termasuk yang diisi lewat formulir) lalu menggantinya dengan isi berkas. Gunakan "Mengganti semua" hanya bila berkas Excel Anda adalah daftar lengkap terbaru.' },
    { id: 'batal-unggah', q: 'Kami salah mengunggah berkas. Bagaimana memperbaikinya?', a: 'Data yang salah bisa diubah atau dihapus satu per satu dari tabel di Beranda (ikon pensil dan tempat sampah). Bila hampir semua barisnya salah, unggah lagi berkas yang benar dengan pilihan "Mengganti semua": seluruh data formulir itu diganti dengan isi berkas yang baru.' },
    { id: 'baris-error', q: 'Muncul pesan "Baris 12: …" setelah memilih berkas.', a: `Itu hasil pemeriksaan otomatis: baris tersebut belum lengkap atau isinya tidak sesuai (misalnya tahun bukan angka, koordinat tidak terbaca). Perbaiki di Excel lalu unggah lagi. Baris contoh bertanda CONTOH tidak ikut terbaca. Ukuran berkas maksimal ${UPLOAD_MB} MB.` },
  ] },
  { title: 'Status & roadmap', items: [
    { id: 'merah', q: 'Kenapa status kami merah padahal semua data sudah diisi?', a: `Status merah bukan berarti datanya kurang, melainkan ada trafo buatan sebelum ${TRAFO_FOCUS_YEAR} yang belum punya rencana (uji, penanganan, atau pengelolaan) atau rencananya sudah lewat tanggal. Buka Beranda: setiap baris di "Yang perlu dilakukan" bisa diklik untuk langsung ke tempat memperbaikinya, biasanya menu Roadmap.`, go: { label: 'Buka Roadmap', path: '/roadmap' } },
    { id: 'kuning-tetap', q: 'Semua trafo sudah punya rencana, tetapi status masih kuning.', a: 'Itu memang tujuannya: kuning berarti semuanya sudah terjadwal tetapi belum selesai, atau ada hal administrasi yang perlu dilengkapi (bukti dukung, izin TPS yang hampir berakhir, tahun pembuatan kosong). Status menjadi hijau setelah semua trafo diuji di bawah 50 ppm, atau yang tidak digunakan sudah dikelola.' },
    { id: 'selesai-masih-tinggi', q: 'Trafo sudah diretrofilling, tetapi muncul "ditandai sudah ditangani, hasil uji masih ≥ 50 ppm".', a: 'Status mengikuti hasil uji terakhir. Isi hasil uji sesudah penanganan di formulir 2 (Pengurangan), atau ubah hasil uji di data trafonya. Bila trafonya sudah diganti, pindahkan trafo lama ke formulir 1.2 (tidak digunakan).', go: { label: 'Buka formulir 2', path: '/formulir', query: { tab: 'pengurangan' } } },
    { id: 'ubah-tanggal', q: 'Tanggal rencana di roadmap perlu dimundurkan.', a: 'Di menu Roadmap, centang trafonya lalu pilih tanggal baru. Tanggal baru menggantikan rencana yang belum selesai. Rencana yang sudah lewat tanggal tanpa hasil membuat status merah, jadi perbarui tanggalnya sebelum terlewat.' },
  ] },
  { title: 'Peta & koordinat', items: [
    { id: 'titik-laut', q: 'Titik trafo kami muncul di laut pada peta.', a: 'Hampir selalu karena lintang selatan ditulis tanpa tanda minus. Wilayah Indonesia di selatan khatulistiwa lintangnya negatif, misalnya -6.2088, 106.8456 (Jakarta). Perbaiki di formulir: Data tersimpan, ikon ubah, lalu koreksi koordinatnya atau pilih titiknya langsung di peta.' },
    { id: 'format-koordinat', q: 'Format koordinat apa saja yang diterima?', a: 'Desimal (-6.2088, 106.8456) maupun derajat-menit-detik, misalnya 6°12\'31.7"LS 106°50\'44.2"BT. Arah LU/LS/BT/BB maupun N/S/E/W dikenali. Di jendela formulir juga ada tombol untuk memilih titik langsung di peta.' },
    { id: 'tidak-tampil', q: 'Sebagian peralatan tidak tampil di peta Beranda.', a: 'Peralatan tanpa koordinat yang terbaca tidak tampil di peta; jumlahnya disebutkan di atas peta Beranda. Lengkapi koordinatnya lewat ikon ubah di tabel Beranda atau di Data tersimpan.' },
  ] },
];

/** The parts of the guide, in order, for the contents list. */
const PARTS: HelpPart[] = [
  { id: 'faq', title: 'Pertanyaan umum', icon: HelpCircle },
  { id: 'langkah', title: 'Langkah melapor', icon: ListOrdered },
  { id: 'arti-status', title: 'Arti status PCBs', icon: Gauge },
  { id: 'formulir', title: 'Daftar formulir', icon: ClipboardPen },
  { id: 'excel', title: 'Template Excel', icon: FileSpreadsheet },
  { id: 'roadmap', title: 'Roadmap', icon: CalendarClock },
  { id: 'bukti-dukung', title: 'Bukti dukung', icon: Paperclip },
  { id: 'koordinat', title: 'Koordinat & peta', icon: MapPin },
  { id: 'istilah', title: 'Istilah', icon: BookOpen },
  { id: 'kontak', title: 'Dokumen & kontak', icon: MessageCircle },
];

/** The forms, what each holds and when it is filled. */
const FORMS: Array<{ code: string; title: string; when: string; tab: string }> = [
  { code: '1.1', title: 'Transformator yang masih digunakan', when: `Trafo yang masih beroperasi, buatan sebelum ${TRAFO_FOCUS_YEAR} atau tanpa tahun. Termasuk hasil uji PCBs dan riwayat perawatannya.`, tab: 'transformator_digunakan' },
  { code: '1.2', title: 'Transformator yang sudah tidak digunakan', when: 'Trafo yang sudah tidak beroperasi (rusak, cadangan, atau sudah diganti) dan masih disimpan. Setiap trafo di sini wajib punya rencana pengelolaan.', tab: 'transformator_tidak_digunakan' },
  { code: '1.3', title: 'Kapasitor', when: 'Kapasitor yang berpotensi mengandung PCBs, baik masih digunakan maupun tidak.', tab: 'kapasitor' },
  { code: '1.4', title: 'Minyak dielektrik', when: 'Minyak dielektrik/oli trafo yang disimpan dalam wadah (drum, IBC, jeriken, tangki), baik belum maupun sudah digunakan.', tab: 'minyak_dielektrik' },
  { code: '2', title: 'Pengurangan (log perawatan)', when: 'Bila ada perawatan trafo seperti retrofilling atau penggantian oli: hasil uji sebelum dan sesudah, serta pengelolaan limbah B3 hasil perawatan.', tab: 'pengurangan' },
  { code: '3', title: 'Penyimpanan (logbook)', when: 'Bila menyimpan limbah PCBs di TPS Limbah B3: logbook limbah (kode A101d), izin TPS, dan ketentuan teknis penyimpanan.', tab: 'penyimpanan' },
  { code: '4.2', title: 'Pengolahan', when: 'Bila perusahaan penghasil mengolah sendiri limbah PCBs-nya: daftar ketentuan teknis pengolahan (Ya/Tidak).', tab: 'pengolahan' },
  { code: '5', title: 'Pelaporan (neraca)', when: 'Neraca limbah PCBs: jumlah yang dihasilkan, dikelola, dan sisa yang belum dikelola.', tab: 'pelaporan' },
];

// A part of this guide, its icon from the contents list.
const Section = (props: Omit<React.ComponentProps<typeof HelpSection>, 'icon'>) => <HelpSection icon={PARTS.find((part) => part.id === props.id)?.icon} {...props} />;

const TERMS: Array<[string, string]> = [
  ['PCBs', 'Polychlorinated Biphenyls, senyawa kimia yang dulu banyak dipakai pada minyak dielektrik trafo dan kapasitor. Termasuk bahan pencemar organik persisten yang wajib dikelola sampai tuntas.'],
  ['ppm', 'Part per million, satuan konsentrasi. Batas konsentrasi PCBs menurut Permen LHK 29/2020 adalah 50 ppm: 50 ppm atau lebih dianggap mengandung PCBs.'],
  ['Uji cepat / uji lab', 'Uji cepat (screening) memberi perkiraan di lapangan; uji laboratorium memberi hasil konsentrasi yang pasti. Keduanya dicatat beserta metode dan penyedia jasanya.'],
  ['Retrofilling', 'Mengganti minyak dielektrik yang mengandung PCBs dengan minyak bebas PCBs, lalu menguji ulang trafonya.'],
  ['Pengelolaan', 'Menyerahkan peralatan atau limbah PCBs ke pengolah berizin, atau mengolahnya sendiri sesuai ketentuan, sampai tuntas.'],
  ['TPS Limbah B3', 'Tempat Penyimpanan Sementara limbah bahan berbahaya dan beracun, yang wajib berizin. Limbah PCBs paling lama disimpan ' + MAX_STORAGE_DAYS + ' hari.'],
  ['A101d', 'Kode limbah B3 untuk limbah yang mengandung PCBs.'],
  ['Penaatan', 'Persentase ketentuan teknis (formulir 3 dan 4.2) yang dijawab "Ya".'],
];

/** How to report, what the status means, each part of the work in detail, and who to ask. */
export default function CompanyHelp() {
  const { href } = useCompanyPortal();
  const contact = adminContactLink('Halo admin, saya butuh bantuan pengisian laporan Inventarisasi PCBs.');
  const evidenceCounts = Object.values(EVIDENCE_ITEMS).map((items) => items.length);

  return (
    <>
      <PortalHeader title="Bantuan" description="Panduan lengkap pelaporan Inventarisasi PCBs: pertanyaan umum, langkah melapor, arti status, setiap formulir, template Excel, roadmap, dan kontak admin." />

      <PortalSubnav><Contents parts={PARTS} /></PortalSubnav>

      <div className="space-y-5">
        <Section id="faq" title="Pertanyaan yang sering diajukan" description="Klik pertanyaan untuk melihat jawabannya, atau cari dengan kata kunci.">
          <FaqList groups={FAQ_GROUPS} resolve={(go) => href(go.path, go.query)} placeholder="Cari pertanyaan, mis. koordinat, ditolak, roadmap…" />
        </Section>

        <Section id="langkah" title="Langkah melapor" description="Urutan pengisian dari awal sampai status hijau.">
          <ol className="space-y-3">
            {[
              ['Nyatakan kepemilikan peralatan', <>Di menu <Link href={href('/formulir', { bagian: 'pernyataan' })} className={linkClass}>Isi formulir</Link>, bagian Kepemilikan peralatan (atau langsung di Beranda): jawab &ldquo;Ya, memiliki trafo&rdquo;, atau &ldquo;Tidak memiliki trafo&rdquo; dengan surat pernyataan PDF. Trafo buatan {TRAFO_FOCUS_YEAR} ke atas cukup jumlah dan tonasenya.</>],
              ['Isi formulir 1.1–1.4', <>Data setiap trafo (masih digunakan dan tidak digunakan), kapasitor, dan minyak dielektrik. Isi lewat formulir satu per satu, atau unggah template Excel lewat card &ldquo;Tambah data&rdquo; di setiap formulir.</>],
              ['Lengkapi bukti dukung', <>Tempel tautan Google Drive untuk setiap dokumen di bagian Bukti dukung di bawah formulir 1.1–1.4.</>],
              ['Atur roadmap', <>Di menu <Link href={href('/roadmap')} className={linkClass}>Roadmap</Link>, beri rencana bulan dan tahun untuk setiap trafo buatan sebelum {TRAFO_FOCUS_YEAR}. Trafo yang masih digunakan: kapan diuji (bila belum diuji) dan kapan diretrofilling (bila ≥ 50 ppm). Trafo yang tidak digunakan: kapan dikelola.</>],
              ['Isi formulir 2–5 bila ada kegiatannya', <>Perawatan trafo (2), penyimpanan limbah PCBs (3), pengolahan (4.2), dan neraca limbah (5).</>],
              ['Pantau status di Beranda', <>Kerjakan setiap baris &ldquo;Yang perlu dilakukan&rdquo; sampai status menjadi hijau, dan perbarui data setiap ada perubahan.</>],
            ].map(([title, body], index) => (
              <li key={index} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">{index + 1}</span>
                <div className="min-w-0 pt-0.5"><p className="font-semibold text-slate-900">{title}</p><p className="text-slate-600">{body}</p></div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="arti-status" title="Arti status PCBs" description={`Status dihitung otomatis dari trafo buatan sebelum ${TRAFO_FOCUS_YEAR} (atau tanpa tahun) dan dari formulir 3–5, setiap kali data berubah.`}>
          <div className="space-y-3">
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <p className="flex items-center gap-2 font-semibold text-rose-800"><CircleAlert className="h-4 w-4" /> Perlu tindakan (merah)</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                <li>Trafo belum diuji dan belum punya rencana uji.</li>
                <li>Trafo dengan hasil uji 50 ppm atau lebih tanpa rencana penanganan (retrofilling, penggantian, atau pengolahan).</li>
                <li>Trafo yang sudah tidak digunakan tanpa rencana pengelolaan.</li>
                <li>Rencana uji, penanganan, atau pengelolaan yang sudah lewat tanggal tanpa hasil.</li>
                <li>Menyimpan limbah PCBs tanpa izin TPS Limbah B3, atau izinnya sudah berakhir.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Perlu perhatian (kuning)</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                <li>Semua trafo sudah punya rencana, tetapi belum selesai.</li>
                <li>Trafo ditandai sudah ditangani, tetapi hasil uji terakhirnya masih 50 ppm atau lebih.</li>
                <li>Izin TPS berakhir dalam {PERMIT_WARNING_DAYS} hari, atau limbah PCBs disimpan lebih dari {MAX_STORAGE_DAYS} hari.</li>
                <li>Ada ketentuan teknis penyimpanan/pengolahan yang dijawab &ldquo;Tidak&rdquo;, atau neraca masih menyisakan limbah yang belum dikelola.</li>
                <li>Bukti dukung formulir 1.x belum lengkap, tahun pembuatan trafo kosong, atau pernyataan kepemilikan belum diisi / tidak sesuai dengan data.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Aman (hijau)</p>
              <p className="mt-2 text-slate-700">Tidak ada yang perlu dilakukan: tidak ada trafo buatan sebelum {TRAFO_FOCUS_YEAR}, atau semuanya sudah diuji di bawah 50 ppm, atau yang tidak digunakan sudah dikelola. Perusahaan yang menyatakan tidak memiliki trafo menjadi hijau setelah surat pernyataannya diterima KLH.</p>
            </div>
          </div>
          <Note>Setiap baris di &ldquo;Yang perlu dilakukan&rdquo; di <Link href={href()} className={linkClass}>Beranda</Link> bisa diklik untuk langsung membuka bagian yang perlu dilengkapi. Merah selalu didahulukan.</Note>
        </Section>

        <Section id="formulir" title="Daftar formulir" description="Formulir 1.x adalah inventarisasi peralatan; formulir 2–5 adalah pengelolaannya.">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {FORMS.map((form) => (
              <Link key={form.code} href={href('/formulir', { tab: form.tab })} className="group flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                <span className="w-9 shrink-0 rounded-md bg-slate-100 py-0.5 text-center text-xs font-bold text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-800">{form.code}</span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{form.title}</span><span className="block text-xs text-slate-600">{form.when}</span></span>
              </Link>
            ))}
          </div>
          <p className="font-semibold text-slate-900">Cara mengisi lewat formulir</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Buka tab formulirnya, lalu klik &ldquo;Isi lewat formulir&rdquo; pada card Tambah data.</li>
            <li>Isi kolomnya di jendela yang muncul. Kolom bertanda * wajib; tombol bagian di atas jendela membawa langsung ke bagian tertentu.</li>
            <li>Klik <span className="font-semibold">Simpan</span>, atau <span className="font-semibold">Simpan &amp; tambah lagi</span> untuk langsung mengisi data berikutnya. Pintasan: Ctrl+Enter.</li>
            <li>Data muncul di &ldquo;Data tersimpan&rdquo; dan dapat diubah atau dihapus kapan saja.</li>
          </ol>
        </Section>

        <Section id="excel" title="Template Excel" description="Untuk data dalam jumlah banyak.">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Unduh template resmi di menu <Link href={href('/template')} className={linkClass}>Template Excel</Link> atau lewat tautan &ldquo;Unduh template&rdquo; di card Tambah data.</li>
            <li>Isi mulai baris di bawah contoh. Baris bertanda CONTOH tidak ikut terbaca.</li>
            <li>Di tab formulir yang sesuai, klik atau seret berkas ke kotak &ldquo;Unggah template Excel&rdquo; (maksimal {UPLOAD_MB} MB).</li>
            <li>Periksa ringkasannya: jumlah baris terbaca dan baris yang perlu diperbaiki. Perbaiki di Excel bila ada yang salah, lalu unggah lagi.</li>
            <li>Kirim atau simpan.</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formulir 1.1–1.4</p>
              <p className="mt-1 text-sm">Dikirim ke KLH dan <span className="font-semibold">diperiksa dulu</span> sebelum masuk ke data. Pilih &ldquo;Menambahkan&rdquo; (baris yang sudah ada dilewati) atau &ldquo;Mengganti semua&rdquo; (data lama formulir itu dihapus).</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formulir 2–5</p>
              <p className="mt-1 text-sm"><span className="font-semibold">Langsung tersimpan</span> setelah lolos pemeriksaan otomatis. Pada formulir 2, trafo dicocokkan dengan data 1.1 lewat merek dan nomor serial.</p>
            </div>
          </div>
          <Note tone="warn">Jangan memindah, menghapus, menggabungkan, atau mengganti nama kolom template. Sistem mengenali kolom dari judulnya, sehingga template yang diubah ditolak sebagai &ldquo;bukan template resmi&rdquo;.</Note>
        </Section>

        <Section id="roadmap" title={`Roadmap trafo buatan sebelum ${TRAFO_FOCUS_YEAR}`} description="Rencana dan tanggal untuk setiap trafo yang perlu tindakan.">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Belum diuji', 'Trafo masih digunakan tanpa hasil uji: kapan akan diuji kandungan PCBs-nya.'],
              ['50 ppm atau lebih', 'Trafo masih digunakan dengan hasil uji ≥ 50 ppm: kapan diretrofilling atau diganti.'],
              ['Tidak digunakan', 'Trafo formulir 1.2: kapan dikelola (diserahkan ke pengolah berizin), berapa pun hasil ujinya.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-600">{body}</p></div>
            ))}
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Buka menu <Link href={href('/roadmap')} className={linkClass}>Roadmap</Link>. Pilih kelompok trafo (masih digunakan atau tidak digunakan), lalu gunakan filter (Tanpa rencana, Lewat waktu, dan lainnya) untuk menemukan trafo yang perlu diatur.</li>
            <li>Centang satu atau beberapa trafo, pilih bulan dan tahun rencana, lalu simpan. Rencana baru menggantikan rencana yang belum selesai.</li>
            <li>Setelah dilaksanakan: untuk uji dan penanganan, isi hasil uji terbarunya di formulir (status mengikuti hasil uji terakhir); untuk pengelolaan, klik <span className="font-semibold">Tandai selesai</span>.</li>
          </ol>
          <Note tone="warn">Rencana yang lewat tanggal tanpa hasil membuat status kembali merah. Majukan atau mundurkan tanggalnya sebelum terlewat bila jadwal berubah.</Note>
        </Section>

        <Section id="bukti-dukung" title="Bukti dukung" description="Dokumentasi pendukung formulir 1.1–1.4, sesuai tabel bukti dukung pada template resmi.">
          <p>Di bawah setiap formulir 1.x ada daftar dokumen yang perlu dilampirkan ({evidenceCounts.join(', ')} dokumen untuk formulir 1.1 sampai 1.4), misalnya foto peralatan 4 sisi dengan simbol dan label, plat nama, MSDS/SDS minyak, dan hasil uji laboratorium.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Unggah dokumennya ke Google Drive perusahaan; satu folder per jenis dokumen memudahkan.</li>
            <li>Ubah akses berbagi menjadi &ldquo;Siapa saja yang memiliki link dapat melihat&rdquo;.</li>
            <li>Salin tautannya dan tempel di baris dokumen yang sesuai, lalu simpan.</li>
          </ol>
          <Note>Bukti dukung yang belum lengkap membuat status kuning, bukan merah.</Note>
        </Section>

        <Section id="koordinat" title="Koordinat & peta" description="Titik lokasi peralatan ditampilkan di peta Beranda.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Desimal</p><p className="mt-1 font-mono text-sm text-slate-900">-6.2088, 106.8456</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Derajat, menit, detik</p><p className="mt-1 font-mono text-sm text-slate-900">6°12&apos;31.7&quot;LS 106°50&apos;44.2&quot;BT</p></div>
          </div>
          <ul className="list-disc space-y-1 pl-5">
            <li>Urutannya lintang dulu, lalu bujur.</li>
            <li>Lokasi di selatan khatulistiwa (sebagian besar Indonesia) lintangnya <span className="font-semibold">negatif</span> atau ditulis LS.</li>
            <li>Di jendela formulir ada tombol untuk memilih titik langsung di peta, sehingga koordinatnya terisi otomatis.</li>
          </ul>
          <Note tone="warn">Titik yang muncul di laut hampir selalu karena tanda minus pada lintang terlewat. Periksa peta di Beranda setelah mengisi data.</Note>
        </Section>

        <Section id="istilah" title="Istilah" description="Istilah yang sering muncul di formulir dan status.">
          <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {TERMS.map(([term, meaning]) => (
              <div key={term} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                <dt className="font-semibold text-slate-900">{term}</dt><dd className="text-slate-600">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="kontak" title="Dokumen & kontak" description="Peraturan, template, dan tempat bertanya bila belum terjawab.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <a href={REGULATION_FILE.file} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/50"><FileText className="h-4 w-4 shrink-0 text-emerald-700" /> {REGULATION_FILE.title}</a>
              <Link href={href('/template')} className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/50"><Download className="h-4 w-4 shrink-0 text-emerald-700" /> Template Excel formulir 1.1–5</Link>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Admin Inventarisasi PCBs</p>
              <p className="text-xs text-slate-600">Direktorat Pengelolaan B3, Kementerian Lingkungan Hidup.</p>
              {contact
                ? <a href={contact} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"><MessageCircle className="h-4 w-4" /> Hubungi admin</a>
                : <p className="mt-2 text-xs text-slate-500">Hubungi admin melalui kontak yang diberikan KLH kepada perusahaan.</p>}
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
