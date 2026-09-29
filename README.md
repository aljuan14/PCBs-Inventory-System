# PCBs Inventory & Management System

Web dashboard untuk inventarisasi **Polychlorinated Biphenyls (PCBs)** dari banyak perusahaan: unggah laporan Excel, petakan ke format baku KLHK, periksa kualitas datanya, lalu pantau hasilnya lewat dashboard, peta, dan tabel.

**Teknologi:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL & Storage) · SheetJS · Leaflet · Recharts

**Aplikasi:** https://pcbs-inventory-system.vercel.app (Vercel)

> ⚠️ **Login masih dalam pengerjaan.** Sampai autentikasi dan Row Level Security selesai, siapa pun yang memegang tautan dapat membaca dan mengubah data. Gunakan tautan hanya di internal tim.

---

## Daftar Isi

1. [Latar Belakang](#latar-belakang)
2. [Fitur](#fitur)
3. [Memulai](#memulai)
4. [Alur Impor Data](#alur-impor-data)
5. [Impor Massal & Impor Ulang](#impor-massal--impor-ulang)
6. [Deploy ke Vercel](#deploy-ke-vercel)
7. [Pengujian](#pengujian)
8. [Skema Database](#skema-database)
9. [Struktur Direktori](#struktur-direktori)
10. [Roadmap](#roadmap)

---

## Latar Belakang

PCBs adalah senyawa B3 dan *Persistent Organic Pollutant* (POP) yang diatur dalam **Konvensi Stockholm** dan regulasi KLHK. Inventarisasinya mengikuti empat formulir resmi KLHK:

| No | Formulir | Tabel |
|---|---|---|
| 1.1 | Transformator yang masih digunakan | `transformator_digunakan` |
| 1.2 | Transformator yang sudah tidak digunakan | `transformator_tidak_digunakan` |
| 1.3 | Kapasitor | `kapasitor` |
| 1.4 | Minyak dielektrik | `minyak_dielektrik` |

Tantangan utamanya adalah laporan dari tiap perusahaan **tidak seragam**. Urutan dan nama kolomnya berbeda, ada judul bertingkat di atas tabel, satu workbook bisa berisi banyak sheet, dan datanya besar (PLN lebih dari 350 ribu baris). Laporan dari lapangan juga sering memuat data yang ditempel dua kali atau sisa tempelan di bawah formulir. Aplikasi ini dirancang untuk menangani semua kondisi itu.

---

## Fitur

### Unggah & Impor

| Fitur | Keterangan |
|---|---|
| Unggah workbook multi-sheet | Berkas hingga 50 MB diunggah langsung dari browser ke Supabase Storage, sehingga tidak terkena batas ukuran request server. |
| Deteksi format otomatis | Setiap sheet dipindai, baris header ditemukan meskipun ada judul bertingkat, lalu dikenali sebagai **Template KLHK** atau **Format PLN** beserta kategorinya. |
| Pemetaan kolom | Kolom dipetakan otomatis sesuai profil format. Admin cukup mengonfirmasi, atau memetakan manual bila perlu. |
| Pemeriksaan sebelum impor | Menampilkan koordinat tidak terbaca, angka atau tanggal tidak valid, field penting yang kosong, dan duplikat. Setiap temuan disertai nomor baris Excel dan contoh nilainya. |
| Cek duplikat di database | Setiap baris punya *fingerprint* (kolom terindeks) dari unit, sub-unit, kode alat, No, merek, seri, tahun, daya, volume, koordinat, dan lokasi. Baris yang sudah tersimpan untuk perusahaan yang sama dikenali dalam satu query per 2.000 baris, tanpa mengunduh seluruh data. |
| Ganti data unggahan sebelumnya | Berkas revisi dapat menggantikan seluruh baris dari unggahan lama (disarankan otomatis bila nama berkas dan sheet sama) dalam satu transaksi. Unggahan lama tetap tercatat di riwayat sebagai "diganti". |
| Progres bertahap | Unggah (MB terkirim), pindai (per sheet), pemeriksaan, dan impor (per baris) menampilkan langkah yang berjalan, durasinya, dan perkiraan sisa waktu. |
| Berat transformator | Berat kering peralatan, berat minyak/cairan, dan berat total (kg) dari formulir PLN disimpan. Nilai 0 dianggap kosong, nilai di atas 1.000 ton dikosongkan, total yang tertulis dalam ton dikoreksi, dan total yang kosong dihitung dari kering + minyak. |
| Perbaikan koordinat | Membaca format DMS, desimal koma, dan urutan lintang-bujur yang tertukar. Pola rusak yang umum (titik desimal hilang, lintang dan bujur tergabung) diperbaiki bila hasilnya jatuh di wilayah Indonesia. |
| Penyaringan baris | Baris formulir kosong, baris CONTOH dari template PLN, sisa tempelan di luar formulir (tanpa Unit Induk, Unit Pelaksana, dan No), serta baris yang ditempel dua kali dilewati. Semuanya dicatat di laporan pemeriksaan. |
| Pembersihan sel | Karakter kontrol tak terlihat (misalnya NUL dari ekspor sistem lain) dibuang dari setiap sel sebelum diproses. |
| Normalisasi unit | Penulisan Unit Induk PLN yang beragam (`UIWRKR`, `UIW RKR`, `WRKR`, ...) dipetakan ke 28 nama baku. Awalan perusahaan pada sub-unit ("PLN UP3 Ketapang") dibuang. |
| Riwayat unggah | Setiap impor menyimpan laporan pemeriksaannya, sehingga bisa ditinjau kembali di `/upload/riwayat`. |

### Dashboard & Analisis

| Fitur | Keterangan |
|---|---|
| Dashboard nasional & per kategori | Statistik dibaca dari tabel ringkasan yang diperbarui otomatis oleh trigger setiap ada impor, edit, atau hapus, jadi tetap cepat dan akurat untuk ratusan ribu baris. Jumlah baris tabel dan titik peta di atas 1.000 ditampilkan sebagai perkiraan. |
| Filter bertingkat | Filter Perusahaan › Unit Induk › Unit Pelaksana berlaku untuk kartu ringkasan, grafik, peta, dan tabel sekaligus. |
| Kartu ringkasan | Per jenis trafo: bilah tahun produksi (< 1997, ≥ 1997, tidak diketahui) dan hasil uji PCBs. Kapasitor dan minyak dielektrik sebagai kartu kecil. Setiap baris membuka datanya di tabel. |
| Tonase transformator | Total tonase dari berat total di formulir, tonase per jenis trafo, dan tonase trafo buatan sebelum 1997. |
| Sebaran transformator | Dua grafik batang bertumpuk per kelas risiko PCBs, dalam jumlah unit atau tonase. Grafik pertama per perusahaan, Unit Induk, atau Unit Pelaksana (mengikuti filter, 12 terbesar dan sisanya digabung ke "Lainnya"). Grafik kedua per rentang lima tahun produksi, dengan batas 1997 ditandai. Klik nama untuk menelusuri, atau klik batang untuk membuka datanya di tabel. |
| Proporsi risiko PCBs | Diagram donut keseluruhan, ditambah satu donut per jenis trafo (masih digunakan dan tidak digunakan) khusus tahun produksi sebelum 1997, per kelas: < 2 ppm, 2–50 ppm, > 50 ppm, dan belum diuji. Klik salah satu kelas untuk menyaring tabel ke rentang tersebut. |
| Cakupan uji & temuan | Persentase trafo buatan sebelum 1997 yang sudah diuji per jenis (dengan pembanding semua tahun), serta jumlah temuan ≥ 2 ppm per jenis alat. Semuanya bisa diklik. |
| Hasil uji per metode | Khusus trafo buatan sebelum 1997: jumlah hasil **uji lab** dan **uji cepat**, masing-masing dirinci < 2, 2–50, dan > 50 ppm, per jenis trafo. Setiap baris membuka datanya di tabel (filter jenis uji, kelas ppm, dan tahun). |
| Peta sebaran | Peta Leaflet dengan warna yang aman bagi buta warna. Klik titik untuk menampilkan semua data di koordinat itu di tabel. |
| Tabel inventaris | Semua kolom tampil (termasuk koordinat, tahun, dan berat kering/minyak/total) dan tabel bisa digeser ke samping, dengan kolom merek dan aksi yang menempel. Kolom yang terkait filter aktif disorot. Tersedia paginasi server, pencarian, edit dan hapus per baris, filter lanjutan (jenis uji, tahun, daya, kelengkapan, batch impor), dan pengurutan. |
| Kualitas data | Menyediakan skor kelengkapan, perbandingan per unit, dan laporan temuan (`/laporan/kualitas`) yang bisa diekspor ke Excel atau PDF. |

### Manajemen Perusahaan

| Fitur | Keterangan |
|---|---|
| Daftar & tambah perusahaan | Dikelola dari halaman `/companies`. |
| Hapus perusahaan | Sebelum menghapus, ditampilkan data apa saja yang ikut terhapus. Penghapusan berjalan bertahap dengan indikator progres, termasuk berkas di Storage. |

---

## Memulai

### Prasyarat

- Node.js 20 atau lebih baru
- Proyek aktif di [Supabase](https://supabase.com)

### Instalasi

```bash
git clone https://github.com/aljuan14/PCBs-Inventory-System.git
cd PCBs-Inventory-System
npm install
```

### Variabel Lingkungan

Salin `.env.example` menjadi `.env.local`, lalu isi dengan kredensial dari **Supabase → Project Settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Opsional, dipakai skrip impor massal bila RLS sudah diperketat
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

URL tidak boleh diakhiri `/rest/v1/`. Jangan commit `.env.local`.

### Migrasi Database

Jalankan semua berkas di `supabase/migrations/` **secara berurutan** lewat SQL Editor Supabase, atau dengan `supabase db push`. Setelah itu jalankan `supabase/seed.sql`.

| Migrasi | Isi |
|---|---|
| `20260922000001_initial_schema` | Skema awal |
| `20260922000002_fix_schema_nullable` | Penyesuaian kolom nullable |
| `20260923000001_split_inventory_tables` | Tabel per kategori formulir KLHK |
| `20260923000002_official_field_constraints` | Batasan field resmi |
| `20260926000001_relax_required_fields` | Melonggarkan field wajib untuk data riil |
| `20260926000002_inventory_stats` | View `inventory_items` dan fungsi `inventory_stats` |
| `20260927000001_upload_storage` | Bucket `pcbs-files` dan tabel `upload_sessions` |
| `20260927000002_inventory_filters` | Indeks untuk filter tabel |
| `20260928000001_units_and_asset_code` | Kolom `unit`, `sub_unit`, `kode_alat` dan fungsi `inventory_units` |
| `20260928000002_stats_by_unit` | Statistik per unit untuk filter dashboard |
| `20260928000003_data_quality` | Catatan impor per baris, laporan pemeriksaan, fungsi `inventory_quality` |
| `20260928000004_dashboard_timeout` | Batas waktu query `anon` dan `authenticated` dinaikkan ke 15 detik |
| `20260929000001_risk_bands` | Kelas risiko PCBs < 2, 2–50, > 50 ppm dan statistik trafo < 1997 |
| `20260929000002_import_replace` | Cek duplikat di database (kolom `fingerprint`) dan mode ganti data unggahan sebelumnya |
| `20260929000003_existing_rows_array` | Perbaikan cek duplikat: hasil tidak lagi terpotong di 1.000 baris per permintaan |
| `20260929000004_transformer_weights` | Kolom berat kering, minyak, dan total (kg) pada tabel trafo, statistik tonase, fungsi `inventory_set_weights` |
| `20260929000005_weight_parts` | Berat kering dan minyak dijumlahkan hanya dari trafo yang mencatat keduanya |
| `20260929000006_dashboard_charts` | Fungsi `inventory_charts` untuk grafik sebaran trafo per unit dan per tahun produksi |
| `20260929000007_stats_summary` | Tabel ringkasan `inventory_stats_parts` yang dijaga trigger, sehingga angka dashboard tidak lagi menghitung ulang seluruh baris (fungsi lama tetap ada sebagai `inventory_stats_scan`) |
| `20260929000008_test_methods` | Jumlah hasil uji lab dan uji cepat per kelas ppm di tabel ringkasan, untuk kartu hasil uji per metode |

### Menjalankan Aplikasi

```bash
npm run dev     # server pengembangan di http://localhost:3000
npm run lint    # ESLint
npm run build   # build produksi (termasuk pemeriksaan TypeScript)
```

---

## Alur Impor Data

```text
1. Unggah workbook   ──►  2. Review sheet     ──►  3. Pemetaan kolom   ──►  4. Pemeriksaan   ──►  5. Impor
   (/upload)              pilih sheet & kategori    (/upload/[batchId]/      temuan per baris       per 1.000 baris
                          satu batch per sheet       mapping)                 & duplikat             ke tabel kategori
```

- Tidak ada berkas yang disimpan di disk server. Workbook disimpan di Supabase Storage, hasil pemindaian di `upload_sessions`, dan konteks pemetaan di `import_batches`, jadi alur ini berjalan di platform serverless.
- Baris yang sudah ada di database dilewati secara default. Baris kembar di dalam berkas yang sama cukup diimpor sekali.
- **Mode ganti:** berkas revisi dapat menggantikan unggahan sebelumnya. Baris baru disimpan dulu, lalu baris lama dihapus dan batch lamanya ditandai "diganti" dalam satu transaksi. Bila langkah itu gagal, baris baru dihapus lagi.
- Bila impor gagal di tengah, baris dari batch tersebut dibatalkan.
- Proses panjang mengirim progresnya secara bertahap (NDJSON) bila diminta browser (`Accept: application/x-ndjson`). Halaman lama yang belum dimuat ulang tetap menerima JSON biasa.
- Unggahan yang tidak pernah dijadikan batch dihapus otomatis setelah 7 hari.

> **Catatan deploy:** workbook PLN terbesar (sekitar 12 MB) membutuhkan ratusan MB memori dan beberapa detik untuk diproses. Pastikan konfigurasi fungsi di Vercel mengizinkan durasi hingga 300 detik untuk impor.

---

## Impor Massal & Impor Ulang

### Impor satu folder

Untuk memuat banyak berkas milik satu perusahaan sekaligus:

```bash
# Dry run: hanya menampilkan apa yang akan diimpor
npx tsx scripts/import-folder.ts "<folder>" --company "PT PLN (Persero)"

# Uji dengan satu unit dulu
npx tsx scripts/import-folder.ts "<folder>" --company "PT PLN (Persero)" --only Bali --commit

# Impor semuanya, dengan laporan JSON
npx tsx scripts/import-folder.ts "<folder>" --company "PT PLN (Persero)" --commit --report hasil-import.json
```

Langkah yang dipakai sama dengan unggah lewat web. Skrip ini aman dijalankan ulang, karena berkas yang identik dan baris yang sudah ada otomatis dilewati.

### Mengisi ulang berat transformator

Kolom berat ditambahkan setelah data PLN diimpor. Skrip ini mengisinya dari berkas asli tiap batch di Storage tanpa impor ulang. Hanya kolom berat yang diperbarui, dicocokkan lewat nomor baris Excel.

```bash
npx tsx scripts/backfill-weights.ts                # dry run
npx tsx scripts/backfill-weights.ts --only Jabar   # batch yang nama berkasnya memuat teks tertentu
npx tsx scripts/backfill-weights.ts --commit       # simpan
```

Batch yang barisnya tidak punya nomor baris Excel (diimpor sebelum migrasi `20260928000003`) perlu diunggah ulang dengan mode ganti.

### Mengosongkan data perusahaan

```bash
npx tsx scripts/purge-company.ts --company "PT PLN (Persero)"            # dry run
npx tsx scripts/purge-company.ts --company "PT PLN (Persero)" --commit   # hapus
```

Perintah ini menghapus baris inventaris, batch impor, berkas di Storage, dan sesi unggah. Data perusahaannya sendiri tetap ada.

---

## Deploy ke Vercel

Aplikasi berjalan di Vercel karena rute impor (`/api/import`) memproses sheet besar dalam satu request hingga 300 detik (`maxDuration`) sambil mengirim progres bertahap. Batas fungsi di Netlify terlalu pendek untuk itu.

1. **Import repositori** di [vercel.com/new](https://vercel.com/new). Next.js terdeteksi otomatis, jadi pengaturan build tidak perlu diubah.
2. **Isi Environment Variables** sesuai `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, dan `SUPABASE_ANON_KEY`. Jangan masukkan `SUPABASE_SERVICE_ROLE_KEY`, karena kunci itu hanya untuk skrip di komputer lokal.
3. **Samakan region fungsi** (Settings → Functions) dengan region proyek Supabase, misalnya Singapore `sin1`, agar impor tidak lambat karena jarak ke database.
4. **Deploy.** Setiap push ke `main` akan ter-deploy otomatis, dan branch lain mendapat URL preview.

Nilai `NEXT_PUBLIC_*` ditanam ke kode saat build. Setelah mengubahnya di Vercel, lakukan **Redeploy**. Bila dashboard online menampilkan galat 401 dari Supabase, periksa apakah anon key tersalin utuh (diawali `eyJ`).

Workbook yang sangat besar (ratusan ribu baris) lebih aman diimpor dengan `scripts/import-folder.ts` dari komputer lokal, karena satu fungsi Vercel dibatasi memorinya.

---

## Pengujian

| Perintah | Menguji |
|---|---|
| `npx tsx scripts/test-dms.ts` | Parser koordinat, termasuk pola yang harus ditolak |
| `npx tsx scripts/test-units.ts` | Normalisasi nama Unit Induk dan sub-unit PLN |
| `npx tsx scripts/check-import.ts "<folder>"` | Dry run seluruh pipeline impor tanpa database: jumlah baris, temuan validasi, dan duplikat per sheet |

**Data PLN terimpor (29 September 2026):** 28 berkas UID/UIT/UIP3B/UIW, dengan UID Jaya yang semula 17 berkas digabung menjadi satu. Isi database dicocokkan dengan hasil baca ulang semua berkas, per sheet dan per angka dashboard:
- 320.966 trafo digunakan
- 32.552 trafo tidak digunakan
- 176 kapasitor
- 103 data minyak dielektrik (29.029 L)
- 230.391 ton berat trafo, dari 145.280 trafo yang beratnya tercatat

---

## Skema Database

| Objek | Fungsi |
|---|---|
| `companies` | Profil perusahaan pemilik peralatan |
| `upload_sessions` | Satu baris per workbook yang diunggah (lokasi berkas, hasil pindai, sidik SHA-256) |
| `import_batches` | Satu baris per sheet yang diimpor, berisi status (`imported`, `replaced`, ...), konteks pemetaan, dan laporan pemeriksaan |
| `transformator_digunakan`, `transformator_tidak_digunakan`, `kapasitor`, `minyak_dielektrik` | Data inventaris per formulir KLHK, termasuk unit, kode alat, catatan impor, nomor baris Excel, dan `fingerprint` per baris. Tabel trafo juga menyimpan berat kering, minyak, dan total (kg) |
| `field_definitions` | Kamus field baku untuk pemetaan |
| `inventory_items` (view) | Gabungan keempat tabel untuk tabel dan peta dashboard |
| `inventory_stats()`, `inventory_units()`, `inventory_quality()` | Statistik dashboard (termasuk tonase), rekap per unit, dan skor kualitas data yang dihitung di server |
| `inventory_existing_rows()`, `replace_import_batch()`, `inventory_set_weights()` | Cek duplikat per potongan baris, penggantian batch dalam satu transaksi, dan pengisian berat per batch |
| Storage `pcbs-files` | Bucket privat untuk workbook yang diunggah |

---

## Struktur Direktori

```text
app/
  api/upload/            Inisialisasi unggahan, pemindaian sheet, konfirmasi batch
  api/mapping/[batchId]/ Info batch, saran pemetaan, pemeriksaan data
  api/import/            Transformasi dan penyimpanan ke tabel kategori
  dashboard/             Dashboard nasional dan per kategori
  upload/                Unggah, pemetaan, dan riwayat unggah
  laporan/kualitas/      Laporan kualitas data
  companies/             Manajemen perusahaan
components/              Dashboard, grafik, peta, tabel, filter, laporan kualitas
lib/
  excel.ts               Parser Excel dan pendeteksi header
  import-profiles.ts     Profil format (KLHK, PLN), pemetaan otomatis, penyaringan baris
  import-scan.ts         Pemindaian sheet (dipakai web dan skrip)
  import-transform.ts    Transformasi, validasi, berat, deteksi duplikat, penyimpanan
  progress.ts            Progres bertahap (NDJSON) untuk pindai, periksa, dan impor
  timing.ts              Log durasi per langkah di server
  units.ts               Normalisasi unit dan sub-unit
  dms.ts                 Parser koordinat
  company-purge.ts       Penghapusan data perusahaan
  data-quality.ts        Perhitungan kualitas data
  inventory-query.ts     Akses data dashboard: statistik, grafik, tabel, dan peta
scripts/                 Impor massal, isi ulang berat, purge, dry run, dan pengujian
supabase/                Migrasi SQL dan seed
```

Data inventaris (`Data-inventaris/`), termasuk template formulir KLHK dan data riil perusahaan, tidak disimpan di repositori. Simpan secara lokal bila diperlukan untuk dry run.

---

## Roadmap

**Selesai**
- [x] Unggah multi-sheet dengan profil Template KLHK dan PLN
- [x] Validasi, perbaikan koordinat, dan deteksi duplikat
- [x] Penyaringan sisa tempelan dan data yang ditempel dua kali
- [x] Statistik server untuk data besar
- [x] Struktur unit (Unit Induk › Unit Pelaksana) dan filter bertingkat di dashboard
- [x] Impor massal satu folder dan skrip purge
- [x] Kualitas data: skor kelengkapan, laporan temuan (Excel/PDF), riwayat unggah
- [x] Donut risiko, kartu cakupan uji, dan peta yang terhubung ke tabel
- [x] Hapus perusahaan beserta seluruh datanya
- [x] Kelas risiko < 2 / 2–50 / > 50 ppm dan fokus pada trafo buatan sebelum 1997
- [x] Cek duplikat di database dan mode ganti data unggahan sebelumnya
- [x] Progres bertahap untuk unggah, pindai, periksa, dan impor
- [x] Berat trafo (kering, minyak, total) dan kartu tonase
- [x] Grafik sebaran trafo per unit dan per tahun produksi (jumlah unit atau tonase)
- [x] Tabel ringkasan berbasis trigger, sehingga dashboard tidak lagi timeout
- [x] Deploy ke Vercel
- [x] Kartu hasil uji per metode (uji lab vs uji cepat) untuk trafo < 1997 dan label kartu ringkasan yang lebih jelas

**Sedang dikerjakan**
- [ ] Autentikasi (login) dan Row Level Security khusus pengguna terdaftar

**Berikutnya**
- [ ] Unggah banyak berkas sekaligus lewat web
- [ ] Pembaruan per baris (berdasarkan kode alat) dan riwayat perubahan
- [ ] Tampilan ponsel (sidebar yang bisa dilipat)
- [ ] Peran admin/viewer
- [ ] Histogram konsentrasi PCBs (ppm) dengan batas 2 dan 50 ppm
- [ ] Tabel ringkasan untuk kualitas data (`inventory_quality` masih membaca seluruh baris)

---

Dikembangkan untuk keperluan inventarisasi dan pengelolaan PCBs nasional.
