-- Login is now required. Every "Public ..." policy (USING (true)) is replaced
-- by the same policy restricted to the `authenticated` role, and `anon` loses
-- its grants on the view and RPC functions. Scripts that run without a login
-- (scripts/import-folder.ts etc.) must use SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS.
--
-- Accounts are created by hand in Supabase (Authentication -> Users), and
-- public sign-up is switched off there.

-- 1. Tables in public: recreate each "Public ..." policy for authenticated only.
DO $$
DECLARE
    pol record;
    new_name text;
BEGIN
    FOR pol IN
        SELECT tablename, policyname, cmd
        FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'Public %'
    LOOP
        new_name := regexp_replace(pol.policyname, '^Public', 'Authenticated');
        EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', new_name, pol.tablename);
        IF pol.cmd = 'SELECT' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', new_name, pol.tablename);
        ELSE
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', new_name, pol.tablename);
        END IF;
    END LOOP;
END $$;

-- 2. Storage bucket for uploaded workbooks.
DROP POLICY IF EXISTS "Public full access on pcbs-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated full access on pcbs-files" ON storage.objects;
CREATE POLICY "Authenticated full access on pcbs-files" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'pcbs-files') WITH CHECK (bucket_id = 'pcbs-files');

-- 3. Table/view grants: anon keeps nothing in public.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 4. Functions: Postgres grants EXECUTE to PUBLIC by default, so revoke that
-- as well as the explicit anon grants, then keep authenticated + service_role.
DO $$
DECLARE
    fn record;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn.signature);
    END LOOP;
END $$;

-- 5. Objects created by later migrations: do not hand them to anon automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
