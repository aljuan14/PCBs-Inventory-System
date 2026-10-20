'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, Building2, CalendarClock, ChevronRight, ClipboardPen, FileSpreadsheet, Home, LifeBuoy, Loader2, LogOut, Repeat } from 'lucide-react';
import { useAccess } from '@/components/useAccess';
import { fetchPcbStatus, manageOpenOf } from '@/lib/company-pcb-status';
import { createClient } from '@/lib/supabase/client';

export type PortalCompany = { id: string; nama_perusahaan: string; alamat: string | null };

type Portal = {
  supabase: SupabaseClient;
  idSimpel: string;
  company: PortalCompany;
  /** Every unit sharing the ID SIMPEL; more than one means a unit is picked (?unit=). */
  companies: PortalCompany[];
  isAdmin: boolean;
  /** A page of the company's area, keeping the picked unit: href('/roadmap'), href('/formulir', { tab: 'kapasitor' }). */
  href: (path?: string, query?: Record<string, string>) => string;
  /** After a change the sidebar's counts depend on. */
  refresh: () => void;
};

const PortalContext = createContext<Portal | null>(null);

// Where a page puts its own column beside the sidebar (PortalSubnav).
const SubnavSlot = createContext<HTMLDivElement | null>(null);

/** A page's own column right beside the sidebar, staying put while the page scrolls, its content centred top to bottom (wide screens only). */
export function PortalSubnav({ children }: { children: React.ReactNode }) {
  const slot = useContext(SubnavSlot);
  if (!slot) return null;
  return createPortal(
    // Centred top to bottom; my-auto, not justify-center, so a list taller than the screen scrolls from its top.
    <div className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto px-4 py-6 lg:flex print:hidden"><div className="my-auto">{children}</div></div>,
    slot,
  );
}

export function useCompanyPortal() {
  const portal = useContext(PortalContext);
  if (!portal) throw new Error('useCompanyPortal dipakai di luar halaman perusahaan.');
  return portal;
}

/** The title of a page of the company's area. */
export function PortalHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  const { company } = useCompanyPortal();
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{company.nama_perusahaan}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </header>
  );
}

const MENU = [
  { path: '', label: 'Beranda', icon: Home },
  { path: '/formulir', label: 'Isi formulir', icon: ClipboardPen },
  { path: '/roadmap', label: 'Roadmap', icon: CalendarClock, badge: 'roadmap' as const },
  { path: '/unggah', label: 'Template & riwayat', icon: FileSpreadsheet, badge: 'unggah' as const },
  { path: '/bantuan', label: 'Bantuan', icon: LifeBuoy },
];

/** Things waiting on the company, shown on its menu: transformers needing a plan, refused uploads. */
function useBadges(supabase: SupabaseClient, companyId: string | null, key: string) {
  const [badges, setBadges] = useState<{ key: string; roadmap: number; unggah: number } | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    Promise.all([
      fetchPcbStatus(supabase, companyId).catch(() => null),
      Promise.resolve(supabase.from('unggahan_perusahaan').select('kategori, status').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50)),
    ]).then(([status, { data }]) => {
      if (!active) return;
      const roadmap = status
        ? (status.belum_uji - status.belum_uji_terjadwal) + (status.tinggi - status.tinggi_selesai - status.tinggi_terjadwal) + manageOpenOf(status) + (status.kelola_lewat ?? 0)
        : 0;
      // A form whose latest upload was refused still needs a new file.
      const latest = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ kategori: string; status: string }>) if (!latest.has(row.kategori)) latest.set(row.kategori, row.status);
      setBadges({ key, roadmap: Math.max(roadmap, 0), unggah: [...latest.values()].filter((value) => value === 'ditolak').length });
    });
    return () => { active = false; };
  }, [supabase, companyId, key]);
  return badges?.key === key ? badges : null;
}

function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => { setBusy(true); await createClient().auth.signOut(); router.replace('/login'); router.refresh(); }}
      className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} {busy ? 'Keluar…' : 'Keluar'}
    </button>
  );
}

/**
 * A company's own area (/lapor/<ID SIMPEL>/…): its sidebar (Beranda, Isi
 * formulir, Roadmap, Template & riwayat, Bantuan) around the page,
 * which reads the company from useCompanyPortal. Units sharing an ID SIMPEL
 * are picked first (?unit=), and the pick stays on every link. The admin sees
 * the same area, with a way back to the admin pages.
 */
