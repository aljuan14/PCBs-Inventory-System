'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Building2, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { countCompanyData, deleteCompany, type CompanyData } from '@/lib/company-purge';
import { INVENTORY_CATEGORIES, getCategoryLabel } from '@/lib/inventory';
import { EMPTY_STATUS, STATUS_COLORS, fetchAllPcbStatus, nationalColor, type NationalColor } from '@/lib/company-pcb-status';
import { FEEDBACK_STATUSES, STATUS_ORDER, fetchCompanyStatuses, formatDate, statusOf, type CompanyStatus, type FeedbackStatus } from '@/lib/company-status';
import NationalPcbStatus from '@/components/NationalPcbStatus';
import { useReadOnly } from '@/components/useAccess';
import { useCompanySort } from '@/components/useCompanySort';
import { formatEdited, selectCompanies } from '@/lib/company-sort';
import { createClient } from '@/lib/supabase/client';
import { alertDialog, promptDialog } from '@/components/Dialog';

type Company = { id: string; nama_perusahaan: string; alamat?: string | null; id_simpel?: string | null; pilar_company_id?: string | null; terakhir_diubah?: string | null };

const formatNumber = (value: number) => value.toLocaleString('id-ID');

type DataFilter = 'all' | FeedbackStatus;
type SortKey = 'nama' | 'status' | 'data' | 'diubah';

/** Most urgent first, for the Status PCBs column and its filter. */
const PCB_ORDER: NationalColor[] = ['red', 'yellow', 'green', 'empty'];

