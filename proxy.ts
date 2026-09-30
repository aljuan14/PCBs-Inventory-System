import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Semua halaman dan API wajib login, kecuali /login.
 * Proxy juga memperbarui token sesi Supabase di cookie sebelum halaman dirender.
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

  return response;
}

/** Bawa cookie sesi yang baru diperbarui ke response redirect / JSON. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
