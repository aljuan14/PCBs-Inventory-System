-- The statement every company gives on the reporting form: whether it owns
-- transformers made before 1997 (reported unit by unit on forms 1.1 / 1.2),
-- from 1997 on (only their number and tonnage, kept but not processed), or
-- none at all. Each save adds a row; the newest one is the company's current
-- statement, the older ones its history.

CREATE TABLE IF NOT EXISTS public.company_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Both false: the company owns no transformer.
  punya_trafo_sebelum_1997 boolean NOT NULL,
  punya_trafo_1997_keatas boolean NOT NULL,
  jumlah_trafo_1997_keatas integer CHECK (jumlah_trafo_1997_keatas IS NULL OR jumlah_trafo_1997_keatas >= 0),
  tonase_trafo_1997_keatas_ton numeric CHECK (tonase_trafo_1997_keatas_ton IS NULL OR tonase_trafo_1997_keatas_ton >= 0),
  catatan text,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_statements_company ON public.company_statements (company_id, created_at DESC);

ALTER TABLE public.company_statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on company_statements" ON public.company_statements;
CREATE POLICY "Authenticated full access on company_statements" ON public.company_statements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.company_statements FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_statements TO authenticated;

NOTIFY pgrst, 'reload schema';
