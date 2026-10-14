-- A third role: pemantau (the leadership of KLH) sees what the admin sees
-- and changes nothing. Its read policies are added next to the existing
-- ones (permissive policies are OR-ed), so admin and company access stay as
-- 20261013000011 and 20261013000012 set them; no write policy names it, so
-- the database refuses its inserts, updates and deletes whatever the app shows.
--
-- Not readable for it: user_access beyond its own row (the accounts are the
-- admin's), and the admin's working tables of the upload flow.

ALTER TABLE public.user_access DROP CONSTRAINT IF EXISTS user_access_peran_check;
ALTER TABLE public.user_access ADD CONSTRAINT user_access_peran_check CHECK (peran IN ('admin', 'pemantau', 'perusahaan'));

CREATE OR REPLACE FUNCTION public.is_pemantau()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_access WHERE user_id = auth.uid() AND peran = 'pemantau');
$$;

REVOKE ALL ON FUNCTION public.is_pemantau() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pemantau() TO authenticated;

DO $$
DECLARE
  t text;
  readable text[] := ARRAY['companies', 'transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik',
    'import_batches', 'company_statements', 'equipment_plans', 'pengurangan_pcbs', 'penyimpanan_logbook', 'pelaporan_neraca',
    'ketentuan_teknis', 'bukti_dukung', 'inventory_stats_parts', 'summary_map_cells', 'summary_company_status', 'summary_brand_counts',
    'simpel_companies', 'company_feedback_log', 'field_definitions'];
BEGIN
  FOREACH t IN ARRAY readable LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Pemantau read on %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Pemantau read on %1$s" ON public.%1$I FOR SELECT TO authenticated USING ((SELECT public.is_pemantau()))', t);
  END LOOP;
END $$;

-- The uploaded workbooks and the statement letters: read only.
DROP POLICY IF EXISTS "Pemantau read on files" ON storage.objects;
CREATE POLICY "Pemantau read on files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('pcbs-files', 'surat-pernyataan') AND (SELECT public.is_pemantau()));

NOTIFY pgrst, 'reload schema';