/** Whether the check results were sent, with the date of the last message. */
function SendBadge({ summary }: { summary: CompanyStatus | undefined }) {
  const status = summary?.status ?? 'empty';
  if (status === 'empty') return null;
  const { label, dot, badge } = FEEDBACK_STATUSES[status];
  const date = summary?.lastSentAt ? ` · ${formatDate(summary.lastSentAt)}` : '';
  return <span title={summary && summary.sends > 1 ? `${summary.sends} kali dikirim` : undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge}`}><span className={`h-2 w-2 rounded-full ${dot}`} />{label}{date}</span>;
}
const PROGRESS_LABELS: Record<string, string> = { import_batches: 'batch impor', upload_sessions: 'sesi unggah', storage: 'berkas' };

/** Shows what the company still holds, asks for its name when that is not nothing, then removes it all. */
function DeleteCompanyDialog({ supabase, company, onClose, onDeleted }: { supabase: SupabaseClient; company: Company; onClose: () => void; onDeleted: () => void }) {
  const [data, setData] = useState<CompanyData | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleting = progress !== null;

  useEffect(() => {
    let active = true;
    countCompanyData(supabase, company.id)
      .then((result) => { if (active) setData(result); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [supabase, company.id]);

  const hasData = data !== null && data.inventoryTotal + data.batches + data.sessions + data.storagePaths.length > 0;
  const canDelete = data !== null && !deleting && (!hasData || confirmName.trim() === company.nama_perusahaan);

  const remove = async () => {
    setError(null);
    setProgress('Menghapus…');
    try {
      const { storageFailures } = await deleteCompany(supabase, company.id, (table, deleted, total) => {
        const label = PROGRESS_LABELS[table] ?? getCategoryLabel(table as Parameters<typeof getCategoryLabel>[0]);
        setProgress(`Menghapus ${label}: ${formatNumber(deleted)} / ${formatNumber(total)}`);
      });
      if (storageFailures > 0) await alertDialog({ title: `${company.nama_perusahaan} terhapus`, message: `Tetapi ${formatNumber(storageFailures)} berkas di Storage gagal dihapus. Hapus manual di dashboard Supabase bila perlu.` });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={deleting ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-company-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><Trash2 className="h-4 w-4" /></div>
            <h2 id="delete-company-title" className="text-base font-semibold text-slate-900">Hapus {company.nama_perusahaan}?</h2>
          </div>
          {!deleting && <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>}
        </div>

        {data === null && !error ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memeriksa data perusahaan…</p>
        ) : data && !hasData ? (
          <p className="mt-4 text-sm text-slate-600">Perusahaan ini tidak memiliki data. Menghapusnya tidak dapat dibatalkan.</p>
        ) : data ? (
          <>
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> Semua data perusahaan ini ikut terhapus permanen:</p>
              <ul className="mt-2 space-y-0.5 pl-5">
                {data.inventory.filter(({ total }) => total > 0).map(({ table, total }) => <li key={table} className="list-disc">{getCategoryLabel(table)}: {formatNumber(total)} baris</li>)}
                {data.batches > 0 && <li className="list-disc">Batch impor: {formatNumber(data.batches)}</li>}
                {data.sessions > 0 && <li className="list-disc">Sesi unggah: {formatNumber(data.sessions)}</li>}
                {data.storagePaths.length > 0 && <li className="list-disc">Berkas di Storage: {formatNumber(data.storagePaths.length)}</li>}
              </ul>
            </div>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Ketik <span className="font-semibold text-slate-900">{company.nama_perusahaan}</span> untuk mengonfirmasi
              <input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} disabled={deleting} autoFocus className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-500" />
            </label>
          </>
        ) : null}

        {error && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{error}</p>}
        {progress && <p className="mt-4 flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> {progress}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={deleting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Batal</button>
          <button type="button" onClick={remove} disabled={!canDelete} className="flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Trash2 className="h-4 w-4" /> Hapus perusahaan</button>
        </div>
      </div>
    </div>
  );
}

export default function CompaniesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const readOnly = useReadOnly();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<Map<string, CompanyStatus> | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DataFilter>('all');
  // PCBs status per company (red / yellow / green / not reported), shown as a dot by the name.
  const [pcbColors, setPcbColors] = useState<Map<string, NationalColor> | null>(null);
  useEffect(() => {
    let active = true;
    fetchAllPcbStatus(supabase).then((map) => { if (active) setPcbColors(new Map([...map].map(([id, counts]) => [id, nationalColor(counts)]))); }, () => {});
    return () => { active = false; };
  }, [supabase, companies]);

  const load = useCallback(async () => {
    const [{ data }, summary] = await Promise.all([
      selectCompanies<Company>(supabase, 'id, nama_perusahaan, alamat, id_simpel, pilar_company_id'),
      fetchCompanyStatuses(supabase).then((result) => ({ result, error: null }), (err: unknown) => ({ result: null, error: err instanceof Error ? err.message : String(err) })),
    ]);
    return { companies: (data || []) as Company[], summary };
  }, [supabase]);

  const apply = useCallback(({ companies: list, summary }: Awaited<ReturnType<typeof load>>) => {
    setCompanies(list);
    setSummaries(summary.result);
    setSummaryError(summary.error);
    setLoading(false);
    setReloadKey((key) => key + 1);
  }, []);

  const loadCompanies = useCallback(async () => apply(await load()), [apply, load]);

  useEffect(() => {
    let active = true;
    load().then((result) => { if (active) apply(result); });
    return () => { active = false; };
  }, [load, apply]);

  // The table's order: a click on a column heading sorts by it, again to reverse. Name and edit
  // time follow the order shared by every company list (lib/company-sort.ts).
  const [sharedSort, setSharedSort] = useCompanySort();
  const withEdited = companies.some((company) => company.terakhir_diubah);
  const [columnSort, setColumnSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const sort = columnSort ?? (sharedSort === 'terbaru' && withEdited ? { key: 'diubah' as const, desc: true } : { key: 'nama' as const, desc: sharedSort === 'za' });
  const sortBy = (key: SortKey) => {
    const desc = sort.key === key ? !sort.desc : key === 'diubah' || key === 'data';
    setColumnSort({ key, desc });
    if (key === 'nama') setSharedSort(desc ? 'za' : 'az');
    if (key === 'diubah' && desc) setSharedSort('terbaru');
  };

  const [query, setQuery] = useState('');
  const [pcbFilter, setPcbFilter] = useState<NationalColor | 'all'>('all');
  const colorOf = (companyId: string): NationalColor => pcbColors?.get(companyId) ?? 'empty';
  const needle = query.trim().toLowerCase();
  const matches = (company: Company) => !needle || [company.nama_perusahaan, company.id_simpel, company.alamat].some((value) => value?.toLowerCase().includes(needle));
  const byName = (a: Company, b: Company) => a.nama_perusahaan.localeCompare(b.nama_perusahaan, 'id');
  const compare: Record<SortKey, (a: Company, b: Company) => number> = {
    nama: byName,
    status: (a, b) => PCB_ORDER.indexOf(colorOf(a.id)) - PCB_ORDER.indexOf(colorOf(b.id)),
    data: (a, b) => (summaries?.get(a.id)?.rows ?? 0) - (summaries?.get(b.id)?.rows ?? 0),
    diubah: (a, b) => (a.terakhir_diubah ?? '').localeCompare(b.terakhir_diubah ?? ''),
  };
  const searched = companies.filter(matches);
  const shown = searched
    .filter((company) => (filter === 'all' || statusOf(summaries, company.id) === filter) && (pcbFilter === 'all' || colorOf(company.id) === pcbFilter))
    .sort((a, b) => (sort.desc ? -1 : 1) * compare[sort.key](a, b) || byName(a, b));
  const FILTERS: Array<[DataFilter, string, number]> = [
    ['all', 'Semua', searched.length],
    ...STATUS_ORDER.map((status): [DataFilter, string, number] => [status, FEEDBACK_STATUSES[status].label, searched.filter((company) => statusOf(summaries, company.id) === status).length]),
  ];
  const PCB_FILTERS: Array<[NationalColor | 'all', string, number]> = [
    ['all', 'Semua', searched.length],
    ...PCB_ORDER.map((color): [NationalColor, string, number] => [color, (color === 'empty' ? EMPTY_STATUS : STATUS_COLORS[color]).label, searched.filter((company) => colorOf(company.id) === color).length]),
  ];

  const statusCompanies = useMemo(() => companies.map((company) => ({ id: company.id, name: company.nama_perusahaan })), [companies]);
  // A company of the status list opens its report page (for a pemantau account, its roadmap: the
  // report holds the forms); one without an ID SIMPEL has no report, so its row below is shown.
  const openCompany = (companyId: string) => {
    if (readOnly) { router.push(`/roadmap?company=${companyId}`); return; }
    const company = companies.find((entry) => entry.id === companyId);
    if (company?.id_simpel) { router.push(`/lapor/${encodeURIComponent(company.id_simpel)}`); return; }
    setFilter('all');
    setPcbFilter('all');
    setQuery('');
    setHighlighted(companyId);
    requestAnimationFrame(() => document.getElementById(`company-${companyId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const addCompany = async () => {
    const name = (await promptDialog({ title: 'Tambah perusahaan', label: 'Nama perusahaan', placeholder: 'mis. PT Contoh Energi', tone: 'primary', confirmLabel: 'Tambah', icon: Building2 }))?.trim();
    if (!name) return;
    const { error } = await supabase.from('companies').insert({ nama_perusahaan: name });
    if (error) { await alertDialog({ title: 'Gagal menambah perusahaan', message: error.message }); return; }
    await loadCompanies();
  };

  const opens = (company: Company) => readOnly || Boolean(company.id_simpel);
  const heading = (key: SortKey, label: string, className = '') => (
    <th scope="col" aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={`px-4 py-3 ${className}`}>
      <button type="button" onClick={() => sortBy(key)} className="inline-flex items-center gap-1 font-bold hover:text-emerald-700">
        {label}{sort.key === key ? (sort.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" />}
      </button>
    </th>
  );
  const chips = <K extends string>(label: string, options: Array<[K, string, number]>, value: K, onChange: (key: K) => void) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-32 shrink-0 text-xs font-semibold text-slate-500">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {options.map(([key, text, count]) => <button key={key} type="button" onClick={() => onChange(key)} aria-pressed={value === key} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${value === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>{text} ({formatNumber(count)})</button>)}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Administrasi</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Manajemen Perusahaan</h1>
        <p className="mt-2 text-sm text-slate-500">Kelola perusahaan pemilik data inventarisasi.</p>
      </header>
      <NationalPcbStatus supabase={supabase} companies={statusCompanies} reloadKey={reloadKey} onSelectCompany={openCompany} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Daftar perusahaan</h2>
            <p className="text-xs text-slate-500">{formatNumber(shown.length)} dari {formatNumber(companies.length)} perusahaan{readOnly ? ' · klik baris untuk membuka roadmap-nya' : ' · klik baris untuk membuka laporannya'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex w-72 max-w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 focus-within:border-emerald-600">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, ID SIMPEL, alamat…" aria-label="Cari perusahaan" className="min-w-0 flex-1 text-sm outline-none" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Hapus pencarian" className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
            </label>
            {!readOnly && <button type="button" onClick={addCompany} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> Tambah perusahaan</button>}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {pcbColors && chips('Status PCBs', PCB_FILTERS, pcbFilter, setPcbFilter)}
          {summaries && chips('Hasil pemeriksaan', FILTERS, filter, setFilter)}
        </div>
        {summaryError && <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Ringkasan isi data gagal dimuat: {summaryError}</div>}

        <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-slate-200/80">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50 text-xs text-slate-700 shadow-[0_1px_0_0_var(--color-slate-200)]">
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-14 min-w-14 bg-slate-50 px-4 py-3 font-bold">No.</th>
                {heading('nama', 'Perusahaan', 'sticky left-14 z-10 bg-slate-50')}
                <th scope="col" className="px-4 py-3 font-bold">ID SIMPEL</th>
                {heading('status', 'Status PCBs')}
                {heading('data', 'Data')}
                <th scope="col" className="px-4 py-3 font-bold">Hasil pemeriksaan</th>
                {heading('diubah', 'Diubah')}
                {!readOnly && <th scope="col" className="px-4 py-3 text-right font-bold">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="p-6 text-sm text-slate-500">Memuat…</td></tr>
                : shown.length === 0 ? <tr><td colSpan={8} className="p-6 text-sm text-slate-500">Tidak ada perusahaan pada pilihan ini.</td></tr>
                : shown.map((company, index) => {
                  const summary = summaries?.get(company.id);
                  const color = pcbColors?.get(company.id);
                  const style = color ? (color === 'empty' ? EMPTY_STATUS : STATUS_COLORS[color]) : null;
                  const detail = summary ? INVENTORY_CATEGORIES.filter((category) => summary.byCategory[category.key]).map((category) => `${category.shortLabel} ${formatNumber(summary.byCategory[category.key]!)}`).join(' · ') : '';
                  const row = highlighted === company.id ? 'bg-amber-50' : index % 2 ? 'bg-slate-50' : 'bg-white';
                  return (
                    <tr key={company.id} id={`company-${company.id}`} onClick={opens(company) ? () => openCompany(company.id) : undefined}
                      title={opens(company) ? undefined : 'Belum punya ID SIMPEL: hubungkan dulu di menu ID SIMPEL untuk membuka laporannya'}
                      className={`${row} border-b border-slate-100 align-top transition-colors last:border-0 ${opens(company) ? 'cursor-pointer hover:bg-emerald-50/60' : ''}`}>
                      <td className="sticky left-0 z-10 w-14 min-w-14 bg-inherit px-4 py-3 tabular-nums text-slate-500">{index + 1}</td>
                      <td className="sticky left-14 z-10 max-w-80 bg-inherit px-4 py-3">
                        <div className="font-semibold text-slate-900">{company.nama_perusahaan}</div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{company.alamat || 'Alamat belum diisi'}</div>
                      </td>
                      <td className="px-4 py-3">{company.id_simpel ? <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">{company.id_simpel}</span> : <span className="text-xs italic text-slate-400">belum ada</span>}</td>
                      <td className="px-4 py-3">{style ? <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style.card} ${style.text}`}><span className={`h-2 w-2 rounded-full ${style.dot}`} />{style.label}</span> : <span className="text-xs text-slate-400">–</span>}</td>
                      <td className="px-4 py-3">
                        {summary && summary.rows > 0 ? <>
                          <div className="whitespace-nowrap font-semibold text-slate-800">{formatNumber(summary.rows)} baris</div>
                          <div className="mt-0.5 text-xs text-slate-500">{detail}{summary.files ? ` · ${formatNumber(summary.files)} berkas` : ''}</div>
                        </> : <span className="text-xs text-slate-400">Belum ada data</span>}
                      </td>
                      <td className="px-4 py-3">{summary && summary.status !== 'empty' ? <SendBadge summary={summary} /> : <span className="text-xs text-slate-400">–</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{company.terakhir_diubah ? formatEdited(company.terakhir_diubah) : '–'}</td>
                      {!readOnly && <td className="px-4 py-3 text-right">
                        <button type="button" onClick={(event) => { event.stopPropagation(); setDeleting(company); }} title="Hapus perusahaan" aria-label={`Hapus ${company.nama_perusahaan}`} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                      </td>}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
      {deleting && <DeleteCompanyDialog supabase={supabase} company={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); loadCompanies(); }} />}
    </div>
  );
}
