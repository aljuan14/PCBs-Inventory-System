-- Roles: the admin of KLH sees everything; a company account sees only the
-- companies with its ID SIMPEL (its units included). Until now every logged-in
-- account could read and write every row.
--
-- * user_access: one row per account: peran 'admin', or 'perusahaan' with its
--   id_simpel. Every account that exists now becomes admin. An account without
--   a row sees nothing. No foreign key to auth.users: restoring the data repo
--   truncates auth.users, which would cascade and lock every admin out.
--   Accounts are made with `npm run offline:user` (admin by default); company
--   accounts will come from the PILAR / SIMPEL login (page /masuk, to come).
-- * is_admin(), my_company_ids(), my_access(): SECURITY DEFINER, so the
--   policies can ask without the policies of user_access and companies
--   applying to themselves. Policies call them as (SELECT …): evaluated once
--   per statement, not per row (PLN-sized tables).
-- * Company tables: the company's own rows, read and write. Inventory rows,
--   import batches, statement, plans, forms 2-5, evidence; the stats parts and
--   the web summary per company read only. Admin only: the PILAR list, upload
--   sessions, feedback log, legacy tables, national brand counts, and the
--   workbooks in Storage.

CREATE TABLE IF NOT EXISTS public.user_access (
  user_id uuid PRIMARY KEY,
  peran text NOT NULL CHECK (peran IN ('admin', 'perusahaan')),
  id_simpel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((peran = 'perusahaan') = (id_simpel IS NOT NULL))
);

INSERT INTO public.user_access (user_id, peran)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_access WHERE user_id = auth.uid() AND peran = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.my_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.companies c
  JOIN public.user_access a ON a.id_simpel = c.id_simpel
  WHERE a.user_id = auth.uid() AND a.peran = 'perusahaan';
$$;

-- The account's role for the app (proxy.ts): {"peran": …, "id_simpel": …}, or null without one.
CREATE OR REPLACE FUNCTION public.my_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('peran', peran, 'id_simpel', id_simpel) FROM public.user_access WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_company_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated;

DO $$
DECLARE
  t text;
  pol record;
  own text := '(SELECT public.is_admin()) OR company_id IN (SELECT public.my_company_ids())';
  admin text := '(SELECT public.is_admin())';
  company_rw text[] := ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik', 'import_batches',
    'company_statements', 'equipment_plans', 'pengurangan_pcbs', 'penyimpanan_logbook', 'pelaporan_neraca', 'ketentuan_teknis', 'bukti_dukung'];
  company_read text[] := ARRAY['inventory_stats_parts', 'summary_map_cells', 'summary_company_status'];
  admin_only text[] := ARRAY['simpel_companies', 'upload_sessions', 'company_feedback_log', 'field_definitions',
    'transformator_legacy', 'kapasitor_legacy', 'minyak_dielektrik_legacy', 'summary_brand_counts'];
BEGIN
  -- Start from no policy on every table touched here.
  FOR pol IN
    SELECT p.polname, c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY (company_rw || company_read || admin_only || ARRAY['companies', 'user_access'])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.polname, pol.relname);
  END LOOP;

  FOREACH t IN ARRAY company_rw LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Own company on %1$s" ON public.%1$I FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)', t, own);
  END LOOP;
  FOREACH t IN ARRAY company_read LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Own company read on %1$s" ON public.%1$I FOR SELECT TO authenticated USING (%2$s)', t, own);
  END LOOP;
  FOREACH t IN ARRAY admin_only LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Admin on %1$s" ON public.%1$I FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)', t, admin);
  END LOOP;
END $$;

-- Companies: a company account reads its own; only the admin adds, changes or removes.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own company read on companies" ON public.companies FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR id IN (SELECT public.my_company_ids()));
CREATE POLICY "Admin write on companies" ON public.companies FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admin update on companies" ON public.companies FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admin delete on companies" ON public.companies FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- Roles: everyone reads their own row; the admin manages them all.
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own row on user_access" ON public.user_access FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admin on user_access" ON public.user_access FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
REVOKE ALL ON public.user_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_access TO authenticated;

-- Uploaded workbooks: admin only.
DROP POLICY IF EXISTS "Authenticated full access on pcbs-files" ON storage.objects;
DROP POLICY IF EXISTS "Admin access on pcbs-files" ON storage.objects;
CREATE POLICY "Admin access on pcbs-files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'pcbs-files' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'pcbs-files' AND (SELECT public.is_admin()));

NOTIFY pgrst, 'reload schema';
