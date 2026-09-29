-- Test results per method (Uji lab / Uji cepat) and PCBs class, for the
-- dashboard card comparing the two methods on transformers made before 1997.
--
-- * inventory_stats_parts gains lab_* and quick_* counts per class (< 2,
--   2–50, > 50 ppm). The method is read from uji_jenis as the table's test
--   filter does (ILIKE '%lab%' / '%cepat%'); every tested row carries one.
-- * inventory_stats_delta_sql fills them (same function as 20260929000007
--   with the six columns appended); the parts are rebuilt once.
-- * inventory_stats adds pre1997_lab_* and pre1997_quick_*.

ALTER TABLE public.inventory_stats_parts
  ADD COLUMN IF NOT EXISTS lab_safe bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lab_moderate bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lab_high bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quick_safe bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quick_moderate bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quick_high bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.inventory_stats_delta_sql(p_table text, p_source text, p_sign integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  shape text;
BEGIN
  shape := CASE p_table
    WHEN 'transformator_digunakan' THEN 'uji_jenis, uji_konsentrasi_ppm AS ppm, NULL::numeric AS volume_l, berat_kering_kg, berat_minyak_kg, COALESCE(berat_total_kg, NULLIF(berat_ton, 0) * 1000) AS berat_total_kg'
    WHEN 'transformator_tidak_digunakan' THEN 'uji_jenis, uji_konsentrasi_ppm AS ppm, NULL::numeric AS volume_l, berat_kering_kg, berat_minyak_kg, COALESCE(berat_total_kg, NULLIF(berat_ton, 0) * 1000) AS berat_total_kg'
    WHEN 'kapasitor' THEN 'NULL::text AS uji_jenis, NULL::numeric AS ppm, NULL::numeric AS volume_l, NULL::numeric AS berat_kering_kg, NULL::numeric AS berat_minyak_kg, NULL::numeric AS berat_total_kg'
    WHEN 'minyak_dielektrik' THEN 'uji_jenis, uji_konsentrasi_ppm AS ppm, volume_l, NULL::numeric AS berat_kering_kg, NULL::numeric AS berat_minyak_kg, NULL::numeric AS berat_total_kg'
  END;
  IF shape IS NULL THEN
    RAISE EXCEPTION 'inventory_stats_delta_sql: unknown table %', p_table;
  END IF;

  RETURN format($sql$
    INSERT INTO public.inventory_stats_parts AS p (
      category, company_id, unit, sub_unit, year_from, total, tested, lab_tested, lab_below_50, lab_at_least_50,
      risk_safe, risk_moderate, risk_high, volume_l, with_coordinates, with_weight, weight_kg, with_weight_parts,
      weight_dry_kg, weight_oil_kg, weight_safe_kg, weight_moderate_kg, weight_high_kg, weight_untested_kg,
      lab_safe, lab_moderate, lab_high, quick_safe, quick_moderate, quick_high)
    SELECT
      %1$L, company_id, unit, sub_unit,
      CASE WHEN tahun_pembuatan IS NULL THEN NULL
           WHEN tahun_pembuatan < 1972 THEN 0
           ELSE 1997 + floor((tahun_pembuatan - 1997) / 5.0)::int * 5 END,
      %2$s * count(*),
      %2$s * count(*) FILTER (WHERE ppm IS NOT NULL),
      %2$s * count(*) FILTER (WHERE ppm IS NOT NULL AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm < 50 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm >= 50 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm < 2),
      %2$s * count(*) FILTER (WHERE ppm >= 2 AND ppm <= 50),
      %2$s * count(*) FILTER (WHERE ppm > 50),
      %2$s * COALESCE(sum(volume_l), 0),
      %2$s * count(*) FILTER (WHERE koordinat_lat IS NOT NULL AND koordinat_lng IS NOT NULL),
      %2$s * count(*) FILTER (WHERE berat_total_kg IS NOT NULL),
      %2$s * COALESCE(sum(berat_total_kg), 0),
      %2$s * count(*) FILTER (WHERE berat_kering_kg IS NOT NULL AND berat_minyak_kg IS NOT NULL),
      %2$s * COALESCE(sum(berat_kering_kg) FILTER (WHERE berat_minyak_kg IS NOT NULL), 0),
      %2$s * COALESCE(sum(berat_minyak_kg) FILTER (WHERE berat_kering_kg IS NOT NULL), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm < 2), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm >= 2 AND ppm <= 50), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm > 50), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm IS NULL), 0),
      %2$s * count(*) FILTER (WHERE ppm < 2 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm >= 2 AND ppm <= 50 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm > 50 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm < 2 AND uji_jenis ILIKE '%%cepat%%'),
      %2$s * count(*) FILTER (WHERE ppm >= 2 AND ppm <= 50 AND uji_jenis ILIKE '%%cepat%%'),
      %2$s * count(*) FILTER (WHERE ppm > 50 AND uji_jenis ILIKE '%%cepat%%')
    FROM (SELECT company_id, unit, sub_unit, tahun_pembuatan, koordinat_lat, koordinat_lng, %3$s FROM %4$s) r
    GROUP BY 2, 3, 4, 5
    ON CONFLICT ON CONSTRAINT inventory_stats_parts_key DO UPDATE SET
      total = p.total + EXCLUDED.total,
      tested = p.tested + EXCLUDED.tested,
      lab_tested = p.lab_tested + EXCLUDED.lab_tested,
      lab_below_50 = p.lab_below_50 + EXCLUDED.lab_below_50,
      lab_at_least_50 = p.lab_at_least_50 + EXCLUDED.lab_at_least_50,
      risk_safe = p.risk_safe + EXCLUDED.risk_safe,
      risk_moderate = p.risk_moderate + EXCLUDED.risk_moderate,
      risk_high = p.risk_high + EXCLUDED.risk_high,
      volume_l = p.volume_l + EXCLUDED.volume_l,
      with_coordinates = p.with_coordinates + EXCLUDED.with_coordinates,
      with_weight = p.with_weight + EXCLUDED.with_weight,
      weight_kg = p.weight_kg + EXCLUDED.weight_kg,
      with_weight_parts = p.with_weight_parts + EXCLUDED.with_weight_parts,
      weight_dry_kg = p.weight_dry_kg + EXCLUDED.weight_dry_kg,
      weight_oil_kg = p.weight_oil_kg + EXCLUDED.weight_oil_kg,
      weight_safe_kg = p.weight_safe_kg + EXCLUDED.weight_safe_kg,
      weight_moderate_kg = p.weight_moderate_kg + EXCLUDED.weight_moderate_kg,
      weight_high_kg = p.weight_high_kg + EXCLUDED.weight_high_kg,
      weight_untested_kg = p.weight_untested_kg + EXCLUDED.weight_untested_kg,
      lab_safe = p.lab_safe + EXCLUDED.lab_safe,
      lab_moderate = p.lab_moderate + EXCLUDED.lab_moderate,
      lab_high = p.lab_high + EXCLUDED.lab_high,
      quick_safe = p.quick_safe + EXCLUDED.quick_safe,
      quick_moderate = p.quick_moderate + EXCLUDED.quick_moderate,
      quick_high = p.quick_high + EXCLUDED.quick_high
  $sql$, p_table, p_sign, shape, p_source);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_stats_delta_sql(text, text, integer) FROM PUBLIC, anon, authenticated;

