-- Permen LHK 29/2020: the Batas Konsentrasi PCBs is 50 ppm, and equipment
-- is left out of PCBs management only "di bawah Batas Konsentrasi PCBs"
-- (Pasal 9 ayat 4, Pasal 10 ayat 4); labels set "di bawah" against "sama
-- dengan atau lebih dari". 50 ppm itself therefore contains PCBs: the
-- classes become < 2, 2 to under 50, and 50 or more (was 2-50 and over 50).
-- A transformer at exactly 50 ppm now needs handling on the roadmap.
--
-- The functions below are the current ones with only "ppm > 50" made
-- "ppm >= 50" and "ppm <= 50" made "ppm < 50"; the stored dashboard parts
-- are counted again.

CREATE OR REPLACE FUNCTION public.company_focus_transformers(p_company_id uuid)
 RETURNS TABLE(kategori text, id uuid, nama_merek text, nomor_serial text, tahun_pembuatan integer, lokasi text, unit text, ppm numeric, kebutuhan text, rencana_id uuid, rencana_untuk_alat boolean, rencana_tanggal date, rencana_selesai date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH items AS (
    SELECT 'transformator_digunakan'::text AS kategori, t.id, t.nama_merek, t.nomor_serial, t.tahun_pembuatan, t.lokasi_peralatan AS lokasi, t.unit, t.uji_konsentrasi_ppm AS ppm
    FROM public.transformator_digunakan t WHERE t.company_id = p_company_id AND (t.tahun_pembuatan IS NULL OR t.tahun_pembuatan < 1997)
    UNION ALL
    SELECT 'transformator_tidak_digunakan', t.id, t.nama_merek, t.nomor_serial, t.tahun_pembuatan, t.lokasi_peralatan, t.unit, t.uji_konsentrasi_ppm
    FROM public.transformator_tidak_digunakan t WHERE t.company_id = p_company_id AND (t.tahun_pembuatan IS NULL OR t.tahun_pembuatan < 1997)
  ),
  needs AS (
    SELECT i.*, CASE
      WHEN i.kategori = 'transformator_tidak_digunakan' THEN 'pengelolaan'
      WHEN i.ppm IS NULL THEN 'uji'
      WHEN i.ppm >= 50 THEN 'penanganan'
    END AS kebutuhan FROM items i
  ),
  -- The plan that counts per transformer and need, picked once.
  own AS (
    SELECT DISTINCT ON (p.item_id, p.jenis) p.item_id, p.jenis, p.id, p.rencana_tanggal, p.selesai_at
    FROM public.equipment_plans p
    WHERE p.company_id = p_company_id AND p.item_id IS NOT NULL
    ORDER BY p.item_id, p.jenis, (p.selesai_at IS NULL), p.rencana_tanggal
  ),
  -- The company-wide plan that counts per category and need, picked once too.
  wide AS (
    SELECT DISTINCT ON (k.kategori, p.jenis) k.kategori, p.jenis, p.id, p.rencana_tanggal, p.selesai_at
    FROM (VALUES ('transformator_digunakan'), ('transformator_tidak_digunakan')) k (kategori)
    JOIN public.equipment_plans p ON p.company_id = p_company_id AND p.item_id IS NULL AND (p.kategori IS NULL OR p.kategori = k.kategori)
    ORDER BY k.kategori, p.jenis, (p.selesai_at IS NULL), p.rencana_tanggal
  )
  SELECT n.kategori, n.id, n.nama_merek, n.nomor_serial, n.tahun_pembuatan, n.lokasi, n.unit, n.ppm, n.kebutuhan,
    COALESCE(o.id, w.id), o.id IS NOT NULL,
    CASE WHEN o.id IS NOT NULL THEN o.rencana_tanggal ELSE w.rencana_tanggal END,
    CASE WHEN o.id IS NOT NULL THEN o.selesai_at ELSE w.selesai_at END
  FROM needs n
  LEFT JOIN own o ON o.item_id = n.id AND o.jenis = n.kebutuhan
  LEFT JOIN wide w ON o.id IS NULL AND w.kategori = n.kategori AND w.jenis = n.kebutuhan;
$function$;

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
      OR (p_pcb = 'high' AND i.ppm >= 50)
      OR (p_pcb = 'untested' AND i.ppm IS NULL))
    AND (p_year IS NULL
      OR (p_year = 'pre1997' AND i.tahun_pembuatan < 1997)
      OR (p_year = 'from1997' AND i.tahun_pembuatan >= 1997)
      OR (p_year = 'unknown' AND i.tahun_pembuatan IS NULL))
  GROUP BY floor(i.lat / p_cell), floor(i.lng / p_cell);
