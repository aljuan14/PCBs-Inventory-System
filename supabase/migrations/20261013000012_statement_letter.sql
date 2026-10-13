-- The company statement (20261012000002) follows the data and the
-- PILAR way of declaring (an uploaded, signed letter):
--
-- * A company with inventory data is not asked whether it owns equipment:
--   the data says so (lib/company-pcb-status.ts). A statement row is then
--   only the transformers from 1997 on that it does not list one by one.
-- * A company without data says it owns transformers, capacitors or
--   dielectric oil (data to follow), or that it owns none of them
--   (tidak_memiliki_peralatan), the latter with its own signed letter
--   (surat pernyataan, the company's own letterhead and wording) uploaded to
--   the private bucket surat-pernyataan under <company id>/.
-- * The admin of KLH verifies the letter: menunggu, diterima or ditolak with
--   a reason. A company account adds statements but cannot change one, nor
--   set its verification: a trigger clears what it sends for those columns.
--   The free-text note (catatan) stays for old rows; the form no longer asks.

ALTER TABLE public.company_statements
  ADD COLUMN IF NOT EXISTS tidak_memiliki_peralatan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surat_path text,
  ADD COLUMN IF NOT EXISTS surat_nama_file text,
  ADD COLUMN IF NOT EXISTS surat_tanggal date,
  ADD COLUMN IF NOT EXISTS verifikasi text CHECK (verifikasi IN ('menunggu', 'diterima', 'ditolak')),
  ADD COLUMN IF NOT EXISTS verifikasi_catatan text,
  ADD COLUMN IF NOT EXISTS diverifikasi_oleh uuid,
  ADD COLUMN IF NOT EXISTS diverifikasi_at timestamptz;

-- Until now "no transformer before or from 1997" was the only way to say "none".
UPDATE public.company_statements SET tidak_memiliki_peralatan = true
WHERE NOT punya_trafo_sebelum_1997 AND NOT punya_trafo_1997_keatas AND NOT tidak_memiliki_peralatan;

ALTER TABLE public.company_statements DROP CONSTRAINT IF EXISTS company_statements_none_owns_nothing;
ALTER TABLE public.company_statements ADD CONSTRAINT company_statements_none_owns_nothing
  CHECK (NOT tidak_memiliki_peralatan OR (NOT punya_trafo_sebelum_1997 AND NOT punya_trafo_1997_keatas));

-- Verification is the admin's: for anyone else a new letter waits, and nothing else is taken.
CREATE OR REPLACE FUNCTION public.company_statements_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() OR NEW.verifikasi IS NULL THEN
      NEW.verifikasi := CASE WHEN NEW.surat_path IS NOT NULL THEN 'menunggu' END;
      NEW.verifikasi_catatan := NULL;
      NEW.diverifikasi_oleh := NULL;
      NEW.diverifikasi_at := NULL;
    END IF;
  ELSIF NEW.verifikasi IS DISTINCT FROM OLD.verifikasi THEN
    NEW.diverifikasi_oleh := auth.uid();
    NEW.diverifikasi_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS company_statements_verification ON public.company_statements;
CREATE TRIGGER company_statements_verification BEFORE INSERT OR UPDATE ON public.company_statements
  FOR EACH ROW EXECUTE FUNCTION public.company_statements_verification();

-- A company reads and adds; only the admin changes or removes (the verification above).
DROP POLICY IF EXISTS "Own company on company_statements" ON public.company_statements;
DROP POLICY IF EXISTS "Own company read on company_statements" ON public.company_statements;
DROP POLICY IF EXISTS "Own company add on company_statements" ON public.company_statements;
DROP POLICY IF EXISTS "Admin update on company_statements" ON public.company_statements;
DROP POLICY IF EXISTS "Admin delete on company_statements" ON public.company_statements;
CREATE POLICY "Own company read on company_statements" ON public.company_statements FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR company_id IN (SELECT public.my_company_ids()));
CREATE POLICY "Own company add on company_statements" ON public.company_statements FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()) OR company_id IN (SELECT public.my_company_ids()));
CREATE POLICY "Admin update on company_statements" ON public.company_statements FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admin delete on company_statements" ON public.company_statements FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- The letters: PDF or a scan, at most 2 MB, under the company's own folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('surat-pernyataan', 'surat-pernyataan', false, 2097152, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Own company read on surat-pernyataan" ON storage.objects;
DROP POLICY IF EXISTS "Own company add on surat-pernyataan" ON storage.objects;
DROP POLICY IF EXISTS "Admin change on surat-pernyataan" ON storage.objects;
DROP POLICY IF EXISTS "Admin remove on surat-pernyataan" ON storage.objects;
CREATE POLICY "Own company read on surat-pernyataan" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'surat-pernyataan' AND ((SELECT public.is_admin()) OR (storage.foldername(name))[1] IN (SELECT public.my_company_ids()::text)));
CREATE POLICY "Own company add on surat-pernyataan" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'surat-pernyataan' AND ((SELECT public.is_admin()) OR (storage.foldername(name))[1] IN (SELECT public.my_company_ids()::text)));
CREATE POLICY "Admin change on surat-pernyataan" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'surat-pernyataan' AND (SELECT public.is_admin()));
CREATE POLICY "Admin remove on surat-pernyataan" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'surat-pernyataan' AND (SELECT public.is_admin()));

-- The web summary keeps the statement without who saved or verified it and without the letter's file.
CREATE OR REPLACE FUNCTION public.summary_build_status()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  TRUNCATE public.summary_company_status;
  INSERT INTO public.summary_company_status (company_id, status)
  SELECT company_id, jsonb_set(status, '{pernyataan}', CASE WHEN status->'pernyataan' = 'null'::jsonb THEN 'null'::jsonb
    ELSE (status->'pernyataan') - 'dibuat_oleh' - 'catatan' - 'surat_path' - 'surat_nama_file' - 'diverifikasi_oleh' - 'verifikasi_catatan' END)
  FROM public.pcb_status_all();
$$;

REVOKE ALL ON FUNCTION public.summary_build_status() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
