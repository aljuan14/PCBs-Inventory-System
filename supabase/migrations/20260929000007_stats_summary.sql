-- Dashboard figures from a summary table instead of a scan of every row.
--
-- inventory_stats scanned all ~354k rows on each dashboard load: 8-16 s on
-- the Nano instance with a cold cache, past the 15 s statement timeout
-- (20260928000004) whenever other requests ran beside it.
--
-- * inventory_stats_parts holds the figures per category, company, unit,
--   sub-unit and five-year production band (anchored on 1997 as in
--   20260929000006): a few thousand rows.
-- * Statement triggers on the four inventory tables add the rows inserted
--   and subtract the rows deleted (an update does both), so the table stays
--   exact through imports, edits, replaced uploads and company purges.
-- * inventory_stats and inventory_charts sum the parts in scope. The old
--   scan stays as inventory_stats_scan to check the parts against.
--
-- The figures are shared by everyone: every inventory table is readable by
-- anon and authenticated alike (policies of 20260923000001).

CREATE TABLE IF NOT EXISTS public.inventory_stats_parts (
  category text NOT NULL,
  company_id uuid,
  unit text,
  sub_unit text,
  -- First year of the band; 0 for years before 1972, null for a missing year.
  year_from integer,
  total bigint NOT NULL DEFAULT 0,
  tested bigint NOT NULL DEFAULT 0,
  lab_tested bigint NOT NULL DEFAULT 0,
  lab_below_50 bigint NOT NULL DEFAULT 0,
  lab_at_least_50 bigint NOT NULL DEFAULT 0,
  risk_safe bigint NOT NULL DEFAULT 0,
  risk_moderate bigint NOT NULL DEFAULT 0,
  risk_high bigint NOT NULL DEFAULT 0,
  volume_l numeric NOT NULL DEFAULT 0,
  with_coordinates bigint NOT NULL DEFAULT 0,
  with_weight bigint NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0,
  with_weight_parts bigint NOT NULL DEFAULT 0,
  weight_dry_kg numeric NOT NULL DEFAULT 0,
  weight_oil_kg numeric NOT NULL DEFAULT 0,
  weight_safe_kg numeric NOT NULL DEFAULT 0,
  weight_moderate_kg numeric NOT NULL DEFAULT 0,
  weight_high_kg numeric NOT NULL DEFAULT 0,
  weight_untested_kg numeric NOT NULL DEFAULT 0,
  CONSTRAINT inventory_stats_parts_key UNIQUE NULLS NOT DISTINCT (category, company_id, unit, sub_unit, year_from)
);

ALTER TABLE public.inventory_stats_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on inventory_stats_parts" ON public.inventory_stats_parts;
CREATE POLICY "Public read access on inventory_stats_parts" ON public.inventory_stats_parts FOR SELECT USING (true);
GRANT SELECT ON public.inventory_stats_parts TO anon, authenticated;

-- SQL adding (p_sign 1) or subtracting (-1) the rows of p_source, a table
-- with the columns of p_table (the table itself or a trigger's transition
-- table), to the parts. The columns are mapped as in the inventory_items
-- view (20260929000004); keep the two in step.
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
      weight_dry_kg, weight_oil_kg, weight_safe_kg, weight_moderate_kg, weight_high_kg, weight_untested_kg)
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
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm IS NULL), 0)
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
      weight_untested_kg = p.weight_untested_kg + EXCLUDED.weight_untested_kg
  $sql$, p_table, p_sign, shape, p_source);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_stats_delta_sql(text, text, integer) FROM PUBLIC, anon, authenticated;

