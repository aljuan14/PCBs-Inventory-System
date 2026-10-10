# Mode offline

Aplikasi berjalan di laptop masing-masing: Supabase lokal di Docker, Next.js di Node.
Data dibagikan lewat repo GitHub **private** `aljuan14/PCBs-Inventory-Data`
(bukan repo kode ini, karena repo kode bersifat publik).

```
Laptop admin (impor data)                    Laptop lain (lihat data)
  npm run offline   ─┐                          npm run offline
  impor Excel        │                            └─ otomatis ambil data terbaru
  npm run data:push ─┴─> PCBs-Inventory-Data ────────┘
```

Internet tetap dibutuhkan untuk: sinkronisasi data, build pertama (font), dan peta (tile OpenStreetMap).

## Pemasangan pertama (sekali per laptop)

### Windows

1. Pasang **Git for Windows**: https://git-scm.com/download/win (pilihan bawaan saja).
2. Pasang **Node.js LTS**: https://nodejs.org
3. Pasang **Docker Desktop**: https://www.docker.com/products/docker-desktop
   - Saat diminta, aktifkan **WSL 2**, lalu restart laptop.
   - Buka Docker Desktop sampai statusnya *Engine running*.
   - Settings → General → centang **Start Docker Desktop when you sign in** (opsional).
4. Minta admin menambahkan akun GitHub-mu sebagai *collaborator* di repo `PCBs-Inventory-Data`.
5. Buka **PowerShell**, lalu:
   ```powershell
   git clone https://github.com/aljuan14/PCBs-Inventory-System.git
   cd PCBs-Inventory-System
   npm install
   npm run offline
   ```
   Saat pertama kali, Git akan membuka jendela login GitHub. Unduhan Docker pertama
   memakan waktu beberapa menit.

### Linux

Pasang `git`, Node.js LTS, dan Docker Engine, lalu:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER      # lalu logout/login
```

Setelah itu jalankan perintah yang sama seperti di atas.

## Pemakaian sehari-hari

1. Buka Docker Desktop (kalau belum otomatis).
2. Di folder aplikasi: `npm run offline`
   - memperbarui kode aplikasi,
   - menyalakan database lokal,
   - **mengambil data terbaru**,
   - membuka http://localhost:3000 di browser.
3. Selesai: tekan **Ctrl+C** di terminal. Kalau ada perubahan data di laptop ini,
   datanya **otomatis dikirim** ke repo sebelum aplikasi tertutup (tunggu sampai
   muncul prompt lagi). Tekan Ctrl+C sekali lagi kalau ingin melewati pengiriman.
   Menutup jendela terminal langsung **tidak** mengirim data.
   Database tetap tersimpan; `npm run db:stop` untuk mematikan container Docker-nya.

## Khusus admin: membagikan perubahan data

Perubahan data (impor, hapus perusahaan, dll.) dikirim otomatis saat aplikasi
ditutup dengan Ctrl+C. Untuk mengirim lebih cepat tanpa menutup aplikasi, jalankan
di terminal lain:

```bash
npm run data:push
```

Kalau pengiriman otomatis gagal (misalnya tidak ada internet), pesannya muncul di
terminal; jalankan `npm run data:push` lagi nanti.

Aturan agar data tidak saling menimpa:

- Hanya **satu orang** yang mengubah data (admin).
- `data:push` menolak kalau di repo ada versi yang belum kamu ambil. Jalankan
  `npm run data:pull` dulu.
- `data:pull` menolak kalau laptop ini punya perubahan yang belum di-push, karena
  perubahan itu akan hilang. Gunakan `npm run data:pull -- --force` hanya kalau
  perubahan lokal memang boleh dibuang.

## Khusus admin: ringkasan di web

Web di Vercel hanya menampilkan **ringkasan** (angka dashboard, tonase, peta per
wilayah, daftar Lampiran I/II), bukan baris data. Ringkasannya dikirim dari laptop
admin ke Supabase Cloud, jadi baris data tetap hanya ada di laptop.

Persiapan (sekali, di laptop admin saja):

1. Jalankan migrasi `supabase/migrations/20261010000003_web_summary.sql` di SQL
   Editor Supabase Cloud.
2. Buat file `.env.web` di folder proyek (tidak ikut ke git) berisi connection
   string "Session pooler" dari dashboard Supabase (tombol *Connect*):

   ```
   WEB_DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
   ```

3. Kirim pertama kali. Data lama di cloud dicadangkan dulu ke
   `Data-inventaris/backup-cloud/`, lalu dikosongkan:

   ```bash
   npm run web:publish -- --reset
   ```

4. Di Vercel (*Settings → Environment Variables*), tambahkan
   `NEXT_PUBLIC_DATA_MODE` = `summary`, lalu *Redeploy*.

Setelah itu ringkasan web ikut diperbarui setiap `npm run data:push` (termasuk
saat aplikasi ditutup dengan Ctrl+C). Kalau gagal, data tetap terkirim ke repo;
jalankan `npm run web:publish` lagi nanti.

## Akun login

Akun ikut tersinkron bersama data, jadi sama di semua laptop.

```bash
npm run offline:user -- nama@contoh.com passwordbaru   # buat akun / ganti password
npm run data:push                                       # bagikan ke laptop lain
```

Pendaftaran dari halaman login dimatikan, dan reset password lewat email tidak tersedia.

## Perintah lain

| Perintah | Fungsi |
|---|---|
| `npm run offline -- --dev` | seperti `offline`, tetapi pakai `next dev` (untuk pengembangan) |
| `npm run data:push` | kirim perubahan data sekarang |
| `npm run data:pull` | ambil data terbaru saja |
| `npm run web:publish` | kirim ringkasan ke web sekarang (perlu `.env.web`) |
| `npm run db:start` / `npm run db:stop` | nyalakan / matikan Supabase lokal |
| `npm run data:from-cloud -- "<connection string>"` | salin data dari Supabase Cloud (sekali, saat pindah) |

## Catatan keamanan

- Supabase lokal memakai kunci dan password bawaan CLI (sama di semua instalasi),
  jadi port-nya (54321 API, 54322 database, 54323 Studio) **hanya dibuka untuk laptop
  itu sendiri**: script membuat jaringan Docker Supabase dengan alamat `127.0.0.1`
  sebelum Supabase dinyalakan, lalu memeriksa ulang dan mematikan Supabase kalau
  ternyata ada port yang terbuka ke jaringan. Jalankan Supabase lewat `npm run offline`
  atau `npm run db:start`, jangan `npx supabase start` langsung.
- Supabase Studio (http://127.0.0.1:54323) bisa dipakai untuk melihat isi database.
- File `.env.local` ditulis otomatis. Kalau sebelumnya berisi konfigurasi Supabase Cloud,
  salinannya disimpan sebagai `.env.cloud`.
- Repo data berisi seluruh data inventaris dan hash password akun: jaga agar tetap **private**.
