# Sistem Inventarisasi PCBs

Aplikasi inventarisasi **Polychlorinated Biphenyls (PCBs)** milik Direktorat Pengelolaan B3, Kementerian Lingkungan Hidup. Perusahaan melaporkan peralatannya (transformator, kapasitor, minyak dielektrik) lewat formulir web atau template Excel; admin juga dapat mengimpor laporan Excel dalam format apa pun. Data diperiksa otomatis, lalu dirangkum di dashboard, peta, tabel, dan status PCBs merah / kuning / hijau per perusahaan sesuai Permen LHK No. P.29/2020.

## Tech Stack

| Bagian | Teknologi |
|---|---|
| Aplikasi | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, ikon lucide-react |
| Grafik & peta | Recharts 3, Leaflet 1.9 (peta dasar Esri: abu-abu terang dan satelit) |
| Baca Excel | SheetJS (`xlsx` 0.20.3, disimpan di `vendor/` karena versi baru tidak lagi terbit di npm) |
| Database & login | Supabase: PostgreSQL 17, Auth, Storage, Row Level Security, fungsi RPC untuk statistik |
| Web | Vercel + Supabase Cloud, data lengkap |
| Offline | Docker + Supabase CLI (Supabase lokal per laptop), script Node.js di `scripts/offline/` |
| Sinkronisasi data | Repo GitHub private `PCBs-Inventory-Data` (CSV per tabel) |

---

## Cara kerja: web dan offline

Satu kode yang sama berjalan di dua tempat.

| | **Web** (utama) | **Offline** |
|---|---|---|
| Alamat | https://pcbs-inventory-system.vercel.app | http://localhost:3000, lihat **[OFFLINE.md](OFFLINE.md)** |
| Database | Supabase Cloud, **sumber data utama** | Supabase lokal di Docker, salinan untuk diolah di laptop |
| Pengguna | Admin, pemantau (pimpinan), dan perusahaan | Admin |
| Fitur | Semua | Semua |

Sejak 13 Oktober 2026 (masa pengujian) web berjalan penuh dengan data asli: data disalin sekali ke cloud dengan `npm run data:to-cloud`, dan sejak itu **data diubah lewat web**. Database lokal dan cloud terpisah: yang diisi di laptop tidak tampil di web, dan sebaliknya. Nanti aplikasi dan datanya dipindah ke server kantor dan dihubungkan ke PILAR / SIMPEL.

Keduanya wajib login. Akun dibuat admin di menu **Akun pengguna**, dan pendaftaran dari halaman login ditutup.

---

## Pengguna dan peran

| Peran | Yang bisa dilakukan |
|---|---|
| **Admin** | Semua: data, unggah, verifikasi unggahan dan surat pernyataan perusahaan, ID SIMPEL, akun |
| **Pemantau** | Melihat dashboard, perusahaan, roadmap, kualitas data, dan panduan; tidak dapat mengubah apa pun (untuk pimpinan) |
| **Perusahaan** | Hanya area perusahaannya sendiri, `/lapor/<ID SIMPEL>`: beranda, formulir, roadmap, template, riwayat unggahan, bantuan |

Akun uji coba ZZ Uji A–F (satu skenario status per perusahaan uji) dibuat dari halaman Akun pengguna.

---

## Fitur

### Dashboard nasional

| Bagian | Isi |
|---|---|
| Filter | Satu kartu: **Tampilkan data** (Perusahaan › Unit Induk › Unit Pelaksana, bisa dicari, berlaku untuk seluruh halaman) dan **Tahun pembuatan** (Semua / < 1997 / ≥ 1997). Saat kartu angka di-scroll, tombol tahun ikut melayang di tengah atas, dengan warna berbeda per pilihan. |
| Peta sebaran | Dibuka pertama. Titik kecil (bawaan) atau kelompok per wilayah berangka dengan cincin warna per status, filter kategori / perusahaan / Status PCBs / tahun, peta atau satelit, layar penuh, legenda di kiri bawah. |
| Ringkasan | Total transformator, kapasitor, dan minyak dielektrik; per jenis trafo (digunakan dan tidak digunakan): tahun produksi dan Status PCBs (< 2, 2 sampai < 50, ≥ 50 ppm, belum diuji). |
| Tonase transformator | Tonase < 1997, ≥ 1997, dan tanpa tahun, ditambah tonase ≥ 1997 dari pernyataan perusahaan (dicatat terpisah); grafik per kadar PCBs (≥ 50 ppm, < 50 ppm, belum diuji), skala logaritmik. |
| Tabel data | Semua kolom, baris belang agar mudah dibaca, berat dalam tiga kolom (kering, minyak, total, kg), pencarian, filter, edit (termasuk koordinat) dan hapus. Baris dimuat 50 per langkah saat di-scroll. |

