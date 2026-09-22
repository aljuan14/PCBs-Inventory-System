# PCBs-Inventory-System

Prototipe Web Dashboard Inventarisasi PCBs (Polychlorinated Biphenyls) dari berkas Excel multi-perusahaan.

## Tech Stack
- **Framework**: Next.js 14+ (App Router) & TypeScript
- **Styling**: Tailwind CSS
- **Database & Storage**: Supabase (PostgreSQL & Supabase Storage)
- **Excel Parser**: SheetJS (`xlsx`)
- **GIS / Mapping**: Leaflet
- **Data Visualization**: Recharts
- **Icons**: Lucide React

---

## Struktur Database & Migration Supabase

Skema database tersimpan di direktori `/supabase`:
- `supabase/migrations/20260922000001_initial_schema.sql`:
  - `companies`: Data profil perusahaan pemilik peralatan/minyak.
  - `import_batches`: Riwayat batch unggahan berkas Excel per perusahaan.
  - `transformator`: Inventarisasi trafo lengkap (koordinat, kapasitas, uji PCB, kondisi).
  - `kapasitor`: Inventarisasi kapasitor lengkap.
  - `minyak_dielektrik`: Inventarisasi drum/tangki minyak cadangan/bekas.
  - `field_definitions`: Kamus field baku untuk mapping dinamis kolom Excel.
- `supabase/seed.sql`: Data awal kamus field baku untuk transformator, kapasitor, dan minyak dielektrik serta data sampel perusahaan.

---

## Panduan Menjalankan Migration & Seed di Supabase

1. Buka dashboard proyek Supabase Anda di browser: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Masuk ke proyek Anda (`fifjrfzwqhmexnanaoag`).
3. Pada menu navigasi sebelah kiri, klik **SQL Editor** (ikon tanda kurung siku `>_`).
4. Klik **New query**.
5. Buka berkas [supabase/migrations/20260922000001_initial_schema.sql](supabase/migrations/20260922000001_initial_schema.sql), salin seluruh isinya, tempel ke SQL Editor, lalu klik tombol **Run**.
6. Setelah tabel berhasil dibuat, buat query baru lagi, salin isi berkas [supabase/seed.sql](supabase/seed.sql), tempel, lalu klik tombol **Run**.
7. *(Opsional untuk upload file)*: Buka menu **Storage**, klik **New bucket**, beri nama bucket `pcbs-files` dengan status **Public bucket** agar file asli yang diunggah dapat disimpan dan diunduh.

---

## Konfigurasi Environment (`.env.local`)

Pastikan berkas `.env.local` memiliki format yang benar:
```env
NEXT_PUBLIC_SUPABASE_URL=https://fifjrfzwqhmexnanaoag.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

SUPABASE_URL=https://fifjrfzwqhmexnanaoag.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
> **Catatan Penting**: URL Supabase tidak boleh memiliki akhiran `/rest/v1/` dan key tidak boleh ada spasi setelah tanda sama dengan (`=`).

---

## Utility DMS Parser (`lib/dms.ts`)

Mengonversi koordinat derajat menit detik (DMS) menjadi koordinat desimal `latitude` dan `longitude`. Mendukung format Indonesia (`LS`, `LU`, `BT`, `BB`), simbol derajat/menit/detik, penanganan koma desimal, serta penanganan typo seperti `35',973"`.

Uji coba parser:
```bash
npx tsx scripts/test-dms.ts
```

---

## Panduan Push ke GitHub

Jalankan perintah berikut di terminal Anda untuk menghubungkan dan melakukan push ke repositori GitHub:

```bash
git add .
git commit -m "feat: complete Phase 1 database schema, seed, DMS parser, and Supabase client setup"
git branch -M main
git remote add origin https://github.com/aljuan14/PCBs-Inventory-System.git
git push -u origin main
```
