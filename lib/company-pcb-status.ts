import type { SupabaseClient } from '@supabase/supabase-js';
import { TRAFO_FOCUS_YEAR } from '@/lib/form-fields';

/**
 * A company's PCBs status for the transformers in focus (made before 1997 or
 * of unknown year), from company_pcb_status (migration 20261013000001), and
 * the colour and messages shown on the status card:
 *
 * - red: a transformer not tested and with no plan, one over 50 ppm with no
 *   plan to handle it, or a plan past its date;
 * - yellow: everything left has a plan still ahead, or the statement is
 *   missing or at odds with the data;
 * - green: nothing left to do (no focus transformer, or all tested within
 *   50 ppm or handled).
 */

export type StatementRow = {
  punya_trafo_sebelum_1997: boolean;
  punya_trafo_1997_keatas: boolean;
  jumlah_trafo_1997_keatas: number | null;
  tonase_trafo_1997_keatas_ton: number | null;
  created_at: string;
};

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
  rencana_berikut: string | null;
  pernyataan: StatementRow | null;
};

export type StatusColor = 'red' | 'yellow' | 'green';
export type StatusMessage = { tone: StatusColor; text: string };

export const STATUS_COLORS: Record<StatusColor, { label: string; dot: string; card: string; text: string }> = {
  red: { label: 'Perlu tindakan', dot: 'bg-rose-600', card: 'border-rose-200 bg-rose-50', text: 'text-rose-800' },
  yellow: { label: 'Dalam rencana', dot: 'bg-amber-500', card: 'border-amber-200 bg-amber-50', text: 'text-amber-900' },
  green: { label: 'Aman', dot: 'bg-emerald-600', card: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800' },
};

const fmt = (value: number) => value.toLocaleString('id-ID');
export const formatPlanDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

export async function fetchPcbStatus(supabase: SupabaseClient, companyId: string): Promise<PcbStatusCounts> {
  const { data, error } = await supabase.rpc('company_pcb_status', { p_company_id: companyId });
  if (error) throw new Error(error.message);
  return data as PcbStatusCounts;
}

/** The colour and what to say about it, most urgent first. */
export function evaluateStatus(s: PcbStatusCounts): { color: StatusColor; messages: StatusMessage[] } {
  const messages: StatusMessage[] = [];
  const untestedOpen = s.belum_uji - s.belum_uji_terjadwal - s.belum_uji_lewat;
  const highOpen = s.tinggi - s.tinggi_selesai - s.tinggi_terjadwal - s.tinggi_lewat;
  const trafo = s.trafo_digunakan + s.trafo_tidak_digunakan;

  if (s.belum_uji_lewat > 0) messages.push({ tone: 'red', text: `${fmt(s.belum_uji_lewat)} trafo melewati tanggal rencana uji dan belum ada hasil ujinya.` });
  if (s.tinggi_lewat > 0) messages.push({ tone: 'red', text: `${fmt(s.tinggi_lewat)} trafo > 50 ppm melewati tanggal rencana penanganan.` });
  if (highOpen > 0) messages.push({ tone: 'red', text: `${fmt(highOpen)} trafo mengandung PCBs > 50 ppm tanpa rencana penanganan (penggantian, retrofilling, atau pengolahan).` });
  if (untestedOpen > 0) messages.push({ tone: 'red', text: `${fmt(untestedOpen)} trafo belum diuji dan belum punya rencana uji.` });
  if (s.belum_uji_terjadwal > 0) messages.push({ tone: 'yellow', text: `${fmt(s.belum_uji_terjadwal)} trafo dijadwalkan diuji.` });
  if (s.tinggi_terjadwal > 0) messages.push({ tone: 'yellow', text: `${fmt(s.tinggi_terjadwal)} trafo > 50 ppm dijadwalkan ditangani.` });

  if (!s.pernyataan) messages.push({ tone: 'yellow', text: 'Perusahaan belum mengisi pernyataan kepemilikan transformator.' });
  else if (!s.pernyataan.punya_trafo_sebelum_1997 && s.fokus > 0) {
    messages.push({ tone: 'yellow', text: `Pernyataan menyebut tidak ada trafo sebelum ${TRAFO_FOCUS_YEAR}, tetapi data berisi ${fmt(s.fokus)}. Periksa pernyataan atau datanya.` });
  } else if (s.pernyataan.punya_trafo_sebelum_1997 && trafo === 0) {
    messages.push({ tone: 'yellow', text: `Pernyataan menyebut ada trafo sebelum ${TRAFO_FOCUS_YEAR}, tetapi datanya belum dilaporkan.` });
  }
  if (s.fokus_tahun_kosong > 0) messages.push({ tone: 'yellow', text: `${fmt(s.fokus_tahun_kosong)} trafo tanpa tahun pembuatan, dihitung sebagai trafo sebelum ${TRAFO_FOCUS_YEAR}. Lengkapi tahunnya.` });

  const color: StatusColor = messages.some((message) => message.tone === 'red') ? 'red' : messages.length > 0 ? 'yellow' : 'green';
  if (color === 'green') {
    messages.push({ tone: 'green', text: s.fokus === 0 ? `Tidak ada trafo buatan sebelum ${TRAFO_FOCUS_YEAR}.` : `Semua trafo sebelum ${TRAFO_FOCUS_YEAR} sudah diuji ≤ 50 ppm atau sudah ditangani.` });
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
  const owned = parts.length ? `Tercatat ${parts.join(', ')}.` : 'Belum ada peralatan yang tercatat.';
  const focus = trafo > 0
    ? ` ${fmt(s.fokus)} trafo buatan sebelum ${TRAFO_FOCUS_YEAR} atau tanpa tahun: ${fmt(s.aman)} aman (≤ 50 ppm), ${fmt(s.tinggi)} > 50 ppm, ${fmt(s.belum_uji)} belum diuji.`
    : '';
  const after = s.pernyataan?.punya_trafo_1997_keatas
    ? ` Menurut pernyataan, ada ${fmt(s.pernyataan.jumlah_trafo_1997_keatas ?? 0)} trafo buatan ${TRAFO_FOCUS_YEAR} ke atas (${(s.pernyataan.tonase_trafo_1997_keatas_ton ?? 0).toLocaleString('id-ID')} ton).`
    : '';
  return owned + focus + after;
}
