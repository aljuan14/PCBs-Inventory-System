-- Form 2 "Pengurangan PCBs" (Data-inventaris/data-template): the maintenance
-- log of transformers still in use that meet Pasal 3a of Permen LHK 29/2020,
-- one row per maintenance (Pasal 13-14: retrofilling or another way to
-- reduce PCBs), with the test result before and after it.
--
-- item_id is the transformer in transformator_digunakan the entry was made
-- for (no foreign key: the row may be replaced by a later import, and the
-- log stays). Its columns 2-9 are copied in, so the entry still reads as the
-- template when the transformer is gone. When asked, the form also writes
-- the maintenance and the after-test into the transformer itself, so its
-- PCBs status follows (app/formulir, components/ReductionFormPanel.tsx).

CREATE TABLE IF NOT EXISTS public.pengurangan_pcbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid,
  -- 2-9: the transformer
  nama_merek text,
  nomor_serial text,
  tahun_pembuatan integer,
  negara_asal text,
  merek_minyak_dielektrik text,
  volume_minyak_l numeric,
  lokasi_peralatan text,
  koordinat_raw text,
  koordinat_lat double precision,
  koordinat_lng double precision,
  -- 10-11: test before the maintenance
  uji_sebelum_jenis text,
  uji_sebelum_ppm numeric CHECK (uji_sebelum_ppm IS NULL OR uji_sebelum_ppm >= 0),
  -- 12-16: the maintenance
  perawatan_jenis text NOT NULL,
  perawatan_waktu date NOT NULL,
  perawatan_merek_oli_pengganti text,
  perawatan_volume_l numeric CHECK (perawatan_volume_l IS NULL OR perawatan_volume_l >= 0),
  perawatan_penyedia_jasa text,
  -- 17-20: test after the maintenance
  uji_sesudah_penyedia_jasa text,
  uji_sesudah_jenis text,
  uji_sesudah_metode text,
  uji_sesudah_ppm numeric CHECK (uji_sesudah_ppm IS NULL OR uji_sesudah_ppm >= 0),
  -- 21-24
  berat_ton numeric,
  status_kondisi text,
  peralatan_tanggap_darurat text,
  pengelolaan_limbah_b3 text,
  bukti_dukung text,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pengurangan_pcbs_company ON public.pengurangan_pcbs (company_id, perawatan_waktu DESC);
CREATE INDEX IF NOT EXISTS idx_pengurangan_pcbs_item ON public.pengurangan_pcbs (item_id) WHERE item_id IS NOT NULL;

ALTER TABLE public.pengurangan_pcbs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on pengurangan_pcbs" ON public.pengurangan_pcbs;
CREATE POLICY "Authenticated full access on pengurangan_pcbs" ON public.pengurangan_pcbs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.pengurangan_pcbs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pengurangan_pcbs TO authenticated;

NOTIFY pgrst, 'reload schema';
