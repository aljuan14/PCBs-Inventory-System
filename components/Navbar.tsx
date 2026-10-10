'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, ClipboardCheck, Droplets, Grid2X2, History, Layers3, LogOut, UploadCloud, Zap, ZapOff } from 'lucide-react';
import { INVENTORY_CATEGORIES } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';

const categoryIcons = {
  transformator_digunakan: Zap,
  transformator_tidak_digunakan: ZapOff,
  kapasitor: Layers3,
  minyak_dielektrik: Droplets,
};

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (pathname === '/login') return;
    createClient().auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, [pathname]);

  if (pathname === '/login') return null;

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    setSigningOut(false);
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-64 print:hidden shrink-0 flex-col border-r border-slate-200 bg-[#fbfcfa] px-4 py-5">
      <Link href="/dashboard" className="flex items-center gap-3 px-2 pb-7">
        <Image src="/logo-klh.jpg" alt="Logo Kementerian Lingkungan Hidup" width={40} height={40} loading="eager" className="h-10 w-10 shrink-0 rounded-full" />
        <div><div className="text-sm font-bold tracking-tight text-slate-900">PCBs inventory</div><div className="text-[10px] font-medium text-slate-500">Direktorat B3</div></div>
      </Link>
      <nav className="space-y-1 text-sm font-medium">
        <Link href="/dashboard" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${pathname === '/dashboard' ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><Grid2X2 className="h-4 w-4" /> Dashboard</Link>
        <div className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Inventarisasi</div>
        {INVENTORY_CATEGORIES.map((category) => {
          const Icon = categoryIcons[category.key];
          const href = `/dashboard/${category.key.replaceAll('_', '-')}`;
          return <Link key={category.key} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isActive(href) ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" /> {category.shortLabel}</Link>;
        })}
        <div className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Lainnya</div>
        <Link href="/upload" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isActive('/upload') && !isActive('/upload/riwayat') ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><UploadCloud className="h-4 w-4" /> Upload data</Link>
        <Link href="/upload/riwayat" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isActive('/upload/riwayat') ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><History className="h-4 w-4" /> Riwayat upload</Link>
        <Link href="/companies" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isActive('/companies') ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><Building2 className="h-4 w-4" /> Perusahaan</Link>
        <Link href="/kualitas-data" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isActive('/kualitas-data') ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><ClipboardCheck className="h-4 w-4" /> Kualitas data</Link>
      </nav>
      <div className="mt-auto border-t border-slate-200 pt-4">
        <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold text-white">{email ? email[0].toUpperCase() : 'AD'}</span>
          <span className="min-w-0 truncate" title={email ?? undefined}>{email ?? 'Direktorat B3'}</span>
        </div>
        <button type="button" onClick={signOut} disabled={signingOut} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"><LogOut className="h-4 w-4" /> {signingOut ? 'Keluar...' : 'Keluar'}</button>
      </div>
    </aside>
  );
}
