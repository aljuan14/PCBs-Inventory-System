-- Map points summed per grid cell of the visible area, so the map can show
-- every one of the ~237k inventory rows with coordinates.
--
-- The map used to load the first 5,000 points by id: about 2% of them,
-- picked at random. Now it asks for the cells of what is on screen (the
-- cell size follows the zoom), draws one bubble per cell with its count and
-- the share of each PCBs class and category, and loads the single points
-- only once few enough are in view. The coordinate indexes of every table
-- (idx_*_coords) serve the bounding box.
--
-- Filters follow the inventory table: category ('transformator' for both
-- transformer tables), company / unit / sub-unit, PCBs class (bounds of
-- PCB_CLASSES in lib/inventory.ts) and production year around 1997.
-- Security invoker: the caller's row level security applies as usual.

CREATE OR REPLACE FUNCTION public.map_clusters(
  p_cell double precision,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_category text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_sub_unit text DEFAULT NULL,
  p_pcb text DEFAULT NULL,
  p_year text DEFAULT NULL
)
RETURNS TABLE (
  lat double precision,
  lng double precision,
  south double precision,
  west double precision,
  north double precision,
  east double precision,
  total bigint,
  high bigint,
  moderate bigint,
  safe bigint,
  untested bigint,
  trafo_used bigint,
  trafo_unused bigint,
  kapasitor bigint,
  minyak bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    avg(i.lat)::double precision, avg(i.lng)::double precision,
    min(i.lat)::double precision, min(i.lng)::double precision,
    max(i.lat)::double precision, max(i.lng)::double precision,
    count(*),
    count(*) FILTER (WHERE i.ppm > 50),
    count(*) FILTER (WHERE i.ppm >= 2 AND i.ppm <= 50),
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
      OR (p_pcb = 'moderate' AND i.ppm >= 2 AND i.ppm <= 50)
      OR (p_pcb = 'high' AND i.ppm > 50)
      OR (p_pcb = 'untested' AND i.ppm IS NULL))
    AND (p_year IS NULL
      OR (p_year = 'pre1997' AND i.tahun_pembuatan < 1997)
      OR (p_year = 'from1997' AND i.tahun_pembuatan >= 1997)
      OR (p_year = 'unknown' AND i.tahun_pembuatan IS NULL))
  GROUP BY floor(i.lat / p_cell), floor(i.lng / p_cell);
$$;

REVOKE ALL ON FUNCTION public.map_clusters(double precision, double precision, double precision, double precision, double precision, text, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.map_clusters(double precision, double precision, double precision, double precision, double precision, text, uuid, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
