-- Figures for the dashboard's bar charts of transformers, in one scan:
--
-- * groups: transformers per company, unit of the chosen company or sub-unit
--   of the chosen unit, split by PCBs risk class (count and total weight).
--   With a single company in scope the national level skips straight to its
--   units, since one bar per company would say nothing.
-- * years: the same split per production year band of five years. The bands
--   are anchored on 1997 (1992–1996, 1997–2001, ...) so none straddles the
--   regulation's split; years before 1972 share one band (year_from 0) and a
--   missing year has its own (year_from null).
--
-- p_category narrows to one transformer category; null counts both.
-- Risk bounds as inventory_stats (migration 20260929000001).
--
-- Returns {"level", "company_id", "groups": [{"key", "label", ...}], "years": [{"year_from", ...}]}
-- where each entry carries safe, moderate, high, untested and the same four as *_kg.
CREATE OR REPLACE FUNCTION public.inventory_charts(p_company_id uuid DEFAULT NULL, p_unit text DEFAULT NULL, p_sub_unit text DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT company_id, unit, sub_unit, tahun_pembuatan, ppm, berat_total_kg
    FROM public.inventory_items
    WHERE category IN ('transformator_digunakan', 'transformator_tidak_digunakan')
      AND (p_category IS NULL OR category = p_category)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND (p_unit IS NULL OR unit = p_unit)
      AND (p_sub_unit IS NULL OR sub_unit = p_sub_unit)
  ),
  -- The company the groups belong to: the chosen one, or the only one in scope.
  target AS (
    SELECT COALESCE(p_company_id, CASE WHEN count(DISTINCT company_id) = 1 THEN min(company_id::text)::uuid END) AS company_id
    FROM scoped
  ),
  keyed AS (
    SELECT
      CASE WHEN t.company_id IS NULL THEN s.company_id::text WHEN p_unit IS NULL THEN s.unit ELSE s.sub_unit END AS grp,
      CASE WHEN s.tahun_pembuatan IS NULL THEN NULL
           WHEN s.tahun_pembuatan < 1972 THEN 0
           ELSE 1997 + floor((s.tahun_pembuatan - 1997) / 5.0)::int * 5 END AS year_from,
      s.ppm, s.berat_total_kg
    FROM scoped s CROSS JOIN target t
  ),
  figures AS (
    SELECT
      grp, year_from,
      GROUPING(grp) = 0 AS by_group,
      jsonb_build_object(
        'safe', count(*) FILTER (WHERE ppm < 2),
        'moderate', count(*) FILTER (WHERE ppm >= 2 AND ppm <= 50),
        'high', count(*) FILTER (WHERE ppm > 50),
        'untested', count(*) FILTER (WHERE ppm IS NULL),
        'safe_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm < 2), 0),
        'moderate_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm >= 2 AND ppm <= 50), 0),
        'high_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm > 50), 0),
        'untested_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm IS NULL), 0)
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
