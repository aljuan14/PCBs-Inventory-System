'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, CalendarClock, Fingerprint, ClipboardCheck, ClipboardPen, Droplets, Grid2X2, History, Layers3, LogOut, UploadCloud, Zap, ZapOff } from 'lucide-react';
import { INVENTORY_CATEGORIES } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';
import { SUMMARY_MODE } from '@/lib/data-mode';

const categoryIcons = {
  transformator_digunakan: Zap,
  transformator_tidak_digunakan: ZapOff,
  kapasitor: Layers3,
  minyak_dielektrik: Droplets,
};

function NavLink({ href, icon: Icon, label, active }: { href: string; icon: typeof Grid2X2; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-700' : 'text-slate-400'}`} /> {label}
    </Link>
  );
}

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

  // The login page has its own layout, and a company's report (/lapor) is shown without the admin menu.
  if (pathname === '/login' || pathname.startsWith('/lapor/')) return null;

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    setSigningOut(false);
    router.replace('/login');
    router.refresh();
  }

  // Menus by what they are for. Reporting, incoming data and administration
  // work on the rows: not on the web (summary mode).
  const groups: Array<{ title: string; rowsOnly?: boolean; items: Array<{ href: string; label: string; icon: typeof Grid2X2; active?: boolean }> }> = [
    { title: 'Inventarisasi', items: INVENTORY_CATEGORIES.map((category) => ({ href: `/dashboard/${category.key.replaceAll('_', '-')}`, label: category.shortLabel, icon: categoryIcons[category.key] })) },
    { title: 'Pelaporan', rowsOnly: true, items: [
      { href: '/formulir', label: 'Isi formulir', icon: ClipboardPen },
      { href: '/roadmap', label: 'Roadmap', icon: CalendarClock },
    ] },
    { title: 'Data masuk', rowsOnly: true, items: [
      { href: '/upload', label: 'Upload data', icon: UploadCloud, active: isActive('/upload') && !isActive('/upload/riwayat') },
      { href: '/upload/riwayat', label: 'Riwayat upload', icon: History },
      { href: '/kualitas-data', label: 'Kualitas data', icon: ClipboardCheck },
    ] },
    { title: 'Administrasi', rowsOnly: true, items: [
      { href: '/companies', label: 'Perusahaan', icon: Building2 },
      { href: '/id-simpel', label: 'ID SIMPEL', icon: Fingerprint },
    ] },
  ];

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-64 print:hidden shrink-0 flex-col border-r border-slate-200 bg-[#fbfcfa] px-4 py-5">
      <Link href="/dashboard" className="flex items-center gap-3 px-2 pb-7">
        <Image src="/logo-klh.jpg" alt="Logo Kementerian Lingkungan Hidup" width={40} height={40} loading="eager" className="h-10 w-10 shrink-0 rounded-full" />
        <div><div className="text-sm font-bold tracking-tight text-slate-900">PCBs inventory</div><div className="text-[10px] font-medium text-slate-500">Direktorat B3</div></div>
      </Link>
      <nav className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4 text-sm font-medium">
        <NavLink href="/dashboard" icon={Grid2X2} label="Dashboard" active={pathname === '/dashboard'} />
        {groups.filter((group) => !group.rowsOnly || !SUMMARY_MODE).map((group) => (
          <div key={group.title} className="mt-5">
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.title}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={item.active ?? isActive(item.href)} />)}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-slate-200 pt-4">
        <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold text-white">{email ? email[0].toUpperCase() : 'AD'}</span>
          <span className="min-w-0 truncate" title={email ?? undefined}>{email ?? 'Direktorat B3'}</span>
        </div>
        <button type="button" onClick={signOut} disabled={signingOut} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"><LogOut className="h-4 w-4" /> {signingOut ? 'Keluar...' : 'Keluar'}</button>
      </div>
    </aside>
  );
}
