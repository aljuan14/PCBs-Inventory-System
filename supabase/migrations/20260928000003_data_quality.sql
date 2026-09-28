-- Data quality: what the import checks found is kept, so it can be reviewed
-- later and reported to the company.
--
-- * catatan_impor (per row): what the import changed or could not read, e.g.
--   [{"kode":"coordinate:repaired","jenis":"diperbaiki","kolom":"koordinat",
--     "pesan":"...","nilai_asli":"(-6.86, 107.90)","nilai_baru":"-6.86, 107.90"}]
--   jenis: diperbaiki | dikosongkan | tidak_terbaca | di_luar_wilayah
-- * baris_excel (per row): the row number in the uploaded sheet.
-- * laporan_pemeriksaan (per import batch): the check report shown at upload.
-- * inventory_quality(): completeness figures for the dashboard, overall and
--   per company / unit / sub-unit.

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS catatan_impor JSONB, ADD COLUMN IF NOT EXISTS baris_excel INTEGER', table_name);
  END LOOP;
END $$;

ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS laporan_pemeriksaan JSONB;

-- Same view as 20260928000001 with koordinat_raw, catatan_impor and baris_excel appended.
CREATE OR REPLACE VIEW public.inventory_items WITH (security_invoker = true) AS
SELECT
    id, 'transformator_digunakan'::text AS category, company_id, no,
    nama_merek AS name, nomor_serial AS serial, lokasi_peralatan AS location,
    koordinat_lat AS lat, koordinat_lng AS lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm AS ppm, 'Masih digunakan'::text AS status,
    daya_kva, NULL::numeric AS volume_l, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel
FROM public.transformator_digunakan
UNION ALL
SELECT
    id, 'transformator_tidak_digunakan', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, COALESCE(status_kondisi, 'Tidak digunakan'),
    daya_kva, NULL::numeric, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel
FROM public.transformator_tidak_digunakan
UNION ALL
SELECT
    id, 'kapasitor', company_id, no,
    nama_merek, nomor_serial, lokasi_peralatan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, NULL::text,
    NULL::numeric, status_alat,
    NULL::numeric, NULL::numeric, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel
FROM public.kapasitor
UNION ALL
SELECT
    id, 'minyak_dielektrik', company_id, no,
    merek_minyak_dielektrik, NULL::text, lokasi_penyimpanan,
    koordinat_lat, koordinat_lng, tahun_pembuatan, uji_jenis,
    uji_konsentrasi_ppm, status_minyak,
    NULL::numeric, volume_l, created_at, import_batch_id,
    unit, sub_unit, kode_alat, koordinat_raw, catatan_impor, baris_excel
FROM public.minyak_dielektrik;

GRANT SELECT ON public.inventory_items TO anon, authenticated;

-- Completeness of the data in scope. Which fields count depends on the
-- category, matching the import checks: brand and coordinates for all;
-- serial number and year for equipment; power for transformers; volume for
-- oil. A row is complete when every field that applies to it is filled and
-- its coordinates were readable.
--
-- Returns {"level": "company" | "unit" | "sub_unit", "summary": {...},
-- "groups": [{"key", "label", ...figures}]}: the groups are the companies,
-- the units of the chosen company, or the sub-units of the chosen unit.
CREATE OR REPLACE FUNCTION public.inventory_quality(p_company_id uuid DEFAULT NULL, p_unit text DEFAULT NULL, p_sub_unit text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH flags AS (
    SELECT
      CASE WHEN p_company_id IS NULL THEN company_id::text WHEN p_unit IS NULL THEN unit ELSE sub_unit END AS grp,
      category <> 'minyak_dielektrik' AS is_equipment,
      category LIKE 'transformator%' AS is_trafo,
      category = 'minyak_dielektrik' AS is_oil,
      lat IS NULL AND koordinat_raw IS NULL AS no_coord,
      lat IS NULL AND koordinat_raw IS NOT NULL AS bad_coord,
      COALESCE(catatan_impor @> '[{"jenis": "diperbaiki", "kolom": "koordinat"}]', false) AS fixed_coord,
      COALESCE(catatan_impor @> '[{"jenis": "dikosongkan"}]', false) AS cleared,
      name IS NULL AS no_name,
      serial IS NULL AND category <> 'minyak_dielektrik' AS no_serial,
      tahun_pembuatan IS NULL AND category <> 'minyak_dielektrik' AS no_year,
      daya_kva IS NULL AND category LIKE 'transformator%' AS no_daya,
      volume_l IS NULL AND category = 'minyak_dielektrik' AS no_volume,
      kode_alat IS NOT NULL AS has_code
    FROM public.inventory_items
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND (p_unit IS NULL OR unit = p_unit)
      AND (p_sub_unit IS NULL OR sub_unit = p_sub_unit)
  ),
  figures AS (
    SELECT
      grp,
      GROUPING(grp) = 1 AS is_summary,
      jsonb_build_object(
        'total', count(*),
        'complete', count(*) FILTER (WHERE NOT (no_coord OR bad_coord OR no_name OR no_serial OR no_year OR no_daya OR no_volume)),
        'no_coordinates', count(*) FILTER (WHERE no_coord),
        'unreadable_coordinates', count(*) FILTER (WHERE bad_coord),
        'fixed_coordinates', count(*) FILTER (WHERE fixed_coord),
        'cleared_values', count(*) FILTER (WHERE cleared),
        'no_name', count(*) FILTER (WHERE no_name),
        'no_serial', count(*) FILTER (WHERE no_serial),
        'no_year', count(*) FILTER (WHERE no_year),
        'no_daya', count(*) FILTER (WHERE no_daya),
        'no_volume', count(*) FILTER (WHERE no_volume),
        'no_code', count(*) FILTER (WHERE NOT has_code),
        'with_code', count(*) FILTER (WHERE has_code),
        'equipment', count(*) FILTER (WHERE is_equipment),
        'transformers', count(*) FILTER (WHERE is_trafo),
        'oil', count(*) FILTER (WHERE is_oil)
      ) AS stats
    FROM flags
    GROUP BY GROUPING SETS ((grp), ())
  )
  SELECT jsonb_build_object(
    'level', CASE WHEN p_company_id IS NULL THEN 'company' WHEN p_unit IS NULL THEN 'unit' ELSE 'sub_unit' END,
    'summary', COALESCE((SELECT stats FROM figures WHERE is_summary), '{}'::jsonb),
    'groups', COALESCE((
      SELECT jsonb_agg(
        f.stats || jsonb_build_object('key', f.grp, 'label', CASE WHEN p_company_id IS NULL THEN c.nama_perusahaan ELSE f.grp END)
        ORDER BY f.grp
      )
      FROM figures f
      LEFT JOIN public.companies c ON p_company_id IS NULL AND c.id::text = f.grp
      WHERE NOT f.is_summary
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.inventory_quality(uuid, text, text) TO anon, authenticated;
