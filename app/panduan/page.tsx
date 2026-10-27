'use client';

import Link from 'next/link';
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, CircleAlert, ClipboardCheck, ClipboardPen, FileCheck2, Fingerprint,
  Grid2X2, HelpCircle, History, Layers3, LayoutList, ServerCog, UploadCloud, UserCog,
} from 'lucide-react';
import { Contents, FaqList, HelpSection, Note, type FaqGroup, type HelpPart } from '@/components/help/HelpParts';
import { MAX_STORAGE_DAYS, PERMIT_WARNING_DAYS } from '@/lib/company-pcb-status';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { MAX_COMPANY_UPLOAD_BYTES } from '@/lib/company-upload-shared';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-store';
import { REGULATION_FILE } from '@/lib/templates';

const linkClass = 'font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900';
const ADMIN_MB = MAX_UPLOAD_BYTES / 1024 / 1024;
const COMPANY_MB = MAX_COMPANY_UPLOAD_BYTES / 1024 / 1024;

const FAQ_GROUPS: FaqGroup[] = [
  {
    title: 'Sehari-hari',
    items: [
      { id: 'mulai', q: 'Saya baru memakai aplikasi ini. Mulai dari mana?', a: 'Buka Dashboard untuk melihat gambaran nasional: peta, jumlah peralatan, hasil uji, dan tonase. Lalu buka Perusahaan untuk melihat status PCBs setiap perusahaan, dan Unggahan perusahaan bila ada angka kuning di menu itu. Bagian "Peta menu" di halaman ini menjelaskan setiap menu.', go: { label: 'Buka Dashboard', path: '/dashboard' } },
      { id: 'satu-perusahaan', q: 'Bagaimana melihat data satu perusahaan saja?', a: 'Di Dashboard, pilih perusahaannya di card filter "Tampilkan data". Peta, angka, tonase, dan tabel langsung menampilkan perusahaan itu saja, ditambah kartu status PCBs dan hasil pemeriksaan datanya. Untuk perusahaan dengan beberapa unit, pilihan unit dan sub-unit muncul di sebelahnya.', go: { label: 'Buka Dashboard', path: '/dashboard' } },
      { id: 'angka-kuning', q: 'Apakah unggahan Excel perusahaan perlu diterima admin dulu?', a: 'Tidak lagi (sejak 26 Oktober 2026). Unggahan formulir 1.1–1.4 dari perusahaan langsung masuk ke inventaris setelah lolos pemeriksaan otomatis. Menu Unggahan perusahaan mencatat setiap unggahan; angka kuning hanya muncul untuk unggahan lama yang masih menunggu.', go: { label: 'Buka Unggahan perusahaan', path: '/upload/pemeriksaan' } },
      { id: 'halaman-perusahaan', q: 'Bagaimana melihat halaman seperti yang dilihat perusahaan?', a: 'Di menu Perusahaan, klik label hitam "ID SIMPEL …" di samping nama perusahaan. Halaman laporan perusahaan terbuka dengan tombol "Kembali ke halaman admin" di kiri bawah. Admin dapat mengisi dan mengubah datanya dari sana.', go: { label: 'Buka Perusahaan', path: '/companies' } },
      { id: 'ubah-data', q: 'Ada data yang salah. Bagaimana memperbaikinya?', a: 'Cari barisnya di tabel Dashboard atau halaman jenis alatnya (cari merek, nomor serial, kode, atau lokasi), lalu klik ikon pensil. Untuk data yang diisi lewat formulir, perbaikan lewat Isi formulir > Data tersimpan lebih lengkap karena semua isian formulir bisa diubah dan diperiksa ulang.' },
    ],
  },
  {
    title: 'Data & unggahan',
    items: [
      { id: 'beda-upload', q: 'Apa beda "Upload data" dengan "Unggahan perusahaan"?', a: `Upload data dipakai admin untuk mengimpor berkas Excel apa pun (format KLH, PLN, atau lainnya) langsung ke inventaris, dengan pemetaan kolom; batasnya ${ADMIN_MB} MB. Unggahan perusahaan berisi template resmi formulir 1.1–1.4 yang diunggah perusahaan sendiri (maks. ${COMPANY_MB} MB) dan langsung tersimpan; admin hanya melihat catatannya.` },
      { id: 'tambah-ganti', q: 'Apa arti "tambahkan" dan "ganti semua" pada unggahan perusahaan?', a: 'Pilihan perusahaan saat mengunggah. Tambahkan: baris berkas ditambahkan ke data formulir itu, baris yang sudah ada dilewati. Ganti semua: semua data formulir itu milik perusahaan dihapus lalu diganti isi berkas (perusahaan diminta konfirmasi dulu).', go: { label: 'Buka Unggahan perusahaan', path: '/upload/pemeriksaan' } },
      { id: 'revisi', q: 'Perusahaan mengirim berkas revisi lewat admin. Apakah datanya jadi dobel?', a: 'Tidak, bila di langkah terakhir Upload data dipilih "Ganti data dari unggahan sebelumnya" lalu dipilih unggahan lamanya: baris lama dihapus dan diganti isi sheet baru dalam satu langkah. Baris yang persis sama dengan data di database juga selalu dilewati.' },
      { id: 'temuan', q: 'Apa itu "temuan" dan "hasil pemeriksaan"?', a: 'Setiap baris yang diimpor diperiksa otomatis: koordinat tidak terbaca atau di laut, tahun di luar 1900 sampai sekarang, berat tidak wajar atau tidak sesuai daya, kolom wajib kosong, dan sebagainya. Sebagian diperbaiki otomatis (dicatat), sebagian hanya ditandai. Ringkasannya ada di Riwayat upload dan Kualitas data.' },
      { id: 'hapus-perusahaan', q: 'Bagaimana menghapus perusahaan yang dobel atau salah?', a: 'Di menu Perusahaan, klik Hapus di baris perusahaannya. Bila masih ada datanya, jendela konfirmasi menampilkan apa saja yang ikut terhapus dan meminta nama perusahaan diketik ulang. Penghapusan tidak dapat dibatalkan.', go: { label: 'Buka Perusahaan', path: '/companies' } },
    ],
  },
  {
    title: 'Akun & akses',
    items: [
      { id: 'buat-akun', q: 'Bagaimana membuat akun untuk rekan kerja atau perusahaan?', a: 'Di menu Akun pengguna, isi email, password (minimal 8 karakter), dan peran: admin, pemantau, atau perusahaan (dengan ID SIMPEL perusahaannya). Password bisa diganti kapan saja lewat tombol ubah. Tidak ada reset password lewat email; admin yang menggantinya.', go: { label: 'Buka Akun pengguna', path: '/akun' } },
      { id: 'pemantau', q: 'Apa yang bisa dilakukan akun pemantau?', a: 'Melihat semua data tanpa dapat mengubahnya, untuk pimpinan: Dashboard, halaman jenis alat, Roadmap, Kualitas data, dan Perusahaan. Menu yang mengubah data (Isi formulir, Upload data, ID SIMPEL, Akun pengguna) tidak tampil, dan tombol ubah/hapus disembunyikan.' },
      { id: 'lokal-web', q: 'Data di laptop berbeda dengan di web. Kenapa?', a: 'Aplikasi di laptop (localhost) memakai database Supabase lokal, sedangkan web memakai Supabase Cloud. Keduanya terpisah dan tidak sinkron otomatis. Sejak web dipakai penuh, data diubah lewat web; isian atau unggahan di laptop hanya ada di laptop.' },
    ],
  },
];