-- The transition tables are only visible to queries run by the trigger
-- function itself, so it executes the delta here rather than in a helper.
-- Security definer: anon edits and deletes rows, but cannot write the parts.
CREATE OR REPLACE FUNCTION public.inventory_stats_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    DELETE FROM public.inventory_stats_parts WHERE category = TG_TABLE_NAME;
    RETURN NULL;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    EXECUTE public.inventory_stats_delta_sql(TG_TABLE_NAME, 'old_rows', -1);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    EXECUTE public.inventory_stats_delta_sql(TG_TABLE_NAME, 'new_rows', 1);
  END IF;
  DELETE FROM public.inventory_stats_parts WHERE category = TG_TABLE_NAME AND total = 0;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_stats_track() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS inventory_stats_insert ON public.%I', table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS inventory_stats_update ON public.%I', table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS inventory_stats_delete ON public.%I', table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS inventory_stats_truncate ON public.%I', table_name);
    EXECUTE format('CREATE TRIGGER inventory_stats_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_stats_track()', table_name);
    EXECUTE format('CREATE TRIGGER inventory_stats_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_stats_track()', table_name);
    EXECUTE format('CREATE TRIGGER inventory_stats_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_stats_track()', table_name);
    EXECUTE format('CREATE TRIGGER inventory_stats_truncate AFTER TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_stats_track()', table_name);
  END LOOP;

  -- Fill the parts from the rows already stored. The table lock keeps rows
  -- written meanwhile from being counted twice or not at all.
  LOCK TABLE public.transformator_digunakan, public.transformator_tidak_digunakan, public.kapasitor, public.minyak_dielektrik IN SHARE MODE;
  TRUNCATE public.inventory_stats_parts;
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE public.inventory_stats_delta_sql(table_name, format('public.%I', table_name), 1);
  END LOOP;
END $$;

-- The scan inventory_stats used to be (20260929000005), kept to check the parts against.
ALTER FUNCTION public.inventory_stats(uuid, text, text) RENAME TO inventory_stats_scan;

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
      'pre1997_weight_untested_kg', COALESCE(sum(weight_untested_kg) FILTER (WHERE year_from < 1997), 0)
    ) AS stats
    FROM public.inventory_stats_parts
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND (p_unit IS NULL OR unit = p_unit)
      AND (p_sub_unit IS NULL OR sub_unit = p_sub_unit)
    GROUP BY category
  ) per_category;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_stats(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_stats_scan(uuid, text, text) TO anon, authenticated;

-- Same result as 20260929000006, summed from the parts.
CREATE OR REPLACE FUNCTION public.inventory_charts(p_company_id uuid DEFAULT NULL, p_unit text DEFAULT NULL, p_sub_unit text DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT *
    FROM public.inventory_stats_parts
    WHERE category IN ('transformator_digunakan', 'transformator_tidak_digunakan')
      AND (p_category IS NULL OR category = p_category)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND (p_unit IS NULL OR unit = p_unit)
      AND (p_sub_unit IS NULL OR sub_unit = p_sub_unit)
  ),
  target AS (
    SELECT COALESCE(p_company_id, CASE WHEN count(DISTINCT company_id) = 1 THEN min(company_id::text)::uuid END) AS company_id
    FROM scoped
  ),
  keyed AS (
    SELECT CASE WHEN t.company_id IS NULL THEN s.company_id::text WHEN p_unit IS NULL THEN s.unit ELSE s.sub_unit END AS grp, s.*
    FROM scoped s CROSS JOIN target t
  ),
  figures AS (
    SELECT
      grp, year_from,
      GROUPING(grp) = 0 AS by_group,
      jsonb_build_object(
        'safe', sum(risk_safe),
        'moderate', sum(risk_moderate),
        'high', sum(risk_high),
        'untested', sum(total - tested),
        'safe_kg', sum(weight_safe_kg),
        'moderate_kg', sum(weight_moderate_kg),
        'high_kg', sum(weight_high_kg),
        'untested_kg', sum(weight_untested_kg)
      ) AS stats
    FROM keyed
    GROUP BY GROUPING SETS ((grp), (year_from))
  )
  SELECT jsonb_build_object(
    'level', CASE WHEN t.company_id IS NULL THEN 'company' WHEN p_unit IS NULL THEN 'unit' ELSE 'sub_unit' END,
    'company_id', t.company_id,
    'groups', COALESCE((
      SELECT jsonb_agg(f.stats || jsonb_build_object('key', f.grp, 'label', CASE WHEN t.company_id IS NULL THEN c.nama_perusahaan ELSE f.grp END) ORDER BY f.grp)
      FROM figures f
      LEFT JOIN public.companies c ON t.company_id IS NULL AND c.id::text = f.grp
      WHERE f.by_group
    ), '[]'::jsonb),
    'years', COALESCE((
      SELECT jsonb_agg(f.stats || jsonb_build_object('year_from', f.year_from) ORDER BY f.year_from NULLS LAST)
      FROM figures f
      WHERE NOT f.by_group
    ), '[]'::jsonb)
  )
  FROM target t;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_charts(uuid, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
