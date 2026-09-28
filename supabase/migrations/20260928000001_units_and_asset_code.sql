-- Organisational units and equipment codes.
--
-- A company can report from several units: for PLN the "Unit Induk" (UID
-- Bali, UIT JBB, ...) and its "Unit Pelaksana" (UP3, UPT, ...); for other
-- companies a plant, branch or site. `kode_alat` keeps the company's own
-- equipment code (PLN "Kode Trafo" / "Kode Kapasitor" / "Kode Oli Trafo"),
-- the most reliable key for matching equipment across re-uploads.

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS unit TEXT, ADD COLUMN IF NOT EXISTS sub_unit TEXT, ADD COLUMN IF NOT EXISTS kode_alat TEXT', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id, unit, sub_unit)', 'idx_' || table_name || '_unit', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id, kode_alat) WHERE kode_alat IS NOT NULL', 'idx_' || table_name || '_kode', table_name);
  END LOOP;
END $$;

-- Same view as 20260927000002 with unit, sub_unit and kode_alat appended.
CREATE OR REPLACE VIEW public.inventory_items WITH (security_invoker = true) AS
SELECT
    id, 'transformator_digunakan'::text AS category, company_id, no,
    nama_merek AS name, nomor_serial AS serial, lokasi_peralatan AS location,
    koordinat_lat AS lat, koordinat_lng AS lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm AS ppm, 'Masih digunakan'::text AS status,
    daya_kva, NULL::numeric AS volume_l, created_at, import_batch_id,
    unit, sub_unit, kode_alat
FROM public.transformator_digunakan
UNION ALL
SELECT
    id, 'transformator_tidak_digunakan', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, COALESCE(status_kondisi, 'Tidak digunakan'),
    daya_kva, NULL::numeric, created_at, import_batch_id,
    unit, sub_unit, kode_alat
FROM public.transformator_tidak_digunakan
UNION ALL
SELECT
    id, 'kapasitor', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, NULL::text,
    NULL::numeric, status_alat,
    NULL::numeric, NULL::numeric, created_at, import_batch_id,
    unit, sub_unit, kode_alat
FROM public.kapasitor
UNION ALL
SELECT
    id, 'minyak_dielektrik', company_id, no,
    merek_minyak_dielektrik, NULL::text, lokasi_penyimpanan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, status_minyak,
    NULL::numeric, volume_l, created_at, import_batch_id,
    unit, sub_unit, kode_alat
FROM public.minyak_dielektrik;

GRANT SELECT ON public.inventory_items TO anon, authenticated;

-- Units and sub-units of a company with their figures: options for the
-- table's cascading filter and a per-unit comparison.
CREATE OR REPLACE FUNCTION public.inventory_units(p_company_id uuid)
RETURNS TABLE (unit text, sub_unit text, total bigint, tested bigint, at_least_50 bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT unit, sub_unit, count(*), count(ppm), count(*) FILTER (WHERE ppm >= 50)
  FROM public.inventory_items
  WHERE company_id = p_company_id AND unit IS NOT NULL
  GROUP BY unit, sub_unit
  ORDER BY unit, sub_unit NULLS FIRST;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_units(uuid) TO anon, authenticated;

-- Fingerprint of the uploaded file, to recognise a workbook uploaded before.
ALTER TABLE public.upload_sessions ADD COLUMN IF NOT EXISTS file_sha256 TEXT;
CREATE INDEX IF NOT EXISTS idx_upload_sessions_sha ON public.upload_sessions (company_id, file_sha256);
