-- ==============================================================================
-- Seed: seed.sql
-- Proyek: PCBs Inventory System
-- Kamus field baku untuk manual mapping dropdown di UI
-- ==============================================================================

-- Hapus data seed sebelumnya agar idempotent
DELETE FROM public.field_definitions;

-- 1. SEED UNTUK TRANSFORMATOR
INSERT INTO public.field_definitions (jenis_data, field_key, label, tipe_data, wajib) VALUES
('transformator', 'nama_merek', 'Nama Merek / Pabrikan', 'text', true),
('transformator', 'nomor_serial', 'Nomor Serial', 'text', true),
('transformator', 'status', 'Status (Aktif / Non-Aktif)', 'text', false),
('transformator', 'tahun_pembuatan', 'Tahun Pembuatan', 'number', false),
('transformator', 'negara_asal_produsen', 'Negara Asal Produsen', 'text', false),
('transformator', 'merek_minyak_dielektrik', 'Merek Minyak Dielektrik', 'text', false),
('transformator', 'volume_minyak_dielektrik_l', 'Volume Minyak Dielektrik (Liter)', 'number', false),
('transformator', 'lokasi_peralatan', 'Lokasi Peralatan', 'text', false),
('transformator', 'titik_koordinat_raw', 'Titik Koordinat (DMS / Desimal)', 'text', false),
('transformator', 'daya_kva', 'Daya (kVA)', 'number', false),
('transformator', 'ketersediaan_keran_buang', 'Ketersediaan Keran Buang (Drain Valve)', 'text', false),
('transformator', 'perawatan_jenis', 'Jenis Perawatan', 'text', false),
('transformator', 'perawatan_waktu', 'Waktu Perawatan Terakhir', 'date', false),
('transformator', 'perawatan_merek_oli_pengganti', 'Merek Oli Pengganti Perawatan', 'text', false),
('transformator', 'perawatan_volume_ditambahkan_l', 'Volume Oli Ditambahkan (Liter)', 'number', false),
('transformator', 'uji_penyedia_jasa', 'Penyedia Jasa Uji Laboratorium', 'text', false),
('transformator', 'uji_jenis', 'Jenis Uji PCBs', 'text', false),
('transformator', 'uji_metode', 'Metode Uji (Dexsil / GC-MS / dll)', 'text', false),
('transformator', 'konsentrasi_pcb_ppm', 'Konsentrasi PCB (ppm)', 'number', false),
('transformator', 'berat_ton', 'Berat Total (Ton)', 'number', false),
('transformator', 'peralatan_tanggap_darurat', 'Peralatan Tanggap Darurat', 'text', false),
('transformator', 'kondisi_di_dalam_alat', 'Kondisi di Dalam Alat', 'text', false),
('transformator', 'status_kondisi', 'Status Kondisi Fisik', 'text', false),
('transformator', 'waktu_terakhir_digunakan', 'Waktu Terakhir Digunakan', 'date', false);

-- 2. SEED UNTUK KAPASITOR
INSERT INTO public.field_definitions (jenis_data, field_key, label, tipe_data, wajib) VALUES
('kapasitor', 'nama_merek', 'Nama Merek / Pabrikan', 'text', true),
('kapasitor', 'nomor_serial', 'Nomor Serial', 'text', false),
('kapasitor', 'tahun_pembuatan', 'Tahun Pembuatan', 'number', false),
('kapasitor', 'negara_asal_produsen', 'Negara Asal Produsen', 'text', false),
('kapasitor', 'merek_minyak_dielektrik', 'Merek Minyak Dielektrik', 'text', false),
('kapasitor', 'lokasi', 'Lokasi / Ruangan', 'text', false),
('kapasitor', 'titik_koordinat_raw', 'Titik Koordinat (DMS / Desimal)', 'text', false),
('kapasitor', 'status_alat', 'Status Peralatan (Aktif/Non-Aktif/dll)', 'text', false);

-- 3. SEED UNTUK MINYAK DIELEKTRIK
INSERT INTO public.field_definitions (jenis_data, field_key, label, tipe_data, wajib) VALUES
('minyak_dielektrik', 'merek', 'Merek Minyak Dielektrik', 'text', true),
('minyak_dielektrik', 'volume_l', 'Volume (Liter)', 'number', false),
('minyak_dielektrik', 'tahun_pembuatan', 'Tahun Pembuatan', 'number', false),
('minyak_dielektrik', 'negara_asal_produsen', 'Negara Asal Produsen', 'text', false),
('minyak_dielektrik', 'lokasi_penyimpanan', 'Lokasi Penyimpanan / Gudang', 'text', false),
('minyak_dielektrik', 'titik_koordinat_raw', 'Titik Koordinat (DMS / Desimal)', 'text', false),
('minyak_dielektrik', 'status', 'Status Minyak', 'text', false),
('minyak_dielektrik', 'uji_penyedia_jasa', 'Penyedia Jasa Uji', 'text', false),
('minyak_dielektrik', 'uji_jenis', 'Jenis Uji PCBs', 'text', false),
('minyak_dielektrik', 'uji_metode', 'Metode Uji', 'text', false),
('minyak_dielektrik', 'konsentrasi_pcb_ppm', 'Konsentrasi PCB (ppm)', 'number', false),
('minyak_dielektrik', 'wadah_penyimpanan', 'Tipe Wadah Penyimpanan (Drum/IBC/Tangki)', 'text', false);

-- SAMPLE PERUSAHAAN (Opsional untuk mempermudah tes awal upload)
INSERT INTO public.companies (nama_perusahaan, sektor_industri, alamat, nama_pic, kontak_pic)
VALUES 
('PT Indonesia Power Substation A', 'Ketenagalistrikan', 'Jl. Jenderal Sudirman No. 12, Jakarta Pusat', 'Budi Santoso', '081234567890'),
('PT Petrochemical Nusantara', 'Industri Kimia', 'Kawasan Industri Cilegon, Banten', 'Rina Wijaya', '081398765432'),
('PT Baja Pratama Mandiri', 'Manufaktur & Metalurgi', 'Kawasan Industri KIIC, Karawang, Jawa Barat', 'Agus Hendrawan', '081122334455')
ON CONFLICT DO NOTHING;
