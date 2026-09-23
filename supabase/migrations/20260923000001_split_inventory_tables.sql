-- Official category-specific inventory schema.
-- Existing generic tables remain untouched so historical data can be migrated deliberately.

-- Remove the prototype constraint before converting its legacy value.
ALTER TABLE public.import_batches
DROP CONSTRAINT IF EXISTS import_batches_jenis_data_check;

-- Prototype batches used the generic transformator key. Assign them to the
-- closest official category before adding the new constraint.
UPDATE public.import_batches
SET
    jenis_data = 'transformator_digunakan'
WHERE
    jenis_data = 'transformator';

ALTER TABLE public.import_batches
ADD CONSTRAINT import_batches_jenis_data_check CHECK (
    jenis_data IN (
        'transformator_digunakan',
        'transformator_tidak_digunakan',
        'kapasitor',
        'minyak_dielektrik'
    )
);

-- Preserve the prototype tables before reusing their names for official schemas.
ALTER TABLE IF EXISTS public.transformator
RENAME TO transformator_legacy;

ALTER TABLE IF EXISTS public.kapasitor RENAME TO kapasitor_legacy;

ALTER TABLE IF EXISTS public.minyak_dielektrik
RENAME TO minyak_dielektrik_legacy;

CREATE TABLE IF NOT EXISTS public.transformator_digunakan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    no INTEGER,
    nama_merek TEXT,
    nomor_serial TEXT,
    tahun_pembuatan INT,
    negara_asal TEXT,
    merek_minyak_dielektrik TEXT,
    volume_minyak_l NUMERIC,
    lokasi_peralatan TEXT,
    koordinat_raw TEXT,
    koordinat_lat NUMERIC(10, 7),
    koordinat_lng NUMERIC(10, 7),
    daya_kva NUMERIC,
    ketersediaan_keran_buang TEXT,
    perawatan_jenis TEXT,
    perawatan_waktu DATE,
    perawatan_merek_oli_pengganti TEXT,
    perawatan_volume_ditambahkan_l NUMERIC,
    perawatan_penyedia_jasa TEXT,
    uji_penyedia_jasa TEXT,
    uji_jenis TEXT,
    uji_metode TEXT,
    uji_konsentrasi_ppm NUMERIC,
    berat_ton NUMERIC,
    peralatan_tanggap_darurat TEXT,
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    import_batch_id UUID REFERENCES public.import_batches (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transformator_tidak_digunakan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    no INTEGER,
    nama_merek TEXT,
    nomor_serial TEXT,
    tahun_pembuatan INT,
    negara_asal TEXT,
    merek_minyak_dielektrik TEXT,
    volume_minyak_l NUMERIC,
    lokasi_peralatan TEXT,
    koordinat_raw TEXT,
    koordinat_lat NUMERIC(10, 7),
    koordinat_lng NUMERIC(10, 7),
    daya_kva NUMERIC,
    ketersediaan_keran_buang TEXT,
    perawatan_jenis TEXT,
    perawatan_waktu DATE,
    perawatan_merek_oli_pengganti TEXT,
    perawatan_volume_ditambahkan_l NUMERIC,
    uji_penyedia_jasa TEXT,
    uji_jenis TEXT,
    uji_metode TEXT,
    uji_konsentrasi_ppm NUMERIC,
    berat_ton NUMERIC,
    peralatan_tanggap_darurat TEXT,
    kondisi_di_dalam_alat TEXT,
    status_kondisi TEXT,
    waktu_terakhir_digunakan DATE,
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    import_batch_id UUID REFERENCES public.import_batches (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kapasitor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    no INTEGER,
    nama_merek TEXT,
    nomor_serial TEXT,
    tahun_pembuatan INT,
    negara_asal TEXT,
    merek_minyak_dielektrik TEXT,
    lokasi_peralatan TEXT,
    koordinat_raw TEXT,
    koordinat_lat NUMERIC(10, 7),
    koordinat_lng NUMERIC(10, 7),
    status_alat TEXT,
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    import_batch_id UUID REFERENCES public.import_batches (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minyak_dielektrik (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    no INTEGER,
    merek_minyak_dielektrik TEXT,
    volume_l NUMERIC,
    tahun_pembuatan INT,
    negara_asal TEXT,
    lokasi_penyimpanan TEXT,
    koordinat_raw TEXT,
    koordinat_lat NUMERIC(10, 7),
    koordinat_lng NUMERIC(10, 7),
    status_minyak TEXT,
    uji_penyedia_jasa TEXT,
    uji_jenis TEXT,
    uji_metode TEXT,
    uji_konsentrasi_ppm NUMERIC,
    wadah_penyimpanan TEXT,
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    import_batch_id UUID REFERENCES public.import_batches (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id)', 'idx_' || table_name || '_company', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (import_batch_id)', 'idx_' || table_name || '_batch', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (koordinat_lat, koordinat_lng)', 'idx_' || table_name || '_coords', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Public full access on ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', 'Public full access on ' || table_name, table_name);
  END LOOP;
END $$;