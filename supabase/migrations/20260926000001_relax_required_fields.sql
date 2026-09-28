-- Real-world reports (e.g. PLN) often lack serial numbers, power ratings or
-- brands. A record is kept as long as the equipment is identifiable; the
-- application enforces that (at least one identifying value per row) and
-- auto-numbers `no`, so the database only requires `no`.

ALTER TABLE public.transformator_digunakan DROP CONSTRAINT IF EXISTS transformator_digunakan_required_fields_check;
ALTER TABLE public.transformator_tidak_digunakan DROP CONSTRAINT IF EXISTS transformator_tidak_digunakan_required_fields_check;
ALTER TABLE public.kapasitor DROP CONSTRAINT IF EXISTS kapasitor_required_fields_check;
ALTER TABLE public.minyak_dielektrik DROP CONSTRAINT IF EXISTS minyak_dielektrik_required_fields_check;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = table_name || '_no_check') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (no IS NOT NULL) NOT VALID', table_name, table_name || '_no_check');
    END IF;
  END LOOP;
END $$;
