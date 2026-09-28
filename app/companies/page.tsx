'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, Building2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { countCompanyData, deleteCompany, type CompanyData } from '@/lib/company-purge';
import { getCategoryLabel } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';

type Company = { id: string; nama_perusahaan: string; alamat?: string | null };

const formatNumber = (value: number) => value.toLocaleString('id-ID');
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
      if (storageFailures > 0) window.alert(`${company.nama_perusahaan} terhapus, tetapi ${formatNumber(storageFailures)} berkas di Storage gagal dihapus.`);
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCompanies = useCallback(async () => {
    const { data } = await supabase.from('companies').select('id, nama_perusahaan, alamat').order('nama_perusahaan');
    setCompanies(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    supabase.from('companies').select('id, nama_perusahaan, alamat').order('nama_perusahaan').then(({ data }) => {
      if (!active) return;
      setCompanies(data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [supabase]);

  const addCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await supabase.from('companies').insert({ nama_perusahaan: name.trim() });
    setName('');
    await loadCompanies();
  };

  return <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Administrasi</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Manajemen Perusahaan</h1><p className="mt-2 text-sm text-slate-500">Kelola perusahaan pemilik data inventarisasi.</p></header><form onSubmit={addCompany} className="flex max-w-xl gap-2 rounded-2xl border border-slate-200 bg-white p-4"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama perusahaan baru" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" /><button type="submit" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Tambah</button></form><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold">Daftar perusahaan</div>{loading ? <div className="p-6 text-sm text-slate-500">Memuat...</div> : companies.map((company) => <div key={company.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-0"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-900">{company.nama_perusahaan}</div><div className="text-xs text-slate-500">{company.alamat || 'Alamat belum diisi'}</div></div><button type="button" onClick={() => setDeleting(company)} aria-label={`Hapus ${company.nama_perusahaan}`} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Hapus</button></div>)}</div>{deleting && <DeleteCompanyDialog supabase={supabase} company={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); loadCompanies(); }} />}</div>;
}
