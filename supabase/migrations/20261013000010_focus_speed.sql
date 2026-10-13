-- company_focus_transformers (20261013000001) looked for each transformer's
-- plan by scanning every plan of the company: with PLN-sized data (180,000
-- transformers in focus) and 5,000 plans, about 22 s, over the 15 s statement
-- timeout of the API, so the status card, the national status and the roadmap
-- failed. Now a transformer's own plans are picked once per transformer and
-- joined, and the company-wide plans are picked once per category and need:
-- under a second. Same columns and the same pick as before: its own plan
-- first, else a company-wide one; among them a finished one, then the earliest.

CREATE OR REPLACE FUNCTION public.company_focus_transformers(p_company_id uuid)
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
  -- The plan that counts per transformer and need, picked once.
  own AS (
    SELECT DISTINCT ON (p.item_id, p.jenis) p.item_id, p.jenis, p.id, p.rencana_tanggal, p.selesai_at
    FROM public.equipment_plans p
    WHERE p.company_id = p_company_id AND p.item_id IS NOT NULL
    ORDER BY p.item_id, p.jenis, (p.selesai_at IS NULL), p.rencana_tanggal
  ),
  -- The company-wide plan that counts per category and need, picked once too.
  wide AS (
    SELECT DISTINCT ON (k.kategori, p.jenis) k.kategori, p.jenis, p.id, p.rencana_tanggal, p.selesai_at
    FROM (VALUES ('transformator_digunakan'), ('transformator_tidak_digunakan')) k (kategori)
    JOIN public.equipment_plans p ON p.company_id = p_company_id AND p.item_id IS NULL AND (p.kategori IS NULL OR p.kategori = k.kategori)
    ORDER BY k.kategori, p.jenis, (p.selesai_at IS NULL), p.rencana_tanggal
  )
  SELECT n.kategori, n.id, n.nama_merek, n.nomor_serial, n.tahun_pembuatan, n.lokasi, n.unit, n.ppm, n.kebutuhan,
    COALESCE(o.id, w.id), o.id IS NOT NULL,
    CASE WHEN o.id IS NOT NULL THEN o.rencana_tanggal ELSE w.rencana_tanggal END,
    CASE WHEN o.id IS NOT NULL THEN o.selesai_at ELSE w.selesai_at END
  FROM needs n
  LEFT JOIN own o ON o.item_id = n.id AND o.jenis = n.kebutuhan
  LEFT JOIN wide w ON o.id IS NULL AND w.kategori = n.kategori AND w.jenis = n.kebutuhan;
$$;

NOTIFY pgrst, 'reload schema';
