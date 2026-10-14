-- Latitudes that lost their minus and put the equipment in the sea north of
-- Java or Kalimantan:
--   "Latitude: -6.110751, longitude: 106.786308"  the parser dropped the minus
--                                                after the label (fixed in lib/dms.ts)
--   "6.134701, 106.290987", "6.262515 107.093496oE", "0.611122, 117.26969"
--                                                written without minus or "S"
-- A positive latitude, with no north written, whose mirror lies within about
-- 2 km of a point of the same company in the south, is turned south; the
-- import does the same from now on (coordinate:sign_fixed). On the data of
-- 2026-10-14 this is 15 rows of 4 companies and nothing else.

DO $$
DECLARE
  t text;
  fixed integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format($sql$
      WITH south AS (
        SELECT company_id, koordinat_lat AS lat, koordinat_lng AS lng FROM public.transformator_digunakan WHERE koordinat_lat < 0
        UNION ALL SELECT company_id, koordinat_lat, koordinat_lng FROM public.transformator_tidak_digunakan WHERE koordinat_lat < 0
        UNION ALL SELECT company_id, koordinat_lat, koordinat_lng FROM public.kapasitor WHERE koordinat_lat < 0
        UNION ALL SELECT company_id, koordinat_lat, koordinat_lng FROM public.minyak_dielektrik WHERE koordinat_lat < 0
      )
      UPDATE public.%1$I r SET
        koordinat_lat = -r.koordinat_lat,
        catatan_impor = coalesce(r.catatan_impor, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'kode', 'coordinate:sign_fixed', 'jenis', 'diperbaiki', 'kolom', 'koordinat',
          'pesan', 'Tanda minus lintang hilang (titik jatuh di laut), dibalik ke lintang selatan sesuai titik lain perusahaan ini',
          'nilai_asli', coalesce(r.koordinat_raw, ''), 'nilai_baru', (-r.koordinat_lat)::text || ', ' || r.koordinat_lng::text))
      WHERE r.koordinat_lat > 0.05
        AND coalesce(r.koordinat_raw, '') !~* '(\mN\M|\mLU\M|[0-9]\s*N|utara|north)'
        AND EXISTS (SELECT 1 FROM south s WHERE s.company_id = r.company_id AND abs(s.lat + r.koordinat_lat) < 0.02 AND abs(s.lng - r.koordinat_lng) < 0.02)
    $sql$, t);
    GET DIAGNOSTICS fixed = ROW_COUNT;
    RAISE NOTICE '%: % koordinat dibalik ke lintang selatan', t, fixed;
  END LOOP;
END $$;
