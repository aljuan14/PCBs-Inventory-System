# 🛡️ PCBs Inventory & Management System

> **Prototipe Web Dashboard Inventarisasi Polychlorinated Biphenyls (PCBs) Multi-Perusahaan**  
> Dibangun dengan arsitektur modern **Next.js 14+ (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL & Storage)**, **SheetJS (`xlsx`)**, **Leaflet GIS**, dan **Recharts**.

---

## 📌 Latar Belakang & Konteks Regulasi

**Polychlorinated Biphenyls (PCBs)** merupakan senyawa kimia organik sintetis yang tergolong Bahan Berbahaya dan Beracun (B3) serta *Persistent Organic Pollutants* (POPs) yang diatur secara ketat dalam **Konvensi Stockholm** dan regulasi Kementerian Lingkungan Hidup dan Kehutanan (KLHK) Republik Indonesia. 

Peralatan industri yang berpotensi mengandung PCBs meliputi:
1. **Transformator**: Trafo berdaya listrik tinggi yang menggunakan minyak dielektrik askarel atau oli mineral terkontaminasi.
2. **Kapasitor**: Bank kapasitor unit/pabrik yang menggunakan cairan isolasi dielektrik sintetis.
3. **Minyak Dielektrik Cadangan / Bekas**: Drum atau tangki penyimpanan oli dielektrik cadangan, hasil *draining*, atau oli servis.

Tantangan utama dalam inventarisasi nasional adalah **format pelaporan dari ribuan perusahaan tidak seragam** (urutan kolom berbeda, nama header beragam, terdapat judul bertingkat 2–4 baris di awal spreadsheet). Prototipe ini dirancang untuk membaca berkas Excel apa pun, mendeteksi baris datanya, memetakan kolom secara dinamis ke skema baku, mengonversi koordinat DMS menjadi desimal spasial, dan memvisualisasikannya ke dashboard GIS nasional.

---

## ✨ Fitur Utama yang Tersedia

### 1. 📂 Smart Header Sniffer & Upload (`/upload`)
- **Multi-Level Header Sniffer**: Algoritma cerdas di `lib/excel.ts` memindai berkas Excel dan secara otomatis menemukan baris header sebenarnya, melewati baris judul bertingkat (2–4 baris awal dokumen).
- **Profil Perusahaan Terintegrasi**: Pilih perusahaan terdaftar atau langsung tambahkan profil perusahaan baru secara instan.
- **Pratinjau Data Awal**: Menampilkan 5 baris pertama data mentah sebelum proses pemetaan kolom.

### 2. 🔄 Manual Column Mapping & DMS Parser (`/upload/[batchId]/mapping`)
- **Visual Column Mapper**: Antarmuka sisi-kiri (kolom Excel asli beserta sampel data) dan sisi-kanan (dropdown field baku database).
- **Heuristic Auto-Suggestion**: Otomatis mendeteksi dan memilih kolom umum seperti Nama Merek, Nomor Seri, Koordinat, Daya (kVA), dan Konsentrasi PCB (ppm).
- **DMS Coordinate Parser (`lib/dms.ts`)**: Mengonversi koordinat derajat menit detik (termasuk format lokal `LS`, `LU`, `BT`, `BB`, desimal koma `,`, serta typo format seperti `35',973"`) menjadi angka desimal `latitude` dan `longitude` spasial.
- **Validasi Kolom Wajib**: Memastikan kolom kunci seperti Merek atau Nomor Seri terpetakan sebelum data diimpor.

### 3. 📊 Dashboard Spasial & Statistik GIS (`/` & `/dashboard`)
- **4 Kartu Metrik KPI**: Ringkasan total perusahaan terdata, transformator (aktif vs non-aktif), kapasitor unit, dan volume minyak dielektrik.
- **Peta Spasial Interaktif (Leaflet GIS)**: Menampilkan sebaran titik koordinat di seluruh wilayah kepulauan Indonesia:
  - 🔵 **Biru**: Transformator
  - 🟡 **Kuning/Amber**: Kapasitor
  - 🟢 **Hijau**: Minyak Dielektrik
  - Dilengkapi *Popup* informatif saat pin diklik (nama alat, nomor seri, perusahaan, dan status kadar PCB).
- **Visualisasi Grafik Analitis (Recharts)**:
  - Diagram Batang: Distribusi klasifikasi bahaya PCB per jenis alat.
  - Diagram Donut: Proporsi risiko keseluruhan:
    - **Bebas PCB** (`< 50 ppm`)
    - **Terkontaminasi** (`50 – 500 ppm`)
    - **Bahaya Tinggi** (`> 500 ppm`)
    - **Belum Diuji**
- **Tabel Data Inventaris Interaktif**:
  - Filter berdasarkan jenis peralatan.
  - Filter berdasarkan perusahaan pelapor.
  - Filter berdasarkan tingkat konsentrasi PCB.
  - Pencarian teks langsung (nama alat, nomor seri, lokasi).
  - Paginasi data yang rapi.

---

## 🗄️ Skema Database Supabase (PostgreSQL)

Skema database lengkap terdapat di berkas `supabase/migrations/20260922000001_initial_schema.sql`:

