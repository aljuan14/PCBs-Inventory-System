-- Data quality: a transformer whose weight does not fit its power, more
-- than 50 kg per kVA (large power transformers weigh about 1 kg per kVA, a
-- 25 kVA distribution one about 10). Either the weight is in the wrong unit
-- (PT Semen Jawa: 300-990 t for ~1 MVA) or the power is (Star Energy Salak:
-- 1.25 "kVA" for 1.25 MVA), so the row is only flagged, not changed.
--
-- inventory_items gets the flag as berat_tidak_sesuai_daya (the table filter
-- "Berat tidak sesuai daya") and inventory_quality counts it as weight_power
-- (lib/data-quality.ts). Both are their definitions so far with that added.

CREATE OR REPLACE VIEW public.inventory_items WITH (security_invoker = true) AS
 SELECT transformator_digunakan.id,
    'transformator_digunakan'::text AS category,
    transformator_digunakan.company_id,
    transformator_digunakan.no,
    transformator_digunakan.nama_merek AS name,
    transformator_digunakan.nomor_serial AS serial,
    transformator_digunakan.lokasi_peralatan AS location,
    transformator_digunakan.koordinat_lat AS lat,
    transformator_digunakan.koordinat_lng AS lng,
    transformator_digunakan.tahun_pembuatan,
    transformator_digunakan.uji_jenis,
    transformator_digunakan.uji_konsentrasi_ppm AS ppm,
    'Masih digunakan'::text AS status,
    transformator_digunakan.daya_kva,
    NULL::numeric AS volume_l,
    transformator_digunakan.created_at,
    transformator_digunakan.import_batch_id,
    transformator_digunakan.unit,
    transformator_digunakan.sub_unit,
    transformator_digunakan.kode_alat,
    transformator_digunakan.koordinat_raw,
    transformator_digunakan.catatan_impor,
    transformator_digunakan.baris_excel,
    transformator_digunakan.berat_kering_kg,
    transformator_digunakan.berat_minyak_kg,
    COALESCE(transformator_digunakan.berat_total_kg, NULLIF(transformator_digunakan.berat_ton, 0::numeric) * 1000::numeric) AS berat_total_kg,
    COALESCE(transformator_digunakan.daya_kva > 0::numeric AND COALESCE(transformator_digunakan.berat_total_kg, NULLIF(transformator_digunakan.berat_ton, 0::numeric) * 1000::numeric) / transformator_digunakan.daya_kva > 50::numeric, false) AS berat_tidak_sesuai_daya
   FROM transformator_digunakan
UNION ALL
 SELECT transformator_tidak_digunakan.id,
    'transformator_tidak_digunakan'::text AS category,
    transformator_tidak_digunakan.company_id,
    transformator_tidak_digunakan.no,
    transformator_tidak_digunakan.nama_merek AS name,
    transformator_tidak_digunakan.nomor_serial AS serial,
    transformator_tidak_digunakan.lokasi_peralatan AS location,
    transformator_tidak_digunakan.koordinat_lat AS lat,
    transformator_tidak_digunakan.koordinat_lng AS lng,
    transformator_tidak_digunakan.tahun_pembuatan,
    transformator_tidak_digunakan.uji_jenis,
    transformator_tidak_digunakan.uji_konsentrasi_ppm AS ppm,
    COALESCE(transformator_tidak_digunakan.status_kondisi, 'Tidak digunakan'::text) AS status,
    transformator_tidak_digunakan.daya_kva,
    NULL::numeric AS volume_l,
    transformator_tidak_digunakan.created_at,
    transformator_tidak_digunakan.import_batch_id,
    transformator_tidak_digunakan.unit,
    transformator_tidak_digunakan.sub_unit,
    transformator_tidak_digunakan.kode_alat,
    transformator_tidak_digunakan.koordinat_raw,
    transformator_tidak_digunakan.catatan_impor,
    transformator_tidak_digunakan.baris_excel,
    transformator_tidak_digunakan.berat_kering_kg,
    transformator_tidak_digunakan.berat_minyak_kg,
    COALESCE(transformator_tidak_digunakan.berat_total_kg, NULLIF(transformator_tidak_digunakan.berat_ton, 0::numeric) * 1000::numeric) AS berat_total_kg,
    COALESCE(transformator_tidak_digunakan.daya_kva > 0::numeric AND COALESCE(transformator_tidak_digunakan.berat_total_kg, NULLIF(transformator_tidak_digunakan.berat_ton, 0::numeric) * 1000::numeric) / transformator_tidak_digunakan.daya_kva > 50::numeric, false) AS berat_tidak_sesuai_daya
   FROM transformator_tidak_digunakan
UNION ALL
 SELECT kapasitor.id,
    'kapasitor'::text AS category,
    kapasitor.company_id,
    kapasitor.no,
    kapasitor.nama_merek AS name,
    kapasitor.nomor_serial AS serial,
    kapasitor.lokasi_peralatan AS location,
    kapasitor.koordinat_lat AS lat,
    kapasitor.koordinat_lng AS lng,
    kapasitor.tahun_pembuatan,
    NULL::text AS uji_jenis,
    NULL::numeric AS ppm,
    kapasitor.status_alat AS status,
    NULL::numeric AS daya_kva,
    NULL::numeric AS volume_l,
    kapasitor.created_at,
    kapasitor.import_batch_id,
    kapasitor.unit,
    kapasitor.sub_unit,
    kapasitor.kode_alat,
    kapasitor.koordinat_raw,
    kapasitor.catatan_impor,
    kapasitor.baris_excel,
    NULL::numeric AS berat_kering_kg,
    NULL::numeric AS berat_minyak_kg,
    NULL::numeric AS berat_total_kg,
    false AS berat_tidak_sesuai_daya
   FROM kapasitor
UNION ALL
 SELECT minyak_dielektrik.id,
    'minyak_dielektrik'::text AS category,
    minyak_dielektrik.company_id,
    minyak_dielektrik.no,
    minyak_dielektrik.merek_minyak_dielektrik AS name,
    NULL::text AS serial,
    minyak_dielektrik.lokasi_penyimpanan AS location,
    minyak_dielektrik.koordinat_lat AS lat,
    minyak_dielektrik.koordinat_lng AS lng,
    minyak_dielektrik.tahun_pembuatan,
    minyak_dielektrik.uji_jenis,
    minyak_dielektrik.uji_konsentrasi_ppm AS ppm,
    minyak_dielektrik.status_minyak AS status,
    NULL::numeric AS daya_kva,
    minyak_dielektrik.volume_l,
    minyak_dielektrik.created_at,
    minyak_dielektrik.import_batch_id,
    minyak_dielektrik.unit,
    minyak_dielektrik.sub_unit,
    minyak_dielektrik.kode_alat,
    minyak_dielektrik.koordinat_raw,
    minyak_dielektrik.catatan_impor,
    minyak_dielektrik.baris_excel,
    NULL::numeric AS berat_kering_kg,
    NULL::numeric AS berat_minyak_kg,
    NULL::numeric AS berat_total_kg,
    false AS berat_tidak_sesuai_daya
   FROM minyak_dielektrik;

CREATE OR REPLACE FUNCTION public.inventory_quality(p_company_id uuid DEFAULT NULL::uuid, p_unit text DEFAULT NULL::text, p_sub_unit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      kode_alat IS NOT NULL AS has_code,
      berat_tidak_sesuai_daya AS weight_power
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
        'oil', count(*) FILTER (WHERE is_oil),
        'weight_power', count(*) FILTER (WHERE weight_power)
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
$function$;

NOTIFY pgrst, 'reload schema';
