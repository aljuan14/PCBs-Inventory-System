-- Server-side aggregation for the dashboards. With hundreds of thousands of
-- rows (PLN), the client can no longer load every row: Supabase caps a
-- request at 1000 rows, so client-side counts were silently truncated.

-- One row per inventory record across the four category tables, with the
-- columns the dashboards and the paginated table need. security_invoker makes
-- the underlying tables' RLS policies apply to whoever queries the view.
CREATE OR REPLACE VIEW public.inventory_items WITH (security_invoker = true) AS
SELECT
    id, 'transformator_digunakan'::text AS category, company_id, no,
    nama_merek AS name, nomor_serial AS serial, lokasi_peralatan AS location,
    koordinat_lat AS lat, koordinat_lng AS lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm AS ppm, 'Masih digunakan'::text AS status,
    daya_kva, NULL::numeric AS volume_l, created_at
FROM public.transformator_digunakan
UNION ALL
SELECT
    id, 'transformator_tidak_digunakan', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, COALESCE(status_kondisi, 'Tidak digunakan'),
    daya_kva, NULL::numeric, created_at
FROM public.transformator_tidak_digunakan
UNION ALL
SELECT
    id, 'kapasitor', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, NULL::text,
    NULL::numeric, status_alat,
    NULL::numeric, NULL::numeric, created_at
FROM public.kapasitor
UNION ALL
SELECT
    id, 'minyak_dielektrik', company_id, no,
    merek_minyak_dielektrik, NULL::text, lokasi_penyimpanan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, status_minyak,
    NULL::numeric, volume_l, created_at
FROM public.minyak_dielektrik;

GRANT SELECT ON public.inventory_items TO anon, authenticated;

-- Dashboard figures per category, optionally for one company. Definitions
-- match the dashboard: "lab" = uji_jenis mentions lab and has a ppm value;
-- risk bands are <50, 50–500 and >500 ppm.
CREATE OR REPLACE FUNCTION public.inventory_stats(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(category, stats), '{}'::jsonb)
  FROM (
    SELECT category, jsonb_build_object(
      'total', count(*),
      'before_1997', count(*) FILTER (WHERE tahun_pembuatan < 1997),
      'from_1997', count(*) FILTER (WHERE tahun_pembuatan >= 1997),
      'unknown_year', count(*) FILTER (WHERE tahun_pembuatan IS NULL),
      'tested', count(*) FILTER (WHERE ppm IS NOT NULL),
      'lab_tested', count(*) FILTER (WHERE ppm IS NOT NULL AND uji_jenis ILIKE '%lab%'),
      'lab_below_50', count(*) FILTER (WHERE ppm < 50 AND uji_jenis ILIKE '%lab%'),
      'lab_at_least_50', count(*) FILTER (WHERE ppm >= 50 AND uji_jenis ILIKE '%lab%'),
      'risk_safe', count(*) FILTER (WHERE ppm < 50),
      'risk_moderate', count(*) FILTER (WHERE ppm >= 50 AND ppm <= 500),
      'risk_high', count(*) FILTER (WHERE ppm > 500),
      'volume_l', COALESCE(sum(volume_l), 0),
      'with_coordinates', count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)
    ) AS stats
    FROM public.inventory_items
    WHERE p_company_id IS NULL OR company_id = p_company_id
    GROUP BY category
  ) per_category;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_stats(uuid) TO anon, authenticated;

-- The paginated table sorts newest first; these let Postgres read each
-- table in order instead of sorting every row for every page.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (created_at DESC, id DESC)', 'idx_' || table_name || '_created', table_name);
  END LOOP;
END $$;
