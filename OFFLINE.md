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

Pasang `git`, Node.js LTS, dan Docker Engine, pastikan user ada di grup `docker`,
lalu jalankan perintah yang sama seperti di atas.

## Pemakaian sehari-hari

1. Buka Docker Desktop (kalau belum otomatis).
2. Di folder aplikasi: `npm run offline`
   - memperbarui kode aplikasi,
   - menyalakan database lokal,
   - **mengambil data terbaru**,
   - membuka http://localhost:3000 di browser.
3. Selesai: tutup jendela terminal (atau Ctrl+C). Database tetap tersimpan;
   `npm run db:stop` untuk mematikan container Docker-nya.

## Khusus admin: membagikan perubahan data

Setelah impor, hapus perusahaan, atau perubahan data lainnya:

```bash
npm run data:push
```

Aturan agar data tidak saling menimpa:

- Hanya **satu orang** yang mengubah data (admin).
- `data:push` menolak kalau di repo ada versi yang belum kamu ambil. Jalankan
  `npm run data:pull` dulu.
- `data:pull` menolak kalau laptop ini punya perubahan yang belum di-push, karena
  perubahan itu akan hilang. Gunakan `npm run data:pull -- --force` hanya kalau
  perubahan lokal memang boleh dibuang.

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
| `npm run data:pull` | ambil data terbaru saja |
| `npm run db:start` / `npm run db:stop` | nyalakan / matikan Supabase lokal |
| `npm run data:from-cloud -- "<connection string>"` | salin data dari Supabase Cloud (sekali, saat pindah) |

## Catatan keamanan

- Supabase lokal memakai kunci dan password bawaan CLI (sama di semua instalasi).
  Port-nya (54321, 54322) **tidak boleh bisa diakses dari jaringan lain**.
  Jangan matikan firewall Windows, dan jangan izinkan Docker di jaringan *Public*.
- File `.env.local` ditulis otomatis. Kalau sebelumnya berisi konfigurasi Supabase Cloud,
  salinannya disimpan sebagai `.env.cloud`.
- Repo data berisi seluruh data inventaris dan hash password akun: jaga agar tetap **private**.
