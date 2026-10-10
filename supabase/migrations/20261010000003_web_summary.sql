-- Summary tables for the web (Vercel + Supabase Cloud), which shows the
-- dashboards only: the inventory rows stay on the offline laptops.
--
-- `npm run web:publish` (also run by `npm run data:push`) fills these from
-- the local database with summary_build() and copies them, with the
-- companies and inventory_stats_parts, to the cloud. The dashboard figures
-- already come from inventory_stats_parts (20260929000007); the two tables
-- here cover what used to read the rows:
--
-- * summary_map_cells: points per grid cell for zoom levels 4-11 (cell of
--   84 / 2^level degrees, as cellSize in components/MapLeaflet.tsx), per
--   company and category, with the PCBs classes. summary_cells() sums the
--   cells of a view like map_clusters (20261010000002) does with the rows.
-- * summary_brand_counts: capacitor brands per production year and oil
--   brands per category, for the Lampiran I / II lists.
-- * summary_meta: when the summary was built.
--
-- They are not synced through the data repo (SKIP_TABLES in
-- scripts/offline/lib.mjs): every laptop can rebuild them.

CREATE TABLE IF NOT EXISTS public.summary_map_cells (
  level integer NOT NULL,
  cx integer NOT NULL,
  cy integer NOT NULL,
  company_id uuid NOT NULL,
  category text NOT NULL,
  total bigint NOT NULL,
  high bigint NOT NULL,
  moderate bigint NOT NULL,
  safe bigint NOT NULL,
  untested bigint NOT NULL,
  lat_sum double precision NOT NULL,
  lng_sum double precision NOT NULL,
  south double precision NOT NULL,
  west double precision NOT NULL,
  north double precision NOT NULL,
  east double precision NOT NULL,
  PRIMARY KEY (level, cx, cy, company_id, category)
);

CREATE TABLE IF NOT EXISTS public.summary_brand_counts (
  category text NOT NULL,
  -- 'nama_merek' (capacitor brand, with its year) or 'merek_minyak' (oil brand).
  field text NOT NULL,
  brand text,
  year integer,
  total bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.summary_meta (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  built_at timestamptz NOT NULL
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['summary_map_cells', 'summary_brand_counts', 'summary_meta'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated read on %1$s" ON public.%1$I', table_name);
    EXECUTE format('CREATE POLICY "Authenticated read on %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', table_name);
  END LOOP;
END $$;

-- Rebuild the summary tables from the inventory rows (a few seconds).
CREATE OR REPLACE FUNCTION public.summary_build()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  TRUNCATE public.summary_map_cells, public.summary_brand_counts;

  INSERT INTO public.summary_map_cells
  SELECT
    z, floor(i.lng / (84 / 2.0 ^ z))::int, floor(i.lat / (84 / 2.0 ^ z))::int, i.company_id, i.category,
    count(*),
    count(*) FILTER (WHERE i.ppm > 50),
    count(*) FILTER (WHERE i.ppm >= 2 AND i.ppm <= 50),
    count(*) FILTER (WHERE i.ppm < 2),
    count(*) FILTER (WHERE i.ppm IS NULL),
    sum(i.lat), sum(i.lng), min(i.lat), min(i.lng), max(i.lat), max(i.lng)
  FROM public.inventory_items i
  CROSS JOIN generate_series(4, 11) AS z
  WHERE i.lat BETWEEN -90 AND 90 AND i.lng BETWEEN -180 AND 180
  GROUP BY 1, 2, 3, 4, 5;

  INSERT INTO public.summary_brand_counts
  SELECT 'kapasitor', 'nama_merek', NULLIF(btrim(nama_merek), ''), tahun_pembuatan, count(*) FROM public.kapasitor GROUP BY 3, 4;

  INSERT INTO public.summary_brand_counts
  SELECT category, 'merek_minyak', merek, NULL, total
  FROM (
    SELECT 'transformator_digunakan' AS category, NULLIF(btrim(merek_minyak_dielektrik), '') AS merek, count(*) AS total FROM public.transformator_digunakan GROUP BY 2
    UNION ALL SELECT 'transformator_tidak_digunakan', NULLIF(btrim(merek_minyak_dielektrik), ''), count(*) FROM public.transformator_tidak_digunakan GROUP BY 2
    UNION ALL SELECT 'kapasitor', NULLIF(btrim(merek_minyak_dielektrik), ''), count(*) FROM public.kapasitor GROUP BY 2
    UNION ALL SELECT 'minyak_dielektrik', NULLIF(btrim(merek_minyak_dielektrik), ''), count(*) FROM public.minyak_dielektrik GROUP BY 2
  ) oils;

  INSERT INTO public.summary_meta (id, built_at) VALUES (1, now())
  ON CONFLICT (id) DO UPDATE SET built_at = EXCLUDED.built_at;
$$;

REVOKE ALL ON FUNCTION public.summary_build() FROM PUBLIC, anon, authenticated;

-- The cells of one zoom level within a view, summed over the companies and
-- categories asked for, in the shape of map_clusters.
CREATE OR REPLACE FUNCTION public.summary_cells(
  p_level integer,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_categories text[] DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_pcb text DEFAULT NULL
)
RETURNS TABLE (
  lat double precision, lng double precision, south double precision, west double precision, north double precision, east double precision,
  total bigint, high bigint, moderate bigint, safe bigint, untested bigint,
  trafo_used bigint, trafo_unused bigint, kapasitor bigint, minyak bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT c.*,
      CASE p_pcb WHEN 'high' THEN c.high WHEN 'moderate' THEN c.moderate WHEN 'safe' THEN c.safe WHEN 'untested' THEN c.untested ELSE c.total END AS n
    FROM public.summary_map_cells c
    WHERE c.level = p_level
      AND c.cx BETWEEN floor(p_west / (84 / 2.0 ^ p_level)) AND floor(p_east / (84 / 2.0 ^ p_level))
      AND c.cy BETWEEN floor(p_south / (84 / 2.0 ^ p_level)) AND floor(p_north / (84 / 2.0 ^ p_level))
      AND (p_categories IS NULL OR c.category = ANY (p_categories))
      AND (p_company_id IS NULL OR c.company_id = p_company_id)
  )
  SELECT
    -- With a PCBs class picked, the centre still weighs every point of the cell.
    (sum(lat_sum) / sum(total))::double precision, (sum(lng_sum) / sum(total))::double precision,
    min(south), min(west), max(north), max(east),
    sum(n)::bigint,
    sum(CASE WHEN p_pcb IS NULL OR p_pcb = 'high' THEN high ELSE 0 END)::bigint,
    sum(CASE WHEN p_pcb IS NULL OR p_pcb = 'moderate' THEN moderate ELSE 0 END)::bigint,
    sum(CASE WHEN p_pcb IS NULL OR p_pcb = 'safe' THEN safe ELSE 0 END)::bigint,
    sum(CASE WHEN p_pcb IS NULL OR p_pcb = 'untested' THEN untested ELSE 0 END)::bigint,
    sum(n) FILTER (WHERE category = 'transformator_digunakan')::bigint,
    sum(n) FILTER (WHERE category = 'transformator_tidak_digunakan')::bigint,
    sum(n) FILTER (WHERE category = 'kapasitor')::bigint,
    sum(n) FILTER (WHERE category = 'minyak_dielektrik')::bigint
  FROM picked
  GROUP BY cx, cy
  HAVING sum(n) > 0;
$$;

REVOKE ALL ON FUNCTION public.summary_cells(integer, double precision, double precision, double precision, double precision, text[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.summary_cells(integer, double precision, double precision, double precision, double precision, text[], uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
