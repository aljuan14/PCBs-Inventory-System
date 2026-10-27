-- The map's PCBs filter gets "below50" (under the 50 ppm Batas Konsentrasi),
-- the group the app shows since 2026-10-27 in place of "< 2" and "2 - < 50"
-- (lib/inventory.ts PCB_GROUPS). map_clusters as in 20261019000001 and
-- summary_cells as in 20261010000003, with that one value added.

CREATE OR REPLACE FUNCTION public.map_clusters(p_cell double precision, p_west double precision, p_south double precision, p_east double precision, p_north double precision, p_category text DEFAULT NULL::text, p_company_id uuid DEFAULT NULL::uuid, p_unit text DEFAULT NULL::text, p_sub_unit text DEFAULT NULL::text, p_pcb text DEFAULT NULL::text, p_year text DEFAULT NULL::text)
 RETURNS TABLE(lat double precision, lng double precision, south double precision, west double precision, north double precision, east double precision, total bigint, high bigint, moderate bigint, safe bigint, untested bigint, trafo_used bigint, trafo_unused bigint, kapasitor bigint, minyak bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    avg(i.lat)::double precision, avg(i.lng)::double precision,
    min(i.lat)::double precision, min(i.lng)::double precision,
    max(i.lat)::double precision, max(i.lng)::double precision,
    count(*),
    count(*) FILTER (WHERE i.ppm >= 50),
    count(*) FILTER (WHERE i.ppm >= 2 AND i.ppm < 50),
    count(*) FILTER (WHERE i.ppm < 2),
    count(*) FILTER (WHERE i.ppm IS NULL),
    count(*) FILTER (WHERE i.category = 'transformator_digunakan'),
    count(*) FILTER (WHERE i.category = 'transformator_tidak_digunakan'),
    count(*) FILTER (WHERE i.category = 'kapasitor'),
    count(*) FILTER (WHERE i.category = 'minyak_dielektrik')
  FROM public.inventory_items i
  WHERE i.lat BETWEEN p_south AND p_north
    AND i.lng BETWEEN p_west AND p_east
    AND (p_category IS NULL
      OR (p_category = 'transformator' AND i.category IN ('transformator_digunakan', 'transformator_tidak_digunakan'))
      OR i.category = p_category)
    AND (p_company_id IS NULL OR i.company_id = p_company_id)
    AND (p_unit IS NULL OR i.unit = p_unit)
    AND (p_sub_unit IS NULL OR i.sub_unit = p_sub_unit)
    AND (p_pcb IS NULL
      OR (p_pcb = 'safe' AND i.ppm < 2)
      OR (p_pcb = 'moderate' AND i.ppm >= 2 AND i.ppm < 50)
      OR (p_pcb = 'below50' AND i.ppm < 50)
      OR (p_pcb = 'high' AND i.ppm >= 50)
      OR (p_pcb = 'untested' AND i.ppm IS NULL))
    AND (p_year IS NULL
      OR (p_year = 'pre1997' AND i.tahun_pembuatan < 1997)
      OR (p_year = 'from1997' AND i.tahun_pembuatan >= 1997)
      OR (p_year = 'unknown' AND i.tahun_pembuatan IS NULL))
  GROUP BY floor(i.lat / p_cell), floor(i.lng / p_cell);
$function$;

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
      CASE p_pcb WHEN 'high' THEN c.high WHEN 'moderate' THEN c.moderate WHEN 'safe' THEN c.safe WHEN 'untested' THEN c.untested WHEN 'below50' THEN c.safe + c.moderate ELSE c.total END AS n
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
    sum(CASE WHEN p_pcb IS NULL OR p_pcb IN ('moderate', 'below50') THEN moderate ELSE 0 END)::bigint,
    sum(CASE WHEN p_pcb IS NULL OR p_pcb IN ('safe', 'below50') THEN safe ELSE 0 END)::bigint,
    sum(CASE WHEN p_pcb IS NULL OR p_pcb = 'untested' THEN untested ELSE 0 END)::bigint,
    sum(n) FILTER (WHERE category = 'transformator_digunakan')::bigint,
    sum(n) FILTER (WHERE category = 'transformator_tidak_digunakan')::bigint,
    sum(n) FILTER (WHERE category = 'kapasitor')::bigint,
    sum(n) FILTER (WHERE category = 'minyak_dielektrik')::bigint
  FROM picked
  GROUP BY cx, cy
  HAVING sum(n) > 0;
$$;

NOTIFY pgrst, 'reload schema';
