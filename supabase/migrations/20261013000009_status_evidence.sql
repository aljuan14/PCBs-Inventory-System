-- The PCBs status also reads the supporting evidence of forms 1.1-1.4
-- (bukti_dukung, 20261013000008): how many links the latest save of each form
-- has. lib/company-pcb-status.ts compares it with the template's items
-- (lib/evidence.ts) for the forms the company has data in. The function is
-- the one of 20261013000007 with this added.

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
    'aman', (SELECT count(*) FROM f WHERE ppm IS NOT NULL AND ppm <= 50),
    'belum_uji', (SELECT count(*) FROM f WHERE kebutuhan = 'uji'),
    'belum_uji_terjadwal', (SELECT count(*) FROM f WHERE kebutuhan = 'uji' AND rencana_tanggal >= current_date),
    'belum_uji_lewat', (SELECT count(*) FROM f WHERE kebutuhan = 'uji' AND rencana_tanggal < current_date),
    'tinggi', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan'),
    'tinggi_selesai', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NOT NULL),
    'tinggi_terjadwal', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NULL AND rencana_tanggal >= current_date),
    'tinggi_lewat', (SELECT count(*) FROM f WHERE kebutuhan = 'penanganan' AND rencana_selesai IS NULL AND rencana_tanggal < current_date),
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
