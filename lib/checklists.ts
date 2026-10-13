/**
 * The yes / no checklists of the KLHK templates (Data-inventaris/data-template),
 * answered per company on the reporting form and stored in ketentuan_teknis
 * (migration 20261013000004):
 *
 * - '3_penyimpanan': "Tabel Ketentuan Teknis Penyimpanan PCBs" of form 3, with
 *   the storage permit (Izin TPS Limbah B3) above it;
 * - '4_2_pengolahan': "Ketentuan Teknis Pengolahan" of form 4.2 (the company
 *   hands its PCBs to a licensed third party). Form 5 repeats the same eleven
 *   questions as "Tabel Pelaporan Pengolahan PCBs", so they are answered once.
 *
 * Form 4.1 is for the licensed waste processors themselves, not for the
 * companies owning the equipment, and is not on the form yet.
 */

export type ChecklistKey = '3_penyimpanan' | '4_2_pengolahan';

export type Checklist = { key: ChecklistKey; code: string; title: string; note: string; permit: boolean; questions: string[] };

const EQUIPMENT = 'transformator, kapasitor, dan minyak dielektrik sudah tidak digunakan';

export const CHECKLISTS: Record<ChecklistKey, Checklist> = {
  '3_penyimpanan': {
    key: '3_penyimpanan',
    code: '3',
    title: 'Ketentuan teknis penyimpanan PCBs',
    note: 'Penyimpanan sementara transformator / kapasitor / minyak dielektrik sudah tidak digunakan. Izin TPS Limbah B3 harus mencantumkan kode limbah A101d.',
    permit: true,
    questions: [
      `Apakah penyimpanan ${EQUIPMENT} memiliki Izin TPS Limbah B3 / Rincian Teknis Penyimpanan Limbah B3 yang terintegrasi ke dalam Perizinan Lingkungan?`,
      `Apakah lokasi penyimpanan ${EQUIPMENT} bebas banjir dan tidak rawan bencana (longsoran, bahaya gunung api, gempa bumi, sesar, sink hole, amblesan, tsunami, mud volcano)? Apabila tidak, apakah telah dilakukan rekayasa teknologi?`,
      `Apakah lokasi penyimpanan ${EQUIPMENT} berada di dalam penguasaan setiap orang yang menghasilkan?`,
      `Apakah bagian luar bangunan diberi papan nama dan titik koordinat serta simbol limbah B3 sesuai dengan karakteristik ${EQUIPMENT} yang disimpan?`,
      'Apakah bangunan memiliki sistem penerangan?',
      `Apakah ${EQUIPMENT} terlindung dari hujan dan sinar matahari?`,
      'Apakah bangunan mempunyai sistem ventilasi udara?',
      'Apakah dimensi/ukuran dan kapasitas fasilitas bangunan sesuai dengan yang tercantum dalam izin / Rincian Teknis Penyimpanan Limbah B3?',
      `Apakah memiliki rancang bangun (desain) dan luas sesuai dengan kategori, karakteristik, dan jumlah ${EQUIPMENT} yang disimpan?`,
      'Apakah dinding dan atap terbuat dari bahan yang tidak mudah terbakar?',
      'Apakah bangunan memiliki saluran dan bak penampung tumpahan (jika menyimpan limbah B3 cair)?',
      'Apakah bak penampung mempunyai kapasitas yang memadai untuk menampung tumpahan/ceceran?',
      'Apakah lantai kedap air, tidak bergelombang, kuat, tidak retak, dan dibuat melandai turun ke arah bak penampungan dengan kemiringan minimum 1%?',
      'Apakah memiliki tanggul atau tembok pemisah untuk memisahkan limbah B3 lebih dari 1 kategori, karakteristik, dan jenis?',
      'Apakah melakukan prosedur tata laksana kebersihan yang baik (good housekeeping)?',
      'Apakah tata letak lokasi fasilitas penyimpanan sesuai dengan layout lokasi penyimpanan limbah B3 dalam izin / Rincian Teknis Penyimpanan Limbah B3?',
      'Apakah fasilitas penyimpanan dilengkapi saluran drainase di sekeliling lantai yang mengalir menuju bak penampung tumpahan?',
      'Apakah kemasan yang disusun telah diberi palet, tidak lebih dari 3 susun, dan/atau berjarak paling rendah 1 meter dari atap (jika menggunakan drum, jumbo bag, IBC tank)?',
      `Apakah kemasan yang digunakan sesuai dengan jenis, karakteristik, dan/atau kompatibilitas ${EQUIPMENT} yang disimpan?`,
      'Apakah kemasan yang digunakan sesuai dengan yang tercantum dalam izin / Rincian Teknis Penyimpanan Limbah B3 (jenis dan ukuran/kapasitas)?',
      'Apakah kemasan tidak berkarat, tidak bocor, tidak rusak, dan memiliki penutup yang kuat untuk mencegah tumpahan serta mampu mengungkung limbah B3 sesuai karakteristiknya?',
      'Apakah kemasan dilengkapi simbol dan label limbah B3 serta simbol PCBs/non PCBs, dengan label paling sedikit memuat nama limbah B3, identitas penghasil, tanggal dihasilkan, dan tanggal pengemasan?',
      `Apakah ada logbook/catatan keluar masuk ${EQUIPMENT}?`,
      `Apakah jumlah dan jenis ${EQUIPMENT} sesuai dengan yang tercatat di logbook/catatan?`,
      'Apakah waktu penyimpanan telah sesuai dengan sumber, jumlah, dan kategori limbah B3?',
      'Apakah SOP penyimpanan, SOP tanggap darurat, SOP bongkar muat, dan/atau SOP pengemasan limbah B3 dipasang di dalam fasilitas penyimpanan limbah B3?',
      'Apakah fasilitas penyimpanan dilengkapi dengan peralatan tanggap darurat?',
    ],
  },
  '4_2_pengolahan': {
    key: '4_2_pengolahan',
    code: '4.2 / 5',
    title: 'Ketentuan teknis pengolahan PCBs (untuk penghasil)',
    note: 'Pengolahan transformator / kapasitor / minyak dielektrik sudah tidak digunakan oleh pihak ketiga berizin. Pertanyaan yang sama dipakai di formulir 5 (Tabel Pelaporan Pengolahan PCBs).',
    permit: false,
    questions: [
      `Apakah pihak ketiga pengolah ${EQUIPMENT} memiliki izin/persetujuan teknis pengelolaan PCBs dengan kode limbah B3 A101d?`,
      `Apakah pihak ketiga pengolah ${EQUIPMENT} memiliki Surat Kelayakan Operasional pengelolaan PCBs dengan kode limbah B3 A101d?`,
      'Apakah penghasil dan pihak ketiga memiliki kontrak kerja sama dalam pengelolaan limbah B3?',
      'Apakah pihak ketiga memiliki rekomendasi pengangkutan limbah B3 (mencantumkan kode limbah B3 A101d), perizinan Kementerian Perhubungan, dan kartu pengawas?',
      'Apakah penghasil dan pihak ketiga memiliki manifes elektronik?',
      'Apakah pihak ketiga memiliki sertifikat kompetensi personil pengelolaan limbah B3?',
      'Apakah memiliki SOP pengoperasian fasilitas pengolahan PCBs?',
      'Apakah memiliki SOP tanggap darurat dan peralatan tanggap darurat sesuai izin / persetujuan teknis / Surat Kelayakan Operasional?',
      'Apakah kriteria pemenuhan baku mutu untuk fasilitas pengolahan PCBs terpenuhi?',
      'Apakah memiliki logbook/pencatatan pengolahan PCBs?',
      'Apakah memiliki SOP penanganan limbah B3 yang dihasilkan dari kegiatan pengolahan PCBs?',
    ],
  },
};

export type ChecklistAnswer = { jawaban: 'ya' | 'tidak' | null; nomor_surat?: string; keterangan?: string; bukti_dukung?: string };

/** Share of "ya" among the questions, as the template's "Persentase penaatan". */
export const complianceRate = (answers: ChecklistAnswer[]) => {
  const answered = answers.filter((answer) => answer.jawaban);
  return answered.length ? answers.filter((answer) => answer.jawaban === 'ya').length / answers.length : null;
};

