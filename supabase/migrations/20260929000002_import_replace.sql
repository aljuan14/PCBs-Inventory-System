-- Faster duplicate check and "replace an earlier upload".
--
-- * fingerprint (per row): hash of the values that identify a record, kept by
--   Postgres as a generated column and indexed per company. The import sends
--   the rows of a sheet to inventory_existing_rows() and gets back the ones
--   already stored, instead of downloading every row of the company. Unit and
--   sub-unit are part of it: two units may both have a "No 1" with the same
--   brand and year (UID Jaya restarts No per UP3).
-- * replace_import_batch(): a revised workbook replaces the rows of an earlier
--   import batch in one transaction; the old batch is kept as 'replaced'.

-- Every part is passed as text and normalised the same way, so the function
-- does not depend on column types (they differ between databases: a table
-- created by the prototype has `no` as NUMERIC) and gives the same result for
-- a stored value and the value sent by the import (400, 400.0 and '400').
-- Earlier drafts of this migration had typed parameters; drop them, and
-- anything built on them, in case a partial run left them behind.
DROP FUNCTION IF EXISTS public.inventory_fingerprint(text, text, text, integer, text, text, integer, numeric, numeric, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.inventory_fingerprint(text, text, text, numeric, text, text, numeric, numeric, numeric, text, text) CASCADE;

-- Numbers without trailing zeros, other text trimmed and lower-cased, NULL as ''.
CREATE OR REPLACE FUNCTION public.inventory_fingerprint_part(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN ''
    WHEN btrim(p_value) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim_scale(btrim(p_value)::numeric)::text
    ELSE lower(btrim(p_value))
  END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_fingerprint(
  p_unit text, p_sub_unit text, p_kode_alat text, p_no text, p_name text, p_serial text,
  p_tahun text, p_daya text, p_volume text, p_koordinat_raw text, p_location text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT md5(
    public.inventory_fingerprint_part(p_unit) || '|' ||
    public.inventory_fingerprint_part(p_sub_unit) || '|' ||
    public.inventory_fingerprint_part(p_kode_alat) || '|' ||
    public.inventory_fingerprint_part(p_no) || '|' ||
    public.inventory_fingerprint_part(p_name) || '|' ||
    public.inventory_fingerprint_part(p_serial) || '|' ||
    public.inventory_fingerprint_part(p_tahun) || '|' ||
    public.inventory_fingerprint_part(p_daya) || '|' ||
    public.inventory_fingerprint_part(p_volume) || '|' ||
    public.inventory_fingerprint_part(p_koordinat_raw) || '|' ||
    public.inventory_fingerprint_part(p_location)
  );
$$;

ALTER TABLE public.transformator_digunakan ADD COLUMN IF NOT EXISTS fingerprint text GENERATED ALWAYS AS (
  public.inventory_fingerprint(unit::text, sub_unit::text, kode_alat::text, no::text, nama_merek::text, nomor_serial::text,
    tahun_pembuatan::text, daya_kva::text, NULL, koordinat_raw::text, lokasi_peralatan::text)
) STORED;
ALTER TABLE public.transformator_tidak_digunakan ADD COLUMN IF NOT EXISTS fingerprint text GENERATED ALWAYS AS (
  public.inventory_fingerprint(unit::text, sub_unit::text, kode_alat::text, no::text, nama_merek::text, nomor_serial::text,
    tahun_pembuatan::text, daya_kva::text, NULL, koordinat_raw::text, lokasi_peralatan::text)
) STORED;
ALTER TABLE public.kapasitor ADD COLUMN IF NOT EXISTS fingerprint text GENERATED ALWAYS AS (
  public.inventory_fingerprint(unit::text, sub_unit::text, kode_alat::text, no::text, nama_merek::text, nomor_serial::text,
    tahun_pembuatan::text, NULL, NULL, koordinat_raw::text, lokasi_peralatan::text)
) STORED;
ALTER TABLE public.minyak_dielektrik ADD COLUMN IF NOT EXISTS fingerprint text GENERATED ALWAYS AS (
  public.inventory_fingerprint(unit::text, sub_unit::text, kode_alat::text, no::text, merek_minyak_dielektrik::text, NULL,
    tahun_pembuatan::text, NULL, volume_l::text, koordinat_raw::text, lokasi_penyimpanan::text)
) STORED;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id, fingerprint)', 'idx_' || table_name || '_fingerprint', table_name);
  END LOOP;
END $$;

-- Positions (0-based) of the rows in p_rows that are already stored for the
-- company. Each row is an object with the keys unit, sub_unit, kode_alat, no,
-- name, serial, tahun_pembuatan, daya_kva, volume_l, koordinat_raw, location.
-- Rows of p_exclude_batch do not count (the batch being replaced).
CREATE OR REPLACE FUNCTION public.inventory_existing_rows(p_category text, p_company_id uuid, p_rows jsonb, p_exclude_batch uuid DEFAULT NULL)
RETURNS SETOF integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_category NOT IN ('transformator_digunakan', 'transformator_tidak_digunakan', 'kapasitor', 'minyak_dielektrik') THEN
    RAISE EXCEPTION 'Kategori tidak dikenal: %', p_category;
  END IF;
  RETURN QUERY EXECUTE format($query$
    SELECT (r.idx - 1)::integer
    FROM jsonb_array_elements($2) WITH ORDINALITY AS r(v, idx)
    WHERE EXISTS (
      SELECT 1 FROM public.%I t
      WHERE t.company_id = $1
        AND t.fingerprint = public.inventory_fingerprint(
          r.v->>'unit', r.v->>'sub_unit', r.v->>'kode_alat', r.v->>'no', r.v->>'name', r.v->>'serial',
          r.v->>'tahun_pembuatan', r.v->>'daya_kva', r.v->>'volume_l', r.v->>'koordinat_raw', r.v->>'location')
        AND ($3 IS NULL OR t.import_batch_id IS DISTINCT FROM $3)
    )
  $query$, p_category) USING p_company_id, p_rows, p_exclude_batch;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_fingerprint_part(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_fingerprint(text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_existing_rows(text, uuid, jsonb, uuid) TO anon, authenticated;

-- A replaced batch stays in the upload history, pointing at its replacement.
ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS replaced_by uuid REFERENCES public.import_batches (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replaced_at timestamptz;

ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_status_check
  CHECK (status IN ('pending_mapping', 'mapped', 'imported', 'error', 'replaced'));

-- Deletes the rows of p_old and marks it replaced by p_new, in one
-- transaction. Returns the number of rows deleted.
CREATE OR REPLACE FUNCTION public.replace_import_batch(p_old uuid, p_new uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  old_batch public.import_batches%ROWTYPE;
  new_batch public.import_batches%ROWTYPE;
  deleted integer;
BEGIN
  SELECT * INTO old_batch FROM public.import_batches WHERE id = p_old FOR UPDATE;
  SELECT * INTO new_batch FROM public.import_batches WHERE id = p_new;
  IF old_batch.id IS NULL OR new_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch tidak ditemukan.';
  END IF;
  IF old_batch.status <> 'imported' THEN
    RAISE EXCEPTION 'Unggahan yang diganti belum diimpor atau sudah diganti.';
  END IF;
  IF old_batch.company_id <> new_batch.company_id OR old_batch.jenis_data <> new_batch.jenis_data THEN
    RAISE EXCEPTION 'Unggahan yang diganti harus dari perusahaan dan kategori yang sama.';
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE import_batch_id = $1', old_batch.jenis_data) USING p_old;
  GET DIAGNOSTICS deleted = ROW_COUNT;

  UPDATE public.import_batches SET status = 'replaced', replaced_by = p_new, replaced_at = now() WHERE id = p_old;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_import_batch(uuid, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