$function$;

CREATE OR REPLACE FUNCTION public.inventory_stats_delta_sql(p_table text, p_source text, p_sign integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
      %2$s * count(*) FILTER (WHERE ppm >= 2 AND ppm < 50),
      %2$s * count(*) FILTER (WHERE ppm >= 50),
      %2$s * COALESCE(sum(volume_l), 0),
      %2$s * count(*) FILTER (WHERE koordinat_lat IS NOT NULL AND koordinat_lng IS NOT NULL),
      %2$s * count(*) FILTER (WHERE berat_total_kg IS NOT NULL),
      %2$s * COALESCE(sum(berat_total_kg), 0),
      %2$s * count(*) FILTER (WHERE berat_kering_kg IS NOT NULL AND berat_minyak_kg IS NOT NULL),
      %2$s * COALESCE(sum(berat_kering_kg) FILTER (WHERE berat_minyak_kg IS NOT NULL), 0),
      %2$s * COALESCE(sum(berat_minyak_kg) FILTER (WHERE berat_kering_kg IS NOT NULL), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm < 2), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm >= 2 AND ppm < 50), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm >= 50), 0),
      %2$s * COALESCE(sum(berat_total_kg) FILTER (WHERE ppm IS NULL), 0),
      %2$s * count(*) FILTER (WHERE ppm < 2 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm >= 2 AND ppm < 50 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm >= 50 AND uji_jenis ILIKE '%%lab%%'),
      %2$s * count(*) FILTER (WHERE ppm < 2 AND uji_jenis ILIKE '%%cepat%%'),
      %2$s * count(*) FILTER (WHERE ppm >= 2 AND ppm < 50 AND uji_jenis ILIKE '%%cepat%%'),
      %2$s * count(*) FILTER (WHERE ppm >= 50 AND uji_jenis ILIKE '%%cepat%%')
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
$function$;

CREATE OR REPLACE FUNCTION public.inventory_stats_scan(p_company_id uuid DEFAULT NULL::uuid, p_unit text DEFAULT NULL::text, p_sub_unit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      'risk_moderate', count(*) FILTER (WHERE ppm >= 2 AND ppm < 50),
      'risk_high', count(*) FILTER (WHERE ppm >= 50),
      'pre1997_tested', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm IS NOT NULL),
      'pre1997_risk_safe', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm < 2),
      'pre1997_risk_moderate', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm >= 2 AND ppm < 50),
      'pre1997_risk_high', count(*) FILTER (WHERE tahun_pembuatan < 1997 AND ppm >= 50),
      'volume_l', COALESCE(sum(volume_l), 0),
      'with_coordinates', count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL),
      'with_weight', count(*) FILTER (WHERE berat_total_kg IS NOT NULL),
      'weight_kg', COALESCE(sum(berat_total_kg), 0),
      'with_weight_parts', count(*) FILTER (WHERE berat_kering_kg IS NOT NULL AND berat_minyak_kg IS NOT NULL),
      'weight_dry_kg', COALESCE(sum(berat_kering_kg) FILTER (WHERE berat_minyak_kg IS NOT NULL), 0),
      'weight_oil_kg', COALESCE(sum(berat_minyak_kg) FILTER (WHERE berat_kering_kg IS NOT NULL), 0),
      'weight_safe_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm < 2), 0),
      'weight_moderate_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm >= 2 AND ppm < 50), 0),
      'weight_high_kg', COALESCE(sum(berat_total_kg) FILTER (WHERE ppm >= 50), 0),
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
$function$;

CREATE OR REPLACE FUNCTION public.summary_build()
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  TRUNCATE public.summary_map_cells, public.summary_brand_counts;

  INSERT INTO public.summary_map_cells
  SELECT
    z, floor(i.lng / (84 / 2.0 ^ z))::int, floor(i.lat / (84 / 2.0 ^ z))::int, i.company_id, i.category,
    count(*),
    count(*) FILTER (WHERE i.ppm >= 50),
    count(*) FILTER (WHERE i.ppm >= 2 AND i.ppm < 50),
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
$function$;

-- The dashboard parts again, with the new classes (as in 20260929000008).
DO $$
DECLARE table_name text;
BEGIN
  LOCK TABLE public.transformator_digunakan, public.transformator_tidak_digunakan, public.kapasitor, public.minyak_dielektrik IN SHARE MODE;
  TRUNCATE public.inventory_stats_parts;
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE public.inventory_stats_delta_sql(table_name, format('public.%I', table_name), 1);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';