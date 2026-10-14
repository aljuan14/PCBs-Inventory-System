import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryCategory } from '@/lib/inventory';
import { buildCheckReport, insertBatchRows, transformRows } from '@/lib/import-transform';

/**
 * The test companies and their accounts, one per scenario a company goes
 * through, for the trial period (until the login comes from PILAR / SIMPEL).
 * Fake ID SIMPEL (UJI-…) never meet a real one; the names start with "ZZ Uji"
 * so they sort last. B, D and F start with data, the others empty.
 */
export type TestScenario = {
  idSimpel: string;
  email: string;
  name: string;
  purpose: string;
  seed: Partial<Record<InventoryCategory, Array<Record<string, string>>>>;
  /** Rows of the form 3 storage logbook, days before today for its dates. */
  storage?: Array<{ source: string; serial: string; daysAgo: number; tons: number }>;
};

const trafo = (serial: string, year: string, location: string, coordinate: string, extra: Record<string, string> = {}) => ({
  nama_merek: 'TRAFINDO', nomor_serial: serial, tahun_pembuatan: year, negara_asal: 'Indonesia', merek_minyak_dielektrik: 'Shell Diala B',
  volume_minyak_l: '450', lokasi_peralatan: location, koordinat_raw: coordinate, daya_kva: '630', ketersediaan_keran_buang: 'Ada', ...extra,
});
const tested = (ppm: string) => ({ uji_penyedia_jasa: 'Laboratorium Uji B3', uji_jenis: 'Uji lab', uji_metode: 'GC-ECD', uji_konsentrasi_ppm: ppm });

export const TEST_SCENARIOS: TestScenario[] = [
  {
    idSimpel: 'UJI-A', email: 'uji-a@pb3.com', name: 'ZZ Uji A - Perusahaan baru',
    purpose: 'Belum punya data sama sekali: mengisi trafo, minyak dielektrik, dan kapasitor dari awal.',
    seed: {},
  },
  {
    idSimpel: 'UJI-B', email: 'uji-b@pb3.com', name: 'ZZ Uji B - Sudah punya data',
    purpose: 'Sudah punya data: menambah peralatan baru dan mengedit data yang tersimpan.',
    seed: {
      transformator_digunakan: [
        trafo('UJI-B-001', '1985', 'Gardu Induk 1', '-6.2146, 106.8451', tested('1.5')),
        trafo('UJI-B-002', '1990', 'Gardu Induk 2', '-6.2150, 106.8460', tested('12')),
        trafo('UJI-B-003', '1993', 'Gedung Produksi', '-6.2139, 106.8444', tested('0.8')),
      ],
      kapasitor: [
        { nama_merek: 'NOKIAN', nomor_serial: 'UJI-B-K01', tahun_pembuatan: '1988', negara_asal: 'Finlandia', lokasi_peralatan: 'Panel Utama', koordinat_raw: '-6.2146, 106.8451', status_alat: 'Masih digunakan' },
      ],
      minyak_dielektrik: [
        { merek_minyak_dielektrik: 'Shell Diala B', volume_l: '200', tahun_pembuatan: '1995', lokasi_penyimpanan: 'Gudang B3', koordinat_raw: '-6.2152, 106.8448', status_minyak: 'Sudah digunakan', wadah_penyimpanan: 'Drum', ...tested('1.2') },
      ],
    },
  },
  {
    idSimpel: 'UJI-C', email: 'uji-c@pb3.com', name: 'ZZ Uji C - Tidak memiliki PCBs',
    purpose: 'Tidak memiliki peralatan: memilih "tidak memiliki" dan mengunggah surat pernyataan untuk diverifikasi admin.',
    seed: {},
  },
  {
    idSimpel: 'UJI-D', email: 'uji-d@pb3.com', name: 'ZZ Uji D - Status merah',
    purpose: 'Status merah (belum diuji, > 50 ppm, trafo tidak digunakan): mengisi roadmap dan formulir 2 Pengurangan sampai statusnya turun.',
    seed: {
      transformator_digunakan: [
        trafo('UJI-D-001', '1978', 'Gardu Timur', '-7.2575, 112.7521'),
        trafo('UJI-D-002', '1982', 'Gardu Barat', '-7.2581, 112.7498'),
        trafo('UJI-D-003', '1984', 'Gedung Kompresor', '-7.2569, 112.7530', tested('180')),
        trafo('UJI-D-004', '1991', 'Gedung Kantor', '-7.2590, 112.7512', tested('25')),
      ],
      transformator_tidak_digunakan: [
        trafo('UJI-D-005', '1976', 'Gudang Peralatan Bekas', '-7.2600, 112.7505', { ...tested('75'), status_kondisi: 'Baik', kondisi_di_dalam_alat: 'Minyak dielektrik penuh' }),
      ],
    },
  },
  {
    idSimpel: 'UJI-E', email: 'uji-e@pb3.com', name: 'ZZ Uji E - Unggah Excel',
    purpose: 'Mengisi formulir 2, 3, 4.2, dan 5 lewat unggah template Excel, termasuk berkas yang sengaja salah untuk melihat pesan pemeriksaannya.',
    seed: {},
  },
  {
    idSimpel: 'UJI-F', email: 'uji-f@pb3.com', name: 'ZZ Uji F - Penyimpan limbah PCBs',
    purpose: 'Menyimpan limbah PCBs tanpa izin TPS, satu sudah > 365 hari: mengisi formulir 3 Penyimpanan, 4.2 Pengolahan, dan 5 Pelaporan.',
    seed: {
      transformator_tidak_digunakan: [
        trafo('UJI-F-001', '1979', 'TPS Limbah B3', '-6.9175, 107.6191', { ...tested('320'), status_kondisi: 'Bocor', kondisi_di_dalam_alat: 'Minyak dielektrik penuh' }),
      ],
    },
    storage: [
      { source: 'Transformator utuh sudah tidak digunakan', serial: 'UJI-F-001', daysAgo: 400, tons: 1.4 },
      { source: 'Minyak dielektrik yang sudah dikeluarkan dari transformator', serial: '', daysAgo: 70, tons: 0.6 },
    ],
  },
];

