-- The dry and oil weights of inventory_stats (20260929000004) were summed over
-- different rows than the total: a unit with only its dry weight has no total,
-- yet its dry weight counted, so the dry weight of transformers in use read
-- 194.782 t against a total of 181.792 t. Both parts now count only for units
-- that report both, so the split describes one set of units (with_weight_parts).

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
      'risk_safe', count(*) FILTER (WHERE ppm < 2),
      'risk_moderate', count(*) FILTER (WHERE ppm >= 2 AND ppm <= 50),
      'risk_high', count(*) FILTER (WHERE ppm > 50),
      'pre1997_tested', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm IS NOT NULL),
      'pre1997_risk_safe', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm < 2),
      'pre1997_risk_moderate', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm >= 2 AND ppm <= 50),
      'pre1997_risk_high', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm > 50),
      'volume_l', COALESCE(sum(volume_l), 0),
      'with_coordinates', count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL),
      'with_weight', count(*) FILTER (WHERE berat_total_kg IS NOT NULL),
      'weight_kg', COALESCE(sum(berat_total_kg), 0),
      'with_weight_parts', count(*) FILTER (WHERE berat_kering_kg IS NOT NULL AND berat_minyak_kg IS NOT NULL),
      'weight_dry_kg', COALESCE(sum(berat_kering_kg) FILTER (WHERE berat_minyak_kg IS NOT NULL), 0),
      'weight_oil_kg', COALESCE(sum(berat_minyak_kg) FILTER (WHERE berat_kering_kg IS NOT NULL), 0),
      'weight_safe_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm < 2), 0),
      'weight_moderate_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm >= 2 AND ppm <= 50), 0),
      'weight_high_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm > 50), 0),
      'weight_untested_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm IS NULL), 0),
      'pre1997_weight_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE tahun_pembuatan < 1997), 0),
      'pre1997_weight_untested_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE tahun_pembuatan < 1997 AND ppm IS NULL), 0)
    ) AS stats
    FROM public.inventory_items
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND (p_unit IS NULL OR unit = p_unit)
      AND (p_sub_unit IS NULL OR sub_unit = p_sub_unit)
    GROUP BY category
  ) per_category;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_stats(uuid, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
