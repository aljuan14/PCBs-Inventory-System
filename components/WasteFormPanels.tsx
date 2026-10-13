'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import ChecklistPanel from '@/components/ChecklistPanel';
import RecordLogPanel, { shortDate, sumOf, tons } from '@/components/RecordLogPanel';
import { BALANCE_SECTIONS, STORAGE_SECTIONS, wasteEntryDefaults } from '@/lib/form-fields';

type Props = { supabase: SupabaseClient; companyId: string };

const DAY = 24 * 60 * 60 * 1000;
/** Days stored: to the last handling, or still running to today. */
function storedDays(row: Record<string, unknown>) {
  if (typeof row.masa_simpan_hari === 'number') return `${row.masa_simpan_hari.toLocaleString('id-ID')} hari`;
  const since = Math.floor((Date.now() - new Date(`${row.tanggal_dihasilkan}T00:00:00`).getTime()) / DAY);
  return <span title="Belum dikelola: dihitung sampai hari ini">{since.toLocaleString('id-ID')} hari <span className="text-amber-700">(berjalan)</span></span>;
}

/** Form 3: the storage logbook and the storage checklist with the permit. */
export function StorageFormPanel({ supabase, companyId }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Formulir 3: Penyimpanan PCBs</h2>
        <p className="text-xs text-slate-500">Penyimpanan sementara transformator, kapasitor, dan minyak dielektrik yang sudah tidak digunakan (Pasal 15–16 Permen LHK 29/2020).</p>
      </div>
      <RecordLogPanel
        supabase={supabase}
        companyId={companyId}
        table="penyimpanan_logbook"
        orderBy="tanggal_dihasilkan"
        title="Logbook penyimpanan"
        description="Satu baris per limbah yang disimpan. Masa simpan dan jumlah di TPS dihitung otomatis."
        addLabel="Tambah baris logbook"
        sections={STORAGE_SECTIONS}
        defaults={wasteEntryDefaults}
        extraErrors={(values): Record<string, string> => (values.jumlah_dikelola_ton !== null && values.jumlah_dihasilkan_ton !== null && values.jumlah_dikelola_ton > values.jumlah_dihasilkan_ton
          ? { jumlah_dikelola_ton: 'Tidak boleh lebih dari jumlah dihasilkan.' } : {})}
        columns={[
          { label: 'Kode', value: (row) => String(row.kode_limbah) },
          { label: 'Sumber limbah', value: (row) => <span className="line-clamp-2">{String(row.sumber_limbah ?? '–')}</span> },
          { label: 'No. serial', value: (row) => String(row.nomor_serial ?? '–') },
          { label: 'Dihasilkan', value: (row) => shortDate(row.tanggal_dihasilkan), className: 'whitespace-nowrap' },
          { label: 'Masa simpan', value: storedDays, className: 'whitespace-nowrap' },
          { label: 'Terakhir dikelola', value: (row) => shortDate(row.tanggal_terakhir_dikelola), className: 'whitespace-nowrap' },
          { label: 'Dihasilkan (ton)', value: (row) => tons(row.jumlah_dihasilkan_ton), total: sumOf('jumlah_dihasilkan_ton'), className: 'text-right tabular-nums' },
          { label: 'Dikelola (ton)', value: (row) => tons(row.jumlah_dikelola_ton), total: sumOf('jumlah_dikelola_ton'), className: 'text-right tabular-nums' },
          { label: 'Disimpan TPS (ton)', value: (row) => tons(row.jumlah_disimpan_ton), total: sumOf('jumlah_disimpan_ton'), className: 'text-right tabular-nums' },
        ]}
      />
      <ChecklistPanel supabase={supabase} companyId={companyId} checklist="3_penyimpanan" />
    </div>
  );
}

/** Form 4.2: processing by a licensed third party, as a checklist. */
export function ProcessingFormPanel({ supabase, companyId }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Formulir 4.2: Pengolahan PCBs (untuk penghasil)</h2>
        <p className="text-xs text-slate-500">Pengolahan peralatan dan minyak yang sudah tidak digunakan oleh pihak ketiga berizin (Pasal 17 Permen LHK 29/2020).</p>
      </div>
      <ChecklistPanel supabase={supabase} companyId={companyId} checklist="4_2_pengolahan" />
    </div>
  );
}

/** Form 5: the balance of PCBs waste; its processing checklist is the one of form 4.2. */
export function ReportingFormPanel({ supabase, companyId }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Formulir 5: Pelaporan PCBs</h2>
        <p className="text-xs text-slate-500">Neraca pengelolaan PCBs. Tabel pelaporan pengolahan di template ini sama dengan ketentuan formulir 4.2, jadi cukup diisi di tab 4.2.</p>
      </div>
      <RecordLogPanel
        supabase={supabase}
        companyId={companyId}
        table="pelaporan_neraca"
        orderBy="created_at"
        title="Neraca pengelolaan PCBs"
        description="Yang belum dikelola dihitung otomatis dari dihasilkan, dikelola, dan disimpan."
        addLabel="Tambah baris neraca"
        sections={BALANCE_SECTIONS}
        defaults={wasteEntryDefaults}
        extraErrors={(values): Record<string, string> => ((values.dikelola_ton ?? 0) + (values.disimpan_ton ?? 0) > (values.dihasilkan_ton ?? 0)
          ? { dikelola_ton: 'Dikelola + disimpan tidak boleh lebih dari dihasilkan.' } : {})}
        columns={[
          { label: 'Kode', value: (row) => String(row.kode_limbah) },
          { label: 'Jenis', value: (row) => <span className="line-clamp-2">{String(row.jenis ?? '–')}</span> },
          { label: 'No. serial', value: (row) => String(row.nomor_serial ?? '–') },
          { label: 'Dihasilkan (ton)', value: (row) => tons(row.dihasilkan_ton), total: sumOf('dihasilkan_ton'), className: 'text-right tabular-nums' },
          { label: 'Dikelola (ton)', value: (row) => tons(row.dikelola_ton), total: sumOf('dikelola_ton'), className: 'text-right tabular-nums' },
          { label: 'Disimpan (ton)', value: (row) => tons(row.disimpan_ton), total: sumOf('disimpan_ton'), className: 'text-right tabular-nums' },
          { label: 'Belum dikelola (ton)', value: (row) => tons(row.belum_dikelola_ton), total: sumOf('belum_dikelola_ton'), className: 'text-right tabular-nums' },
          { label: 'Keterangan', value: (row) => <span className="line-clamp-2">{String(row.keterangan ?? '–')}</span> },
        ]}
      />
    </div>
  );
}
