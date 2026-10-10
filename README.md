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
| Fitur | Semua | Dashboard, tonase, peta, daftar Lampiran I/II. Tanpa tabel, unggah, edit |
| Cara menjalankan | `npm run offline`, lihat **[OFFLINE.md](OFFLINE.md)** | https://pcbs-inventory-system.vercel.app |

Keduanya wajib login. Akun dibuat oleh admin, dan pendaftaran dari halaman login ditutup. Web diperbarui otomatis setiap `npm run data:push` dari laptop admin (lihat [Memperbarui web](#memperbarui-web)).

---

## Fitur

### Dashboard nasional

| Bagian | Isi |
|---|---|
| Filter | Perusahaan › Unit Induk › Unit Pelaksana. Pemilih perusahaan bisa dicari dan berlaku untuk seluruh halaman. |
| Ringkasan | Total transformator, kapasitor, dan minyak dielektrik. Di bawahnya satu kolom per jenis trafo (digunakan dan tidak digunakan, masing-masing dengan latar warnanya): tahun produksi, lalu Status PCBs (< 2, 2–50, > 50 ppm, belum diuji) dengan tombol **< 1997 / Semua**. |
| Tonase transformator | Tombol **< 1997 / Semua**. Total tonase, lalu grafik kolom per kadar PCBs (> 50 ppm, ≤ 50 ppm, belum diuji) untuk tiap jenis trafo, dan baris terpisah untuk trafo yang tahun pembuatannya kosong. Skala logaritmik agar angka kecil tetap terlihat. |
| Tabel data | Semua kolom, pencarian, filter, edit dan hapus. Baris dimuat 50 per langkah saat tabel di-scroll. *(offline)* |
| Peta sebaran | Filter kategori, perusahaan, Status PCBs, dan tahun. Titik dikelompokkan per wilayah (lingkaran berangka dengan cincin warna per status), lalu tampil satuan saat diperbesar. Warna per Status PCBs atau kategori, pilihan peta atau satelit, dan layar penuh. |

Hampir semua angka bisa diklik untuk membuka datanya di tabel *(offline)*.

### Halaman per kategori

Trafo digunakan, trafo tidak digunakan, kapasitor, dan minyak dielektrik, masing-masing dengan kartu angka, grafik, tabel, dan peta.

- **Kapasitor:** daftar 72 nama dagang kapasitor yang mengandung PCBs (**Lampiran II** Permen LHK No. P.29/2020), dicocokkan dengan merek dan tahun di data: *berpotensi PCBs*, *perlu dicek* (tahun kosong), atau *di luar batas tahun*.
- **Semua kategori:** daftar 110 nama dagang minyak dielektrik yang mengandung PCBs (**Lampiran I**), dicocokkan dengan merek minyak di data. Tulisan seperti "non pcb oil" tidak dihitung.

### Impor data *(offline)*

| Langkah | Keterangan |
|---|---|
| Unggah | Workbook multi-sheet hingga 50 MB langsung ke Storage. |
| Deteksi format | Header dicari otomatis (termasuk judul bertingkat) dan dikenali sebagai Template KLHK atau format PLN beserta kategorinya. |
| Pemetaan kolom | Otomatis sesuai format. Admin cukup mengonfirmasi. |
| Pemeriksaan | Koordinat tidak terbaca, angka atau tanggal tidak valid, kolom penting kosong, dan duplikat, lengkap dengan nomor baris Excel. |
| Impor | Baris yang sudah ada dilewati. Berkas revisi bisa **mengganti** unggahan lama dalam satu transaksi. |
| Perbaikan otomatis | Koordinat DMS, koma desimal, dan lintang-bujur tertukar. Nama unit PLN diseragamkan. Berat trafo dalam ton dikoreksi. Baris contoh, kosong, dan tempelan ganda dilewati. |

### Perusahaan & kualitas data *(offline)*

- **Perusahaan:** isi data per perusahaan, hasil pemeriksaan siap dikirim lewat email, dan status pengiriman (belum dikirim, sudah dikirim, ada data baru, kosong).
- **Kualitas data:** skor kelengkapan per perusahaan dan unit, plus laporan temuan yang bisa diekspor ke Excel atau PDF.

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
| `npm run offline:user -- email password` | Buat akun atau ganti password (offline) |

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
| `summary_map_cells`, `summary_brand_counts`, `summary_meta` | Ringkasan untuk web: sel peta, jumlah merek, waktu kirim |
| RPC `inventory_stats`, `inventory_charts`, `inventory_units`, `inventory_quality` | Statistik, grafik, daftar unit, dan kualitas data |
| RPC `map_clusters`, `oil_brand_counts`, `summary_build`, `summary_cells` | Peta per wilayah, merek minyak, serta pembuatan dan pembacaan ringkasan web |
| Storage `pcbs-files` | Workbook yang diunggah (privat) |

Semua tabel, fungsi, dan bucket hanya bisa diakses pengguna yang sudah login.

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
- [x] Tonase transformator per kadar PCBs, < 1997 / semua
- [x] Peta dengan filter dan pengelompokan per wilayah untuk semua titik
- [x] Daftar Lampiran I & II Permen LHK 29/2020 yang dicocokkan dengan data
- [x] Login, Row Level Security, mode offline, dan sinkronisasi antar-laptop
- [x] Web hanya-ringkasan yang diperbarui dari laptop admin

**Berikutnya**
- [ ] Judul hasil uji ppm sesuai arahan pimpinan ("hasil pengujian minyak dielektrik")
- [ ] Konverter PDF ke Excel untuk laporan yang hanya dikirim sebagai PDF
- [ ] Uji mode offline di laptop Windows
- [ ] Tampilan ponsel dan peran admin/viewer
- [ ] Tabel ringkasan untuk kualitas data (`inventory_quality` masih membaca seluruh baris)