Hampir semua angka bisa diklik untuk membuka datanya di tabel.

### Halaman per kategori

Trafo digunakan, trafo tidak digunakan, kapasitor, dan minyak dielektrik, masing-masing dengan kartu angka, grafik, tabel, dan peta.

- **Kapasitor:** daftar 72 nama dagang kapasitor yang mengandung PCBs (**Lampiran II** Permen LHK No. P.29/2020), dicocokkan dengan merek dan tahun di data: *berpotensi PCBs*, *perlu dicek* (tahun kosong), atau *di luar batas tahun*.
- **Semua kategori:** daftar 110 nama dagang minyak dielektrik yang mengandung PCBs (**Lampiran I**), dicocokkan dengan merek minyak di data. Tulisan seperti "non pcb oil" tidak dihitung.

### Area perusahaan

`/lapor/<ID SIMPEL>`: semua yang dilaporkan satu perusahaan, dengan menu samping sendiri dan tampilan yang pas di ponsel. Bila satu ID SIMPEL dipakai beberapa unit/pabrik, unitnya dipilih dulu (`?unit=`). Ini juga pintu masuk dari PILAR/SIMPEL nanti.

| Menu | Isi |
|---|---|
| Beranda | Kartu status PCBs beserta langkah perbaikannya, unggahan yang menunggu atau ditolak, lalu **tabel data peralatan** perusahaan (ubah lewat pop-up formulir, atau hapus). Klik angka untuk menyaring tabel. |
| Isi formulir | Satu kartu **Tambah data** per formulir: isi formulir (pop-up) atau unggah template Excel. |
| Roadmap | Tanggal rencana uji / penanganan / pengelolaan dengan catatan opsional. |
| Template Excel | Unduh template resmi 1.1–5 beserta langkah pengisiannya. |
| Riwayat unggahan | Status setiap unggahan Excel: menunggu, diterima, atau ditolak beserta alasannya. |
| Bantuan | FAQ yang bisa dicari dan panduan setiap bagian, dengan daftar isi di samping. |

Admin membuka halaman yang sama lewat label ID SIMPEL di halaman Perusahaan, atau lewat **Isi formulir** dan **Roadmap** dengan pemilih perusahaan. Sebelum perusahaan dipilih, Isi formulir menampilkan perusahaan yang perlu perhatian dan pratinjau laporan yang terkunci, dan Roadmap menampilkan jadwal nasional. Perusahaan terakhir yang dibuka diingat (`?company=`).

### Formulir pelaporan

- **Kepemilikan dan pernyataan perusahaan:** bila sudah ada data, kepemilikan dibaca dari data, ditambah isian opsional jumlah dan tonase trafo 1997 ke atas. Perusahaan yang **tidak memiliki** trafo, kapasitor, maupun minyak dielektrik wajib **unggah surat pernyataan** bertanda tangan (PDF/JPG/PNG, maks. 2 MB, bucket privat `surat-pernyataan`), lalu **diverifikasi admin** (menunggu / diterima / ditolak dengan alasan).
- **Formulir 1.1–1.4** sesuai template KLHK. Isian wajib ditandai, pilihan berupa dropdown, koordinat dibaca langsung atau dipilih di peta, berat trafo diisi kering / minyak / total. Setiap formulir punya **tabel bukti dukung** (tautan Google Drive). Formulir 1.1/1.2 hanya untuk trafo buatan sebelum 1997 atau tanpa tahun.
- **Data tersimpan** bisa diubah dengan editor formulir yang sama atau dihapus; perubahan diperiksa ulang di server.
- **Formulir 2 Pengurangan PCBs:** log perawatan trafo (mis. retrofilling) dengan hasil uji sebelum dan sesudah; bila dicentang, ikut memperbarui data trafo, status PCBs, dan roadmap.
- **Formulir 3 Penyimpanan:** logbook penyimpanan (masa simpan dan jumlah di TPS dihitung otomatis), 27 ketentuan teknis Ya/Tidak, dan izin TPS Limbah B3.
- **Formulir 4.2 Pengolahan:** 11 ketentuan teknis Ya/Tidak, persentase penaatan dihitung otomatis. Formulir 4.1 (untuk jasa pengolah) belum ada.
- **Formulir 5 Pelaporan:** neraca dihasilkan / dikelola / disimpan / belum dikelola (ton).
- **Unggah template Excel 2, 3, 4.2, dan 5:** dikenali dari judul dan kolomnya, diperiksa, ditampilkan, lalu disimpan (`lib/template-import.ts`).
- Isian 1.1–1.4 tersimpan sebagai draf di browser, diperiksa dengan aturan yang sama seperti unggahan Excel, lalu tercatat di Riwayat upload sebagai "Formulir web".

