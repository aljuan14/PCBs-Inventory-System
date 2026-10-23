@AGENTS.md

# Cara kerja di proyek ini

## Komunikasi
- Jawab dalam **Bahasa Indonesia**.
- Untuk fitur baru atau perubahan tampilan yang besar, **brainstorming dulu**: beri beberapa pilihan beserta sarannya, lalu tunggu keputusan sebelum membangun.

## Git
- **Commit dan push hanya bila diminta** ("commit dan push").
- Alurnya: branch pendek, lalu commit, `git merge --ff-only` ke `main`, hapus branch, dan push. Setelah push, pantau status deploy Vercel sampai berhasil.
- Sebelum commit, jalankan `npm run lint` dan `npx tsc --noEmit`, dan pastikan keduanya lolos.
- Jangan commit perubahan pada `supabase/migrations/20261013000010_focus_speed.sql` (hanya baris kosong dari editor).

## Data dan kerahasiaan
- Repositori ini **publik**. `Data-inventaris/`, `laporan/`, dan semua `.env*` tidak boleh masuk repo.
- Jangan menerbitkan dokumen atau data perusahaan asli. Untuk screenshot dan contoh, pakai perusahaan uji ZZ Uji A–F.
- **Tanya dulu** sebelum membaca kunci atau database cloud (`.env.web`, `.env.cloud`).
- Database lokal dan cloud terpisah. Sejak 13 Oktober 2026, **cloud adalah data utama**. Lokal disegarkan dengan `npm run data:from-cloud`. Jangan menjalankan `data:to-cloud`.

## Memeriksa perubahan
- Setelah mengubah tampilan, periksa di browser lokal (http://localhost:3000) dengan akun uji, lalu laporkan apa yang sudah dan belum diperiksa.
- Setelah mengubah login, peran, atau menu samping (`useAccess`, `Navbar`, `proxy.ts`, halaman login), uji dengan **login lewat form** untuk setiap peran (admin, pemantau, perusahaan): `node scripts/check-login-menu.mjs <email> <password> --expect "Akun pengguna"`. Membuka halaman langsung atau me-refresh tidak cukup: menu samping sudah dimuat sejak halaman login dan tidak dimuat ulang setelah masuk (bug 23 Oktober 2026: admin tampil seperti akun lihat-saja).
