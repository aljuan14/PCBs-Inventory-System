-- Enforce official category contracts for new inserts and updates.
-- NOT VALID keeps existing prototype rows from blocking rollout.

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transformator_digunakan_required_fields_check') THEN
ALTER TABLE public.transformator_digunakan ADD CONSTRAINT transformator_digunakan_required_fields_check CHECK (
    no IS NOT NULL
    AND nama_merek IS NOT NULL
    AND nomor_serial IS NOT NULL
    AND daya_kva IS NOT NULL
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transformator_tidak_digunakan_required_fields_check') THEN
ALTER TABLE public.transformator_tidak_digunakan ADD CONSTRAINT transformator_tidak_digunakan_required_fields_check CHECK (
    no IS NOT NULL
    AND nama_merek IS NOT NULL
    AND nomor_serial IS NOT NULL
    AND daya_kva IS NOT NULL
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kapasitor_required_fields_check') THEN
ALTER TABLE public.kapasitor ADD CONSTRAINT kapasitor_required_fields_check CHECK (
    no IS NOT NULL
    AND nama_merek IS NOT NULL
    AND nomor_serial IS NOT NULL
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'minyak_dielektrik_required_fields_check') THEN
ALTER TABLE public.minyak_dielektrik ADD CONSTRAINT minyak_dielektrik_required_fields_check CHECK (
    no IS NOT NULL
    AND merek_minyak_dielektrik IS NOT NULL
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transformator_digunakan_keran_check') THEN
ALTER TABLE public.transformator_digunakan ADD CONSTRAINT transformator_digunakan_keran_check CHECK (
    ketersediaan_keran_buang IS NULL
    OR ketersediaan_keran_buang IN ('Ada', 'Tidak Ada')
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transformator_tidak_digunakan_keran_check') THEN
ALTER TABLE public.transformator_tidak_digunakan ADD CONSTRAINT transformator_tidak_digunakan_keran_check CHECK (
    ketersediaan_keran_buang IS NULL
    OR ketersediaan_keran_buang IN ('Ada', 'Tidak Ada')
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transformator_digunakan_uji_jenis_check') THEN
ALTER TABLE public.transformator_digunakan ADD CONSTRAINT transformator_digunakan_uji_jenis_check CHECK (
    uji_jenis IS NULL
    OR uji_jenis IN ('Uji cepat', 'Uji lab')
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transformator_tidak_digunakan_uji_jenis_check') THEN
ALTER TABLE public.transformator_tidak_digunakan ADD CONSTRAINT transformator_tidak_digunakan_uji_jenis_check CHECK (
    uji_jenis IS NULL
    OR uji_jenis IN ('Uji cepat', 'Uji lab')
) NOT VALID; END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kapasitor_status_alat_check') THEN
ALTER TABLE public.kapasitor ADD CONSTRAINT kapasitor_status_alat_check CHECK (
    status_alat IS NULL
    OR status_alat IN (
        'Masih digunakan',
        'Tidak digunakan'
    )
) NOT VALID; END IF;
END $$;