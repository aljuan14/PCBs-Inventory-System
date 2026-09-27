'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function CompaniesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<Array<{ id: string; nama_perusahaan: string; alamat?: string | null }>>([]);
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

  return <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Administrasi</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Manajemen Perusahaan</h1><p className="mt-2 text-sm text-slate-500">Kelola perusahaan pemilik data inventarisasi.</p></header><form onSubmit={addCompany} className="flex max-w-xl gap-2 rounded-2xl border border-slate-200 bg-white p-4"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama perusahaan baru" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" /><button type="submit" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Tambah</button></form><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold">Daftar perusahaan</div>{loading ? <div className="p-6 text-sm text-slate-500">Memuat...</div> : companies.map((company) => <div key={company.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-0"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="h-4 w-4" /></div><div><div className="text-sm font-semibold text-slate-900">{company.nama_perusahaan}</div><div className="text-xs text-slate-500">{company.alamat || 'Alamat belum diisi'}</div></div></div>)}</div></div>;
}
