import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

// ─── Fallback kamus field baku (dipakai jika tabel field_definitions kosong) ───
const FIELD_DEFS_FALLBACK: Record<string, Array<{ field_key: string; label: string; tipe_data: string; wajib: boolean; tips: string | null }>> = {
  transformator: [
    { field_key: 'id_peralatan',          label: 'ID Peralatan',              tipe_data: 'text',    wajib: false, tips: 'Nomor identifikasi unik peralatan' },
    { field_key: 'nama_peralatan',        label: 'Nama Peralatan',            tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'nama_merek',            label: 'Merek / Pabrikan',          tipe_data: 'text',    wajib: false, tips: 'Contoh: ABB, Siemens, Trafo Solo' },
    { field_key: 'nomor_serial',          label: 'Nomor Serial',              tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'tahun_pembuatan',       label: 'Tahun Pembuatan',           tipe_data: 'integer', wajib: false, tips: '4 digit angka tahun' },
    { field_key: 'daya_kva',             label: 'Daya (kVA)',                tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'tegangan_primer_kv',   label: 'Tegangan Primer (kV)',      tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'tegangan_sekunder_kv', label: 'Tegangan Sekunder (kV)',    tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'jenis_minyak',         label: 'Jenis Minyak Isolasi',      tipe_data: 'text',    wajib: false, tips: 'Contoh: Askarel, Mineral, Bio' },
    { field_key: 'volume_minyak_liter',  label: 'Volume Minyak (Liter)',     tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'konsentrasi_pcb_ppm',  label: 'Konsentrasi PCB (ppm)',     tipe_data: 'numeric', wajib: false, tips: 'Nilai mg/kg atau ppm hasil uji lab' },
    { field_key: 'tanggal_uji',          label: 'Tanggal Uji Lab',           tipe_data: 'date',    wajib: false, tips: 'Format: YYYY-MM-DD' },
    { field_key: 'status_pcb',           label: 'Status PCB',                tipe_data: 'text',    wajib: false, tips: 'Contoh: Terkontaminasi, Bebas PCB, Belum Uji' },
    { field_key: 'lokasi_provinsi',      label: 'Provinsi',                  tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_kabkota',       label: 'Kabupaten / Kota',          tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_detail',        label: 'Lokasi Detail (Alamat)',     tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'titik_koordinat_raw',  label: 'Koordinat (DMS/Desimal)',   tipe_data: 'text',    wajib: false, tips: 'Akan di-parse otomatis ke format desimal' },
    { field_key: 'latitude',             label: 'Latitude (Desimal)',         tipe_data: 'numeric', wajib: false, tips: 'Isi jika sudah dalam format desimal' },
    { field_key: 'longitude',            label: 'Longitude (Desimal)',        tipe_data: 'numeric', wajib: false, tips: 'Isi jika sudah dalam format desimal' },
    { field_key: 'kondisi_fisik',        label: 'Kondisi Fisik',             tipe_data: 'text',    wajib: false, tips: 'Contoh: Baik, Rusak Ringan, Rusak Berat' },
    { field_key: 'keterangan',           label: 'Keterangan',                tipe_data: 'text',    wajib: false, tips: 'Catatan tambahan' },
  ],
  kapasitor: [
    { field_key: 'id_peralatan',         label: 'ID Peralatan',              tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'nama_peralatan',       label: 'Nama Peralatan',            tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'nama_merek',           label: 'Merek / Pabrikan',          tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'nomor_serial',         label: 'Nomor Serial',              tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'tahun_pembuatan',      label: 'Tahun Pembuatan',           tipe_data: 'integer', wajib: false, tips: null },
    { field_key: 'kapasitas_kvar',       label: 'Kapasitas (kVAR)',          tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'tegangan_kerja_kv',   label: 'Tegangan Kerja (kV)',       tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'jenis_dielektrik',     label: 'Jenis Dielektrik',          tipe_data: 'text',    wajib: false, tips: 'Contoh: PCB, Minyak Mineral, Film Kering' },
    { field_key: 'konsentrasi_pcb_ppm', label: 'Konsentrasi PCB (ppm)',     tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'tanggal_uji',         label: 'Tanggal Uji Lab',           tipe_data: 'date',    wajib: false, tips: null },
    { field_key: 'status_pcb',          label: 'Status PCB',                tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_provinsi',     label: 'Provinsi',                  tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_kabkota',      label: 'Kabupaten / Kota',          tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_detail',       label: 'Lokasi Detail (Alamat)',     tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'titik_koordinat_raw', label: 'Koordinat (DMS/Desimal)',   tipe_data: 'text',    wajib: false, tips: 'Akan di-parse otomatis ke format desimal' },
    { field_key: 'latitude',            label: 'Latitude (Desimal)',         tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'longitude',           label: 'Longitude (Desimal)',        tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'kondisi_fisik',       label: 'Kondisi Fisik',             tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'keterangan',          label: 'Keterangan',                tipe_data: 'text',    wajib: false, tips: null },
  ],
  minyak_dielektrik: [
    { field_key: 'id_sampel',           label: 'ID Sampel',                 tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'id_peralatan_induk',  label: 'ID Peralatan Induk',        tipe_data: 'text',    wajib: false, tips: 'ID transformator/kapasitor sumber minyak' },
    { field_key: 'nama_peralatan',      label: 'Nama Peralatan',            tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'jenis_minyak',        label: 'Jenis Minyak',              tipe_data: 'text',    wajib: false, tips: 'Askarel, Mineral, dll' },
    { field_key: 'volume_liter',        label: 'Volume (Liter)',            tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'konsentrasi_pcb_ppm', label: 'Konsentrasi PCB (ppm)',     tipe_data: 'numeric', wajib: false, tips: 'Nilai mg/kg atau ppm' },
    { field_key: 'metode_uji',          label: 'Metode Uji',                tipe_data: 'text',    wajib: false, tips: 'Contoh: GC-MS, HRGC/HRMS' },
    { field_key: 'laboratorium',        label: 'Laboratorium Penguji',      tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'tanggal_uji',         label: 'Tanggal Uji',               tipe_data: 'date',    wajib: false, tips: null },
    { field_key: 'status_pcb',          label: 'Status PCB',                tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_provinsi',     label: 'Provinsi',                  tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_kabkota',      label: 'Kabupaten / Kota',          tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'lokasi_detail',       label: 'Lokasi Detail',             tipe_data: 'text',    wajib: false, tips: null },
    { field_key: 'titik_koordinat_raw', label: 'Koordinat (DMS/Desimal)',   tipe_data: 'text',    wajib: false, tips: 'Akan di-parse otomatis ke format desimal' },
    { field_key: 'latitude',            label: 'Latitude (Desimal)',         tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'longitude',           label: 'Longitude (Desimal)',        tipe_data: 'numeric', wajib: false, tips: null },
    { field_key: 'keterangan',          label: 'Keterangan',                tipe_data: 'text',    wajib: false, tips: null },
  ],
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const supabase = await createClient();

    // 1. Ambil data batch dari database
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .select('*, companies(*)')
      .eq('id', batchId)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Data batch tidak ditemukan di database.' }, { status: 404 });
    }

    // 2. Ambil field_definitions sesuai jenis_data
    const { data: fieldDefs } = await supabase
      .from('field_definitions')
      .select('*')
      .eq('jenis_data', batch.jenis_data)
      .order('wajib', { ascending: false });

    // Gunakan data dari DB jika ada, atau fallback ke kamus hardcoded
    const resolvedFieldDefs =
      fieldDefs && fieldDefs.length > 0
        ? fieldDefs
        : (FIELD_DEFS_FALLBACK[batch.jenis_data as keyof typeof FIELD_DEFS_FALLBACK] ?? []);

    // 3. Ambil data headers dan sample row dari file meta di tmp_uploads
    const metaPath = path.join(process.cwd(), 'tmp_uploads', `${batchId}.json`);
    let headers: string[] = [];
    let sampleRow: Record<string, any> = {};

    if (fs.existsSync(metaPath)) {
      try {
        const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        headers = metaContent.headers || [];
        if (metaContent.previewRows && metaContent.previewRows.length > 0) {
          sampleRow = metaContent.previewRows[0];
        }
      } catch (err) {
        console.error('Error reading meta json:', err);
      }
    }

    return NextResponse.json({
      batch,
      fieldDefinitions: resolvedFieldDefs,
      headers,
      sampleRow,
    });
  } catch (err: any) {
    console.error('Mapping get error:', err);
    return NextResponse.json({ error: err.message || 'Gagal memuat konfigurasi mapping.' }, { status: 500 });
  }
}