/** Stores a scenario's rows as one batch per category, the way the reporting form does (app/api/formulir). */
export async function seedTestCompany(supabase: SupabaseClient, companyId: string, scenario: TestScenario) {
  for (const [category, entries] of Object.entries(scenario.seed) as Array<[InventoryCategory, Array<Record<string, string>>]>) {
    const headers = [...new Set(entries.flatMap((entry) => Object.keys(entry)))];
    const mappings = Object.fromEntries(headers.map((key) => [key, key]));
    const result = transformRows(category, { headers, allRows: entries, rowNumbers: entries.map((_, index) => index + 1) }, mappings, {}, { keepIssueRows: true });
    result.rows.forEach((row, index) => { row.item.no = index + 1; });
    const { data: batch, error } = await supabase.from('import_batches').insert({
      company_id: companyId, jenis_data: category, nama_file_asli: 'Data awal akun uji coba', status: 'mapped', profile: 'formulir',
      headers, total_rows: entries.length, data_rows: result.rows.length,
    }).select('id, company_id').single();
    if (error || !batch) throw new Error(`Gagal membuat data awal ${category}: ${error?.message}`);
    const failure = await insertBatchRows(supabase, category, result.rows, batch);
    if (failure) throw new Error(`Gagal menyimpan data awal ${category}: ${failure.message}`);
    await supabase.from('import_batches').update({ status: 'imported', laporan_pemeriksaan: buildCheckReport(result, result.rows.length, mappings) }).eq('id', batch.id);
  }
  if (scenario.storage?.length) {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { error } = await supabase.from('penyimpanan_logbook').insert(scenario.storage.map((row) => ({
      company_id: companyId, kode_limbah: 'A101d', nama_limbah: WASTE_NAME, sumber_limbah: row.source, nomor_serial: row.serial || null,
      tanggal_dihasilkan: daysAgo(row.daysAgo), jumlah_dihasilkan_ton: row.tons, jumlah_dikelola_ton: 0,
    })));
    if (error) throw new Error(`Gagal menyimpan logbook awal: ${error.message}`);
  }
}

// As the form offers it (lib/form-fields.ts, form 3).
const WASTE_NAME = 'Limbah yang mengandung senyawa POPs dan UPOPs antara lain polychlorinated biphenyls (PCBs), DDT, PCDD, PCDF';
