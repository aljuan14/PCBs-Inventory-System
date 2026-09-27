# 🛡️ PCBs Inventory & Management System

> **Web Dashboard Inventarisasi Polychlorinated Biphenyls (PCBs) Multi-Perusahaan**
> Dibangun dengan **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS 4**, **Supabase (PostgreSQL & Storage)**, **SheetJS (`xlsx`)**, **Leaflet GIS**, dan **Recharts**.

---

## Latar Belakang & Konteks Regulasi

**Polychlorinated Biphenyls (PCBs)** merupakan senyawa kimia organik sintetis yang tergolong Bahan Berbahaya dan Beracun (B3) serta *Persistent Organic Pollutants* (POPs) yang diatur secara ketat dalam **Konvensi Stockholm** dan regulasi Kementerian Lingkungan Hidup dan Kehutanan (KLHK) Republik Indonesia.

Inventarisasi mengikuti empat formulir resmi KLHK:
1. **Transformator yang masih digunakan**
2. **Transformator yang sudah tidak digunakan**
3. **Kapasitor**
4. **Minyak dielektrik** (drum / tangki cadangan, hasil *draining*, atau oli servis)

Tantangan utamanya adalah **format pelaporan tiap perusahaan tidak seragam**: urutan kolom berbeda, nama header beragam, judul bertingkat di awal sheet, satu workbook berisi banyak sheet, dan data besar (ratusan ribu baris untuk PLN). Aplikasi ini membaca workbook Excel, mengenali sheet dan formatnya, memetakan kolom ke skema baku, memvalidasi data, lalu memvisualisasikannya di dashboard GIS.

---

## Fitur Utama

### 1. Upload Workbook Multi-Sheet (`/upload`)
- **Upload langsung ke Supabase Storage**: browser mengunggah berkas (maks. 50 MB) langsung ke bucket privat `pcbs-files` memakai token sekali pakai (`/api/upload/init`), sehingga berkas besar tidak terkena batas ukuran request server (4,5 MB di Vercel).
- **Pemindaian seluruh sheet**: setiap sheet dalam workbook dipindai; `lib/excel.ts` menemukan baris header sebenarnya (melewati judul bertingkat & header yang diulang), serta berhenti sebelum bagian penutup (checklist dokumen, tanda tangan).
- **Deteksi profil format** (`lib/import-profiles.ts`): sheet dikenali sebagai **Template KLHK** atau **Format PLN** dari sidik jari header-nya, sekaligus kategori inventarisnya.
- **Review sebelum lanjut**: admin memilih sheet mana yang diimpor dan kategorinya; setiap sheet yang dikonfirmasi menjadi satu *import batch* (`/api/upload/confirm`).
- **Hitungan baris data riil**: baris formulir kosong yang sudah bernomor tidak ikut dihitung.

### 2. Pemetaan Kolom & Validasi (`/upload/[batchId]/mapping`)
- **Mapping otomatis dari profil**: kolom template KLHK/PLN langsung terpetakan; admin cukup mengonfirmasi. Kolom lain tetap bisa dipetakan manual.
- **Field turunan**: mis. berat (kg) → ton, hasil uji GC/Dexil (ppm) → jenis uji & konsentrasi.
- **Pemeriksaan data** (`/api/mapping/[batchId]/validate`) sebelum impor:
  - koordinat tidak terbaca atau di luar wilayah Indonesia,
  - angka/tanggal tidak valid, kelengkapan field penting,
  - **duplikat** di dalam file maupun terhadap data perusahaan yang sudah ada di database,
  - setiap temuan menunjukkan nomor baris Excel dan contoh nilainya.
