'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, BookOpen, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, ClipboardPen, Download, FileSpreadsheet, FileText,
  Gauge, HelpCircle, Lightbulb, ListOrdered, MapPin, MessageCircle, Paperclip, Plus, Search, X,
} from 'lucide-react';
import { PortalHeader, PortalSubnav, useCompanyPortal } from '@/components/company/CompanyPortal';
import { adminContactLink } from '@/lib/contact';
import { MAX_STORAGE_DAYS, PERMIT_WARNING_DAYS } from '@/lib/company-pcb-status';
import { MAX_COMPANY_UPLOAD_BYTES } from '@/lib/company-upload-shared';
import { EVIDENCE_ITEMS } from '@/lib/evidence';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';
import { REGULATION_FILE } from '@/lib/templates';

const HIGHLIGHT = ['ring-4', 'ring-emerald-500/40'];
const UPLOAD_MB = MAX_COMPANY_UPLOAD_BYTES / 1024 / 1024;
const linkClass = 'font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900';

/** Where an answer or a step leads: a page of the company's area, with its query. */
type Goto = { label: string; path: string; query?: Record<string, string> };
type Faq = { id: string; q: string; a: string; go?: Goto };

const FAQ_GROUPS: Array<{ title: string; items: Faq[] }> = [
  { title: 'Umum', items: [
    { id: 'wajib', q: 'Siapa yang wajib mengisi laporan ini?', a: `Setiap perusahaan yang memiliki atau pernah memiliki peralatan yang berpotensi mengandung PCBs: transformator (trafo), kapasitor, atau minyak dielektrik, sesuai ${REGULATION_FILE.title}. Perusahaan yang tidak memiliki peralatan tersebut tetap melapor dengan menyatakan "Tidak memiliki peralatan" disertai surat pernyataan.` },
    { id: 'tidak-punya', q: 'Perusahaan kami tidak memiliki trafo, kapasitor, maupun minyak dielektrik. Apa yang diisi?', a: 'Di menu Isi formulir, pada bagian Kepemilikan peralatan pilih "Tidak memiliki peralatan", isi tanggal surat, lalu unggah surat pernyataan bertanda tangan dan bermeterai dengan kop perusahaan (PDF, JPG, atau PNG, maksimal 2 MB). KLH akan memverifikasi suratnya. Bila ditolak, alasannya tampil di kartu yang sama dan surat yang sudah diperbaiki bisa diunggah ulang.', go: { label: 'Buka Kepemilikan peralatan', path: '/formulir', query: { bagian: 'pernyataan' } } },
    { id: 'tahun-1997', q: `Trafo kami buatan ${TRAFO_FOCUS_YEAR} ke atas. Apakah harus diisi satu per satu?`, a: `Tidak. Formulir 1.1 dan 1.2 hanya untuk trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau yang tahun pembuatannya tidak diketahui. Trafo ${TRAFO_FOCUS_YEAR} ke atas cukup dicatat jumlah dan total tonasenya di bagian "Trafo ${TRAFO_FOCUS_YEAR} ke atas yang tidak didata satu per satu" pada Kepemilikan peralatan.` },
    { id: 'unit', q: 'Perusahaan kami punya beberapa unit dengan ID SIMPEL yang sama.', a: 'Setiap unit dilaporkan terpisah. Pilih unit yang akan diisi di awal; nama unit yang sedang dibuka tampil di kartu kiri atas sidebar. Semua menu (Beranda, Isi formulir, Roadmap) hanya menampilkan data unit tersebut.' },
    { id: 'batas-waktu', q: 'Apakah data bisa diubah setelah disimpan?', a: 'Bisa, kapan saja. Laporan ini bersifat berkelanjutan: perbarui datanya setiap ada perubahan, misalnya trafo baru diuji, diganti, atau sudah dikelola.' },
  ] },
  { title: 'Mengisi formulir', items: [
    { id: 'ubah-data', q: 'Data yang sudah tersimpan salah. Bagaimana mengubahnya?', a: 'Buka formulirnya di menu Isi formulir. Di bagian "Data tersimpan" klik ikon ubah pada baris yang salah, perbaiki di jendela yang muncul, lalu Simpan. Ikon tempat sampah menghapus baris tersebut setelah dikonfirmasi.', go: { label: 'Buka Isi formulir', path: '/formulir' } },
    { id: 'wajib-isi', q: 'Kolom mana saja yang wajib diisi?', a: 'Kolom wajib ditandai bintang (*). Untuk formulir 1.1 misalnya: nama/merek, nomor serial, tahun pembuatan, lokasi peralatan, dan titik koordinat. Bila ada yang terlewat, formulir tidak tersimpan dan kolom yang kurang ditandai merah serta langsung ditampilkan.' },
    { id: 'banyak-data', q: 'Kami punya puluhan trafo. Apakah ada cara lebih cepat dari mengisi satu per satu?', a: 'Ada dua cara. Pertama, tombol "Simpan & tambah lagi" di jendela formulir menyimpan data lalu langsung membuka formulir kosong berikutnya (pintasan Ctrl+Enter untuk menyimpan). Kedua, unggah template Excel: unduh template resmi, isi semua baris, lalu unggah di card "Tambah data" pada formulir yang sesuai.' },
    { id: 'draf', q: 'Jendela formulir tertutup sebelum disimpan. Apakah isiannya hilang?', a: 'Bila ada isian yang belum disimpan, aplikasi menanyakan dulu sebelum menutup jendela. Isian yang sudah disimpan selalu tampil di "Data tersimpan".' },
    { id: 'belum-diuji', q: 'Trafo kami belum pernah diuji kandungan PCBs-nya. Apa yang diisi?', a: 'Kosongkan bagian hasil uji. Trafo tersebut dihitung "Belum diuji" dan perlu diberi tanggal rencana uji di menu Roadmap. Setelah diuji, ubah datanya dan isi jenis uji, metode, penyedia jasa, serta konsentrasi PCBs (ppm).' },
  ] },
  { title: 'Template Excel', items: [
    { id: 'unggah-belum-masuk', q: 'Kenapa unggahan Excel kami belum masuk ke data?', a: 'Unggahan formulir 1.1–1.4 diperiksa KLH dulu sebelum masuk ke data. Statusnya (menunggu, diterima, atau ditolak beserta alasannya) terlihat di card Tambah data pada formulirnya dan di menu Riwayat unggahan. Unggahan formulir 2–5 langsung tersimpan setelah lolos pemeriksaan otomatis.', go: { label: 'Lihat riwayat unggahan', path: '/unggah' } },
    { id: 'bukan-template', q: 'Unggahan kami ditolak karena "bukan template resmi". Kenapa?', a: 'Sistem mengenali kolom dari judulnya. Unduh template resmi di menu Template Excel, isi mulai baris di bawah contoh, dan jangan memindah, menghapus, menggabungkan, atau mengganti nama kolomnya.', go: { label: 'Unduh template resmi', path: '/template' } },
    { id: 'tambah-ganti', q: 'Apa beda "Menambahkan" dan "Mengganti semua" saat mengunggah formulir 1.1–1.4?', a: '"Menambahkan" memasukkan baris baru dan melewati baris yang sudah ada di data perusahaan. "Mengganti semua" menghapus seluruh data formulir itu (termasuk yang diisi lewat formulir) lalu menggantinya dengan isi berkas. Gunakan "Mengganti semua" hanya bila berkas Excel Anda adalah daftar lengkap terbaru.' },
    { id: 'batal-unggah', q: 'Kami salah mengunggah berkas. Bisakah dibatalkan?', a: 'Selama statusnya masih "Menunggu pemeriksaan KLH", unggahan bisa dibatalkan dari daftar unggahan di card Tambah data formulirnya. Satu formulir hanya bisa punya satu unggahan yang menunggu; batalkan dulu yang lama bila ingin mengirim berkas pengganti.' },
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
    { id: 'tidak-tampil', q: 'Sebagian peralatan tidak tampil di peta Beranda.', a: 'Peralatan tanpa koordinat yang terbaca tidak tampil di peta; jumlahnya disebutkan di atas peta Beranda. Lengkapi koordinatnya lewat Data tersimpan, ikon ubah.' },
  ] },
];

