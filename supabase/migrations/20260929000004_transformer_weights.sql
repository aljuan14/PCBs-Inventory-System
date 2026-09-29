-- Transformer weights as the PLN form reports them: dry equipment, oil /
-- liquid and total, in kg. The import used to keep only the total (as
-- berat_ton); scripts/backfill-weights.ts fills the new columns of rows
-- already imported from their stored workbooks.
--
-- * inventory_items gains the three weights; berat_total_kg falls back to
--   berat_ton × 1000 for rows from the KLHK template, which has only a total.
--   A berat_ton of 0 counts as empty: imports before this one stored the PLN
--   form's formula total of an empty row as 0.
-- * inventory_stats adds tonnage: total, dry and oil, per PCBs risk class,
--   and for equipment made before 1997.
-- * inventory_set_weights() writes the weights of many rows of a batch in
--   one request, matched on their Excel row.

ALTER TABLE public.transformator_digunakan
  ADD COLUMN IF NOT EXISTS berat_kering_kg numeric,
  ADD COLUMN IF NOT EXISTS berat_minyak_kg numeric,
  ADD COLUMN IF NOT EXISTS berat_total_kg numeric;
ALTER TABLE public.transformator_tidak_digunakan
  ADD COLUMN IF NOT EXISTS berat_kering_kg numeric,
  ADD COLUMN IF NOT EXISTS berat_minyak_kg numeric,
  ADD COLUMN IF NOT EXISTS berat_total_kg numeric;

CREATE INDEX IF NOT EXISTS idx_transformator_digunakan_batch_row ON public.transformator_digunakan (import_batch_id, baris_excel);
CREATE INDEX IF NOT EXISTS idx_transformator_tidak_digunakan_batch_row ON public.transformator_tidak_digunakan (import_batch_id, baris_excel);

-- Same view as 20260928000003 with the three weights appended.
CREATE OR REPLACE VIEW public.inventory_items WITH (security_invoker = true) AS
SELECT
    id, 'transformator_digunakan'::text AS category, company_id, no,
    nama_merek AS name, nomor_serial AS serial, lokasi_peralatan AS location,
    koordinat_lat AS lat, koordinat_lng AS lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm AS ppm, 'Masih digunakan'::text AS status,
    daya_kva, NULL::numeric AS volume_l, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel,
    berat_kering_kg, berat_minyak_kg, COALESCE(berat_total_kg, NULLIF(berat_ton, 0) * 1000) AS berat_total_kg
FROM public.transformator_digunakan
UNION ALL
SELECT
    id, 'transformator_tidak_digunakan', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, COALESCE(status_kondisi, 'Tidak digunakan'),
    daya_kva, NULL::numeric, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel,
    berat_kering_kg, berat_minyak_kg, COALESCE(berat_total_kg, NULLIF(berat_ton, 0) * 1000)
FROM public.transformator_tidak_digunakan
UNION ALL
SELECT
    id, 'kapasitor', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, NULL::text,
    NULL::numeric, status_alat,
    NULL::numeric, NULL::numeric, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel,
    NULL::numeric, NULL::numeric, NULL::numeric
FROM public.kapasitor
UNION ALL
SELECT
    id, 'minyak_dielektrik', company_id, no,
    merek_minyak_dielektrik, NULL::text, lokasi_penyimpanan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, status_minyak,
    NULL::numeric, volume_l, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel,
    NULL::numeric, NULL::numeric, NULL::numeric
FROM public.minyak_dielektrik;

GRANT SELECT ON public.inventory_items TO anon, authenticated;

-- Same figures as 20260929000001 plus tonnage (kg; the dashboard shows tons).
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
      'weight_dry_kg', COALESCE(sum(berat_kering_kg), 0),
      'weight_oil_kg', COALESCE(sum(berat_minyak_kg), 0),
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

-- Writes the weights of rows of one import batch, matched on their Excel
-- row: p_rows is [{"row": 12, "dry": 960, "oil": 360, "total": 1320}, …].
-- berat_ton follows the total. Returns the number of rows updated.
CREATE OR REPLACE FUNCTION public.inventory_set_weights(p_category text, p_batch uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  IF p_category NOT IN ('transformator_digunakan', 'transformator_tidak_digunakan') THEN
    RAISE EXCEPTION 'Kategori tanpa kolom berat: %', p_category;
  END IF;
  EXECUTE format($query$
    UPDATE public.%I t SET
      berat_kering_kg = (r.v->>'dry')::numeric,
      berat_minyak_kg = (r.v->>'oil')::numeric,
      berat_total_kg = (r.v->>'total')::numeric,
      berat_ton = (r.v->>'total')::numeric / 1000
    FROM jsonb_array_elements($2) AS r(v)
    WHERE t.import_batch_id = $1 AND t.baris_excel = (r.v->>'row')::integer
  $query$, p_category) USING p_batch, p_rows;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_set_weights(text, uuid, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