- **Parser koordinat** (`lib/dms.ts`): DMS dengan arah di depan/belakang (`LS/LU/BT/BB`, `S/N/E/W`), desimal koma, label `lat/long`, urutan bujur-lintang (dibalik otomatis), dan koordinat yang terpecah di dua kolom (`Titik Koordinat` + kolom tanpa nama).
- **Perbaikan koordinat rusak khas Indonesia**: titik desimal hilang (`5196385, 97142441`), lintang & bujur tergabung (`-5.22015105.17231`), dll. Hasil perbaikan hanya diterima bila jatuh di wilayah Indonesia dan dicatat di laporan validasi agar bisa diperiksa; pola yang ambigu dibiarkan tidak terbaca.
- **Impor bertahap** (`/api/import`): insert per 500 baris; bila gagal di tengah, baris batch tersebut di-*rollback*. Baris duplikat dilewati secara default (bisa dimatikan).

### 3. Dashboard (`/dashboard` & `/dashboard/<kategori>`)
- **Statistik agregat di server** (`inventory_stats` RPC): angka tetap akurat meskipun data mencapai ratusan ribu baris (tidak terpotong limit 1000 baris Supabase).
- **Dashboard per kategori**: trafo digunakan, trafo tidak digunakan, kapasitor, minyak dielektrik.
- **Peta Leaflet** sebaran titik koordinat dengan popup detail (jenis, no. seri, perusahaan, kadar PCB).
- **Grafik Recharts**: distribusi klasifikasi PCB per jenis alat dan proporsi risiko:
  **Bebas PCB** (`< 50 ppm`), **Terkontaminasi** (`50 – 500 ppm`), **Bahaya Tinggi** (`> 500 ppm`), **Belum Diuji**.
- **Tabel inventaris** dengan paginasi server, pencarian, edit & hapus per baris, serta:
  - filter utama: jenis alat (termasuk trafo digunakan / tidak digunakan), perusahaan, kadar PCB;
  - **filter lanjutan**: jenis uji (lab/cepat/belum), tahun pembuatan (sebelum 1985, 1985–1996, ≥ 1997, rentang bebas), daya trafo (kVA), ada/tanpa koordinat, kelengkapan data (tanpa no. seri/merek/tahun/lokasi), batch import, dan waktu input;
  - pengurutan (terbaru, kadar PCB tertinggi, tahun tertua/terbaru, daya terbesar, merek A–Z);
  - chip filter aktif yang bisa dihapus satu per satu atau di-reset sekaligus.

### 4. Manajemen Perusahaan (`/companies`)
Daftar dan penambahan perusahaan pemilik data.

---

## Skema Database (Supabase / PostgreSQL)

| Objek | Fungsi |
|---|---|
| `companies` | Profil perusahaan pemilik peralatan. |
| `upload_sessions` | Satu baris per workbook yang diunggah: lokasi berkas di Storage dan hasil pemindaian sheet. |
| `import_batches` | Satu baris per sheet yang diimpor, beserta status (`pending_mapping`, `mapped`, `imported`, `error`) dan konteks mapping (header, profil, saran mapping). |
| `transformator_digunakan` | Inventaris trafo yang masih beroperasi. |
| `transformator_tidak_digunakan` | Inventaris trafo yang sudah tidak digunakan / rusak. |
| `kapasitor` | Inventaris kapasitor. |
| `minyak_dielektrik` | Wadah / sampel minyak dielektrik. |
| `field_definitions` | Kamus field baku (dipakai saat mapping). |
| `inventory_items` (view) | Gabungan keempat tabel inventaris untuk tabel & peta dashboard (termasuk `import_batch_id` untuk filter batch). |
| Storage `pcbs-files` | Bucket privat berisi workbook yang diunggah (`uploads/<upload_id>/source.xlsx`). |
| `inventory_stats()` (function) | Agregasi statistik dashboard di sisi server. |

Tabel lama `transformator` dari prototipe awal dibiarkan untuk migrasi data historis.

---

## Panduan Memulai

