-- Dashboard figures for a unit or sub-unit of a company, so the national
-- dashboard can be narrowed to e.g. PT PLN (Persero) › UIT JBB › UPT Bekasi.
-- Same figures as 20260926000002; the old one-argument function is dropped so
-- PostgREST does not see two candidates for a call with only p_company_id.

DROP FUNCTION IF EXISTS public.inventory_stats(uuid);

CREATE OR REPLACE FUNCTION public.inventory_stats(p_company_id uuid DEFAULT NULL, p_unit text DEFAULT NULL, p_sub_unit text DEFAULT NULL)
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
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND (p_unit IS NULL OR unit = p_unit)
      AND (p_sub_unit IS NULL OR sub_unit = p_sub_unit)
    GROUP BY category
  ) per_category;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_stats(uuid, text, text) TO anon, authenticated;
