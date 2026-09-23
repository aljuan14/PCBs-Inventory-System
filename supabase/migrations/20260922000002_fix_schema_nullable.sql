-- ==============================================================================
-- Migration: 20260922000002_fix_schema_nullable.sql
-- Fix: Hapus NOT NULL yang tidak perlu, sinkronkan nama kolom dengan field_key
--      yang digunakan di halaman mapping (fallback FIELD_DEFS_FALLBACK)
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- DROP & RECREATE tabel transformator
-- ──────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.transformator CASCADE;

CREATE TABLE public.transformator (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id             UUID        REFERENCES public.import_batches(id) ON DELETE SET NULL,
    company_id                  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    -- field_key dari FIELD_DEFS_FALLBACK (transformator)
    id_peralatan                TEXT,
    nama_peralatan              TEXT,
    nama_merek                  TEXT,
    nomor_serial                TEXT,
    tahun_pembuatan             INT,
    daya_kva                    NUMERIC,
    tegangan_primer_kv          NUMERIC,
    tegangan_sekunder_kv        NUMERIC,
    jenis_minyak                TEXT,
    volume_minyak_liter         NUMERIC,
    konsentrasi_pcb_ppm         NUMERIC,
    tanggal_uji                 DATE,
    status_pcb                  TEXT,
    lokasi_provinsi             TEXT,
    lokasi_kabkota              TEXT,
    lokasi_detail               TEXT,
    titik_koordinat_raw         TEXT,
    latitude                    NUMERIC(10, 7),
    longitude                   NUMERIC(10, 7),
    kondisi_fisik               TEXT,
    keterangan                  TEXT,
    -- Kolom lama yang mungkin masih relevan
    negara_asal_produsen        TEXT,
    ketersediaan_keran_buang    TEXT,
    perawatan_jenis             TEXT,
    perawatan_waktu             DATE,
    perawatan_merek_oli_pengganti TEXT,
    perawatan_volume_ditambahkan_l NUMERIC,
    uji_penyedia_jasa           TEXT,
    uji_jenis                   TEXT,
    uji_metode                  TEXT,
    berat_ton                   NUMERIC,
    peralatan_tanggap_darurat   TEXT,
    kondisi_di_dalam_alat       TEXT,
    status_kondisi              TEXT,
    waktu_terakhir_digunakan    DATE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transformator_company     ON public.transformator (company_id);
CREATE INDEX IF NOT EXISTS idx_transformator_batch       ON public.transformator (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_transformator_coords      ON public.transformator (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_transformator_konsentrasi ON public.transformator (konsentrasi_pcb_ppm);

-- RLS
ALTER TABLE public.transformator ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on transformator" ON public.transformator;
CREATE POLICY "Public full access on transformator" ON public.transformator FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- DROP & RECREATE tabel kapasitor
-- ──────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.kapasitor CASCADE;

CREATE TABLE public.kapasitor (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id     UUID        REFERENCES public.import_batches(id) ON DELETE SET NULL,
    company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    -- field_key dari FIELD_DEFS_FALLBACK (kapasitor)
    id_peralatan        TEXT,
    nama_peralatan      TEXT,
    nama_merek          TEXT,
    nomor_serial        TEXT,
    tahun_pembuatan     INT,
    kapasitas_kvar      NUMERIC,
    tegangan_kerja_kv   NUMERIC,
    jenis_dielektrik    TEXT,
    konsentrasi_pcb_ppm NUMERIC,
    tanggal_uji         DATE,
    status_pcb          TEXT,
    lokasi_provinsi     TEXT,
    lokasi_kabkota      TEXT,
    lokasi_detail       TEXT,
    titik_koordinat_raw TEXT,
    latitude            NUMERIC(10, 7),
    longitude           NUMERIC(10, 7),
    kondisi_fisik       TEXT,
    keterangan          TEXT,
    -- Kolom lama
    negara_asal_produsen        TEXT,
    merek_minyak_dielektrik     TEXT,
    status_alat                 TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kapasitor_company ON public.kapasitor (company_id);
CREATE INDEX IF NOT EXISTS idx_kapasitor_batch   ON public.kapasitor (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_kapasitor_coords  ON public.kapasitor (latitude, longitude);

ALTER TABLE public.kapasitor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on kapasitor" ON public.kapasitor;
CREATE POLICY "Public full access on kapasitor" ON public.kapasitor FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- DROP & RECREATE tabel minyak_dielektrik
-- ──────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.minyak_dielektrik CASCADE;

CREATE TABLE public.minyak_dielektrik (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id     UUID        REFERENCES public.import_batches(id) ON DELETE SET NULL,
    company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    -- field_key dari FIELD_DEFS_FALLBACK (minyak_dielektrik)
    id_sampel           TEXT,
    id_peralatan_induk  TEXT,
    nama_peralatan      TEXT,
    jenis_minyak        TEXT,
    volume_liter        NUMERIC,
    konsentrasi_pcb_ppm NUMERIC,
    metode_uji          TEXT,
    laboratorium        TEXT,
    tanggal_uji         DATE,
    status_pcb          TEXT,
    lokasi_provinsi     TEXT,
    lokasi_kabkota      TEXT,
    lokasi_detail       TEXT,
    titik_koordinat_raw TEXT,
    latitude            NUMERIC(10, 7),
    longitude           NUMERIC(10, 7),
    keterangan          TEXT,
    -- Kolom lama
    merek               TEXT,
    volume_l            NUMERIC,
    negara_asal_produsen TEXT,
    lokasi_penyimpanan  TEXT,
    uji_penyedia_jasa   TEXT,
    uji_jenis           TEXT,
    uji_metode          TEXT,
    wadah_penyimpanan   TEXT,
    status              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minyak_company     ON public.minyak_dielektrik (company_id);
CREATE INDEX IF NOT EXISTS idx_minyak_batch       ON public.minyak_dielektrik (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_minyak_coords      ON public.minyak_dielektrik (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_minyak_konsentrasi ON public.minyak_dielektrik (konsentrasi_pcb_ppm);

ALTER TABLE public.minyak_dielektrik ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on minyak_dielektrik" ON public.minyak_dielektrik;
CREATE POLICY "Public full access on minyak_dielektrik" ON public.minyak_dielektrik FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- FIX tabel field_definitions: ubah constraint tipe_data agar terima semua varian
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.field_definitions
    DROP CONSTRAINT IF EXISTS field_definitions_tipe_data_check;

ALTER TABLE public.field_definitions
    ADD CONSTRAINT field_definitions_tipe_data_check
    CHECK (tipe_data IN ('text', 'number', 'numeric', 'integer', 'date'));