### Unggahan Excel perusahaan (1.1–1.4)

Perusahaan mengunggah template resmi (`.xlsx`/`.xls`, maks. 20 MB) dan memilih **tambahkan** atau **ganti semua**. Berkas diperiksa dan ditampilkan dulu, lalu menunggu di menu admin **Unggahan perusahaan** (angka kuning di menu = jumlah yang menunggu). Admin memeriksa temuan dan berkasnya, lalu **Terima** (diimpor seperti unggahan admin) atau **Tolak dengan alasan** (tampil ke perusahaan).

### Status PCBs & roadmap

Batas konsentrasi PCBs adalah **50 ppm**: 50 ppm ke atas berarti mengandung PCBs (Permen LHK 29/2020, Pasal 9 ayat 4 dan Pasal 10 ayat 4).

- **Kartu status** per perusahaan: ringkasan peralatan dan lampu untuk trafo buatan sebelum 1997 (atau tanpa tahun), dengan pesan yang mengarah ke perbaikannya.
  - **Merah:** trafo digunakan belum diuji tanpa rencana uji, ≥ 50 ppm tanpa rencana penanganan, trafo **tidak digunakan** tanpa rencana pengelolaan, rencana yang lewat tanggalnya, atau limbah PCBs disimpan tanpa izin TPS yang berlaku.
  - **Kuning:** semua sudah punya rencana yang belum jatuh tempo, atau ada hal administratif: pernyataan belum diisi atau tidak cocok, tahun pembuatan kosong, izin TPS berakhir dalam 90 hari, limbah disimpan lebih dari 365 hari, ketentuan teknis dijawab "Tidak", neraca masih menyisakan limbah, atau bukti dukung belum lengkap.
  - **Hijau:** tidak ada yang perlu dilakukan.
- **Ringkasan nasional** di halaman Perusahaan: jumlah perusahaan per warna dan belum melapor, angka nasional, dan daftar perusahaan per warna.
- **Roadmap:** tanggal rencana uji (belum diuji), penanganan (≥ 50 ppm), atau pengelolaan (tidak digunakan), untuk semua trafo atau yang dicentang, dengan catatan opsional. Rencana uji selesai sendiri begitu hasil ujinya masuk; penanganan ditandai selesai oleh admin atau oleh log perawatan yang menurunkan kadar di bawah 50 ppm.

### Impor data (admin)

| Langkah | Keterangan |
|---|---|
| Unggah | Workbook multi-sheet hingga 50 MB langsung ke Storage. Berkas di atas 10 MB dikirim tanpa fotonya (hanya data sel). |
| Aturan unggah perusahaan | Hanya .xlsx, maks. 1 MB, tanpa gambar, makro, atau kata sandi, memakai template KLHK, maks. 5.000 baris per sheet. Di menu Upload data ini hanya peringatan (`lib/upload-rules.ts`). |
| Deteksi format | Header dicari otomatis (termasuk judul bertingkat) dan dikenali sebagai Template KLHK atau format PLN beserta kategorinya. |
| Pemetaan kolom | Otomatis sesuai format. Admin cukup mengonfirmasi. |
| Pemeriksaan | Koordinat tidak terbaca, angka atau tanggal tidak valid, kolom penting kosong, dan duplikat, lengkap dengan nomor baris Excel. |
| Impor | Baris yang sudah ada dilewati. Berkas revisi bisa **mengganti** unggahan lama dalam satu transaksi. |
| Perbaikan otomatis | Koordinat DMS, koma desimal, lintang-bujur tertukar, dan tanda minus lintang yang hilang. Nama unit PLN diseragamkan. Berat trafo dalam ton dikoreksi; berat total dihitung dari ton bila kolom kg kosong. Baris contoh, kosong, dan tempelan ganda dilewati. |

### Perusahaan, kualitas data, dan bantuan

