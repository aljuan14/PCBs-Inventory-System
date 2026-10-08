import type { SupabaseClient } from '@supabase/supabase-js';
import type { EditableInventoryFields, InventoryItem } from '@/components/DataTable';
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

export async function updateInventoryItem(supabase: SupabaseClient, item: InventoryItem, changes: EditableInventoryFields) {
  const table = tableOf(item);
  const payload: Record<string, string | number | null> = {};
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
