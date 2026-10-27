-- A roadmap plan (equipment_plans, 20261013000001) names its transformer by
-- item_id alone, with no foreign key, as it points into two tables. Deleting
-- a transformer left its plans behind: on the form's "Data tersimpan", in the
-- admin table, and for every row an Excel upload "Mengganti semua" replaces.
-- They now go with it, whichever way it is deleted.

CREATE OR REPLACE FUNCTION public.delete_item_plans()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.equipment_plans p USING gone g WHERE p.item_id = g.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_item_plans() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_delete_item_plans ON public.transformator_digunakan;
CREATE TRIGGER trg_delete_item_plans
  AFTER DELETE ON public.transformator_digunakan
  REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT EXECUTE FUNCTION public.delete_item_plans();

DROP TRIGGER IF EXISTS trg_delete_item_plans ON public.transformator_tidak_digunakan;
CREATE TRIGGER trg_delete_item_plans
  AFTER DELETE ON public.transformator_tidak_digunakan
  REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT EXECUTE FUNCTION public.delete_item_plans();

-- The plans already left behind.
DELETE FROM public.equipment_plans p
WHERE p.item_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.transformator_digunakan t WHERE t.id = p.item_id)
  AND NOT EXISTS (SELECT 1 FROM public.transformator_tidak_digunakan t WHERE t.id = p.item_id);
