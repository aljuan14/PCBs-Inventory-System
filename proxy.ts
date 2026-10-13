import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ROW_ONLY_PATHS, SUMMARY_MODE } from '@/lib/data-mode';

/**
 * Semua halaman dan API wajib login, kecuali /login.
 * Proxy juga memperbarui token sesi Supabase di cookie sebelum halaman dirender.
 * Di mode ringkasan (web), halaman dan API yang butuh baris data ditutup.
 */
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse('Supabase environment variables tidak ditemukan', { status: 500 });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims memverifikasi token, jangan diganti getSession (isi cookie bisa dipalsukan).
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  if (pathname === '/login') {
    if (loggedIn) return withCookies(NextResponse.redirect(new URL('/dashboard', request.url)), response);
    return response;
  }

  if (!loggedIn) {
    if (pathname.startsWith('/api/')) {
      return withCookies(NextResponse.json({ error: 'Silakan login terlebih dahulu' }, { status: 401 }), response);
    }
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);
    return withCookies(NextResponse.redirect(loginUrl), response);
  }

  if (SUMMARY_MODE) {
    if (pathname.startsWith('/api/')) {
      return withCookies(NextResponse.json({ error: 'Web hanya menampilkan ringkasan; olah data di aplikasi offline.' }, { status: 403 }), response);
    }
    if (ROW_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      return withCookies(NextResponse.redirect(new URL('/dashboard', request.url)), response);
    }
  }

  // Peran akun (migrasi 20261013000011). Akun perusahaan hanya membuka laporannya sendiri
  // (/lapor/<ID SIMPEL>) dan API formulir; akun tanpa peran tidak membuka apa pun.
  // Batas datanya dijaga di database (RLS); ini hanya mengarahkan halaman.
  const { data: access, error: accessError } = await supabase.rpc('my_access');
  // Belum ada fungsinya (database web sebelum migrasi itu dijalankan): perilaku lama. Aman,
  // karena pembatasan datanya datang dari migrasi yang sama.
  if (accessError) return response;
  const role = access as { peran: 'admin' | 'perusahaan'; id_simpel: string | null } | null;
  if (role?.peran === 'admin') return response;
  if (role?.peran === 'perusahaan' && role.id_simpel) {
    const own = `/lapor/${encodeURIComponent(role.id_simpel)}`;
    if (pathname === own || pathname === '/api/formulir') return response;
    if (pathname.startsWith('/api/')) {
      return withCookies(NextResponse.json({ error: 'Akun perusahaan tidak dapat mengakses fitur ini.' }, { status: 403 }), response);
    }
    return withCookies(NextResponse.redirect(new URL(own, request.url)), response);
  }
  if (pathname.startsWith('/api/')) {
    return withCookies(NextResponse.json({ error: 'Akun ini belum diberi peran. Hubungi admin.' }, { status: 403 }), response);
  }
  return withCookies(new NextResponse('Akun ini belum diberi peran. Hubungi admin Direktorat Pengelolaan B3.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } }), response);
}

/** Bawa cookie sesi yang baru diperbarui ke response redirect / JSON. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
