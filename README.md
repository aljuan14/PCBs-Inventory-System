# PCBs Inventory & Management System

Web dashboard untuk inventarisasi **Polychlorinated Biphenyls (PCBs)** dari banyak perusahaan: unggah laporan Excel, petakan ke format baku KLHK, periksa kualitas datanya, lalu pantau hasilnya lewat dashboard, peta, dan tabel.

**Teknologi:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL & Storage) · SheetJS · Leaflet · Recharts

---

## Daftar Isi

1. [Latar Belakang](#latar-belakang)
2. [Fitur](#fitur)
3. [Memulai](#memulai)
4. [Alur Impor Data](#alur-impor-data)
5. [Impor Massal & Impor Ulang](#impor-massal--impor-ulang)
6. [Pengujian](#pengujian)
7. [Skema Database](#skema-database)
8. [Struktur Direktori](#struktur-direktori)
9. [Roadmap](#roadmap)

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
| Perbaikan koordinat | Membaca format DMS, desimal koma, dan urutan lintang-bujur yang tertukar. Pola rusak yang umum (titik desimal hilang, lintang dan bujur tergabung) diperbaiki bila hasilnya jatuh di wilayah Indonesia. |
| Penyaringan baris | Baris formulir kosong, sisa tempelan di luar formulir (tanpa Unit Induk, Unit Pelaksana, dan No), serta baris yang ditempel dua kali dilewati. Semuanya dicatat di laporan pemeriksaan. |
| Normalisasi unit | Penulisan Unit Induk PLN yang beragam (`UIWRKR`, `UIW RKR`, `WRKR`, ...) dipetakan ke 28 nama baku. |
| Riwayat unggah | Setiap impor menyimpan laporan pemeriksaannya, sehingga bisa ditinjau kembali di `/upload/riwayat`. |

### Dashboard & Analisis

| Fitur | Keterangan |
|---|---|
| Dashboard nasional & per kategori | Statistik dihitung di server, jadi tetap akurat untuk ratusan ribu baris. |
| Filter bertingkat | Filter Perusahaan › Unit Induk › Unit Pelaksana berlaku untuk kartu ringkasan, grafik, peta, dan tabel sekaligus. |
| Proporsi risiko PCBs | Diagram donut per kelas: < 50 ppm, 50–500 ppm, > 500 ppm, dan belum diuji. Klik salah satu kelas untuk menyaring tabel ke rentang tersebut. |
| Cakupan uji & temuan | Menampilkan persentase alat yang sudah diuji per jenis serta jumlah temuan ≥ 50 ppm, yang juga bisa diklik. |
| Peta sebaran | Peta Leaflet dengan warna yang aman bagi buta warna. Klik titik untuk menampilkan semua data di koordinat itu di tabel. |
| Tabel inventaris | Paginasi server, pencarian, edit dan hapus per baris, filter lanjutan (jenis uji, tahun, daya, kelengkapan, batch impor), serta pengurutan. |
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
   (/upload)              pilih sheet & kategori    (/upload/[batchId]/      temuan per baris       per 500 baris
                          satu batch per sheet       mapping)                 & duplikat             ke tabel kategori
```

- Tidak ada berkas yang disimpan di disk server. Workbook disimpan di Supabase Storage, hasil pemindaian di `upload_sessions`, dan konteks pemetaan di `import_batches`, jadi alur ini berjalan di platform serverless.
- Baris yang sudah ada di database dilewati secara default. Baris kembar di dalam berkas yang sama cukup diimpor sekali.
- Bila impor gagal di tengah, baris dari batch tersebut dibatalkan.
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

### Mengosongkan data perusahaan

```bash
npx tsx scripts/purge-company.ts --company "PT PLN (Persero)"            # dry run
npx tsx scripts/purge-company.ts --company "PT PLN (Persero)" --commit   # hapus
```

Perintah ini menghapus baris inventaris, batch impor, berkas di Storage, dan sesi unggah. Data perusahaannya sendiri tetap ada.

---

## Pengujian

| Perintah | Menguji |
|---|---|
| `npx tsx scripts/test-dms.ts` | Parser koordinat, termasuk pola yang harus ditolak |
| `npx tsx scripts/test-units.ts` | Normalisasi nama Unit Induk PLN |
| `npx tsx scripts/check-import.ts "<folder>"` | Dry run seluruh pipeline impor tanpa database: jumlah baris, temuan validasi, dan duplikat per sheet |

**Hasil dry run data PLN (28 September 2026):** 45 berkas menghasilkan 356.991 baris data:
- 324.154 trafo digunakan
- 32.558 trafo tidak digunakan
- 176 kapasitor
- 103 minyak dielektrik

Sekitar 65% koordinatnya valid. Sebanyak 8.790 baris kembar di dalam berkas dan ribuan baris sisa tempelan dilewati.

---

## Skema Database

| Objek | Fungsi |
|---|---|
| `companies` | Profil perusahaan pemilik peralatan |
| `upload_sessions` | Satu baris per workbook yang diunggah (lokasi berkas, hasil pindai, sidik SHA-256) |
| `import_batches` | Satu baris per sheet yang diimpor, berisi status, konteks pemetaan, dan laporan pemeriksaan |
| `transformator_digunakan`, `transformator_tidak_digunakan`, `kapasitor`, `minyak_dielektrik` | Data inventaris per formulir KLHK, termasuk unit, kode alat, dan catatan impor per baris |
| `field_definitions` | Kamus field baku untuk pemetaan |
| `inventory_items` (view) | Gabungan keempat tabel untuk tabel dan peta dashboard |
| `inventory_stats()`, `inventory_units()`, `inventory_quality()` | Statistik dashboard, rekap per unit, dan skor kualitas data yang dihitung di server |
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
  import-transform.ts    Transformasi, validasi, deteksi duplikat, penyimpanan
  units.ts               Normalisasi unit dan sub-unit
  dms.ts                 Parser koordinat
  company-purge.ts       Penghapusan data perusahaan
  data-quality.ts        Perhitungan kualitas data
scripts/                 Impor massal, purge, dry run, dan pengujian
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

**Berikutnya**
- [ ] Unggah banyak berkas sekaligus lewat web
- [ ] Mode *update* data (upsert berdasarkan kode alat) dan riwayat perubahan
- [ ] Autentikasi, peran admin/viewer, dan Row Level Security

---

Dikembangkan untuk keperluan inventarisasi dan pengelolaan PCBs nasional.