- **Perusahaan:** status PCBs tiap perusahaan, isi data, hasil pemeriksaan siap dikirim lewat email, dan status pengiriman. Daftar bisa diurutkan A–Z, Z–A, atau yang terakhir diubah.
- **ID SIMPEL** (`/id-simpel`): setiap perusahaan dijodohkan dengan catatannya di daftar PILAR. Tab **Perusahaan kita** (status terhubung / tanpa ID / perlu dipilih / tidak ditemukan / cocok persis, kandidat terbaik, Pilih / Cari) dan **Daftar PILAR**.
- **Kualitas data:** termasuk tanda **berat tidak sesuai daya** (lebih dari 50 kg per kVA). Skor kelengkapan per perusahaan dan unit, plus laporan temuan yang bisa diekspor ke Excel atau PDF.
- **Panduan admin** (`/panduan`): FAQ dan panduan rinci setiap menu admin, dengan daftar isi di kiri. Perusahaan punya menu **Bantuan** sendiri.
- Preloader berlogo KLH tampil sekali per sesi browser.

---

## Keamanan

- **Row Level Security** di semua tabel dan bucket: admin melihat semua, pemantau hanya membaca, perusahaan hanya baris perusahaannya (`my_company_ids()`). Batas ini berlaku juga bila API Supabase dipanggil langsung.
- **`proxy.ts`**: semua halaman dan API wajib login; halaman dan API diarahkan sesuai peran. Bila peran tidak dapat dibaca, akses ditolak (503).
- **Kunci service role** hanya di server (`lib/supabase/admin.ts`, dipakai halaman Akun pengguna) dan tidak pernah dikirim ke browser.
- **Storage privat**: perusahaan hanya menulis dan membaca foldernya sendiri; tautan unduh bertanda tangan dan kedaluwarsa.
- **Header keamanan** di setiap respons (`next.config.ts`): tidak bisa ditampilkan di dalam frame situs lain, `nosniff`, `Referrer-Policy`, dan kamera / mikrofon / lokasi dimatikan.
- `?next=` di halaman login hanya menerima alamat di dalam aplikasi.
- Repositori ini publik: tanpa data perusahaan (`Data-inventaris/`, `laporan/`) dan tanpa kunci (`.env*`).

---

## Memulai

### Pengguna (mode offline)

Ikuti **[OFFLINE.md](OFFLINE.md)**: pasang Docker dan Node.js, lalu jalankan `npm run offline`. Perintah ini menyalakan Supabase lokal, mengambil data terbaru, dan membuka aplikasi di http://localhost:3000.

### Pengembang

```bash
git clone https://github.com/aljuan14/PCBs-Inventory-System.git
cd PCBs-Inventory-System
npm install
npm run offline -- --dev   # Supabase lokal + next dev
```

