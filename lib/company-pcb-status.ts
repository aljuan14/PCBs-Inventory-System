import type { SupabaseClient } from '@supabase/supabase-js';
import { TRAFO_FOCUS_YEAR, formSpec } from '@/lib/form-fields';
import { EVIDENCE_ITEMS } from '@/lib/evidence';
import { SUMMARY_MODE } from '@/lib/data-mode';
import type { ReportTab } from '@/components/FormTabs';

/**
 * A company's PCBs status for the transformers in focus (made before 1997 or
 * of unknown year), from company_pcb_status (migration 20261013000001), and
 * the colour and messages shown on the status card:
 *
 * - red: a transformer not tested and with no plan, one over 50 ppm with no
 *   plan to handle it, a plan past its date, or PCBs waste stored without a
 *   valid TPS permit (form 3);
 * - yellow: everything left has a plan still ahead, the statement is
 *   missing or at odds with the data, the TPS permit ends within 90 days,
 *   waste stored over 365 days, a checklist point answered "tidak", or
 *   waste not handled yet in the balance (forms 3-5), or the supporting
 *   evidence of a form 1.x with data incomplete;
 * - green: nothing left to do (no focus transformer, or all tested within
 *   50 ppm or handled).
 */

export type StatementRow = {
  punya_trafo_sebelum_1997: boolean;
  punya_trafo_1997_keatas: boolean;
  jumlah_trafo_1997_keatas: number | null;
  tonase_trafo_1997_keatas_ton: number | null;
  // Migration 20261013000012; absent in a web summary sent before it.
  tidak_memiliki_peralatan?: boolean;
  surat_tanggal?: string | null;
  verifikasi?: 'menunggu' | 'diterima' | 'ditolak' | null;
  created_at: string;
};

/** Inventory rows of any kind: with them, the data says what the company owns. */
export const hasInventory = (s: PcbStatusCounts) => s.trafo_digunakan + s.trafo_tidak_digunakan + s.kapasitor + s.minyak > 0;
/** The statement says the company owns no transformer, capacitor or dielectric oil (older rows: neither transformer box). */
export const declaresNone = (statement: StatementRow) =>
  statement.tidak_memiliki_peralatan ?? (!statement.punya_trafo_sebelum_1997 && !statement.punya_trafo_1997_keatas);

export type PcbStatusCounts = {
  trafo_digunakan: number;
  trafo_tidak_digunakan: number;
  kapasitor: number;
  minyak: number;
  fokus: number;
  fokus_tahun_kosong: number;
  aman: number;
  belum_uji: number;
  belum_uji_terjadwal: number;
  belum_uji_lewat: number;
  tinggi: number;
  tinggi_selesai: number;
  tinggi_terjadwal: number;
  tinggi_lewat: number;
  /** Transformers no longer in use, each needing a management plan (migration 20261014000002). */
  kelola?: number;
  kelola_selesai?: number;
  kelola_terjadwal?: number;
  kelola_lewat?: number;
  rencana_berikut: string | null;
  pernyataan: StatementRow | null;
  // Forms 3-5 (migration 20261013000007); missing in a web summary sent before it.
  simpan_ton?: number;
  simpan_lewat_365?: number;
  izin_tps_status?: string | null;
  izin_tps_berlaku?: string | null;
  penyimpanan_diisi?: boolean;
  penyimpanan_tidak?: number | null;
  penyimpanan_penaatan?: number | null;
  pengolahan_tidak?: number | null;
  pengolahan_penaatan?: number | null;
  belum_dikelola_ton?: number;
  /** Links filled in per form 1.x on its latest save (migration 20261013000009). */
  bukti_dukung?: Partial<Record<keyof typeof EVIDENCE_ITEMS, number>>;
};

/** How long before the TPS permit ends the status turns yellow, and how long PCBs waste may be stored. */
export const PERMIT_WARNING_DAYS = 90;
export const MAX_STORAGE_DAYS = 365;

