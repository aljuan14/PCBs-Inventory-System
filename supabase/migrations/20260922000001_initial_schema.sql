-- ==============================================================================
-- Migration: 20260922000001_initial_schema.sql
-- Proyek: PCBs (Polychlorinated Biphenyls) Inventory System
-- Database: PostgreSQL (Supabase)
-- ==============================================================================

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- TABEL: companies
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_perusahaan TEXT NOT NULL,
    npwp_atau_id TEXT,
    alamat TEXT,
    sektor_industri TEXT,
    nama_pic TEXT,
    kontak_pic TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index untuk pencarian perusahaan berdasarkan nama
CREATE INDEX IF NOT EXISTS idx_companies_nama ON public.companies (nama_perusahaan);

-- ==============================================================================
-- TABEL: import_batches
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    jenis_data TEXT NOT NULL CHECK (jenis_data IN ('transformator', 'kapasitor', 'minyak_dielektrik')),
    nama_file_asli TEXT NOT NULL,
    file_storage_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending_mapping' CHECK (status IN ('pending_mapping', 'mapped', 'imported', 'error')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_company ON public.import_batches (company_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON public.import_batches (status);

-- ==============================================================================
-- TABEL: transformator
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.transformator (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'aktif',
    nama_merek TEXT NOT NULL,
    nomor_serial TEXT NOT NULL,
    tahun_pembuatan INT,
    negara_asal_produsen TEXT,
    merek_minyak_dielektrik TEXT,
    volume_minyak_dielektrik_l NUMERIC,
    lokasi_peralatan TEXT,
    titik_koordinat_raw TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    daya_kva NUMERIC,
    ketersediaan_keran_buang TEXT,
    perawatan_jenis TEXT,
    perawatan_waktu DATE,
    perawatan_merek_oli_pengganti TEXT,
    perawatan_volume_ditambahkan_l NUMERIC,
    uji_penyedia_jasa TEXT,
    uji_jenis TEXT,
    uji_metode TEXT,
    konsentrasi_pcb_ppm NUMERIC,
    berat_ton NUMERIC,
    peralatan_tanggap_darurat TEXT,
    kondisi_di_dalam_alat TEXT,
    status_kondisi TEXT,
    waktu_terakhir_digunakan DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transformator_company ON public.transformator (company_id);
CREATE INDEX IF NOT EXISTS idx_transformator_batch ON public.transformator (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_transformator_coords ON public.transformator (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_transformator_konsentrasi ON public.transformator (konsentrasi_pcb_ppm);

-- ==============================================================================
-- TABEL: kapasitor
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.kapasitor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nama_merek TEXT NOT NULL,
    nomor_serial TEXT,
    tahun_pembuatan INT,
    negara_asal_produsen TEXT,
    merek_minyak_dielektrik TEXT,
    lokasi TEXT,
    titik_koordinat_raw TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    status_alat TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kapasitor_company ON public.kapasitor (company_id);
CREATE INDEX IF NOT EXISTS idx_kapasitor_batch ON public.kapasitor (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_kapasitor_coords ON public.kapasitor (latitude, longitude);

-- ==============================================================================
-- TABEL: minyak_dielektrik
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.minyak_dielektrik (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    merek TEXT NOT NULL,
    volume_l NUMERIC,
    tahun_pembuatan INT,
    negara_asal_produsen TEXT,
    lokasi_penyimpanan TEXT,
    titik_koordinat_raw TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    status TEXT,
    uji_penyedia_jasa TEXT,
    uji_jenis TEXT,
    uji_metode TEXT,
    konsentrasi_pcb_ppm NUMERIC,
    wadah_penyimpanan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minyak_company ON public.minyak_dielektrik (company_id);
CREATE INDEX IF NOT EXISTS idx_minyak_batch ON public.minyak_dielektrik (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_minyak_coords ON public.minyak_dielektrik (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_minyak_konsentrasi ON public.minyak_dielektrik (konsentrasi_pcb_ppm);

-- ==============================================================================
-- TABEL: field_definitions (Kamus Field Baku untuk Manual Mapping Dropdown)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jenis_data TEXT NOT NULL CHECK (jenis_data IN ('transformator', 'kapasitor', 'minyak_dielektrik')),
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    tipe_data TEXT NOT NULL CHECK (tipe_data IN ('text', 'number', 'date')),
    wajib BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_jenis_field UNIQUE (jenis_data, field_key)
);

CREATE INDEX IF NOT EXISTS idx_field_definitions_jenis ON public.field_definitions (jenis_data);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Prototipe internal: Mengizinkan akses baca & tulis anon / service_role
-- ==============================================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transformator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kapasitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minyak_dielektrik ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;

-- Buat policy publik permisif (Cocok untuk prototipe internal tanpa login ketat)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public full access on companies" ON public.companies;
    CREATE POLICY "Public full access on companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public full access on import_batches" ON public.import_batches;
    CREATE POLICY "Public full access on import_batches" ON public.import_batches FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public full access on transformator" ON public.transformator;
    CREATE POLICY "Public full access on transformator" ON public.transformator FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public full access on kapasitor" ON public.kapasitor;
    CREATE POLICY "Public full access on kapasitor" ON public.kapasitor FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public full access on minyak_dielektrik" ON public.minyak_dielektrik;
    CREATE POLICY "Public full access on minyak_dielektrik" ON public.minyak_dielektrik FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public full access on field_definitions" ON public.field_definitions;
    CREATE POLICY "Public full access on field_definitions" ON public.field_definitions FOR ALL USING (true) WITH CHECK (true);
END $$;
