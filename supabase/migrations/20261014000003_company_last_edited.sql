-- companies.terakhir_diubah: when the company's data last changed, so the
-- company lists can show the one worked on most recently first. Kept by
-- triggers: any row added, changed or removed in a table of the company
-- (forms 1.x-5, uploads, evidence, roadmap, statement), and a change to the
-- company itself (name, address, ID SIMPEL). One update per statement, so an
-- upload of thousands of rows touches the company once.
--
-- Rows changed before this migration only left their created_at, so the
-- starting value is the newest created_at of the company and its rows.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS terakhir_diubah timestamptz;

UPDATE public.companies c SET terakhir_diubah = GREATEST(c.created_at,
  (SELECT max(created_at) FROM public.transformator_digunakan WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.transformator_tidak_digunakan WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.kapasitor WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.minyak_dielektrik WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.upload_sessions WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.company_statements WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.equipment_plans WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.pengurangan_pcbs WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.penyimpanan_logbook WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.pelaporan_neraca WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.ketentuan_teknis WHERE company_id = c.id),
  (SELECT max(created_at) FROM public.bukti_dukung WHERE company_id = c.id))
WHERE c.terakhir_diubah IS NULL;

ALTER TABLE public.companies ALTER COLUMN terakhir_diubah SET DEFAULT now();
UPDATE public.companies SET terakhir_diubah = created_at WHERE terakhir_diubah IS NULL;
ALTER TABLE public.companies ALTER COLUMN terakhir_diubah SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_terakhir_diubah ON public.companies (terakhir_diubah DESC);

-- A change to the company itself; the touch below sets the column on its own.
CREATE OR REPLACE FUNCTION public.companies_set_terakhir_diubah()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.terakhir_diubah IS NOT DISTINCT FROM OLD.terakhir_diubah THEN
    NEW.terakhir_diubah := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_terakhir_diubah ON public.companies;
CREATE TRIGGER companies_terakhir_diubah BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_set_terakhir_diubah();

-- Rows of a company: the companies of the statement's rows (the transition
-- table "changed"). Security definer: a company account may not update the
-- companies table itself.
CREATE OR REPLACE FUNCTION public.touch_company_terakhir_diubah()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies SET terakhir_diubah = now()
  WHERE id IN (SELECT DISTINCT company_id FROM changed WHERE company_id IS NOT NULL)
    AND terakhir_diubah < now();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_company_terakhir_diubah() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik', 'upload_sessions',
    'import_batches', 'company_statements', 'equipment_plans', 'pengurangan_pcbs', 'penyimpanan_logbook', 'pelaporan_neraca', 'ketentuan_teknis', 'bukti_dukung'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_touch_ins ON public.%1$I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_touch_upd ON public.%1$I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_touch_del ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_touch_ins AFTER INSERT ON public.%1$I REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.touch_company_terakhir_diubah()', t);
    EXECUTE format('CREATE TRIGGER %1$s_touch_upd AFTER UPDATE ON public.%1$I REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.touch_company_terakhir_diubah()', t);
    EXECUTE format('CREATE TRIGGER %1$s_touch_del AFTER DELETE ON public.%1$I REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.touch_company_terakhir_diubah()', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