export type StatusColor = 'red' | 'yellow' | 'green';
/**
 * Where a message is fixed: a tab of the company's report (null: none), and
 * the part of the page to scroll to.
 */
export type StatusTarget = { tab: ReportTab | null; section?: 'pernyataan' | 'bukti-dukung' | 'ketentuan-teknis' };
/**
 * `admin`: about paperwork (statement, supporting evidence), not about the
 * equipment. `go` and `action`: where it is fixed, and the button saying so.
 */
export type StatusMessage = { tone: StatusColor; text: string; admin?: boolean; go?: StatusTarget; action?: string };

export const STATUS_COLORS: Record<StatusColor, { label: string; dot: string; card: string; text: string }> = {
  red: { label: 'Perlu tindakan', dot: 'bg-rose-600', card: 'border-rose-200 bg-rose-50', text: 'text-rose-800' },
  yellow: { label: 'Perlu perhatian', dot: 'bg-amber-500', card: 'border-amber-200 bg-amber-50', text: 'text-amber-900' },
  green: { label: 'Aman', dot: 'bg-emerald-600', card: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800' },
};

const fmt = (value: number) => value.toLocaleString('id-ID');
export const formatPlanDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

// On the web the counts come from summary_company_status, sent by web:publish (migration 20261013000005).
export async function fetchPcbStatus(supabase: SupabaseClient, companyId: string): Promise<PcbStatusCounts> {
  if (SUMMARY_MODE) {
    const { data, error } = await supabase.from('summary_company_status').select('status').eq('company_id', companyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Status perusahaan ini belum dikirim ke web.');
    return data.status as PcbStatusCounts;
  }
  const { data, error } = await supabase.rpc('company_pcb_status', { p_company_id: companyId });
  if (error) throw new Error(error.message);
  return data as PcbStatusCounts;
}

const ROADMAP: StatusTarget = { tab: 'roadmap' };
const PERMIT: StatusTarget = { tab: 'penyimpanan', section: 'ketentuan-teknis' };
const STATEMENT: StatusTarget = { tab: null, section: 'pernyataan' };

/** The colour and what to say about it, most urgent first. */
export function evaluateStatus(s: PcbStatusCounts): { color: StatusColor; messages: StatusMessage[] } {
  const messages: StatusMessage[] = [];
  const untestedOpen = s.belum_uji - s.belum_uji_terjadwal - s.belum_uji_lewat;
  const highOpen = s.tinggi - s.tinggi_selesai - s.tinggi_terjadwal - s.tinggi_lewat;
  const manageOpen = manageOpenOf(s);

  if (s.belum_uji_lewat > 0) messages.push({ tone: 'red', text: `${fmt(s.belum_uji_lewat)} trafo melewati tanggal rencana uji dan belum ada hasil ujinya.`, go: ROADMAP, action: 'Atur roadmap' });
  if (s.tinggi_lewat > 0) messages.push({ tone: 'red', text: `${fmt(s.tinggi_lewat)} trafo > 50 ppm melewati tanggal rencana penanganan.`, go: ROADMAP, action: 'Atur roadmap' });
  if (highOpen > 0) messages.push({ tone: 'red', text: `${fmt(highOpen)} trafo mengandung PCBs > 50 ppm tanpa rencana penanganan (penggantian, retrofilling, atau pengolahan).`, go: ROADMAP, action: 'Atur roadmap' });
  if (untestedOpen > 0) messages.push({ tone: 'red', text: `${fmt(untestedOpen)} trafo belum diuji dan belum punya rencana uji.`, go: ROADMAP, action: 'Atur roadmap' });
  if ((s.kelola_lewat ?? 0) > 0) messages.push({ tone: 'red', text: `${fmt(s.kelola_lewat!)} trafo tidak digunakan melewati tanggal rencana pengelolaan.`, go: ROADMAP, action: 'Atur roadmap' });
  if (manageOpen > 0) messages.push({ tone: 'red', text: `${fmt(manageOpen)} trafo tidak digunakan belum punya rencana pengelolaan.`, go: ROADMAP, action: 'Atur roadmap' });
  if (s.belum_uji_terjadwal > 0) messages.push({ tone: 'yellow', text: `${fmt(s.belum_uji_terjadwal)} trafo dijadwalkan diuji.`, go: ROADMAP, action: 'Lihat roadmap' });
  if (s.tinggi_terjadwal > 0) messages.push({ tone: 'yellow', text: `${fmt(s.tinggi_terjadwal)} trafo > 50 ppm dijadwalkan ditangani.`, go: ROADMAP, action: 'Lihat roadmap' });
  if ((s.kelola_terjadwal ?? 0) > 0) messages.push({ tone: 'yellow', text: `${fmt(s.kelola_terjadwal!)} trafo tidak digunakan dijadwalkan dikelola.`, go: ROADMAP, action: 'Lihat roadmap' });

  // Forms 3-5: storage, its permit and checklists, the balance.
  const stored = Number(s.simpan_ton) || 0;
  const tons = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  if (stored > 0) {
    const permitEnd = s.izin_tps_berlaku ? new Date(`${s.izin_tps_berlaku}T00:00:00`) : null;
    const daysLeft = permitEnd ? Math.floor((permitEnd.getTime() - Date.now()) / 86_400_000) : null;
    if (!s.penyimpanan_diisi || !s.izin_tps_status || s.izin_tps_status === 'Belum memiliki izin') {
      messages.push({ tone: 'red', text: `Menyimpan ${tons(stored)} ton limbah PCBs tanpa izin TPS Limbah B3 yang tercatat.`, go: PERMIT, action: 'Isi izin TPS' });
    } else if (daysLeft !== null && daysLeft < 0) {
      messages.push({ tone: 'red', text: `Menyimpan ${tons(stored)} ton limbah PCBs, tetapi izin TPS sudah berakhir ${formatPlanDate(s.izin_tps_berlaku!)}.`, go: PERMIT, action: 'Perbarui izin TPS' });
    } else if (daysLeft !== null && daysLeft <= PERMIT_WARNING_DAYS) {
      messages.push({ tone: 'yellow', text: `Izin TPS Limbah B3 berakhir ${formatPlanDate(s.izin_tps_berlaku!)} (${fmt(daysLeft)} hari lagi).`, go: PERMIT, action: 'Perbarui izin TPS' });
    }
  }
  if ((s.simpan_lewat_365 ?? 0) > 0) messages.push({ tone: 'yellow', text: `${fmt(s.simpan_lewat_365!)} limbah PCBs disimpan lebih dari ${MAX_STORAGE_DAYS} hari dan belum dikelola seluruhnya.`, go: { tab: 'penyimpanan' }, action: 'Lihat logbook' });
  const unmet = (count: number | null | undefined, rate: number | null | undefined, what: 'penyimpanan' | 'pengolahan') => {
    if (count) messages.push({ tone: 'yellow', text: `${fmt(count)} ketentuan teknis ${what} belum terpenuhi${rate !== null && rate !== undefined ? ` (penaatan ${Math.round(rate * 100)}%)` : ''}.`, go: { tab: what, section: 'ketentuan-teknis' }, action: 'Lihat ketentuan' });
  };
  unmet(s.penyimpanan_tidak, s.penyimpanan_penaatan, 'penyimpanan');
  unmet(s.pengolahan_tidak, s.pengolahan_penaatan, 'pengolahan');
  if ((Number(s.belum_dikelola_ton) || 0) > 0) messages.push({ tone: 'yellow', text: `Neraca: ${tons(Number(s.belum_dikelola_ton))} ton limbah PCBs belum dikelola.`, go: { tab: 'pelaporan' }, action: 'Lihat neraca' });

  // Supporting evidence of every form 1.x the company has data in.
  const rowsPerForm: Record<keyof typeof EVIDENCE_ITEMS, number> = {
    transformator_digunakan: s.trafo_digunakan, transformator_tidak_digunakan: s.trafo_tidak_digunakan, kapasitor: s.kapasitor, minyak_dielektrik: s.minyak,
  };
  if (s.bukti_dukung) {
    for (const [form, rows] of Object.entries(rowsPerForm) as Array<[keyof typeof EVIDENCE_ITEMS, number]>) {
      const needed = EVIDENCE_ITEMS[form].length;
      const filled = s.bukti_dukung[form] ?? 0;
      if (rows > 0 && filled < needed) messages.push({ tone: 'yellow', admin: true, text: `Bukti dukung formulir ${formSpec(form).code} belum lengkap: ${fmt(filled)}/${fmt(needed)} tautan.`, go: { tab: form, section: 'bukti-dukung' }, action: 'Isi bukti dukung' });
    }
  }
  // The statement: with inventory data the data says what the company owns; without, the statement must.
  const statement = s.pernyataan;
  if (hasInventory(s)) {
    if (statement && declaresNone(statement)) {
      messages.push({ tone: 'yellow', text: 'Pernyataan menyebut tidak memiliki trafo, kapasitor, maupun minyak dielektrik, tetapi datanya ada. Periksa pernyataan atau datanya.', go: STATEMENT, action: 'Periksa pernyataan' });
    } else if (statement && !statement.punya_trafo_sebelum_1997 && statement.punya_trafo_1997_keatas && s.fokus > 0) {
      messages.push({ tone: 'yellow', text: `Pernyataan menyebut hanya ada trafo ${TRAFO_FOCUS_YEAR} ke atas, tetapi data berisi ${fmt(s.fokus)} trafo sebelum ${TRAFO_FOCUS_YEAR} atau tanpa tahun.`, go: STATEMENT, action: 'Periksa pernyataan' });
    }
  } else if (!statement) {
    messages.push({ tone: 'yellow', admin: true, text: 'Belum ada data maupun pernyataan: isi formulir, atau nyatakan tidak memiliki peralatan.', go: STATEMENT, action: 'Isi pernyataan' });
  } else if (!declaresNone(statement)) {
    messages.push({ tone: 'yellow', text: 'Perusahaan menyatakan memiliki peralatan, tetapi datanya belum dilaporkan di formulir.', go: { tab: 'transformator_digunakan' }, action: 'Isi formulir' });
  } else if (statement.verifikasi === 'ditolak') {
    messages.push({ tone: 'yellow', admin: true, text: 'Surat pernyataan tidak memiliki peralatan ditolak. Unggah surat yang sudah diperbaiki.', go: STATEMENT, action: 'Unggah surat' });
  } else if (statement.verifikasi === 'menunggu') {
    messages.push({ tone: 'yellow', admin: true, text: 'Surat pernyataan tidak memiliki peralatan menunggu verifikasi KLH.', go: STATEMENT, action: 'Lihat surat' });
  } else if (statement.verifikasi !== 'diterima') {
    messages.push({ tone: 'yellow', admin: true, text: 'Pernyataan tidak memiliki peralatan belum dilengkapi surat pernyataan.', go: STATEMENT, action: 'Unggah surat' });
  }
  if (s.fokus_tahun_kosong > 0) messages.push({ tone: 'yellow', text: `${fmt(s.fokus_tahun_kosong)} trafo tanpa tahun pembuatan, dihitung sebagai trafo sebelum ${TRAFO_FOCUS_YEAR}. Lengkapi tahunnya.`, go: ROADMAP, action: 'Lihat trafonya' });

  // Red first: the national list shows a company's first message.
  messages.sort((a, b) => Number(b.tone === 'red') - Number(a.tone === 'red'));
  const color: StatusColor = messages.some((message) => message.tone === 'red') ? 'red' : messages.length > 0 ? 'yellow' : 'green';
  if (color === 'green') {
    messages.push({ tone: 'green', text: !hasInventory(s) && statement && declaresNone(statement) ? 'Perusahaan menyatakan tidak memiliki trafo, kapasitor, maupun minyak dielektrik (surat pernyataan diterima).' : s.fokus === 0 ? `Tidak ada trafo buatan sebelum ${TRAFO_FOCUS_YEAR}.` : `Semua trafo sebelum ${TRAFO_FOCUS_YEAR} sudah diuji ≤ 50 ppm atau sudah ditangani.` });
  }
  return { color, messages };
}

/** One sentence on everything the company owns. */
export function summarySentence(s: PcbStatusCounts): string {
  const trafo = s.trafo_digunakan + s.trafo_tidak_digunakan;
  const parts: string[] = [];
  if (trafo > 0) {
    parts.push(`${fmt(trafo)} transformator (${fmt(s.trafo_digunakan)} masih digunakan, ${fmt(s.trafo_tidak_digunakan)} tidak digunakan)`);
  }
  if (s.kapasitor > 0) parts.push(`${fmt(s.kapasitor)} kapasitor`);
  if (s.minyak > 0) parts.push(`${fmt(s.minyak)} data minyak dielektrik`);
  const owned = parts.length ? `Tercatat ${parts.join(', ')}.`
    : s.pernyataan && declaresNone(s.pernyataan) ? 'Perusahaan menyatakan tidak memiliki trafo, kapasitor, maupun minyak dielektrik.'
      : 'Belum ada peralatan yang tercatat.';
  const focus = trafo > 0
    ? ` ${fmt(s.fokus)} trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau tanpa tahun: ${fmt(s.aman)} aman (≤ 50 ppm), ${fmt(s.tinggi)} > 50 ppm, ${fmt(s.belum_uji)} belum diuji${s.kelola ? `, ${fmt(s.kelola)} tidak digunakan (perlu dikelola)` : ''}.`
    : '';
  const after = s.pernyataan?.punya_trafo_1997_keatas
    ? ` Menurut pernyataan, ada ${fmt(s.pernyataan.jumlah_trafo_1997_keatas ?? 0)} trafo buatan ${TRAFO_FOCUS_YEAR} ke atas (${(s.pernyataan.tonase_trafo_1997_keatas_ton ?? 0).toLocaleString('id-ID')} ton).`
    : '';
  return owned + focus + after;
}

/** National view: every company's colour, or 'empty' when it has neither data nor a statement yet. */
export type NationalColor = StatusColor | 'empty';

export const EMPTY_STATUS = { label: 'Belum melapor', dot: 'bg-slate-400', card: 'border-slate-200 bg-slate-50', text: 'text-slate-600' };

export const nationalColor = (s: PcbStatusCounts): NationalColor =>
  !hasInventory(s) && !s.pernyataan ? 'empty' : evaluateStatus(s).color;

/** Transformers still needing something with no plan, or past their plan: how urgent a red company is. */
export const openActions = (s: PcbStatusCounts) =>
  (s.belum_uji - s.belum_uji_terjadwal) + (s.tinggi - s.tinggi_selesai - s.tinggi_terjadwal) + (s.kelola ?? 0) - (s.kelola_selesai ?? 0) - (s.kelola_terjadwal ?? 0);

/** Transformers no longer in use with no management plan yet. */
export const manageOpenOf = (s: PcbStatusCounts) =>
  (s.kelola ?? 0) - (s.kelola_selesai ?? 0) - (s.kelola_terjadwal ?? 0) - (s.kelola_lewat ?? 0);

export async function fetchAllPcbStatus(supabase: SupabaseClient): Promise<Map<string, PcbStatusCounts>> {
  const { data, error } = SUMMARY_MODE
    ? await supabase.from('summary_company_status').select('company_id, status')
    : await supabase.rpc('pcb_status_all');
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as Array<{ company_id: string; status: PcbStatusCounts }>).map((row) => [row.company_id, row.status]));
}

/** Yellow only for paperwork (statement, supporting evidence): nothing in the data itself needs doing. */
export const onlyPaperwork = (s: PcbStatusCounts) => {
  const { color, messages } = evaluateStatus(s);
  return color === 'yellow' && messages.every((message) => message.admin);
};
