-- Oil brands of one inventory table with how many rows carry each, for
-- matching against Lampiran I of Permen LHK 29/2020 (trade names of
-- dielectric oils containing PCBs) on the category pages.
--
-- The transformer tables hold ~324k rows: reading them page by page in the
-- browser would take hundreds of requests, while the distinct brands are a
-- few hundred. The brand is returned as stored (trimmed), so the page can
-- fetch the rows of a matched brand with an exact filter. Rows without a
-- brand come back as one null row.
--
-- Security invoker: the caller's row level security applies as usual.

CREATE OR REPLACE FUNCTION public.oil_brand_counts(p_table text)
RETURNS TABLE (merek text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_table NOT IN ('transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik') THEN
    RAISE EXCEPTION 'oil_brand_counts: unknown table %', p_table;
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT NULLIF(btrim(merek_minyak_dielektrik), %L), count(*) FROM public.%I GROUP BY 1',
    '', p_table);
END;
$$;

REVOKE ALL ON FUNCTION public.oil_brand_counts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oil_brand_counts(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