`.env.local` ditulis otomatis oleh `npm run offline`. Untuk memakai Supabase Cloud, salin `.env.example` menjadi `.env.local` lalu isi URL dan anon key dari **Supabase → Project Settings → API**.

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run lint` | ESLint |
| `npm run build` | Build produksi (termasuk pemeriksaan TypeScript) |
| `npx tsx scripts/check-import.ts <folder>` | Uji coba impor atas berkas Excel asli tanpa database |
| `npm run offline` | Mode offline lengkap |
| `npm run data:push` / `data:pull` | Kirim / ambil data lewat repo private |
| `npm run data:to-cloud` | Salin seluruh data laptop ke Supabase Cloud (sekali saja; tanpa `--yes` hanya memeriksa) |
| `npm run simpel:load` | Muat daftar perusahaan PILAR (CSV terbaru di `Data-inventaris/id_simpel/`) |
| `npm run offline:user -- email password` | Buat akun admin atau ganti password (offline) |
| `npm run offline:user -- email password perusahaan <ID SIMPEL>` | Buat akun perusahaan (offline) |

Di web, akun dikelola di menu **Akun pengguna**, yang butuh `SUPABASE_SERVICE_ROLE_KEY` di Environment Variables Vercel (jangan diberi awalan `NEXT_PUBLIC_`).

### Mode ringkasan (cara lama)

Sebelum 13 Oktober 2026 web hanya berisi ringkasan yang dikirim dari laptop (`npm run web:publish`, `NEXT_PUBLIC_DATA_MODE=summary`). Mode ini masih ada di kode; `web:publish` menolak berjalan selama cloud berisi data lengkap. Detailnya di [OFFLINE.md](OFFLINE.md#khusus-admin-ringkasan-di-web).

---

## Database

Jalankan semua berkas di `supabase/migrations/` **berurutan**. Mode offline menjalankannya otomatis. Di Supabase Cloud, jalankan lewat SQL Editor sebelum kodenya di-push.

| Objek | Fungsi |
|---|---|
| `transformator_digunakan`, `transformator_tidak_digunakan`, `kapasitor`, `minyak_dielektrik` | Data inventaris per formulir KLHK (1.1–1.4) |
| `companies`, `simpel_companies` | Perusahaan (dengan ID SIMPEL, ID PILAR, terakhir diubah) dan daftar perusahaan PILAR |
| `import_batches`, `upload_sessions`, `unggahan_perusahaan` | Satu baris per sheet yang diimpor, per workbook yang diunggah, dan per unggahan perusahaan yang menunggu verifikasi |
| `inventory_stats_parts` | Ringkasan statistik yang dijaga trigger, sumber semua angka dashboard |
| `inventory_items` (view) | Gabungan keempat tabel untuk tabel dan peta |
| `user_access` | Peran setiap akun: admin, pemantau, atau perusahaan dengan ID SIMPEL-nya |
| `company_statements` | Pernyataan dan surat pernyataan perusahaan (riwayat; yang terbaru berlaku) |
| `pengurangan_pcbs`, `penyimpanan_logbook`, `pelaporan_neraca`, `ketentuan_teknis` | Formulir 2, 3, 5, dan ketentuan teknis formulir 3 dan 4.2 |
| `bukti_dukung` | Tautan bukti dukung formulir 1.1–1.4 |
| `equipment_plans` | Rencana uji / penanganan / pengelolaan per trafo atau untuk semua trafo perusahaan, dengan catatan |
| `company_feedback_log` | Riwayat pengiriman hasil pemeriksaan ke perusahaan |
| `summary_*` | Ringkasan untuk mode ringkasan web |
| RPC `inventory_stats`, `inventory_charts`, `inventory_units`, `inventory_quality` | Statistik, grafik, daftar unit, dan kualitas data |
| RPC `company_pcb_status`, `company_focus_transformers`, `pcb_status_all` | Status PCBs per perusahaan dan trafo yang butuh rencana |
| RPC `my_access`, `map_clusters`, `oil_brand_counts` | Peran pengguna, peta per wilayah, merek minyak |
| Storage `pcbs-files`, `surat-pernyataan` | Workbook yang diunggah dan surat pernyataan (privat) |

---

## Struktur Direktori

```text
app/                 Halaman: login, dashboard, kategori, formulir, roadmap, upload, perusahaan,
                     ID SIMPEL, akun, kualitas data, panduan, area perusahaan (lapor/); API
components/          Dashboard, peta, tabel, formulir, area perusahaan, bantuan
lib/                 Parser Excel, profil format, impor, aturan formulir, status PCBs, kueri
proxy.ts             Wajib login dan pembatasan halaman per peran
scripts/             Uji coba impor, impor massal, isi ulang berat, hapus data perusahaan
scripts/offline/     Mode offline, sinkronisasi data, salin ke cloud
supabase/            Migrasi SQL, seed, konfigurasi Supabase lokal
vendor/              SheetJS xlsx 0.20.3 (tarball resmi dari cdn.sheetjs.com)
```

Data inventaris asli (`Data-inventaris/`) tidak disimpan di repositori.

---

## Roadmap

**Sudah**
- [x] Impor multi-sheet (Template KLHK & PLN) dengan pemeriksaan, perbaikan koordinat, dan cek duplikat
- [x] Dashboard berbasis ringkasan trigger untuk ratusan ribu baris, peta, tonase, Lampiran I & II
- [x] Login, Row Level Security, peran admin / pemantau / perusahaan, akun dikelola dari web
- [x] Mode offline dan sinkronisasi antar-laptop; web berjalan penuh di Supabase Cloud
- [x] ID SIMPEL: perusahaan dihubungkan dengan daftar PILAR
- [x] Formulir web 1.1–1.4, 2, 3, 4.2, 5 dengan pernyataan, surat pernyataan, bukti dukung, dan unggah template
- [x] Status PCBs merah / kuning / hijau (batas 50 ppm), roadmap uji / penanganan / pengelolaan
- [x] Area perusahaan dengan menu sendiri, tabel data di beranda, tampilan ponsel, dan Bantuan
- [x] Unggahan Excel perusahaan yang diverifikasi admin
- [x] Panduan admin
- [x] Uji skala PLN (±350 ribu baris): semua halaman di bawah 1 detik

**Berikutnya**
- [ ] Login dari PILAR / SIMPEL (halaman `/masuk`), setelah cara dan kuncinya disepakati
- [ ] Daftar perusahaan dari API PILAR, bukan CSV manual
- [ ] Pindah ke server kantor: satu database lengkap dengan backup terjadwal
- [ ] Unggah ulang data PT PLN (Persero) yang sudah diperbaiki
- [ ] Uji mode offline di laptop Windows
