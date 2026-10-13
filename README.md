# Sistem Inventarisasi PCBs

Aplikasi inventarisasi **Polychlorinated Biphenyls (PCBs)** milik Direktorat B3, Kementerian Lingkungan Hidup. Laporan Excel dari banyak perusahaan diunggah, dipetakan ke formulir baku KLHK, diperiksa kualitasnya, lalu dirangkum di dashboard, peta, dan tabel.

## Tech Stack

| Bagian | Teknologi |
|---|---|
| Aplikasi | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, ikon lucide-react |
| Grafik & peta | Recharts 3, Leaflet 1.9 (peta dasar Esri: abu-abu terang dan satelit) |
| Baca Excel | SheetJS (`xlsx`) |
| Database & login | Supabase: PostgreSQL 17, Auth, Storage, Row Level Security, fungsi RPC untuk statistik |
| Offline | Docker + Supabase CLI (Supabase lokal per laptop), script Node.js di `scripts/offline/` |
| Web | Vercel + Supabase Cloud, hanya berisi ringkasan |
| Sinkronisasi data | Repo GitHub private `PCBs-Inventory-Data` (CSV per tabel) |

---

## Cara kerja: offline dan web

Satu kode yang sama berjalan di dua tempat.

```text
Laptop (offline, data lengkap)                         Web (Vercel, hanya ringkasan)
┌──────────────────────────────┐   npm run data:push   ┌──────────────────────────────┐
│ Supabase lokal di Docker     │──► repo data private  │ Supabase Cloud               │
│ unggah, periksa, edit, tabel │──► ringkasan (±5 MB) ─►│ dashboard, tonase, peta      │
└──────────────────────────────┘                       └──────────────────────────────┘
```

| | **Offline** | **Web** |
|---|---|---|
| Untuk | Admin yang mengolah data | Pimpinan yang memantau hasil |
| Isi database | Semua baris data (±356 ribu) | Ringkasan saja: angka, sel peta, jumlah merek |
| Fitur | Semua | Dashboard, status PCBs perusahaan, tonase, peta, daftar Lampiran I/II. Tanpa tabel, unggah, edit, formulir, roadmap |
| Cara menjalankan | `npm run offline`, lihat **[OFFLINE.md](OFFLINE.md)** | https://pcbs-inventory-system.vercel.app |

