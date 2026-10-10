'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Hanya terima path internal, supaya ?next= tidak bisa dipakai untuk redirect ke situs lain. */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError(signInError.message === 'Invalid login credentials' ? 'Email atau password salah.' : signInError.message);
      setLoading(false);
      return;
    }
    router.replace(nextPath());
    router.refresh();
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f4f5f2]">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="flex flex-col items-center text-center">
            <Image src="/logo-klh.jpg" alt="Logo Kementerian Lingkungan Hidup" width={72} height={72} loading="eager" className="h-[72px] w-[72px] rounded-full shadow-sm ring-4 ring-white" />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700"><span className="block sm:inline">Kementerian Lingkungan Hidup</span><span className="hidden sm:inline"> · </span><span className="block sm:inline">Direktorat B3</span></p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Sistem Inventarisasi PCBs</h1>
            <p className="mt-1.5 text-sm text-slate-500">Inventarisasi <span className="italic">Polychlorinated Biphenyls</span> nasional</p>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* The logo's three colours as a thin band. */}
            <div aria-hidden className="flex h-1">
              <span className="flex-[3] bg-[#005953]" />
              <span className="flex-[2] bg-[#147df0]" />
              <span className="flex-1 bg-[#f97810]" />
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-7">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Masuk</h2>
                <p className="mt-0.5 text-xs text-slate-500">Gunakan akun yang diberikan admin.</p>
              </div>

              <div>
                <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
                <div className="relative mt-1.5">
                  <Mail aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="nama@instansi.go.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                <div className="relative mt-1.5">
                  <Lock aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>
            <p className="border-t border-slate-100 bg-slate-50/70 px-7 py-3 text-center text-xs text-slate-500">Belum punya akun atau lupa password? Hubungi admin.</p>
          </div>
        </div>
      </div>
      <footer className="px-4 pb-6 text-center text-[11px] text-slate-400">© {new Date().getFullYear()} Kementerian Lingkungan Hidup · Direktorat B3</footer>
    </div>
  );
}
