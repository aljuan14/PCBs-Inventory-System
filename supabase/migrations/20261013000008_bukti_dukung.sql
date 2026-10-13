-- "Tabel Bukti Dukung" of forms 1.1-1.4: the company's links (Google Drive)
-- for each documentation item of a form (lib/evidence.ts), one row per save
-- with every link; the newest row of a form is the current one.

CREATE TABLE IF NOT EXISTS public.bukti_dukung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  formulir text NOT NULL CHECK (formulir IN ('transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik')),
  -- [{ label, tautan }], in the order of the template's items.
  tautan jsonb NOT NULL,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bukti_dukung_company ON public.bukti_dukung (company_id, formulir, created_at DESC);

ALTER TABLE public.bukti_dukung ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on bukti_dukung" ON public.bukti_dukung;
CREATE POLICY "Authenticated full access on bukti_dukung" ON public.bukti_dukung FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.bukti_dukung FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bukti_dukung TO authenticated;

NOTIFY pgrst, 'reload schema';
