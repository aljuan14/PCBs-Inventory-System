-- The roadmap asks three things of the transformers made before 1997 (or
-- without a year):
--   in use, not tested      -> uji: when it will be tested
--   in use, above 50 ppm    -> penanganan: when it is retrofilled or replaced
--   no longer in use        -> pengelolaan: when it is managed (sent for
--                              processing), whatever its test result, tested
--                              or not
-- Until now a transformer no longer in use followed the rules of one in use.
-- Plans made earlier for such a transformer (uji / penanganan) stay as they
-- are but no longer count for it.
--
-- company_pcb_status: 'aman' is now the transformers in use at 50 ppm or
-- less; the ones no longer in use are counted as kelola (+ _selesai,
-- _terjadwal, _lewat), a pengelolaan plan being marked done by hand like a
-- penanganan.

ALTER TABLE public.equipment_plans DROP CONSTRAINT IF EXISTS equipment_plans_jenis_check;
ALTER TABLE public.equipment_plans ADD CONSTRAINT equipment_plans_jenis_check CHECK (jenis IN ('uji', 'penanganan', 'pengelolaan'));

CREATE OR REPLACE FUNCTION public.company_focus_transformers(p_company_id uuid)
RETURNS TABLE(kategori text, id uuid, nama_merek text, nomor_serial text, tahun_pembuatan integer, lokasi text, unit text, ppm numeric, kebutuhan text, rencana_id uuid, rencana_untuk_alat boolean, rencana_tanggal date, rencana_selesai date)
LANGUAGE sql
STABLE
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
    SELECT i.*, CASE
      WHEN i.kategori = 'transformator_tidak_digunakan' THEN 'pengelolaan'
      WHEN i.ppm IS NULL THEN 'uji'
      WHEN i.ppm > 50 THEN 'penanganan'
    END AS kebutuhan FROM items i
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

CREATE OR REPLACE FUNCTION public.company_pcb_status(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
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
  storage AS (
    SELECT
      COALESCE(sum(jumlah_disimpan_ton) FILTER (WHERE jumlah_disimpan_ton > 0), 0) AS ton,
      count(*) FILTER (WHERE jumlah_disimpan_ton > 0 AND current_date - tanggal_dihasilkan > 365) AS lewat_365
    FROM public.penyimpanan_logbook WHERE company_id = p_company_id
  ),
  checklists AS (
    SELECT DISTINCT ON (k.checklist) k.checklist, k.izin_status, k.izin_masa_berlaku, k.persentase_penaatan,
      (SELECT count(*) FROM jsonb_array_elements(k.jawaban) a WHERE a->>'jawaban' = 'tidak') AS tidak
    FROM public.ketentuan_teknis k WHERE k.company_id = p_company_id
    ORDER BY k.checklist, k.created_at DESC
  ),
  evidence AS (
    -- Links filled in on the latest save of each form's supporting evidence.
    SELECT jsonb_object_agg(formulir, filled) AS filled
    FROM (
      SELECT DISTINCT ON (b.formulir) b.formulir,
        (SELECT count(*) FROM jsonb_array_elements(b.tautan) t WHERE coalesce(t->>'tautan', '') <> '') AS filled
      FROM public.bukti_dukung b WHERE b.company_id = p_company_id
      ORDER BY b.formulir, b.created_at DESC
    ) latest
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
    'aman', (SELECT count(*) FROM f WHERE kebutuhan IS NULL),
    'belum_uji', (SELECT count(*) FROM f WHERE kebutuhan = 'uji'),
    'belum_uji_terjadwal', (SELECT count(*) FROM f WHERE kebutuhan = 'uji' AND rencana_tanggal >= current_date),
    'belum_uji_lewat', (SELECT count(*) FROM f WHERE kebutuhan = 'uji' AND rencana_tanggal < current_date),
    'tinggi', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan'),
    'tinggi_selesai', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NOT NULL),
    'tinggi_terjadwal', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NULL AND rencana_tanggal >= current_date),
    'tinggi_lewat', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NULL AND rencana_tanggal < current_date),
    'kelola', (SELECT count(*) FROM f WHERE kebutuhan = 'pengelolaan'),
    'kelola_selesai', (SELECT count(*) FROM f WHERE kebutuhan = 'pengelolaan' AND rencana_selesai IS NOT NULL),
    'kelola_terjadwal', (SELECT count(*) FROM f WHERE kebutuhan = 'pengelolaan' AND rencana_selesai IS NULL AND rencana_tanggal >= current_date),
    'kelola_lewat', (SELECT count(*) FROM f WHERE kebutuhan = 'pengelolaan' AND rencana_selesai IS NULL AND rencana_tanggal < current_date),
    'rencana_berikut', (SELECT min(rencana_tanggal) FROM f WHERE rencana_selesai IS NULL AND rencana_tanggal >= current_date),
    'pernyataan', (SELECT row FROM statement),
    -- Forms 3-5 (20261013000007).
    'simpan_ton', (SELECT ton FROM storage),
    'simpan_lewat_365', (SELECT lewat_365 FROM storage),
    'izin_tps_status', (SELECT izin_status FROM checklists WHERE checklist = '3_penyimpanan'),
    'izin_tps_berlaku', (SELECT izin_masa_berlaku FROM checklists WHERE checklist = '3_penyimpanan'),
    'penyimpanan_diisi', EXISTS (SELECT 1 FROM checklists WHERE checklist = '3_penyimpanan'),
    'penyimpanan_tidak', (SELECT tidak FROM checklists WHERE checklist = '3_penyimpanan'),
    'penyimpanan_penaatan', (SELECT persentase_penaatan FROM checklists WHERE checklist = '3_penyimpanan'),
    'pengolahan_tidak', (SELECT tidak FROM checklists WHERE checklist = '4_2_pengolahan'),
    'pengolahan_penaatan', (SELECT persentase_penaatan FROM checklists WHERE checklist = '4_2_pengolahan'),
    -- Forms 1.1-1.4 (20261013000009): links per form, absent when never saved.
    'bukti_dukung', COALESCE((SELECT filled FROM evidence), '{}'::jsonb),
    'belum_dikelola_ton', (SELECT COALESCE(sum(belum_dikelola_ton) FILTER (WHERE belum_dikelola_ton > 0), 0) FROM public.pelaporan_neraca WHERE company_id = p_company_id)
  )
  FROM totals t;
$$;

NOTIFY pgrst, 'reload schema';
