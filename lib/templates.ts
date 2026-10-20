import type { OtherForm } from '@/components/FormTabs';
import type { InventoryCategory } from '@/lib/inventory';

/**
 * The official KLH templates companies fill in (public/template, copied from
 * Data-inventaris/data-template), one per form.
 */
export const TEMPLATE_FILES: Array<{ form: InventoryCategory | OtherForm; code: string; title: string; /** What the form holds, in a line. */ description: string; file: string }> = [
  { form: 'transformator_digunakan', code: '1.1', title: 'Transformator yang masih digunakan', description: 'Trafo yang masih beroperasi, buatan sebelum 1997 atau tanpa tahun, dengan hasil uji PCBs dan riwayat perawatannya.', file: '/template/1.1-transformator-masih-digunakan.xlsx' },
  { form: 'transformator_tidak_digunakan', code: '1.2', title: 'Transformator yang sudah tidak digunakan', description: 'Trafo yang sudah tidak beroperasi dan masih disimpan, termasuk kondisi dan waktu terakhir digunakan.', file: '/template/1.2-transformator-tidak-digunakan.xlsx' },
  { form: 'kapasitor', code: '1.3', title: 'Kapasitor', description: 'Kapasitor yang berpotensi mengandung PCBs, baik yang masih digunakan maupun tidak.', file: '/template/1.3-kapasitor.xlsx' },
  { form: 'minyak_dielektrik', code: '1.4', title: 'Minyak dielektrik', description: 'Minyak dielektrik/oli yang disimpan dalam wadah: drum, IBC, jeriken, atau tangki.', file: '/template/1.4-minyak-dielektrik.xlsx' },
  { form: 'pengurangan', code: '2', title: 'Pengurangan PCBs', description: 'Log perawatan trafo: hasil uji sebelum dan sesudah, serta pengelolaan limbah B3 hasil perawatan.', file: '/template/2-pengurangan.xlsx' },
  { form: 'penyimpanan', code: '3', title: 'Penyimpanan PCBs', description: 'Logbook limbah PCBs di TPS Limbah B3, izin TPS, dan ketentuan teknis penyimpanan.', file: '/template/3-penyimpanan.xlsx' },
  { form: 'pengolahan', code: '4.2', title: 'Pengolahan PCBs (untuk penghasil)', description: 'Ketentuan teknis pengolahan limbah PCBs oleh perusahaan penghasil, dijawab Ya atau Tidak.', file: '/template/4.2-pengolahan.xlsx' },
  { form: 'pelaporan', code: '5', title: 'Pelaporan PCBs', description: 'Neraca limbah PCBs: jumlah yang dihasilkan, dikelola, dan sisa yang belum dikelola.', file: '/template/5-pelaporan.xlsx' },
];

export const REGULATION_FILE = { title: 'Permen LHK Nomor 29 Tahun 2020 tentang Pengelolaan PCBs', file: '/template/permen-lhk-29-2020.pdf' };