| Tabel | Fungsi & Deskripsi |
|---|---|
| `companies` | Menyimpan profil identitas perusahaan pemilik peralatan (nama, NPWP/ID, alamat, PIC, kontak). |
| `import_batches` | Riwayat unggahan berkas Excel per perusahaan beserta status pipeline (`pending_mapping`, `mapped`, `imported`, `error`). |
| `transformator` | Inventarisasi trafo lengkap (koordinat desimal, raw DMS, kapasitas kVA, oli, hasil uji ppm, riwayat perawatan). |
| `kapasitor` | Inventarisasi kapasitor bank/unit (koordinat, merek, tahun, status alat). |
| `minyak_dielektrik` | Inventarisasi drum / tangki penyimpanan oli dielektrik cadangan (koordinat, volume liter, tipe wadah, uji ppm). |
| `field_definitions` | Kamus acuan field baku untuk mengisi pilihan dropdown mapping kolom dinamis di UI. |

---

## 🚀 Panduan Memulai Cepat

### 1. Prasyarat Sistem
- **Node.js**: v18.0.0 atau lebih baru (Disarankan Node.js v20+)
- **Git**
- Akun dan proyek aktif di **[Supabase](https://supabase.com)**

### 2. Kloning Repositori & Instalasi
```bash
git clone https://github.com/aljuan14/PCBs-Inventory-System.git
cd PCBs-Inventory-System
npm install
```

### 3. Konfigurasi Variabel Lingkungan (`.env.local`)
Buat atau periksa berkas `.env.local` di root proyek:
```env
NEXT_PUBLIC_SUPABASE_URL=https://fifjrfzwqhmexnanaoag.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

SUPABASE_URL=https://fifjrfzwqhmexnanaoag.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
> **Penting**: Pastikan URL tidak berakhiran `/rest/v1/` dan tidak ada spasi setelah tanda sama dengan (`=`).

### 4. Eksekusi Skema Database di Supabase
1. Masuk ke [Dashboard Proyek Supabase](https://supabase.com/dashboard).
2. Pilih menu **SQL Editor** pada navigasi sebelah kiri.
3. Buka berkas `supabase/migrations/20260922000001_initial_schema.sql`, salin seluruh kodenya, tempel di SQL Editor, lalu klik **Run**.
4. Buka tab query baru, salin isi berkas `supabase/seed.sql`, tempel, lalu klik **Run** untuk mengisi kamus field dan data sampel perusahaan.
5. *(Opsional untuk file storage)*: Buka menu **Storage**, buat bucket baru bernama `pcbs-files` dengan status **Public**.

### 5. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka browser Anda di **`http://localhost:3000`**.

---

## 📁 Struktur Direktori Proyek

```text
├── app/
│   ├── api/
│   │   ├── import/route.ts          # API eksekusi mapping, parsing DMS, & insert ke DB
│   │   ├── mapping/[batchId]/route.ts # API penyedia info batch & kamus field
│   │   └── upload/route.ts          # API upload file Excel & sniffing header
│   ├── dashboard/page.tsx           # Halaman utama Dashboard (KPI, Map, Charts, Table)
│   ├── upload/
│   │   ├── page.tsx                 # Langkah 1: Upload Excel & Deteksi Header
│   │   └── [batchId]/mapping/       # Langkah 2: Pemetaan Kolom Manual
│   ├── globals.css                  # Konfigurasi Tailwind CSS & Light Theme
│   ├── layout.tsx                   # Root Layout dengan Navbar
│   └── page.tsx                     # Entry point (merender Dashboard)
├── components/
│   ├── DashboardCharts.tsx          # Komponen grafik analitis Recharts
│   ├── DataTable.tsx                # Komponen tabel interaktif dengan multi-filter
│   ├── MapLeaflet.tsx               # Komponen peta Leaflet GIS (No-SSR)
│   └── Navbar.tsx                   # Navigasi atas dengan indikator sistem
├── lib/
│   ├── dms.ts                       # Utility pengubah koordinat DMS ke Desimal
│   ├── excel.ts                     # Utility parser Excel & Smart Header Sniffer
│   ├── types.ts                     # Definisi tipe data TypeScript
│   └── supabase/
│       ├── client.ts                # Supabase Browser Client (@supabase/ssr)
│       └── server.ts                # Supabase Server Client (@supabase/ssr)
├── scripts/
│   ├── test-dms.ts                  # Unit test parser koordinat DMS
│   └── test-supabase.ts             # Script penguji koneksi Supabase
├── supabase/
│   ├── migrations/                  # Berkas migration SQL
│   └── seed.sql                     # Seed kamus field & data perusahaan awal
├── .env.example                     # Template konfigurasi environment
└── README.md                        # Dokumentasi resmi proyek
```

---

## 🧪 Pengujian Unit Parser DMS

Untuk menguji keakuratan parser koordinat DMS dari baris perintah:
```bash
npx tsx scripts/test-dms.ts
```

Contoh hasil konversi:
- `"S 7 2' 17,151\" E 107 35',973\""` ➔ `Lat: -7.0380975, Lon: 107.5836036` (Valid: `true`)
- `"LS 07° 02' 17.151\" BT 107° 35' 00.973\""` ➔ `Lat: -7.0380975, Lon: 107.5836036` (Valid: `true`)
- `"-7.038097, 107.583604"` ➔ `Lat: -7.038097, Lon: 107.583604` (Valid: `true`)

---

## 📄 Lisensi & Kontribusi
Dikembangkan untuk keperluan inventarisasi dan pengelolaan PCBs nasional. Dikelola oleh [aljuan14](https://github.com/aljuan14).
