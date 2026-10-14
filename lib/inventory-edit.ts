import type { SupabaseClient } from '@supabase/supabase-js';
import type { EditableInventoryFields, InventoryItem } from '@/components/DataTable';
import { parseDMSCoordinate, repairIndonesianCoordinate } from '@/lib/dms';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';

/**
 * Edit and delete one inventory row from the data table. The row's own
 * category picks the table, so the national dashboard (all categories) and the
 * per-category pages share this code.
 */

function tableOf(item: InventoryItem): InventoryCategory {
  const table = INVENTORY_CATEGORIES.find((category) => category.key === item.type)?.key;
  if (!table) throw new Error(`Kategori data "${item.type}" tidak dikenali.`);
  return table;
}

/** The coordinate as the edit form shows it: the point read, or the text that could not be read. */
export function coordinateText(item: InventoryItem) {
  if (item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined) return `${item.latitude}, ${item.longitude}`;
  return item.rawCoordinate ?? '';
}

// The map shows Indonesia only (as the import, lib/import-transform.ts).
const inIndonesia = (lat: number, lng: number) => lat >= -11.5 && lat <= 6.5 && lng >= 94 && lng <= 141.5;

/** A typed or picked coordinate: empty clears it; anything else must read as a point in Indonesia. */
function coordinatePayload(text: string) {
  const raw = text.trim();
  if (!raw) return { koordinat_raw: null, koordinat_lat: null, koordinat_lng: null };
  const parsed = parseDMSCoordinate(raw);
  const point = parsed.isValid ? { latitude: parsed.latitude as number, longitude: parsed.longitude as number } : repairIndonesianCoordinate(raw);
  if (!point) throw new Error('Koordinat tidak terbaca. Gunakan format desimal, contoh: -6.2088, 106.8456, atau pilih di peta.');
  if (!inIndonesia(point.latitude, point.longitude)) throw new Error(`Koordinat ${point.latitude}, ${point.longitude} berada di luar wilayah Indonesia. Periksa tanda minus lintang selatan.`);
  return { koordinat_raw: raw, koordinat_lat: point.latitude, koordinat_lng: point.longitude };
}

export async function updateInventoryItem(supabase: SupabaseClient, item: InventoryItem, changes: EditableInventoryFields) {
  const table = tableOf(item);
  const payload: Record<string, unknown> = {};
  if (table === 'minyak_dielektrik') {
    payload.merek_minyak_dielektrik = changes.name.trim() || null;
    payload.uji_konsentrasi_ppm = changes.pcbConcentration;
    payload.lokasi_penyimpanan = changes.location.trim() || null;
    payload.status_minyak = changes.status.trim() || null;
  } else if (table === 'kapasitor') {
    payload.nama_merek = changes.name.trim() || null;
    payload.nomor_serial = changes.serialNumber.trim() || null;
    payload.lokasi_peralatan = changes.location.trim() || null;
    payload.status_alat = changes.status.trim() || null;
  } else {
    payload.nama_merek = changes.name.trim() || null;
    payload.nomor_serial = changes.serialNumber.trim() || null;
    payload.uji_konsentrasi_ppm = changes.pcbConcentration;
    payload.lokasi_peralatan = changes.location.trim() || null;
    if (table === 'transformator_tidak_digunakan') payload.status_kondisi = changes.status.trim() || null;
  }
  // Only a changed coordinate is written;
  // the import's notes on the old coordinate go with it (read here, not from the page).
  if (changes.coordinate.trim() !== coordinateText(item).trim()) {
    const coordinate = coordinatePayload(changes.coordinate);
    // A row from a workbook keeps the text written there ("Di Excel"); only the point changes.
    if (item.excelRow !== null && item.excelRow !== undefined && item.rawCoordinate) delete (coordinate as Partial<typeof coordinate>).koordinat_raw;
    Object.assign(payload, coordinate);
    const { data } = await supabase.from(table).select('catatan_impor').eq('id', item.id).maybeSingle();
    const notes = ((data?.catatan_impor ?? []) as Array<{ kode?: string }>).filter((note) => !note.kode?.startsWith('coordinate:'));
    payload.catatan_impor = notes.length > 0 ? notes : null;
  }
  const { error, count } = await supabase.from(table).update(payload, { count: 'exact' }).eq('id', item.id);
  if (error) throw new Error(`Gagal menyimpan perubahan: ${error.message}`);
  if (count === 0) throw new Error('Data tidak ditemukan; mungkin sudah dihapus. Muat ulang halaman.');
}

export async function deleteInventoryItem(supabase: SupabaseClient, item: InventoryItem) {
  const { error, count } = await supabase.from(tableOf(item)).delete({ count: 'exact' }).eq('id', item.id);
  if (error) throw new Error(`Gagal menghapus data: ${error.message}`);
  // Row-level security turns a refused delete into "0 rows" rather than an error.
  if (count === 0) throw new Error('Data tidak terhapus: data tidak ditemukan atau akun ini tidak punya izin. Muat ulang halaman lalu coba lagi.');
}
