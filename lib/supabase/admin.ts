import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Server only (Route Handlers): the service-role client, which manages login
 * accounts and bypasses RLS. Its key (SUPABASE_SERVICE_ROLE_KEY, never
 * NEXT_PUBLIC_) must not reach the browser; no client component imports this.
 */
export function createServiceClient(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('createServiceClient hanya untuk server.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ServiceKeyMissing();
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class ServiceKeyMissing extends Error {
  constructor() {
    super('SUPABASE_SERVICE_ROLE_KEY belum diatur di server (Vercel: Settings → Environment Variables), jadi akun belum dapat dikelola dari web.');
  }
}

/** The signed-in caller's session client and user id when the account is admin, otherwise null. */
export async function requireAdmin(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data, error } = await supabase.rpc('my_access');
  if (error || (data as { peran?: string } | null)?.peran !== 'admin') return null;
  return { supabase, userId };
}
