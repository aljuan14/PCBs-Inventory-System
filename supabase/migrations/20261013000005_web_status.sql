-- The PCBs status per company on the web (summary mode, 20261010000003):
-- the web has no inventory rows, so `npm run web:publish` builds the counts
-- of company_pcb_status (20261013000001) on the laptop with
-- summary_build_status() and copies this table to the cloud. The dashboard
-- reads it instead of calling pcb_status_all (lib/company-pcb-status.ts).
--
-- On Supabase Cloud, run the migrations from 20261012000001 on first: this
-- function calls pcb_status_all.

CREATE TABLE IF NOT EXISTS public.summary_company_status (
  company_id uuid PRIMARY KEY,
  status jsonb NOT NULL
);

ALTER TABLE public.summary_company_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read on summary_company_status" ON public.summary_company_status;
CREATE POLICY "Authenticated read on summary_company_status" ON public.summary_company_status FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.summary_company_status FROM anon;
GRANT SELECT ON public.summary_company_status TO authenticated;

CREATE OR REPLACE FUNCTION public.summary_build_status()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  TRUNCATE public.summary_company_status;
  -- The statement goes without who saved it and the free-text note.
  INSERT INTO public.summary_company_status (company_id, status)
  SELECT company_id, jsonb_set(status, '{pernyataan}', CASE WHEN status->'pernyataan' = 'null'::jsonb THEN 'null'::jsonb ELSE (status->'pernyataan') - 'dibuat_oleh' - 'catatan' END)
  FROM public.pcb_status_all();
$$;

REVOKE ALL ON FUNCTION public.summary_build_status() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