### 1. Prasyarat
- **Node.js** v20+
- **Git**
- Proyek aktif di **[Supabase](https://supabase.com)**

### 2. Kloning & Instalasi
```bash
git clone https://github.com/aljuan14/PCBs-Inventory-System.git
cd PCBs-Inventory-System
npm install
```

### 3. Variabel Lingkungan
Salin `.env.example` menjadi `.env.local`, lalu isi dengan kredensial proyek Supabase Anda (**Project Settings → API**):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```
> Pastikan URL tidak berakhiran `/rest/v1/` dan tidak ada spasi setelah `=`. Jangan commit `.env.local`.

### 4. Menjalankan Migrasi Database
Jalankan **semua** berkas di `supabase/migrations/` **secara berurutan** (nama file diawali tanggal) melalui **SQL Editor** Supabase, atau dengan Supabase CLI (`supabase db push`):

1. `20260922000001_initial_schema.sql` — skema awal
2. `20260922000002_fix_schema_nullable.sql`
3. `20260923000001_split_inventory_tables.sql` — tabel per kategori resmi KLHK
4. `20260923000002_official_field_constraints.sql`
5. `20260926000001_relax_required_fields.sql` — melonggarkan field wajib untuk data riil (PLN)
6. `20260926000002_inventory_stats.sql` — view `inventory_items` & fungsi `inventory_stats`
7. `20260927000001_upload_storage.sql` — bucket `pcbs-files`, tabel `upload_sessions`, konteks batch di `import_batches` (**wajib** untuk fitur upload)
8. `20260927000002_inventory_filters.sql` — kolom `import_batch_id` di view & indeks untuk filter tabel

Lalu jalankan `supabase/seed.sql` untuk mengisi kamus field dan contoh perusahaan.

### 5. Menjalankan Aplikasi
```bash
npm run dev     # server pengembangan → http://localhost:3000
npm run lint    # ESLint
npm run build   # build produksi (juga memeriksa TypeScript)
```

---

## Alur Import Data

```text
Upload workbook ──► Pindai semua sheet ──► Review sheet & kategori ──► Batch per sheet
                     (header, profil)        (/upload)                  (/api/upload/confirm)
                                                                              │
Dashboard ◄── Insert per 500 baris ◄── Periksa data ◄── Mapping kolom ◄───────┘
               (/api/import)           (validate)       (/upload/[batchId]/mapping)
```

Tidak ada berkas yang disimpan di disk server (`lib/upload-store.ts`): workbook ada di Supabase Storage, hasil pemindaian di `upload_sessions`, dan konteks mapping di `import_batches`, sehingga alur ini berjalan di platform serverless. Unggahan yang tidak pernah dijadikan batch dihapus otomatis setelah 7 hari.

> ⚠️ **Catatan deploy**: memproses workbook PLN terbesar (±12 MB, puluhan ribu baris) memakan ratusan MB memori dan beberapa detik. Route `upload`, `validate`, dan `import` sudah menyetel `maxDuration`; di Vercel pastikan paket/konfigurasi fungsi mengizinkan durasi (hingga 300 dtk untuk import) dan memori yang cukup.

---

## Struktur Direktori

```text
├── app/
│   ├── api/
│   │   ├── upload/init/route.ts               # Siapkan unggahan: perusahaan + token upload ke Storage
│   │   ├── upload/route.ts                    # Pindai seluruh sheet workbook dari Storage
│   │   ├── upload/confirm/route.ts            # Buat import batch per sheet terpilih
│   │   ├── mapping/[batchId]/route.ts         # Info batch, header, & saran mapping
│   │   ├── mapping/[batchId]/validate/route.ts# Pemeriksaan data sebelum impor
│   │   └── import/route.ts                    # Transformasi & insert ke tabel kategori
│   ├── dashboard/
│   │   ├── page.tsx                           # Dashboard ringkasan semua kategori
│   │   └── <kategori>/page.tsx                # Dashboard per kategori
│   ├── upload/
│   │   ├── page.tsx                           # Langkah 1: upload & review sheet
│   │   └── [batchId]/mapping/page.tsx         # Langkah 2: mapping, validasi, impor
│   ├── companies/page.tsx                     # Manajemen perusahaan
│   ├── layout.tsx                             # Root layout + Navbar
│   └── page.tsx                               # Entry point
├── components/
│   ├── InventoryOverview.tsx                  # Dashboard ringkasan
│   ├── InventoryCategoryDashboard.tsx         # Dashboard per kategori
│   ├── InventorySummary.tsx                   # Kartu statistik
│   ├── useDashboardData.ts                    # Hook pemuat data dashboard
│   ├── DashboardCharts.tsx                    # Grafik Recharts
│   ├── DataTable.tsx                          # Tabel paginasi server + edit/hapus
│   ├── MapLeaflet.tsx / MapNotice.tsx         # Peta Leaflet (No-SSR) & keterangan
│   └── Navbar.tsx
├── lib/
│   ├── excel.ts                               # Parser Excel & header sniffer
│   ├── import-profiles.ts                     # Profil format (Template KLHK, PLN) & mapping otomatis
│   ├── import-transform.ts                    # Transformasi baris, validasi, deteksi duplikat
│   ├── upload-store.ts                        # Sesi upload (Storage + upload_sessions)
│   ├── inventory.ts                           # Kategori & definisi field resmi
│   ├── inventory-query.ts                     # Query dashboard (stats, halaman tabel, titik peta)
│   ├── dms.ts                                 # Konversi koordinat DMS → desimal
│   ├── types.ts
│   └── supabase/{client,server}.ts            # Supabase client (@supabase/ssr)
├── Data-inventaris/data-template/             # Template formulir resmi KLHK (1.1 – 1.4)
├── scripts/
│   ├── check-import.ts                        # Dry-run pipeline import atas berkas Excel (tanpa database)
│   ├── test-dms.ts                            # Uji regresi parser koordinat
│   └── test-supabase.ts                       # Uji koneksi Supabase
├── supabase/
│   ├── migrations/                            # Migrasi SQL (jalankan berurutan)
│   └── seed.sql
└── .env.example
```

Data riil perusahaan (mis. `Data-inventaris/Data-PLN/`) tidak disimpan di repositori.

---

## 🧪 Pengujian

### Parser koordinat
```bash
npx tsx scripts/test-dms.ts
```
Berisi kasus nyata dari laporan PLN beserta nilai yang diharapkan, termasuk pola yang **harus** ditolak (mis. `-615.894.271`, lintang saja dengan titik ribuan). Keluar dengan kode 1 bila ada yang gagal.

### Dry-run import atas data riil
```bash
npx tsx scripts/check-import.ts "Data-inventaris/Data-PLN"
```
Menjalankan pipeline yang sama dengan aplikasi (pindai sheet → deteksi profil → mapping otomatis → transformasi & validasi) tanpa menyentuh database, lalu mencetak laporan per sheet dan ringkasan: jumlah baris per kategori, cakupan nomor seri & koordinat, temuan validasi, dan kandidat kolom ID alat.

Hasil atas 45 berkas PLN (27 Sep 2026): 129 sheet / 370.604 baris terbaca, koordinat valid 65,5% (sebelumnya 30,2%), nomor seri terisi 58,3%, kolom **Kode Trafo** terisi 86% dan unik 89%.

---

## Roadmap

- [x] Upload multi-sheet, profil Template KLHK & PLN, validasi & deteksi duplikat
- [x] Statistik dashboard di sisi server untuk data besar
- [x] Pindahkan berkas kerja upload dari disk lokal ke Supabase Storage/database
- [x] Uji pipeline import dengan seluruh data PLN (dry-run) & perbaikan parser koordinat
- [x] Filter lanjutan & pengurutan tabel inventaris
- [ ] Simpan **Kode Trafo** sebagai identitas alat (dasar mode update)
- [ ] Mode *update* data (upsert berdasarkan identitas alat) & riwayat perubahan
- [ ] Ekspor laporan (Excel/PDF)
- [ ] Autentikasi, peran admin/viewer, & Row Level Security

---

## Lisensi & Kontribusi
Dikembangkan untuk keperluan inventarisasi dan pengelolaan PCBs nasional.
