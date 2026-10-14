-- The dashboard's one year switch (all / before 1997 / 1997 on) needs the
-- test results of the transformers from 1997 on, and the oil volume per
-- year band. Rows without a production year stay out of both bands, as
-- before. The rest of inventory_stats is unchanged.

CREATE OR REPLACE FUNCTION public.inventory_stats(p_company_id uuid DEFAULT NULL::uuid, p_unit text DEFAULT NULL::text, p_sub_unit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      'from1997_tested', COALESCE(sum(tested) FILTER (WHERE year_from >= 1997), 0),
      'from1997_risk_safe', COALESCE(sum(risk_safe) FILTER (WHERE year_from >= 1997), 0),
      'from1997_risk_moderate', COALESCE(sum(risk_moderate) FILTER (WHERE year_from >= 1997), 0),
      'from1997_risk_high', COALESCE(sum(risk_high) FILTER (WHERE year_from >= 1997), 0),
      'volume_l', sum(volume_l),
      'pre1997_volume_l', COALESCE(sum(volume_l) FILTER (WHERE year_from < 1997), 0),
      'from1997_volume_l', COALESCE(sum(volume_l) FILTER (WHERE year_from >= 1997), 0),
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
$function$;

NOTIFY pgrst, 'reload schema';