Keduanya wajib login. Akun dibuat oleh admin, dan pendaftaran dari halaman login ditutup. Web diperbarui otomatis setiap `npm run data:push` dari laptop admin (lihat [Memperbarui web](#memperbarui-web)).

---

## Fitur

### Dashboard nasional

| Bagian | Isi |
|---|---|
| Filter | Perusahaan › Unit Induk › Unit Pelaksana. Pemilih perusahaan bisa dicari dan berlaku untuk seluruh halaman. |
| Ringkasan | Total transformator, kapasitor, dan minyak dielektrik. Di bawahnya satu kolom per jenis trafo (digunakan dan tidak digunakan, masing-masing dengan latar warnanya): tahun produksi, lalu Status PCBs (< 2, 2–50, > 50 ppm, belum diuji) dengan tombol **< 1997 / Semua**. |
| Tonase transformator | Baris **menurut tahun pembuatan**: tonase < 1997, ≥ 1997, dan tanpa tahun, ditambah tonase ≥ 1997 dari pernyataan perusahaan (dicatat terpisah). Lalu tombol **< 1997 / Semua**. Total tonase, lalu grafik kolom per kadar PCBs (> 50 ppm, ≤ 50 ppm, belum diuji) untuk tiap jenis trafo, dan baris terpisah untuk trafo yang tahun pembuatannya kosong. Skala logaritmik agar angka kecil tetap terlihat. |
| Tabel data | Semua kolom, pencarian, filter, edit dan hapus. Baris dimuat 50 per langkah saat tabel di-scroll. *(offline)* |
| Peta sebaran | Filter kategori, perusahaan, Status PCBs, dan tahun. Titik dikelompokkan per wilayah (lingkaran berangka dengan cincin warna per status), lalu tampil satuan saat diperbesar. Warna per Status PCBs atau kategori, pilihan peta atau satelit, dan layar penuh. |

Hampir semua angka bisa diklik untuk membuka datanya di tabel *(offline)*.

### Halaman per kategori

Trafo digunakan, trafo tidak digunakan, kapasitor, dan minyak dielektrik, masing-masing dengan kartu angka, grafik, tabel, dan peta.

- **Kapasitor:** daftar 72 nama dagang kapasitor yang mengandung PCBs (**Lampiran II** Permen LHK No. P.29/2020), dicocokkan dengan merek dan tahun di data: *berpotensi PCBs*, *perlu dicek* (tahun kosong), atau *di luar batas tahun*.
- **Semua kategori:** daftar 110 nama dagang minyak dielektrik yang mengandung PCBs (**Lampiran I**), dicocokkan dengan merek minyak di data. Tulisan seperti "non pcb oil" tidak dihitung.

### Formulir pelaporan *(offline)*

Alternatif dari unggah Excel: data diisi langsung per unit lewat halaman **Isi formulir**.

- **Pernyataan perusahaan:** tidak memiliki transformator, atau memiliki trafo buatan sebelum 1997 dan/atau 1997 ke atas. Untuk trafo 1997 ke atas cukup jumlah dan tonasenya.
- **Formulir 1.1–1.4** sesuai template KLHK, dengan bagian dan urutan kolom yang sama. Isian wajib ditandai, pilihan berupa dropdown, dan koordinat langsung terbaca beserta tautan ke peta, atau dipilih dengan mengklik peta (peta atau satelit). Setiap formulir punya **tabel bukti dukung** sesuai template: satu tautan Google Drive per dokumentasi. Formulir 1.1/1.2 hanya untuk trafo buatan sebelum 1997 (atau tahunnya tidak diketahui).
- **Data tersimpan** di bawah setiap formulir 1.1–1.4: daftar data perusahaan (cari, muat bertahap) yang bisa **diubah** dengan editor formulir yang sama atau dihapus. Perubahan diperiksa ulang di server; catatan pemeriksaan lama untuk kolom yang diperbaiki diganti hasil pemeriksaan baru. Trafo 1997 ke atas dari laporan lama tetap bisa diubah.
- **Formulir 2 Pengurangan PCBs:** log perawatan trafo yang masih digunakan (mis. retrofilling) dengan hasil uji sebelum dan sesudahnya, kondisi, dan pengelolaan limbah B3. Trafo dipilih dari data 1.1 sehingga datanya terisi otomatis, dan log yang tersimpan bisa diubah; bila dicentang, perawatan dan hasil uji sesudahnya ikut memperbarui data trafo, sehingga status PCBs dan roadmap mengikuti.
- **Formulir 3 Penyimpanan:** logbook penyimpanan (masa simpan dan jumlah di TPS dihitung otomatis) dan 27 ketentuan teknis Ya/Tidak beserta izin TPS Limbah B3.
- **Formulir 4.2 Pengolahan** (untuk penghasil): 11 ketentuan teknis Ya/Tidak. Formulir 5 memakai pertanyaan yang sama, jadi cukup diisi sekali. Persentase penaatan dihitung otomatis.
- **Formulir 5 Pelaporan:** neraca dihasilkan / dikelola / disimpan / belum dikelola (ton) dengan baris TOTAL.
- **Unggah template Excel 2, 3, 4.2, dan 5** di tab masing-masing: template dikenali dari judulnya, kolom dicek terhadap template resmi, baris contoh template dilewati, isinya diperiksa dengan aturan formulir web lalu ditampilkan sebelum disimpan. Log perawatan dicocokkan ke trafo 1.1 lewat merek + nomor serial (`lib/template-import.ts`).
- Formulir 4.1 (untuk jasa pengelola limbah B3) belum ada, karena diisi pengolah, bukan pemilik peralatan.
- Isian 1.1–1.4 tersimpan sebagai draf di browser, lalu **diperiksa** dengan aturan yang sama seperti unggahan Excel (koordinat, angka, tahun) ditambah cek merek + nomor serial yang sudah pernah dilaporkan. Isian yang lolos dikirim sekaligus dan tercatat di Riwayat upload sebagai "Formulir web".

### Halaman laporan perusahaan *(offline)*

`/lapor/<ID SIMPEL>`: semua yang dilaporkan satu perusahaan di satu halaman, tanpa menu admin. Isinya status PCBs, pernyataan, formulir 1.1–5 (termasuk data tersimpan dan unggah template), dan roadmap. Perusahaan dicari dari ID SIMPEL-nya; bila satu ID dipakai beberapa unit/pabrik, unitnya dipilih dulu. Ini pintu masuk dari aplikasi PILAR/SIMPEL, yang mengetahui ID SIMPEL perusahaan yang login. Admin membuka halaman yang sama lewat label ID SIMPEL di halaman Perusahaan; halaman **Isi formulir** memakai isi yang sama dengan pemilih perusahaan.

### Status PCBs & roadmap *(offline)*

- **Kartu status** di dashboard (saat satu perusahaan dipilih) dan di halaman Roadmap: satu kalimat ringkasan semua peralatan perusahaan, lalu lampu **merah / kuning / hijau** untuk trafo buatan sebelum 1997 (atau tanpa tahun) beserta pesannya.
  - **Merah:** ada trafo belum diuji tanpa rencana uji, > 50 ppm tanpa rencana penanganan, rencana yang lewat tanggalnya, atau limbah PCBs disimpan tanpa izin TPS yang berlaku (formulir 3).
  - **Kuning:** semua sisanya sudah punya rencana yang belum jatuh tempo, pernyataan belum diisi atau tidak cocok dengan data, tahun pembuatan kosong, izin TPS berakhir dalam 90 hari, limbah disimpan lebih dari 365 hari, ada ketentuan teknis dijawab "Tidak", neraca masih menyisakan limbah belum dikelola, atau bukti dukung formulir 1.1–1.4 yang berisi data belum lengkap. Kotak kuning di dashboard menyebut berapa yang kuning hanya karena kelengkapan administrasi (pernyataan / bukti dukung).
  - **Hijau:** tidak ada yang perlu dilakukan.
- **Ringkasan nasional** di dashboard (tanpa perusahaan dipilih): jumlah perusahaan merah / kuning / hijau / belum melapor, angka nasional (trafo belum diuji, > 50 ppm, tanpa rencana, rencana lewat), dan daftar perusahaan per warna, yang paling banyak tindakan terbuka di atas. Klik perusahaan untuk melihat dashboard-nya. Halaman Perusahaan juga menampilkan status tiap perusahaan.
- **Roadmap:** tanggal rencana uji (untuk yang belum diuji) atau penanganan (untuk yang > 50 ppm), untuk semua trafo sekaligus atau trafo yang dicentang. Rencana uji selesai sendiri begitu hasil ujinya masuk; penanganan ditandai selesai oleh admin.

### Impor data *(offline)*

| Langkah | Keterangan |
|---|---|
| Unggah | Workbook multi-sheet hingga 50 MB langsung ke Storage. Berkas di atas 10 MB dikirim tanpa fotonya (hanya data sel). |
| Aturan unggah perusahaan | Hanya .xlsx (bukan .xls, .xlsm, PDF), maksimal 1 MB, tanpa gambar atau objek tersemat, tanpa makro, tidak dikunci kata sandi, memakai template KLHK, maksimal 5.000 baris per sheet. Untuk admin hanya peringatan; nanti untuk akun perusahaan menjadi penolakan (`lib/upload-rules.ts`). |
| Deteksi format | Header dicari otomatis (termasuk judul bertingkat) dan dikenali sebagai Template KLHK atau format PLN beserta kategorinya. |
| Pemetaan kolom | Otomatis sesuai format. Admin cukup mengonfirmasi. |
| Pemeriksaan | Koordinat tidak terbaca, angka atau tanggal tidak valid, kolom penting kosong, dan duplikat, lengkap dengan nomor baris Excel. |
| Impor | Baris yang sudah ada dilewati. Berkas revisi bisa **mengganti** unggahan lama dalam satu transaksi. |
| Perbaikan otomatis | Koordinat DMS, koma desimal, dan lintang-bujur tertukar. Nama unit PLN diseragamkan. Berat trafo dalam ton dikoreksi. Baris contoh, kosong, dan tempelan ganda dilewati. |

### Perusahaan & kualitas data *(offline)*

- **Perusahaan:** isi data per perusahaan, hasil pemeriksaan siap dikirim lewat email, dan status pengiriman (belum dikirim, sudah dikirim, ada data baru, kosong).
- **ID SIMPEL:** setiap perusahaan dihubungkan dengan datanya di PILAR. Kandidat disarankan dari kemiripan nama, nama yang cocok persis bisa dihubungkan sekaligus, sisanya dipilih admin atau dicari lewat nama, NPWP, NIB, atau ID SIMPEL.
- **Kualitas data:** termasuk tanda **berat tidak sesuai daya** (lebih dari 50 kg per kVA, biasanya salah satuan berat atau daya; hanya ditandai, data tidak diubah). Skor kelengkapan per perusahaan dan unit, plus laporan temuan yang bisa diekspor ke Excel atau PDF.

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
| `npm run offline` | Mode offline lengkap |
| `npm run data:push` / `data:pull` | Kirim / ambil data lewat repo private |
| `npm run web:publish` | Kirim ringkasan ke web sekarang |
| `npm run simpel:load` | Muat daftar perusahaan PILAR (CSV terbaru di `Data-inventaris/id_simpel/`) |
| `npm run offline:user -- email password` | Buat akun admin atau ganti password (offline) |
| `npm run offline:user -- email password perusahaan <ID SIMPEL>` | Buat akun perusahaan: hanya melihat laporan perusahaan dengan ID SIMPEL itu |

---

## Memperbarui web

Web tidak menyimpan baris data. Isinya ringkasan yang dihitung di laptop admin, lalu dikirim ke Supabase Cloud.

1. **Sekali saja:** buat file `.env.web` (tidak ikut git) berisi connection string *Session pooler* dari Supabase:
   ```
   WEB_DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
   ```
2. **Setiap ada data baru:** `npm run data:push`. Ringkasan ikut terkirim otomatis. Bisa juga dijalankan sendiri dengan `npm run web:publish`.
3. **Pengaturan Vercel:** `NEXT_PUBLIC_DATA_MODE=summary` (sudah terpasang). Variabel ini menyembunyikan tabel, unggah, dan edit, dan halaman yang membutuhkan baris data ditutup.

Detailnya ada di [OFFLINE.md](OFFLINE.md#khusus-admin-ringkasan-di-web).

---

## Database

Jalankan semua berkas di `supabase/migrations/` **berurutan**. Mode offline menjalankannya otomatis. Di Supabase Cloud, jalankan lewat SQL Editor sebelum kodenya di-push.

| Objek | Fungsi |
|---|---|
| `transformator_digunakan`, `transformator_tidak_digunakan`, `kapasitor`, `minyak_dielektrik` | Data inventaris per formulir KLHK (1.1–1.4) |
| `companies`, `import_batches`, `upload_sessions` | Perusahaan, satu baris per sheet yang diimpor, satu baris per workbook yang diunggah |
| `inventory_stats_parts` | Ringkasan statistik yang dijaga trigger, sumber semua angka dashboard |
| `inventory_items` (view) | Gabungan keempat tabel untuk tabel dan peta |
| `company_feedback_log` | Riwayat pengiriman hasil pemeriksaan ke perusahaan |
| `user_access` | Peran setiap akun: admin, atau perusahaan dengan ID SIMPEL-nya |
| `company_statements` | Pernyataan perusahaan (riwayat; yang terbaru berlaku), termasuk jumlah dan tonase trafo 1997 ke atas |
| `pengurangan_pcbs` | Log perawatan pengurangan PCBs (formulir 2) |
| `bukti_dukung` | Tautan bukti dukung formulir 1.1–1.4 per perusahaan (riwayat; yang terbaru berlaku) |
| `penyimpanan_logbook`, `pelaporan_neraca`, `ketentuan_teknis` | Logbook penyimpanan (formulir 3), neraca (formulir 5), dan jawaban ketentuan teknis Ya/Tidak (formulir 3 dan 4.2) |
| `equipment_plans` | Rencana uji / penanganan per trafo atau untuk semua trafo perusahaan |
| `simpel_companies` | Daftar perusahaan PILAR dengan ID SIMPEL; `companies.pilar_company_id` dan `companies.id_simpel` menyimpan pilihan admin |
| `summary_map_cells`, `summary_brand_counts`, `summary_company_status`, `summary_meta` | Ringkasan untuk web: sel peta, jumlah merek, status PCBs per perusahaan, waktu kirim |
| RPC `inventory_stats`, `inventory_charts`, `inventory_units`, `inventory_quality` | Statistik, grafik, daftar unit, dan kualitas data |
| RPC `company_pcb_status`, `company_focus_transformers`, `pcb_status_all` | Angka status PCBs per perusahaan dan daftar trafo sebelum 1997 beserta rencananya |
| RPC `map_clusters`, `oil_brand_counts`, `summary_build`, `summary_cells` | Peta per wilayah, merek minyak, serta pembuatan dan pembacaan ringkasan web |
| Storage `pcbs-files` | Workbook yang diunggah (privat) |

Semua tabel, fungsi, dan bucket hanya bisa diakses pengguna yang sudah login, sesuai perannya (`user_access`): **admin** melihat semua; **perusahaan** hanya membaca dan mengubah baris perusahaan dengan ID SIMPEL-nya (dijaga Row Level Security di database) dan hanya membuka `/lapor/<ID SIMPEL>` miliknya. Akun tanpa peran tidak bisa membuka apa pun.

---

## Struktur Direktori

```text
app/                 Halaman: login, dashboard (nasional & per kategori), upload, companies,
                     kualitas-data, laporan; API unggah, pemetaan, impor
components/          Dashboard, tonase, peta, tabel, filter, daftar Lampiran I/II
lib/                 Parser Excel, profil format, impor, kueri dashboard, daftar Lampiran,
                     mode data (offline / ringkasan web)
proxy.ts             Wajib login, dan menutup halaman berbasis baris di web
scripts/             Impor massal satu folder, isi ulang berat, hapus data perusahaan, pengujian
scripts/offline/     Mode offline, sinkronisasi data, kirim ringkasan ke web
supabase/            Migrasi SQL, seed, konfigurasi Supabase lokal
```

Data inventaris asli (`Data-inventaris/`) tidak disimpan di repositori.

---

## Roadmap

**Sudah**
- [x] Impor multi-sheet (Template KLHK & PLN) dengan pemeriksaan, perbaikan koordinat, dan cek duplikat
- [x] Dashboard berbasis ringkasan trigger untuk ratusan ribu baris
- [x] Tonase transformator per kadar PCBs, < 1997 / ≥ 1997 / tanpa tahun, ditambah tonase dari pernyataan
- [x] Peta dengan filter dan pengelompokan per wilayah untuk semua titik
- [x] Daftar Lampiran I & II Permen LHK 29/2020 yang dicocokkan dengan data
- [x] Login, Row Level Security, mode offline, dan sinkronisasi antar-laptop
- [x] Web hanya-ringkasan yang diperbarui dari laptop admin
- [x] ID SIMPEL: perusahaan dihubungkan dengan daftar PILAR
- [x] Formulir web 1.1–1.4, 2, 3, 4.2, 5 dengan pernyataan, bukti dukung, pemilih titik di peta, revisi data tersimpan, dan unggah template
- [x] Aturan unggah perusahaan (1 MB, tanpa gambar, .xlsx template KLHK)
- [x] Status PCBs merah / kuning / hijau per perusahaan dan nasional (juga di web), roadmap uji dan penanganan
- [x] Halaman laporan perusahaan `/lapor/<ID SIMPEL>`, peran admin / perusahaan dengan data terbatas per perusahaan, tampilan ponsel
- [x] Uji skala PLN (±350 ribu baris): semua halaman di bawah 1 detik

**Berikutnya**
- [ ] Login dari PILAR / SIMPEL (halaman `/masuk`), setelah cara dan kuncinya disepakati
- [ ] Pindah ke server kantor: satu database lengkap online
- [ ] Unggah ulang data PT PLN (Persero) yang sudah diperbaiki
- [ ] Uji mode offline di laptop Windows
