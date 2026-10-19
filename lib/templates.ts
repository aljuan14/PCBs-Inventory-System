import type { OtherForm } from '@/components/FormTabs';
import type { InventoryCategory } from '@/lib/inventory';

/**
 * The official KLH templates companies fill in (public/template, copied from
 * Data-inventaris/data-template), one per form.
 */
export const TEMPLATE_FILES: Array<{ form: InventoryCategory | OtherForm; code: string; title: string; file: string }> = [
  { form: 'transformator_digunakan', code: '1.1', title: 'Transformator yang masih digunakan', file: '/template/1.1-transformator-masih-digunakan.xlsx' },
  { form: 'transformator_tidak_digunakan', code: '1.2', title: 'Transformator yang sudah tidak digunakan', file: '/template/1.2-transformator-tidak-digunakan.xlsx' },
  { form: 'kapasitor', code: '1.3', title: 'Kapasitor', file: '/template/1.3-kapasitor.xlsx' },
  { form: 'minyak_dielektrik', code: '1.4', title: 'Minyak dielektrik', file: '/template/1.4-minyak-dielektrik.xlsx' },
  { form: 'pengurangan', code: '2', title: 'Pengurangan PCBs', file: '/template/2-pengurangan.xlsx' },
  { form: 'penyimpanan', code: '3', title: 'Penyimpanan PCBs', file: '/template/3-penyimpanan.xlsx' },
  { form: 'pengolahan', code: '4.2', title: 'Pengolahan PCBs (untuk penghasil)', file: '/template/4.2-pengolahan.xlsx' },
  { form: 'pelaporan', code: '5', title: 'Pelaporan PCBs', file: '/template/5-pelaporan.xlsx' },
];

export const REGULATION_FILE = { title: 'Permen LHK Nomor 29 Tahun 2020 tentang Pengelolaan PCBs', file: '/template/permen-lhk-29-2020.pdf' };