/** The parts of the guide, in order, for the contents list. */
const PARTS: Array<{ id: string; title: string; icon: typeof BookOpen }> = [
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

/** One part of the guide; outlined for a moment when opened by a link to it (#id, e.g. from the status card). */
function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const part = PARTS.find((entry) => entry.id === id);
  const Icon = part?.icon ?? BookOpen;
  useEffect(() => {
    const element = ref.current;
    if (!element || window.location.hash !== `#${id}`) return;
    // The page renders after the company loads, too late for the browser's own jump.
    element.scrollIntoView({ block: 'start' });
    element.classList.add(...HIGHLIGHT);
    const timer = window.setTimeout(() => element.classList.remove(...HIGHLIGHT), 2500);
    return () => window.clearTimeout(timer);
  }, [id]);
  return (
    <section ref={ref} id={id} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white transition-shadow duration-700">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-4.5 w-4.5" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </header>
      <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

/** A tip or caution set apart from the text. */
function Note({ tone = 'tip', children }: { tone?: 'tip' | 'warn'; children: React.ReactNode }) {
  const Icon = tone === 'tip' ? Lightbulb : AlertTriangle;
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${tone === 'tip' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span>
    </p>
  );
}

/** The questions, each opening its answer; the search keeps the matching ones, opened. */
function FaqList() {
  const { href } = useCompanyPortal();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // #faq-<id> opens that answer (a link from elsewhere in the app).
  useEffect(() => {
    const id = window.location.hash.startsWith('#faq-') ? window.location.hash.slice(5) : null;
    if (!id) return;
    const timer = window.setTimeout(() => {
      setOpen(new Set([id]));
      document.getElementById(`faq-${id}`)?.scrollIntoView({ block: 'center' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = FAQ_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => words.every((word) => `${item.q} ${item.a}`.toLowerCase().includes(word))) }))
    .filter((group) => group.items.length > 0);
  const searching = words.length > 0;
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      <label className="flex items-center gap-2 rounded-xl border border-transparent bg-slate-100 px-3 py-2.5 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-600/10">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari pertanyaan, mis. koordinat, ditolak, roadmap…" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Hapus pencarian" className="rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-4 w-4" /></button>}
      </label>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Tidak ada pertanyaan yang cocok dengan &ldquo;{query}&rdquo;. Coba kata lain, atau hubungi admin di bagian bawah halaman.</p>
      ) : groups.map((group) => (
        <div key={group.title}>
          <h3 className="mb-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
          <ul className="space-y-3">
            {group.items.map((item) => {
              const expanded = searching || open.has(item.id);
              return (
                <li key={item.id} id={`faq-${item.id}`} className={`scroll-mt-4 overflow-hidden rounded-2xl border bg-white transition-shadow duration-300 ${expanded ? 'border-emerald-200 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]' : 'border-slate-200 hover:border-slate-300'}`}>
                  <button type="button" onClick={() => toggle(item.id)} aria-expanded={expanded} className={`flex w-full items-center gap-4 px-6 py-4 text-left ${expanded ? 'bg-gradient-to-b from-slate-50 to-white' : ''}`}>
                    <span className={`min-w-0 flex-1 text-[15px] font-semibold transition-colors ${expanded ? 'text-emerald-700' : 'text-slate-900'}`}>{item.q}</span>
                    {expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-emerald-700" /> : <Plus className="h-5 w-5 shrink-0 text-slate-800" strokeWidth={2.5} />}
                  </button>
                  {/* Opens smoothly: the row grows from 0fr to 1fr. */}
                  <div inert={!expanded} className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      <div className="space-y-3 px-6 pb-5 text-sm leading-7 text-slate-500">
                        <p>{item.a}</p>
                        {item.go && <Link href={href(item.go.path, item.go.query)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">{item.go.label} →</Link>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

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

/** The contents beside the sidebar, one floating pill per part, the part being read in green. */
function Contents() {
  const [current, setCurrent] = useState(PARTS[0].id);
  useEffect(() => {
    // The last part whose top has passed the upper third of the screen.
    const update = () => {
      let found = PARTS[0].id;
      for (const part of PARTS) {
        const element = document.getElementById(part.id);
        if (element && element.getBoundingClientRect().top <= window.innerHeight / 3) found = part.id;
      }
      // At the bottom, the last part counts even when short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) found = PARTS[PARTS.length - 1].id;
      setCurrent(found);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return (
    <nav aria-label="Daftar isi">
      <ul className="flex flex-col items-start gap-2">
        {PARTS.map((part) => {
          const active = part.id === current;
          return (
            <li key={part.id}>
              <a href={`#${part.id}`} aria-current={active ? 'location' : undefined}
                onClick={(event) => { event.preventDefault(); document.getElementById(part.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${part.id}`); }}
                className={`inline-flex origin-left items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition duration-200 ease-out hover:scale-105 hover:shadow-md ${active ? 'border-emerald-700 bg-emerald-700 font-semibold text-white shadow-md' : 'border-slate-200 bg-white font-medium text-slate-600 shadow-sm hover:text-slate-900'}`}>
                <part.icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} /> {part.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** How to report, what the status means, each part of the work in detail, and who to ask. */
export default function CompanyHelp() {
  const { href } = useCompanyPortal();
  const contact = adminContactLink('Halo admin, saya butuh bantuan pengisian laporan Inventarisasi PCBs.');
  const evidenceCounts = Object.values(EVIDENCE_ITEMS).map((items) => items.length);

  return (
    <>
      <PortalHeader title="Bantuan" description="Panduan lengkap pelaporan Inventarisasi PCBs: pertanyaan umum, langkah melapor, arti status, setiap formulir, template Excel, roadmap, dan kontak admin." />

      <PortalSubnav><Contents /></PortalSubnav>

      <div className="space-y-5">
        <Section id="faq" title="Pertanyaan yang sering diajukan" description="Klik pertanyaan untuk melihat jawabannya, atau cari dengan kata kunci.">
          <FaqList />
        </Section>

        <Section id="langkah" title="Langkah melapor" description="Urutan pengisian dari awal sampai status hijau.">
          <ol className="space-y-3">
            {[
              ['Nyatakan kepemilikan peralatan', <>Di menu <Link href={href('/formulir', { bagian: 'pernyataan' })} className={linkClass}>Isi formulir</Link>, bagian Kepemilikan peralatan: pilih &ldquo;Memiliki peralatan&rdquo;, atau &ldquo;Tidak memiliki peralatan&rdquo; dengan surat pernyataan. Trafo buatan {TRAFO_FOCUS_YEAR} ke atas cukup jumlah dan tonasenya.</>],
              ['Isi formulir 1.1–1.4', <>Data setiap trafo (masih digunakan dan tidak digunakan), kapasitor, dan minyak dielektrik. Isi lewat formulir satu per satu, atau unggah template Excel lewat card &ldquo;Tambah data&rdquo; di setiap formulir.</>],
              ['Lengkapi bukti dukung', <>Tempel tautan Google Drive untuk setiap dokumen di bagian Bukti dukung di bawah formulir 1.1–1.4.</>],
              ['Atur roadmap', <>Di menu <Link href={href('/roadmap')} className={linkClass}>Roadmap</Link>, beri tanggal rencana untuk setiap trafo buatan sebelum {TRAFO_FOCUS_YEAR}: kapan diuji, ditangani, atau dikelola.</>],
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
              <p className="mt-2 text-slate-700">Tidak ada yang perlu dilakukan: tidak ada trafo buatan sebelum {TRAFO_FOCUS_YEAR}, atau semuanya sudah diuji di bawah 50 ppm, atau yang tidak digunakan sudah dikelola. Perusahaan yang menyatakan tidak memiliki peralatan menjadi hijau setelah suratnya diterima KLH.</p>
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
            <li>Buka menu <Link href={href('/roadmap')} className={linkClass}>Roadmap</Link>. Gunakan filter (Tanpa rencana, Lewat tanggal, dan lainnya) untuk menemukan trafo yang perlu diatur.</li>
            <li>Centang satu atau beberapa trafo, pilih tanggal rencana, lalu simpan. Tanggal baru menggantikan rencana yang belum selesai.</li>
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
