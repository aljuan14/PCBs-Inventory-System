/**
 * Tipe Data TypeScript untuk PCBs Inventory System
 */

export type JenisData = 'transformator' | 'kapasitor' | 'minyak_dielektrik';

export type ImportBatchStatus = 'pending_mapping' | 'mapped' | 'imported' | 'error';

export interface Company {
  id: string;
  nama_perusahaan: string;
  npwp_atau_id?: string | null;
  alamat?: string | null;
  sektor_industri?: string | null;
  nama_pic?: string | null;
  kontak_pic?: string | null;
  created_at?: string;
}

export interface ImportBatch {
  id: string;
  company_id: string;
  jenis_data: JenisData;
  nama_file_asli: string;
  file_storage_path?: string | null;
  status: ImportBatchStatus;
  uploaded_at?: string;
  // Join
  companies?: Company;
}

export interface FieldDefinition {
  id: string;
  jenis_data: JenisData;
  field_key: string;
  label: string;
  tipe_data: 'text' | 'number' | 'date';
  wajib: boolean;
  created_at?: string;
}

export interface Transformator {
  id: string;
  import_batch_id?: string | null;
  company_id: string;
  status?: string | null;
  nama_merek: string;
  nomor_serial: string;
  tahun_pembuatan?: number | null;
  negara_asal_produsen?: string | null;
  merek_minyak_dielektrik?: string | null;
  volume_minyak_dielektrik_l?: number | null;
  lokasi_peralatan?: string | null;
  titik_koordinat_raw?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  daya_kva?: number | null;
  ketersediaan_keran_buang?: string | null;
  perawatan_jenis?: string | null;
  perawatan_waktu?: string | null;
  perawatan_merek_oli_pengganti?: string | null;
  perawatan_volume_ditambahkan_l?: number | null;
  uji_penyedia_jasa?: string | null;
  uji_jenis?: string | null;
  uji_metode?: string | null;
  konsentrasi_pcb_ppm?: number | null;
  berat_ton?: number | null;
  peralatan_tanggap_darurat?: string | null;
  kondisi_di_dalam_alat?: string | null;
  status_kondisi?: string | null;
  waktu_terakhir_digunakan?: string | null;
  created_at?: string;
  companies?: Company;
}

export interface Kapasitor {
  id: string;
  import_batch_id?: string | null;
  company_id: string;
  nama_merek: string;
  nomor_serial?: string | null;
  tahun_pembuatan?: number | null;
  negara_asal_produsen?: string | null;
  merek_minyak_dielektrik?: string | null;
  lokasi?: string | null;
  titik_koordinat_raw?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status_alat?: string | null;
  created_at?: string;
  companies?: Company;
}

export interface MinyakDielektrik {
  id: string;
  import_batch_id?: string | null;
  company_id: string;
  merek: string;
  volume_l?: number | null;
  tahun_pembuatan?: number | null;
  negara_asal_produsen?: string | null;
  lokasi_penyimpanan?: string | null;
  titik_koordinat_raw?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  uji_penyedia_jasa?: string | null;
  uji_jenis?: string | null;
  uji_metode?: string | null;
  konsentrasi_pcb_ppm?: number | null;
  wadah_penyimpanan?: string | null;
  created_at?: string;
  companies?: Company;
}
