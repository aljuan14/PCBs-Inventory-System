import type { CategoryStats, InventoryStats } from '@/lib/inventory-query';

const YEAR_LIMIT = 1997;
const PPM_LIMIT = 50;

const formatNumber = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 });

type Row = { label: string; value: string | number; tone?: string };

function SummaryCard({ title, accent, total, totalLabel, rows, loading }: { title: string; accent: string; total: string | number; totalLabel: string; rows: Row[]; loading: boolean }) {
  return <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} /><h3 className="text-sm font-semibold text-slate-900">{title}</h3></div>
    <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{loading ? '...' : total}</div>
    <div className="text-xs text-slate-500">{totalLabel}</div>
    {rows.length > 0 && <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3">
      {rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-3 text-xs"><dt className="text-slate-500">{row.label}</dt><dd className={`font-semibold tabular-nums ${row.tone ?? 'text-slate-800'}`}>{loading ? '...' : row.value}</dd></div>)}
    </dl>}
  </div>;
}

export default function InventorySummary({ stats, loading }: { stats: InventoryStats | null; loading: boolean }) {
  const used = stats?.transformator_digunakan;
  const unused = stats?.transformator_tidak_digunakan;
  const value = (summary: CategoryStats | undefined, key: keyof CategoryStats) => formatNumber(summary?.[key] ?? 0);
  const yearRows = (summary: CategoryStats | undefined): Row[] => [
    { label: `Tahun < ${YEAR_LIMIT}`, value: value(summary, 'before_1997') },
    { label: `Tahun ≥ ${YEAR_LIMIT}`, value: value(summary, 'from_1997') },
    ...((summary?.unknown_year ?? 0) > 0 ? [{ label: 'Tahun tidak diketahui', value: value(summary, 'unknown_year'), tone: 'text-slate-400' }] : []),
  ];

  return <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <SummaryCard title="Transformator Masih Digunakan" accent="#0f766e" total={value(used, 'total')} totalLabel="Jumlah trafo" loading={loading} rows={[
      ...yearRows(used),
      { label: 'Sudah uji laboratorium', value: value(used, 'lab_tested') },
      { label: 'Belum uji laboratorium', value: formatNumber((used?.total ?? 0) - (used?.lab_tested ?? 0)) },
      { label: `Hasil lab < ${PPM_LIMIT} ppm`, value: value(used, 'lab_below_50'), tone: 'text-emerald-700' },
      { label: `Hasil lab ≥ ${PPM_LIMIT} ppm`, value: value(used, 'lab_at_least_50'), tone: 'text-rose-700' },
    ]} />
    <SummaryCard title="Transformator Tidak Digunakan" accent="#b45309" total={value(unused, 'total')} totalLabel="Jumlah trafo" loading={loading} rows={yearRows(unused)} />
    <SummaryCard title="Kapasitor" accent="#2563eb" total={value(stats?.kapasitor, 'total')} totalLabel="Jumlah kapasitor" loading={loading} rows={[]} />
    <SummaryCard title="Minyak Dielektrik" accent="#7c3aed" total={`${value(stats?.minyak_dielektrik, 'volume_l')} L`} totalLabel="Jumlah minyak dielektrik (liter)" loading={loading} rows={[]} />
  </section>;
}
