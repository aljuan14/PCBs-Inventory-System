import type { InventoryCategory } from '@/lib/inventory';

/**
 * "Tabel Bukti Dukung" of forms 1.1-1.4 (Data-inventaris/data-template): what
 * the company documents for the whole form, each as a link (Google Drive),
 * stored per company and form in bukti_dukung (migration 20261013000008).
 */
export const EVIDENCE_ITEMS: Record<InventoryCategory, Array<{ group: string; label: string }>> = {
  transformator_digunakan: [
    { group: 'A. Dokumentasi', label: 'Transformator yang masih digunakan (4 sisi) yang dilekatkan simbol dan label' },
    { group: 'A. Dokumentasi', label: 'Ketersediaan keran buang' },
    { group: 'A. Dokumentasi', label: 'Plat nama pada transformator yang masih digunakan' },
    { group: 'A. Dokumentasi', label: 'Log perawatan (minyak dielektrik)' },
    { group: 'A. Dokumentasi', label: 'Kondisi ruang penyimpanan' },
    { group: 'A. Dokumentasi', label: 'Ketersediaan peralatan tanggap darurat dan alat pelindung diri' },
    { group: 'A. Dokumentasi', label: 'Lokasi dan titik koordinat penempatan transformator' },
    { group: 'B', label: 'MSDS/SDS minyak dielektrik/oli transformator' },
    { group: 'C', label: 'Hasil uji laboratorium' },
  ],
  transformator_tidak_digunakan: [
    { group: 'A. Dokumentasi', label: 'Transformator sudah tidak digunakan (4 sisi) yang dilekatkan simbol dan label' },
    { group: 'A. Dokumentasi', label: 'Ketersediaan keran buang' },
    { group: 'A. Dokumentasi', label: 'Plat nama pada transformator sudah tidak digunakan' },
    { group: 'A. Dokumentasi', label: 'Log perawatan (minyak dielektrik)' },
    { group: 'A. Dokumentasi', label: 'Kondisi ruang penyimpanan' },
    { group: 'B', label: 'MSDS/SDS minyak dielektrik/oli transformator' },
    { group: 'C', label: 'Hasil uji laboratorium' },
    { group: 'D', label: 'Bukti pengelolaan limbah minyak dielektrik yang mengandung PCBs' },
  ],
  kapasitor: [
    { group: 'A. Dokumentasi', label: 'Kapasitor (4 sisi) yang dilekatkan simbol dan label' },
    { group: 'A. Dokumentasi', label: 'Plat nama pada kapasitor' },
    { group: 'A. Dokumentasi', label: 'Kondisi ruang penyimpanan' },
    { group: 'A. Dokumentasi', label: 'Ketersediaan peralatan tanggap darurat dan alat pelindung diri' },
    { group: 'A. Dokumentasi', label: 'Lokasi dan titik koordinat penempatan kapasitor' },
    { group: 'B', label: 'MSDS/SDS minyak dielektrik/oli kapasitor' },
    { group: 'C', label: 'Hasil uji laboratorium' },
  ],
  minyak_dielektrik: [
    { group: 'A. Dokumentasi', label: 'Wadah penempatan minyak dielektrik (4 sisi) yang dilekatkan simbol dan label' },
    { group: 'A. Dokumentasi', label: 'Log perawatan (minyak dielektrik)' },
    { group: 'A. Dokumentasi', label: 'Ketersediaan peralatan tanggap darurat dan alat pelindung diri' },
    { group: 'B', label: 'MSDS/SDS minyak dielektrik' },
    { group: 'C', label: 'Hasil uji laboratorium' },
  ],
};

/** A link as the template asks: a web address, usually Google Drive. */
export const isLink = (value: string) => /^https?:\/\/\S+\.\S+/i.test(value.trim());
