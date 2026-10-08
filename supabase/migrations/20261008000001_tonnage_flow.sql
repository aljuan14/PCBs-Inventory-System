-- Transformer tonnage along the flow on the whiteboard: in use / not in use,
-- then made from 1997, before 1997 or in an unknown year, then > 50 ppm,
-- <= 50 ppm or untested (the tonnage card of the dashboard).
--
-- The parts (20260929000007) already hold the weight per PCBs class and per
-- five-year band anchored on 1997, so only inventory_stats changes: it adds
-- weight_<from1997|pre1997|noyear>_<high|low|untested>_kg. low is < 2 and
-- 2-50 ppm together. No rebuild is needed.

-- Same figures as 20260929000008 plus the weight per year band and PCBs class.
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
      'pre1997_quick_high', COALESCE(sum(quick_high) FILTER (WHERE year_from < 1997), 0),
      'weight_from1997_high_kg', COALESCE(sum(weight_high_kg) FILTER (WHERE year_from >= 1997), 0),
      'weight_from1997_low_kg', COALESCE(sum(weight_safe_kg + weight_moderate_kg) FILTER (WHERE year_from >= 1997), 0),
      'weight_from1997_untested_kg', COALESCE(sum(weight_untested_kg) FILTER (WHERE year_from >= 1997), 0),
      'weight_pre1997_high_kg', COALESCE(sum(weight_high_kg) FILTER (WHERE year_from < 1997), 0),
      'weight_pre1997_low_kg', COALESCE(sum(weight_safe_kg + weight_moderate_kg) FILTER (WHERE year_from < 1997), 0),
      'weight_pre1997_untested_kg', COALESCE(sum(weight_untested_kg) FILTER (WHERE year_from < 1997), 0),
      'weight_noyear_high_kg', COALESCE(sum(weight_high_kg) FILTER (WHERE year_from IS NULL), 0),
      'weight_noyear_low_kg', COALESCE(sum(weight_safe_kg + weight_moderate_kg) FILTER (WHERE year_from IS NULL), 0),
      'weight_noyear_untested_kg', COALESCE(sum(weight_untested_kg) FILTER (WHERE year_from IS NULL), 0)
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
