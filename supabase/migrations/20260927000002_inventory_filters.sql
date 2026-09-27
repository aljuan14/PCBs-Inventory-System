-- More filters for the inventory table: by import batch (review what one
-- upload brought in) and by year / PCB concentration on large datasets.

-- Same view as 20260926000002, with import_batch_id appended (CREATE OR
-- REPLACE VIEW may only add columns at the end).
CREATE OR REPLACE VIEW public.inventory_items WITH (security_invoker = true) AS
SELECT
    id, 'transformator_digunakan'::text AS category, company_id, no,
    nama_merek AS name, nomor_serial AS serial, lokasi_peralatan AS location,
    koordinat_lat AS lat, koordinat_lng AS lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm AS ppm, 'Masih digunakan'::text AS status,
    daya_kva, NULL::numeric AS volume_l, created_at, import_batch_id
FROM public.transformator_digunakan
UNION ALL
SELECT
    id, 'transformator_tidak_digunakan', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, COALESCE(status_kondisi, 'Tidak digunakan'),
    daya_kva, NULL::numeric, created_at, import_batch_id
FROM public.transformator_tidak_digunakan
UNION ALL
SELECT
    id, 'kapasitor', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, NULL::text,
    NULL::numeric, status_alat,
    NULL::numeric, NULL::numeric, created_at, import_batch_id
FROM public.kapasitor
UNION ALL
SELECT
    id, 'minyak_dielektrik', company_id, no,
    merek_minyak_dielektrik, NULL::text, lokasi_penyimpanan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, status_minyak,
    NULL::numeric, volume_l, created_at, import_batch_id
FROM public.minyak_dielektrik;

GRANT SELECT ON public.inventory_items TO anon, authenticated;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tahun_pembuatan)', 'idx_' || table_name || '_tahun', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'minyak_dielektrik'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (uji_konsentrasi_ppm)', 'idx_' || table_name || '_ppm', table_name);
  END LOOP;
END $$;