/** The parts of the guide, in order, for the contents list. */
const PARTS: HelpPart[] = [
  { id: 'faq', title: 'Pertanyaan umum', icon: HelpCircle },
  { id: 'menu', title: 'Peta menu', icon: LayoutList },
  { id: 'dashboard', title: 'Dashboard & peta', icon: Grid2X2 },
  { id: 'jenis-alat', title: 'Halaman jenis alat', icon: Layers3 },
  { id: 'formulir', title: 'Isi formulir', icon: ClipboardPen },
  { id: 'roadmap', title: 'Roadmap', icon: CalendarClock },
  { id: 'unggahan', title: 'Unggahan perusahaan', icon: FileCheck2 },
  { id: 'upload', title: 'Upload data', icon: UploadCloud },
  { id: 'riwayat', title: 'Riwayat & kualitas data', icon: History },
  { id: 'perusahaan', title: 'Perusahaan & status', icon: Building2 },
  { id: 'id-simpel', title: 'ID SIMPEL', icon: Fingerprint },
  { id: 'akun', title: 'Akun pengguna', icon: UserCog },
  { id: 'teknis', title: 'Catatan teknis', icon: ServerCog },
];

// A part of this guide, its icon from the contents list.
const Section = (props: Omit<React.ComponentProps<typeof HelpSection>, 'icon'>) => <HelpSection icon={PARTS.find((part) => part.id === props.id)?.icon} {...props} />;