-- Rebuild the parts with the new columns, as in 20260929000007.
DO $$
DECLARE table_name text;
BEGIN
  LOCK TABLE public.transformator_digunakan, public.transformator_tidak_digunakan, public.kapasitor, public.minyak_dielektrik IN SHARE MODE;
  TRUNCATE public.inventory_stats_parts;
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE public.inventory_stats_delta_sql(table_name, format('public.%I', table_name), 1);
  END LOOP;
END $$;

-- Same figures as 20260929000007 plus the method counts of equipment made before 1997.
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
      'total', sum(total),
      'before_1997', COALESCE(sum(total) FILTER (WHERE year_from < 1997), 0),
      'from_1997', COALESCE(sum(total) FILTER (WHERE year_from >= 1997), 0),
      'unknown_year', COALESCE(sum(total) FILTER (WHERE year_from IS NULL), 0),
      'tested', sum(tested),
      'lab_tested', sum(lab_tested),
      'lab_below_50', sum(lab_below_50),
      'lab_at_least_50', sum(lab_at_least_50),
      'risk_safe', sum(risk_safe),
      'risk_moderate', sum(risk_moderate),
      'risk_high', sum(risk_high),
      'pre1997_tested', COALESCE(sum(tested) FILTER (WHERE year_from < 1997), 0),
      'pre1997_risk_safe', COALESCE(sum(risk_safe) FILTER (WHERE year_from < 1997), 0),
      'pre1997_risk_moderate', COALESCE(sum(risk_moderate) FILTER (WHERE year_from < 1997), 0),
      'pre1997_risk_high', COALESCE(sum(risk_high) FILTER (WHERE year_from < 1997), 0),
      'volume_l', sum(volume_l),
      'with_coordinates', sum(with_coordinates),
      'with_weight', sum(with_weight),
      'weight_kg', sum(weight_kg),
      'with_weight_parts', sum(with_weight_parts),
      'weight_dry_kg', sum(weight_dry_kg),
      'weight_oil_kg', sum(weight_oil_kg),
      'weight_safe_kg', sum(weight_safe_kg),
      'weight_moderate_kg', sum(weight_moderate_kg),
      'weight_high_kg', sum(weight_high_kg),
      'weight_untested_kg', sum(weight_untested_kg),
      'pre1997_weight_kg', COALESCE(sum(weight_kg) FILTER (WHERE year_from < 1997), 0),
      'pre1997_weight_untested_kg', COALESCE(sum(weight_untested_kg) FILTER (WHERE year_from < 1997), 0),
      'pre1997_lab_safe', COALESCE(sum(lab_safe) FILTER (WHERE year_from < 1997), 0),
      'pre1997_lab_moderate', COALESCE(sum(lab_moderate) FILTER (WHERE year_from < 1997), 0),
      'pre1997_lab_high', COALESCE(sum(lab_high) FILTER (WHERE year_from < 1997), 0),
      'pre1997_quick_safe', COALESCE(sum(quick_safe) FILTER (WHERE year_from < 1997), 0),
      'pre1997_quick_moderate', COALESCE(sum(quick_moderate) FILTER (WHERE year_from < 1997), 0),
      'pre1997_quick_high', COALESCE(sum(quick_high) FILTER (WHERE year_from < 1997), 0)
    ) AS stats
    FROM public.inventory_stats_parts
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND (p_unit IS NULL OR unit = p_unit)
      AND (p_sub_unit IS NULL OR sub_unit = p_sub_unit)
    GROUP BY category
  ) per_category;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_stats(uuid, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
