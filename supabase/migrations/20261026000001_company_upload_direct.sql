-- A company's Excel upload of forms 1.1-1.4 is saved straight away, without
-- the admin's acceptance first (revision of 2026-10-26). The import runs with
-- the company's own rights (its rows only, as before); the upload's row in
-- unggahan_perusahaan is then written already accepted, with its import
-- batch, for the upload history. Uploads still waiting from before keep
-- the admin's accept / refuse.

DROP POLICY IF EXISTS "Send unggahan_perusahaan" ON public.unggahan_perusahaan;
CREATE POLICY "Send unggahan_perusahaan" ON public.unggahan_perusahaan FOR INSERT TO authenticated
  WITH CHECK (
    (status = 'menunggu' OR (status = 'diterima' AND import_batch_id IS NOT NULL))
    AND ((SELECT public.is_admin()) OR company_id IN (SELECT public.my_company_ids()))
  );

NOTIFY pgrst, 'reload schema';