export default function CompanyPortal({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { idSimpel: raw } = useParams<{ idSimpel: string }>();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const access = useAccess();
  const idSimpel = decodeURIComponent(raw ?? '').trim();
  const base = `/lapor/${encodeURIComponent(idSimpel)}`;
  const [loaded, setLoaded] = useState<{ key: string; list: PortalCompany[] } | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [subnavSlot, setSubnavSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from('companies').select('id, nama_perusahaan, alamat').eq('id_simpel', idSimpel).order('nama_perusahaan')
      .then(({ data }) => { if (active) setLoaded({ key: idSimpel, list: (data ?? []) as PortalCompany[] }); });
    supabase.auth.getSession().then(({ data }) => { if (active) setEmail(data.session?.user.email ?? null); });
    return () => { active = false; };
  }, [supabase, idSimpel]);

  const list = loaded?.key === idSimpel ? loaded.list : null;
  const unit = params.get('unit');
  const company = list?.length === 1 ? list[0] : list?.find((entry) => entry.id === unit) ?? null;
  const badges = useBadges(supabase, company?.id ?? null, `${company?.id}|${pathname}|${refreshKey}`);

  const href = useCallback((path = '', query: Record<string, string> = {}) => {
    const search = new URLSearchParams(query);
    if (list && list.length > 1 && company) search.set('unit', company.id);
    const text = search.toString();
    return `${base}${path}${text ? `?${text}` : ''}`;
  }, [base, list, company]);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const portal = useMemo(() => (company && list ? { supabase, idSimpel, company, companies: list, isAdmin: access?.peran === 'admin', href, refresh } : null), [supabase, idSimpel, company, list, access?.peran, href, refresh]);

  const centered = (content: React.ReactNode) => (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <div className="flex items-center gap-3">
        <Image src="/logo-klh.jpg" alt="Logo Kementerian Lingkungan Hidup" width={40} height={40} loading="eager" className="h-10 w-10 rounded-full" />
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Laporan Inventarisasi PCBs</p><p className="text-xs text-slate-500">ID SIMPEL <span className="font-mono font-semibold text-slate-700">{idSimpel}</span></p></div>
      </div>
      {content}
      <div className="max-w-48"><SignOut /></div>
    </div>
  );

  if (list === null) return centered(<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data perusahaan…</p>);
  if (list.length === 0) {
    return centered(<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">ID SIMPEL <span className="font-mono font-semibold">{idSimpel}</span> belum terdaftar di sistem inventarisasi PCBs. Hubungi Direktorat Pengelolaan B3, Kementerian Lingkungan Hidup, untuk didaftarkan.</div>);
  }
  if (!company || !portal) {
    return centered(
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <p className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-800">ID SIMPEL ini dipakai {list.length} unit/pabrik. Pilih yang akan dilaporkan:</p>
        {list.map((entry) => (
          <button key={entry.id} type="button" onClick={() => router.replace(`${pathname}?unit=${entry.id}`)} className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3 text-left last:border-0 hover:bg-slate-50">
            <Building2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-900">{entry.nama_perusahaan}</span>{entry.alamat && <span className="block truncate text-xs text-slate-500">{entry.alamat}</span>}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>
        ))}
      </div>,
    );
  }

  return (
    <PortalContext.Provider value={portal}>
      <SubnavSlot.Provider value={subnavSlot}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-[#fbfcfa] px-4 py-5 print:hidden">
          <div className="flex items-center gap-3 px-2 pb-5">
            <Image src="/logo-klh.jpg" alt="Logo Kementerian Lingkungan Hidup" width={40} height={40} loading="eager" className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0"><div className="text-sm font-bold tracking-tight text-slate-900">Laporan PCBs</div><div className="text-[10px] font-medium text-slate-500">Kementerian Lingkungan Hidup</div></div>
          </div>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="line-clamp-2 text-xs font-semibold text-slate-900" title={company.nama_perusahaan}>{company.nama_perusahaan}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">ID SIMPEL <span className="font-mono font-semibold text-slate-700">{idSimpel}</span></p>
            {list.length > 1 && <Link href={`${base}${pathname.slice(base.length)}`} className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"><Repeat className="h-3 w-3" /> Ganti unit ({list.length})</Link>}
          </div>
          <nav className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 text-sm font-medium">
            {MENU.map((item) => {
              const target = `${base}${item.path}`;
              const active = item.path === '' ? pathname === base : pathname === target || pathname.startsWith(`${target}/`);
              const count = item.badge && badges ? badges[item.badge] : 0;
              const Icon = item.icon;
              return (
                <Link key={item.label} href={href(item.path)} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {count > 0 && <span title={item.badge === 'roadmap' ? `${count} trafo perlu rencana` : `${count} unggahan ditolak`} className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white ${item.badge === 'roadmap' ? 'bg-rose-600' : 'bg-amber-500'}`}>{count}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="shrink-0 border-t border-slate-200 pt-4">
            {portal.isAdmin && (
              <Link href={`/formulir?company=${company.id}`} className="mb-2 flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><ArrowLeft className="h-3.5 w-3.5" /> Kembali ke halaman admin</Link>
            )}
            <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold text-white">{email ? email[0].toUpperCase() : '·'}</span>
              <span className="min-w-0"><span className="block truncate" title={email ?? undefined}>{email ?? ''}</span>{portal.isAdmin && <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Admin · tampilan perusahaan</span>}</span>
            </div>
            <SignOut />
          </div>
        </aside>
        <div ref={setSubnavSlot} className="contents" />
        <div key={company.id} className="min-w-0 flex-1">
          <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">{children}</div>
        </div>
      </div>
      </SubnavSlot.Provider>
    </PortalContext.Provider>
  );
}
