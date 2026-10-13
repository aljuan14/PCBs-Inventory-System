-- Forms 3, 4.2 and 5 of the KLHK templates (Data-inventaris/data-template):
--
-- * penyimpanan_logbook: "Tabel Logbook Penyimpanan PCBs" (form 3), one row
--   per waste item stored, kode limbah A101d. Masa simpan and the tons still
--   in the TPS follow from the other columns (generated).
-- * pelaporan_neraca: "Tabel neraca Pengelolaan PCBs" (form 5): produced,
--   handled, stored and not yet handled, in tons.
-- * ketentuan_teknis: the yes / no checklists (form 3 storage, form 4.2
--   processing, which form 5 repeats), one row per save with every answer;
--   the newest row of a checklist is the company's current one. The
--   questions are in lib/checklists.ts.

CREATE TABLE IF NOT EXISTS public.penyimpanan_logbook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kode_limbah text NOT NULL DEFAULT 'A101d',
  nama_limbah text NOT NULL,
  sumber_limbah text,
  nomor_serial text,
  tanggal_dihasilkan date NOT NULL,
  tanggal_terakhir_dikelola date CHECK (tanggal_terakhir_dikelola IS NULL OR tanggal_terakhir_dikelola >= tanggal_dihasilkan),
  -- Days from produced to last handled; while nothing is handled the page counts to today.
  masa_simpan_hari integer GENERATED ALWAYS AS (tanggal_terakhir_dikelola - tanggal_dihasilkan) STORED,
  jumlah_dihasilkan_ton numeric NOT NULL CHECK (jumlah_dihasilkan_ton >= 0),
  jumlah_dikelola_ton numeric NOT NULL DEFAULT 0 CHECK (jumlah_dikelola_ton >= 0),
  jumlah_disimpan_ton numeric GENERATED ALWAYS AS (jumlah_dihasilkan_ton - jumlah_dikelola_ton) STORED,
  bukti_dukung text,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jumlah_dikelola_ton <= jumlah_dihasilkan_ton)
);

CREATE TABLE IF NOT EXISTS public.pelaporan_neraca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kode_limbah text NOT NULL DEFAULT 'A101d',
  nama_limbah text NOT NULL,
  jenis text,
  nomor_serial text,
  dihasilkan_ton numeric NOT NULL CHECK (dihasilkan_ton >= 0),
  dikelola_ton numeric NOT NULL DEFAULT 0 CHECK (dikelola_ton >= 0),
  disimpan_ton numeric NOT NULL DEFAULT 0 CHECK (disimpan_ton >= 0),
  belum_dikelola_ton numeric GENERATED ALWAYS AS (dihasilkan_ton - dikelola_ton - disimpan_ton) STORED,
  keterangan text,
  periode date,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (dikelola_ton + disimpan_ton <= dihasilkan_ton)
);

CREATE TABLE IF NOT EXISTS public.ketentuan_teknis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  checklist text NOT NULL CHECK (checklist IN ('3_penyimpanan', '4_2_pengolahan')),
  -- Storage permit (form 3 only).
  izin_status text,
  izin_nomor text,
  izin_masa_berlaku date,
  -- [{ jawaban: 'ya' | 'tidak' | null, nomor_surat, keterangan, bukti_dukung }], in the order of the questions.
  jawaban jsonb NOT NULL,
  persentase_penaatan numeric,
  dibuat_oleh uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_penyimpanan_logbook_company ON public.penyimpanan_logbook (company_id, tanggal_dihasilkan DESC);
CREATE INDEX IF NOT EXISTS idx_pelaporan_neraca_company ON public.pelaporan_neraca (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ketentuan_teknis_company ON public.ketentuan_teknis (company_id, checklist, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['penyimpanan_logbook', 'pelaporan_neraca', 'ketentuan_teknis'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access on %1$s" ON public.%1$I', table_name);
    EXECUTE format('CREATE POLICY "Authenticated full access on %1$s" ON public.%1$I FOR ALL TO authenticated USING (true) WITH CHECK (true)', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
