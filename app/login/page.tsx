'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
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
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-[360px]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white"><ShieldCheck className="h-5 w-5" /></div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">Masuk ke PCBs inventory</h1>
          <p className="mt-1.5 text-sm text-slate-500">Direktorat B3</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-400">Belum punya akun atau lupa password? Hubungi admin.</p>
      </div>
    </div>
  );
}
