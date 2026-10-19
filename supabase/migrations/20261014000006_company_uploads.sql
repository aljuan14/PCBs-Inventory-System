-- A company's own Excel upload of forms 1.1-1.4 (the official template),
-- waiting for the admin: nothing reaches the inventory until the admin
-- accepts it. The company keeps only the file and its choices here; on
-- acceptance the file is read again and imported like an admin upload
-- (app/api/unggahan), adding to the company's rows or replacing all of
-- them for that form ("ganti"). A refusal carries the admin's reason.
--
-- The file goes to pcbs-files under unggahan-perusahaan/<company id>/, the
-- one folder of that bucket a company may write to.

CREATE TABLE IF NOT EXISTS public.unggahan_perusahaan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kategori text NOT NULL CHECK (kategori IN ('transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik')),
  mode text NOT NULL CHECK (mode IN ('tambah', 'ganti')),
  nama_file text NOT NULL,
  file_path text NOT NULL,
  sheet_name text,
  -- What the check found when it was sent: rows, findings, a few rows to look at.
  ringkasan jsonb,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'diterima', 'ditolak', 'dibatalkan')),
  catatan text,
  import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  diperiksa_oleh uuid,
  diperiksa_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_unggahan_perusahaan_company ON public.unggahan_perusahaan (company_id, kategori, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unggahan_perusahaan_waiting ON public.unggahan_perusahaan (created_at) WHERE status = 'menunggu';

ALTER TABLE public.unggahan_perusahaan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unggahan_perusahaan FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unggahan_perusahaan TO authenticated;

DROP POLICY IF EXISTS "Read unggahan_perusahaan" ON public.unggahan_perusahaan;
DROP POLICY IF EXISTS "Send unggahan_perusahaan" ON public.unggahan_perusahaan;
DROP POLICY IF EXISTS "Cancel own unggahan_perusahaan" ON public.unggahan_perusahaan;
DROP POLICY IF EXISTS "Admin check unggahan_perusahaan" ON public.unggahan_perusahaan;
DROP POLICY IF EXISTS "Admin remove unggahan_perusahaan" ON public.unggahan_perusahaan;
CREATE POLICY "Read unggahan_perusahaan" ON public.unggahan_perusahaan FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR (SELECT public.is_pemantau()) OR company_id IN (SELECT public.my_company_ids()));
-- Sent waiting, by the company itself (or the admin on its behalf).
CREATE POLICY "Send unggahan_perusahaan" ON public.unggahan_perusahaan FOR INSERT TO authenticated
  WITH CHECK (status = 'menunggu' AND ((SELECT public.is_admin()) OR company_id IN (SELECT public.my_company_ids())));
-- The company may only withdraw an upload still waiting.
CREATE POLICY "Cancel own unggahan_perusahaan" ON public.unggahan_perusahaan FOR UPDATE TO authenticated
  USING (status = 'menunggu' AND company_id IN (SELECT public.my_company_ids()))
  WITH CHECK (status = 'dibatalkan' AND company_id IN (SELECT public.my_company_ids()));
CREATE POLICY "Admin check unggahan_perusahaan" ON public.unggahan_perusahaan FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admin remove unggahan_perusahaan" ON public.unggahan_perusahaan FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- The files: the company adds and reads its own folder; the admin has the whole bucket already.
DROP POLICY IF EXISTS "Own company add on pcbs-files uploads" ON storage.objects;
DROP POLICY IF EXISTS "Own company read on pcbs-files uploads" ON storage.objects;
CREATE POLICY "Own company add on pcbs-files uploads" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pcbs-files' AND (storage.foldername(name))[1] = 'unggahan-perusahaan'
    AND (storage.foldername(name))[2] IN (SELECT public.my_company_ids()::text));
CREATE POLICY "Own company read on pcbs-files uploads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pcbs-files' AND (storage.foldername(name))[1] = 'unggahan-perusahaan'
    AND (storage.foldername(name))[2] IN (SELECT public.my_company_ids()::text));

NOTIFY pgrst, 'reload schema';
