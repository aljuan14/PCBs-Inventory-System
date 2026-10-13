-- Roadmap and PCBs status per company, for the transformers in focus: made
-- before 1997 or of unknown year (the statement and forms 1.1/1.2 use the
-- same bound, TRAFO_FOCUS_YEAR in lib/form-fields.ts).
--
-- equipment_plans: a planned date for what a transformer still needs.
-- * jenis 'uji': a PCBs test, for one not tested yet. Done as soon as the
--   transformer has a test result (uji_konsentrasi_ppm), so it needs no
--   marking.
-- * jenis 'penanganan': replacement, retrofilling or processing, for one with
--   more than 50 ppm. Done when marked (selesai_at).
-- item_id names one transformer; empty, the plan covers every transformer of
-- the company (in `kategori`, or both categories when that is empty too)
-- still needing it, e.g. "test all the rest by June 2027". The rows have no
-- foreign key: they live in two tables.
--
-- company_pcb_status(company): the counts the status card and its colour
-- are built from (lib/company-pcb-status.ts).

CREATE TABLE IF NOT EXISTS public.equipment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kategori text CHECK (kategori IS NULL OR kategori IN ('transformator_digunakan', 'transformator_tidak_digunakan')),
  item_id uuid,
  jenis text NOT NULL CHECK (jenis IN ('uji', 'penanganan')),
  rencana_tanggal date NOT NULL,
  selesai_at date,
  catatan text,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (item_id IS NULL OR kategori IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_equipment_plans_company ON public.equipment_plans (company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_plans_item ON public.equipment_plans (item_id) WHERE item_id IS NOT NULL;

ALTER TABLE public.equipment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on equipment_plans" ON public.equipment_plans;
CREATE POLICY "Authenticated full access on equipment_plans" ON public.equipment_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.equipment_plans FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_plans TO authenticated;

-- Each focus transformer with what it needs ('uji', 'penanganan' or nothing)
-- and the plan that counts for it: its own plan first, else a company-wide one.
DROP FUNCTION IF EXISTS public.company_focus_transformers(uuid);
CREATE FUNCTION public.company_focus_transformers(p_company_id uuid)
RETURNS TABLE (
  kategori text, id uuid, nama_merek text, nomor_serial text, tahun_pembuatan integer, lokasi text, unit text, ppm numeric,
  kebutuhan text, rencana_id uuid, rencana_untuk_alat boolean, rencana_tanggal date, rencana_selesai date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH items AS (
    SELECT 'transformator_digunakan'::text AS kategori, t.id, t.nama_merek, t.nomor_serial, t.tahun_pembuatan, t.lokasi_peralatan AS lokasi, t.unit, t.uji_konsentrasi_ppm AS ppm
    FROM public.transformator_digunakan t WHERE t.company_id = p_company_id AND (t.tahun_pembuatan IS NULL OR t.tahun_pembuatan < 1997)
    UNION ALL
    SELECT 'transformator_tidak_digunakan', t.id, t.nama_merek, t.nomor_serial, t.tahun_pembuatan, t.lokasi_peralatan, t.unit, t.uji_konsentrasi_ppm
    FROM public.transformator_tidak_digunakan t WHERE t.company_id = p_company_id AND (t.tahun_pembuatan IS NULL OR t.tahun_pembuatan < 1997)
  ),
  needs AS (
    SELECT i.*, CASE WHEN i.ppm IS NULL THEN 'uji' WHEN i.ppm > 50 THEN 'penanganan' END AS kebutuhan FROM items i
  ),
  plans AS (
    SELECT * FROM public.equipment_plans p WHERE p.company_id = p_company_id
  )
  SELECT n.kategori, n.id, n.nama_merek, n.nomor_serial, n.tahun_pembuatan, n.lokasi, n.unit, n.ppm, n.kebutuhan,
    pick.id, pick.item_id IS NOT NULL, pick.rencana_tanggal, pick.selesai_at
  FROM needs n
  LEFT JOIN LATERAL (
    SELECT p.id, p.item_id, p.rencana_tanggal, p.selesai_at
    FROM plans p
    WHERE n.kebutuhan IS NOT NULL
      AND p.jenis = n.kebutuhan
      AND (p.item_id = n.id OR (p.item_id IS NULL AND (p.kategori IS NULL OR p.kategori = n.kategori)))
    -- A plan for this transformer wins over a company-wide one; among those, a finished one, then the earliest.
    ORDER BY (p.item_id IS NULL), (p.selesai_at IS NULL), p.rencana_tanggal
    LIMIT 1
  ) pick ON true;
$$;

CREATE OR REPLACE FUNCTION public.company_pcb_status(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH f AS (SELECT * FROM public.company_focus_transformers(p_company_id)),
  totals AS (
    SELECT
      (SELECT count(*) FROM public.transformator_digunakan WHERE company_id = p_company_id) AS trafo_digunakan,
      (SELECT count(*) FROM public.transformator_tidak_digunakan WHERE company_id = p_company_id) AS trafo_tidak_digunakan,
      (SELECT count(*) FROM public.kapasitor WHERE company_id = p_company_id) AS kapasitor,
      (SELECT count(*) FROM public.minyak_dielektrik WHERE company_id = p_company_id) AS minyak
  ),
  statement AS (
    SELECT to_jsonb(s) AS row FROM public.company_statements s WHERE s.company_id = p_company_id ORDER BY s.created_at DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'trafo_digunakan', t.trafo_digunakan,
    'trafo_tidak_digunakan', t.trafo_tidak_digunakan,
    'kapasitor', t.kapasitor,
    'minyak', t.minyak,
    'fokus', (SELECT count(*) FROM f),
    'fokus_tahun_kosong', (SELECT count(*) FROM f WHERE tahun_pembuatan IS NULL),
    'aman', (SELECT count(*) FROM f WHERE ppm IS NOT NULL AND ppm <= 50),
    'belum_uji', (SELECT count(*) FROM f WHERE kebutuhan = 'uji'),
    'belum_uji_terjadwal', (SELECT count(*) FROM f WHERE kebutuhan = 'uji' AND rencana_tanggal >= current_date),
    'belum_uji_lewat', (SELECT count(*) FROM f WHERE kebutuhan = 'uji' AND rencana_tanggal < current_date),
    'tinggi', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan'),
    'tinggi_selesai', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NOT NULL),
    'tinggi_terjadwal', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NULL AND rencana_tanggal >= current_date),
    'tinggi_lewat', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NULL AND rencana_tanggal < current_date),
    'rencana_berikut', (SELECT min(rencana_tanggal) FROM f WHERE rencana_selesai IS NULL AND rencana_tanggal >= current_date),
    'pernyataan', (SELECT row FROM statement)
  )
  FROM totals t;
$$;

REVOKE ALL ON FUNCTION public.company_focus_transformers(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.company_pcb_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_focus_transformers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_pcb_status(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
