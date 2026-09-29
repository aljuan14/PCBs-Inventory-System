-- inventory_existing_rows (20260929000002) returned one row per match, and
-- the API caps a response at 1,000 rows (max rows setting), so a chunk of
-- 2,000 rows lost every match past the first 1,000 without an error. It now
-- returns the positions as one array, which the cap does not apply to.

DROP FUNCTION IF EXISTS public.inventory_existing_rows(text, uuid, jsonb, uuid);

-- Positions (0-based) of the rows in p_rows that are already stored for the
-- company. Each row is an object with the keys unit, sub_unit, kode_alat, no,
-- name, serial, tahun_pembuatan, daya_kva, volume_l, koordinat_raw, location.
-- Rows of p_exclude_batch do not count (the batch being replaced).
CREATE FUNCTION public.inventory_existing_rows(p_category text, p_company_id uuid, p_rows jsonb, p_exclude_batch uuid DEFAULT NULL)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  found integer[];
BEGIN
  IF p_category NOT IN ('transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik') THEN
    RAISE EXCEPTION 'Kategori tidak dikenal: %', p_category;
  END IF;
  EXECUTE format($query$
    SELECT coalesce(array_agg((r.idx - 1)::integer ORDER BY r.idx), '{}')
    FROM jsonb_array_elements($2) WITH ORDINALITY AS r(v, idx)
    WHERE EXISTS (
      SELECT 1 FROM public.%I t
      WHERE t.company_id = $1
        AND t.fingerprint = public.inventory_fingerprint(
          r.v->>'unit', r.v->>'sub_unit', r.v->>'kode_alat', r.v->>'no', r.v->>'name', r.v->>'serial',
          r.v->>'tahun_pembuatan', r.v->>'daya_kva', r.v->>'volume_l', r.v->>'koordinat_raw', r.v->>'location')
        AND ($3 IS NULL OR t.import_batch_id IS DISTINCT FROM $3)
    )
  $query$, p_category) INTO found USING p_company_id, p_rows, p_exclude_batch;
  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_existing_rows(text, uuid, jsonb, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
