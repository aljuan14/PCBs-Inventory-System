'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Building2, ChevronRight, Loader2 } from 'lucide-react';
import CompanyReport from '@/components/CompanyReport';
import { createClient } from '@/lib/supabase/client';

type Company = { id: string; nama_perusahaan: string; alamat: string | null };

/**
 * A company's own report page, reached by its ID SIMPEL: the way in from
 * the PILAR / SIMPEL apps, which know the ID of the company logged in there.
 * No admin menu (components/Navbar.tsx hides it here). Branches or plants
 * sharing one ID SIMPEL are picked first (?unit=<company id>).
 */
function LaporContent() {
  const supabase = useMemo(() => createClient(), []);
  const { idSimpel } = useParams<{ idSimpel: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const [companies, setCompanies] = useState<{ key: string; list: Company[] } | null>(null);
  const id = decodeURIComponent(idSimpel ?? '').trim();

  useEffect(() => {
    let active = true;
    supabase.from('companies').select('id, nama_perusahaan, alamat').eq('id_simpel', id).order('nama_perusahaan')
      .then(({ data }) => { if (active) setCompanies({ key: id, list: (data ?? []) as Company[] }); });
    return () => { active = false; };
  }, [supabase, id]);

  const list = companies?.key === id ? companies.list : null;
  const picked = list?.length === 1 ? list[0] : list?.find((company) => company.id === params.get('unit')) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header className="flex flex-wrap items-center gap-4">
        <Image src="/logo-klh.jpg" alt="Logo Kementerian Lingkungan Hidup" width={44} height={44} loading="eager" className="h-11 w-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Laporan Inventarisasi PCBs</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">{picked?.nama_perusahaan ?? 'Perusahaan'}</h1>
          <p className="text-xs text-slate-500">ID SIMPEL <span className="font-mono font-semibold text-slate-700">{id}</span>{list && list.length > 1 && picked && <> · <button type="button" onClick={() => router.replace(`/lapor/${encodeURIComponent(id)}`)} className="font-semibold text-emerald-700 underline">ganti unit</button></>}</p>
        </div>
      </header>

      {list === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data perusahaan…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          ID SIMPEL <span className="font-mono font-semibold">{id}</span> belum terdaftar di sistem inventarisasi PCBs. Hubungi Direktorat Pengelolaan B3, Kementerian Lingkungan Hidup, untuk didaftarkan.
        </div>
      ) : !picked ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <p className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-800">ID SIMPEL ini dipakai {list.length} unit/pabrik. Pilih yang akan dilaporkan:</p>
          {list.map((company) => (
            <button key={company.id} type="button" onClick={() => router.replace(`/lapor/${encodeURIComponent(id)}?unit=${company.id}`)} className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3 text-left last:border-0 hover:bg-slate-50">
              <Building2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-900">{company.nama_perusahaan}</span>{company.alamat && <span className="block truncate text-xs text-slate-500">{company.alamat}</span>}</span>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </button>
          ))}
        </div>
      ) : (
        <CompanyReport key={picked.id} supabase={supabase} companyId={picked.id} />
      )}
    </div>
  );
}

export default function LaporPage() {
  return <Suspense fallback={null}><LaporContent /></Suspense>;
}