/** Numbered steps, a title and a line each. */
function Steps({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <ol className="space-y-3">
      {items.map(([title, body], index) => (
        <li key={title} className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">{index + 1}</span>
          <div className="min-w-0 pt-0.5"><p className="font-semibold text-slate-900">{title}</p><div className="text-slate-600">{body}</div></div>
        </li>
      ))}
    </ol>
  );
}

/** Things on a page, a name and what it does, in two columns. */
function Parts({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([name, body]) => (
        <div key={name} className="rounded-xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold text-slate-900">{name}</dt>
          <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">{body}</dd>
        </div>
      ))}
    </dl>
  );
}

const go = (path: string, label: string) => <Link href={path} className={linkClass}>{label}</Link>;

/** The admin's guide: every menu in detail, the daily work, and the questions that come up. */
export default function AdminGuide() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Bantuan</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Panduan admin</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Cara memakai setiap menu admin Sistem Inventarisasi PCBs: memantau data nasional, memantau unggahan perusahaan, mengimpor Excel, mengelola perusahaan, ID SIMPEL, dan akun.</p>
      </header>

      {/* The contents stay in sight on the left while the guide scrolls. */}
      <div className="mt-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-6"><Contents parts={PARTS} /></div>
        </aside>

        <div className="space-y-5">
          <Section id="faq" title="Pertanyaan yang sering diajukan" description="Klik pertanyaan untuk melihat jawabannya, atau cari dengan kata kunci.">
            <FaqList groups={FAQ_GROUPS} resolve={(target) => target.path} placeholder="Cari pertanyaan, mis. unggahan, akun, revisi…" />
          </Section>

          <Section id="menu" title="Peta menu" description="Setiap menu di sidebar dan kegunaannya.">
            <Parts items={[
              ['Dashboard', 'Ringkasan nasional atau satu perusahaan: peta, jumlah peralatan, hasil uji minyak, tonase, dan tabel semua data.'],
              ['Inventarisasi (4 menu)', 'Satu halaman per jenis alat: trafo digunakan, trafo tidak digunakan, kapasitor, minyak dielektrik.'],
              ['Isi formulir', 'Mengisi atau memperbaiki laporan sebuah perusahaan, persis seperti halaman perusahaan.'],
              ['Roadmap', 'Jadwal rencana uji, penanganan, dan pengelolaan trafo, nasional atau per perusahaan.'],
              ['Upload data', `Impor berkas Excel (maks. ${ADMIN_MB} MB) ke inventaris dengan pemetaan kolom.`],
              ['Unggahan perusahaan', 'Catatan template Excel yang diunggah perusahaan. Datanya langsung masuk; angka kuning hanya untuk unggahan lama yang masih menunggu.'],
              ['Riwayat upload', 'Setiap sheet yang pernah diimpor beserta hasil pemeriksaannya.'],
              ['Kualitas data', 'Skor kelengkapan data dan daftar data yang perlu dilengkapi, bisa diunduh sebagai Excel.'],
              ['Perusahaan', 'Status PCBs nasional, daftar perusahaan, tambah, dan hapus.'],
              ['ID SIMPEL', 'Menjodohkan perusahaan dengan daftar PILAR agar punya ID SIMPEL.'],
              ['Akun pengguna', 'Akun login dan perannya, serta akun uji coba.'],
            ]} />
            <Note>Akun pemantau hanya melihat menu yang membaca data. Akun perusahaan tidak melihat menu ini sama sekali; mereka langsung masuk ke halaman laporannya sendiri.</Note>
          </Section>

          <Section id="dashboard" title="Dashboard & peta" description="Halaman pertama setelah masuk: gambaran nasional, atau satu perusahaan.">
            <p>Urutan isi Dashboard dari atas: peta sebaran, card filter, kartu perusahaan (bila satu perusahaan dipilih), angka ringkasan, tonase, lalu tabel data.</p>
            <h3 className="pt-1 font-semibold text-slate-900">Peta sebaran</h3>
            <Parts items={[
              ['Kelompok / Titik', 'Kelompok (bawaan): lingkaran berangka = jumlah data di area itu, warnanya porsi hasil uji. Titik: setiap lokasi satu titik kecil. Perbesar peta untuk melihat titik satuan.'],
              ['Warna: Hasil uji / Kategori', 'Hasil uji: oranye tua ≥ 50 ppm (batas konsentrasi atau lebih), biru < 50 ppm (di bawah batas konsentrasi), abu-abu belum ada hasil uji. Kategori: warna per jenis alat.'],
              ['Filter peta', 'Jenis alat, perusahaan, hasil uji, dan tahun, khusus untuk peta.'],
              ['Peta / Satelit, rumah, layar penuh', 'Ganti latar peta, kembali ke tampilan seluruh Indonesia, atau buka peta layar penuh.'],
              ['Klik titik', 'Membuka datanya di tabel di bagian bawah halaman.'],
              ['Keterangan warna', 'Card kecil di kiri bawah peta.'],
            ]} />
            <h3 className="pt-1 font-semibold text-slate-900">Filter, angka, dan tabel</h3>
            <Parts items={[
              ['Tampilkan data', 'Pilih satu perusahaan (dan unit/sub-unit bila ada). "Semua data" kembali ke nasional.'],
              ['Tahun pembuatan', `Semua, < ${TRAFO_FOCUS_YEAR}, atau ≥ ${TRAFO_FOCUS_YEAR}. Berlaku untuk angka, hasil uji, dan tonase. Saat halaman digulir, pilihan ini melayang di tengah atas.`],
              ['Kartu perusahaan', 'Saat satu perusahaan dipilih: status PCBs dan yang perlu dilakukan, serta hasil pemeriksaan data dengan pesan email yang tinggal disalin.'],
              ['Angka & grafik', 'Klik angka atau bagian grafik untuk menyaring tabel ke data itu.'],
              ['Tonase', 'Berat total trafo, per hasil uji, untuk trafo sebelum 1997 dan yang tahunnya tidak diketahui.'],
              ['Tabel data', 'Cari, saring (jenis alat, perusahaan, hasil uji, filter lanjutan), urutkan. Klik nama alat untuk melihat semua kolomnya; pensil untuk mengubah, tempat sampah untuk menghapus.'],
            ]} />
            <Note>Tabel memuat 50 baris dan menambah sendiri saat digulir ke bawah. Kolom berat terbagi tiga: kering, minyak, dan total.</Note>
          </Section>

          <Section id="jenis-alat" title="Halaman jenis alat" description="Empat menu di bawah Inventarisasi: satu jenis alat per halaman.">
            <p>Setiap halaman berisi ringkasan, grafik, dan tabel khusus jenis alat itu, dengan filter perusahaan yang sama seperti Dashboard.</p>
            <Parts items={[
              ['Trafo digunakan / tidak digunakan', `Jumlah per tahun produksi (sebelum ${TRAFO_FOCUS_YEAR}, ${TRAFO_FOCUS_YEAR} ke atas, tidak diketahui), hasil uji minyak dielektrik, dan tabelnya.`],
              ['Kapasitor', 'Dicocokkan dengan 72 nama dagang kapasitor PCBs di Lampiran II Permen LHK 29/2020, berdasarkan merek dan tahun.'],
              ['Minyak dielektrik', 'Merek minyak dicocokkan dengan 110 nama dagang minyak PCBs di Lampiran I Permen LHK 29/2020.'],
            ]} />
          </Section>

          <Section id="formulir" title="Isi formulir" description="Mengisi atau memperbaiki laporan perusahaan atas nama perusahaan.">
            <Steps items={[
              ['Pilih perusahaan', <>Di {go('/formulir', 'Isi formulir')}, pilih di kotak Perusahaan, atau klik perusahaan di daftar &ldquo;perlu perhatian&rdquo;. Perusahaan terakhir yang dibuka diingat untuk kunjungan berikutnya.</>],
              ['Pernyataan perusahaan', <>Memiliki trafo, atau tidak memiliki trafo dengan surat pernyataan (PDF). Surat yang diunggah perusahaan diperiksa di sini: klik <b>Terima</b>, atau <b>Tolak</b> dengan alasan yang akan dibaca perusahaan.</>],
              ['Pilih formulirnya', <>Tab Inventarisasi (1.1–1.4) dan Pengelolaan (2, 3, 4.2, 5).</>],
              ['Tambah data', <>Card &ldquo;Tambah data&rdquo;: <b>Isi lewat formulir</b> membuka formulir sebagai pop-up, satu data per simpan; <b>Unggah template Excel</b> untuk banyak data sekaligus. Unggahan oleh admin langsung tersimpan, tidak perlu diperiksa.</>],
              ['Data tersimpan & bukti dukung', <>Di bawahnya: daftar data yang sudah tersimpan untuk diubah atau dihapus, dan tautan Google Drive bukti dukung formulir 1.1–1.4.</>],
            ]} />
            <Note>Sebelum perusahaan dipilih, halaman menampilkan kerangkanya dalam keadaan terkunci. Tab tetap bisa diklik untuk melihat isi setiap formulir.</Note>
          </Section>

          <Section id="roadmap" title="Roadmap" description={`Rencana bulan dan tahun untuk setiap trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau tanpa tahun, dalam dua kelompok: masih digunakan dan tidak digunakan.`}>
            <Parts items={[
              ['Kapan diuji', 'Masih digunakan: trafo yang belum diuji.'],
              ['Kapan diretrofilling', 'Masih digunakan: trafo dengan hasil uji 50 ppm atau lebih (retrofilling atau penggantian). Hasil ujinya ditampilkan.'],
              ['Kapan dikelola', 'Tidak digunakan: setiap trafo, berapa pun hasil ujinya, jadi ppm-nya tidak ditampilkan.'],
              ['Keterangan', 'Catatan opsional di samping bulan rencana.'],
            ]} />
            <p>Tanpa perusahaan dipilih, {go('/roadmap', 'Roadmap')} menampilkan jadwal nasional. Pilih perusahaan untuk mengisi atau mengubah rencananya. Rencana yang belum ada, atau yang bulannya sudah lewat, membuat status perusahaan merah.</p>
          </Section>

          <Section id="unggahan" title="Unggahan perusahaan" description="Template Excel formulir 1.1–1.4 yang diunggah perusahaan.">
            <Steps items={[
              ['Langsung masuk', <>Sejak 26 Oktober 2026, unggahan perusahaan tidak perlu diterima admin. Setelah lolos pemeriksaan otomatis, datanya langsung masuk ke inventaris: <b>ditambahkan</b> (baris yang sudah ada dilewati) atau <b>mengganti semua</b> data formulir itu, sesuai pilihan perusahaan.</>],
              ['Pantau', <>Di {go('/upload/pemeriksaan', 'Unggahan perusahaan')}, lihat perusahaan, formulir, jumlah data, dan temuan pemeriksaan otomatis setiap unggahan. Unduh berkasnya bila perlu, atau buka halaman laporan perusahaannya.</>],
              ['Unggahan lama', <>Unggahan yang dikirim sebelum perubahan ini dan masih menunggu tetap bisa <b>diterima</b> atau <b>ditolak</b> dengan alasan.</>],
            ]} />
            <Note tone="warn">Karena tidak diperiksa admin lagi, cek temuan pada unggahan baru secara rutin dan hubungi perusahaannya bila datanya perlu diperbaiki.</Note>
          </Section>

          <Section id="upload" title="Upload data" description={`Impor berkas Excel ke inventaris oleh admin (maks. ${ADMIN_MB} MB).`}>
            <Steps items={[
              ['Pilih perusahaan dan berkas', <>Di {go('/upload', 'Upload data')}, pilih perusahaan pelapor (perusahaan terakhir diletakkan paling atas) atau ketik nama perusahaan baru, lalu pilih berkas .xlsx/.xls. Foto di dalam berkas besar dibuang otomatis, hanya tabelnya yang dikirim.</>],
              ['Pindai berkas', <>Semua sheet dipindai, kategorinya ditebak otomatis. Centang sheet yang diimpor dan perbaiki kategorinya bila salah. Peringatan muncul bila berkas yang sama persis sudah pernah diimpor.</>],
              ['Petakan kolom', <>Langkah 3 dari 3: kolom Excel dipasangkan ke kolom inventaris, oleh profil (KLH, PLN) atau tebakan kata kunci. Periksa kolom yang ditandai, pilih &ldquo;Abaikan&rdquo; untuk kolom di luar formulir.</>],
              ['Periksa data dulu', <>Semua baris diproses seperti saat impor tanpa menyimpan apa pun: tampil baris baru, yang sudah ada, temuan, dan tambahan pada dashboard (tahun &lt; {TRAFO_FOCUS_YEAR}, hasil lab ≥ 50 ppm, dan seterusnya).</>],
              ['Tambahkan atau ganti, lalu impor', <><b>Tambahkan sebagai data baru</b>, atau <b>Ganti data dari unggahan sebelumnya</b> untuk berkas revisi. Klik &ldquo;Verifikasi &amp; Impor&rdquo;.</>],
            ]} />
            <Note tone="warn">&ldquo;Ganti&rdquo; juga menimpa perubahan yang pernah dibuat lewat tombol ubah di tabel pada data unggahan lama.</Note>
          </Section>

          <Section id="riwayat" title="Riwayat upload & kualitas data" description="Melihat kembali hasil impor, dan seberapa lengkap datanya.">
            <Parts items={[
              ['Riwayat upload', <>Di {go('/upload/riwayat', 'Riwayat upload')}: setiap sheet yang diimpor, jumlah barisnya, duplikat yang dilewati, dan hasil pemeriksaan. Saring per perusahaan atau cari nama berkas.</>],
              ['Kualitas data', <>Di {go('/kualitas-data', 'Kualitas data')}: skor kelengkapan (Baik 90% ke atas, Perlu perhatian 70% sampai di bawah 90%, Kritis di bawah 70%), indikator per kelompok (lokasi, identitas, teknis, hasil impor), dan perbandingan antar perusahaan.</>],
              ['Klik indikator', 'Menyaring tabel di bawahnya ke data yang bermasalah untuk indikator itu, untuk langsung diperbaiki.'],
              ['Unduh laporan', 'Excel berisi ringkasan, daftar data yang perlu dilengkapi atau diperbaiki per kode alat, dan keterangannya, untuk dikirim ke perusahaan.'],
            ]} />
          </Section>

          <Section id="perusahaan" title="Perusahaan & status PCBs" description="Daftar perusahaan pemilik data dan status nasionalnya.">
            <Parts items={[
              ['Status PCBs nasional', 'Jumlah perusahaan merah, kuning, hijau, dan belum melapor. Klik warnanya untuk melihat daftar perusahaannya, lalu klik perusahaan untuk menuju barisnya.'],
              ['Tambah perusahaan', 'Ketik nama di kotak "Nama perusahaan baru" lalu Tambah.'],
              ['Daftar perusahaan', 'Diurutkan dan disaring sesuai pilihan. Setiap baris: label ID SIMPEL (membuka halaman laporannya), status, tanggal terakhir diubah, status kirim hasil pemeriksaan, dan isi data.'],
              ['Hapus', 'Menghapus perusahaan beserta semua datanya, setelah konfirmasi.'],
            ]} />
            <h3 className="pt-1 font-semibold text-slate-900">Arti status</h3>
            <div className="space-y-3">
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <p className="flex items-center gap-2 font-semibold text-rose-800"><CircleAlert className="h-4 w-4" /> Perlu tindakan (merah)</p>
                <p className="mt-1 text-slate-700">Ada trafo sebelum {TRAFO_FOCUS_YEAR} tanpa rencana uji, penanganan (≥ 50 ppm), atau pengelolaan (tidak digunakan); ada rencana yang lewat tanggal; atau menyimpan limbah PCBs tanpa izin TPS yang berlaku.</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Perlu perhatian (kuning)</p>
                <p className="mt-1 text-slate-700">Rencana sudah ada tetapi belum selesai; izin TPS berakhir dalam {PERMIT_WARNING_DAYS} hari atau limbah disimpan lebih dari {MAX_STORAGE_DAYS} hari; ketentuan teknis dijawab &ldquo;Tidak&rdquo;; atau kelengkapan administrasi (bukti dukung, pernyataan, surat) belum beres.</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Aman (hijau)</p>
                <p className="mt-1 text-slate-700">Semua trafo sebelum {TRAFO_FOCUS_YEAR} sudah diuji di bawah 50 ppm atau sudah dikelola, dan tidak ada catatan lain; atau surat pernyataan tidak memiliki trafo sudah diterima.</p>
              </div>
            </div>
            <Note>Status dihitung ulang otomatis setiap data berubah. Kuning yang hanya karena administrasi ditandai tersendiri di status nasional.</Note>
          </Section>

          <Section id="id-simpel" title="ID SIMPEL" description="Menjodohkan perusahaan di inventaris dengan catatannya di daftar PILAR.">
            <Steps items={[
              ['Muat daftar PILAR', <>Simpan ekspor tabel Company dari PILAR (.csv) di <code className="rounded bg-slate-100 px-1 text-xs">Data-inventaris/id_simpel/</code>, lalu jalankan <code className="rounded bg-slate-100 px-1 text-xs">npm run simpel:load</code> di laptop.</>],
              ['Hubungkan yang cocok persis', <>Di {go('/id-simpel', 'ID SIMPEL')}, tombol &ldquo;Hubungkan semua yang cocok persis&rdquo; menjodohkan perusahaan yang namanya sama persis dengan satu catatan PILAR.</>],
              ['Pilih yang lain', <>Untuk perusahaan yang &ldquo;perlu dipilih&rdquo;, klik dan pilih catatan PILAR yang benar, atau cari dengan nama lain, NPWP, NIB, atau ID SIMPEL.</>],
              ['Lepas bila salah', <>Hubungan yang keliru bisa dilepas lalu dipilih ulang.</>],
            ]} />
            <Note>ID SIMPEL membuka halaman laporan perusahaan (/lapor/ID SIMPEL) dan akan dipakai untuk login dari PILAR / SIMPEL. Perusahaan tanpa ID SIMPEL belum bisa punya akun perusahaan.</Note>
          </Section>

          <Section id="akun" title="Akun pengguna" description="Siapa yang bisa masuk, dan apa yang bisa dilakukannya.">
            <Parts items={[
              ['Admin', 'Melihat dan mengubah semua data, mengelola akun.'],
              ['Pemantau', 'Melihat semua data tanpa dapat mengubahnya (pimpinan).'],
              ['Perusahaan', 'Hanya melihat dan mengisi data perusahaannya sendiri, lewat halaman laporannya.'],
              ['Akun uji coba', 'Perusahaan uji ZZ Uji A–F (ID SIMPEL palsu UJI-…) dengan satu password bersama. "Perbarui" membuat yang belum ada dan mengganti password; "Ulang dari awal" mengembalikan isian perusahaan uji ke data awal.'],
            ]} />
            <Steps items={[
              ['Buat akun', <>Di {go('/akun', 'Akun pengguna')}: email, password (minimal 8 karakter), peran, dan ID SIMPEL untuk peran perusahaan.</>],
              ['Ubah peran atau password', <>Tombol ubah di baris akunnya. Kosongkan password bila tidak diganti.</>],
              ['Hapus akun', <>Pemiliknya tidak bisa login lagi; data perusahaannya tidak ikut terhapus.</>],
            ]} />
          </Section>

          <Section id="teknis" title="Catatan teknis" description="Hal yang perlu diketahui saat menjalankan aplikasi.">
            <Parts items={[
              ['Web dan laptop', 'Web memakai Supabase Cloud, aplikasi di laptop (localhost) memakai Supabase lokal. Datanya terpisah; ubah data lewat web.'],
              ['Pesan "AuthRetryableFetchError"', 'Di laptop: Supabase lokal (Docker) masih menyala. Tunggu beberapa detik lalu muat ulang; cek dengan npx supabase status.'],
              ['Preloader', 'Animasi logo saat aplikasi dibuka hanya muncul sekali per sesi browser.'],
              ['Peraturan', <><a href={REGULATION_FILE.file} target="_blank" rel="noreferrer" className={linkClass}>{REGULATION_FILE.title}</a>: batas PCBs 50 ppm, lampiran nama dagang.</>],
            ]} />
            <p className="flex items-start gap-2 text-xs text-slate-500"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" /> Panduan untuk perusahaan ada di menu Bantuan pada halaman laporan perusahaan.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
