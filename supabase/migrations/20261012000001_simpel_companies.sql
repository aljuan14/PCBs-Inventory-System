-- ID SIMPEL: every company in the inventory is linked to its record in
-- PILAR, and through it to its ID SIMPEL (idCompanySimpel), so the company
-- accounts of PILAR can later reach their own data.
--
-- * simpel_companies: the PILAR company list (export "_Company_….csv" in
--   Data-inventaris/id_simpel), loaded with `npm run simpel:load`. id is the
--   PILAR id; id_simpel is empty for some (often a unit whose parent,
--   id_perusahaan_induk, has one) and not unique (branches share it).
-- * companies.pilar_company_id / id_simpel: the record the admin picked on
--   the "ID SIMPEL" page. id_simpel is copied so the link stays readable
--   when the list is loaded again.

CREATE TABLE IF NOT EXISTS public.simpel_companies (
  id uuid PRIMARY KEY,
  id_simpel text,
  nama text NOT NULL,
  npwp text,
  nib text,
  alamat text,
  bidang_usaha text,
  id_perusahaan_induk uuid
);

CREATE INDEX IF NOT EXISTS idx_simpel_companies_id_simpel ON public.simpel_companies (id_simpel);

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS pilar_company_id uuid;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS id_simpel text;
CREATE INDEX IF NOT EXISTS idx_companies_id_simpel ON public.companies (id_simpel);

ALTER TABLE public.simpel_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on simpel_companies" ON public.simpel_companies;
CREATE POLICY "Authenticated full access on simpel_companies" ON public.simpel_companies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.simpel_companies FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simpel_companies TO authenticated;

NOTIFY pgrst, 'reload schema';
