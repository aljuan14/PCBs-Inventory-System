'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type Peran = 'admin' | 'pemantau' | 'perusahaan';
export type Access = { peran: Peran; id_simpel: string | null };

// One request per page load; cleared on sign-in or sign-out.
let cached: Promise<Access | null> | null = null;

function loadAccess(): Promise<Access | null> {
  if (!cached) {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') cached = null; });
    // Without the function (a database before migration 20261013000011) every account was admin.
    cached = Promise.resolve(supabase.rpc('my_access')).then(({ data, error }) => (error ? { peran: 'admin', id_simpel: null } : (data as Access | null)), () => null);
  }
  return cached;
}

/**
 * The signed-in account's role (migrations 20261013000011, 20261014000001),
 * null while loading. The database enforces it; this only shapes the pages.
 */
export function useAccess(): Access | null {
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    let active = true;
    loadAccess().then((value) => { if (active) setAccess(value); });
    return () => { active = false; };
  }, []);
  return access;
}

/** True for a pemantau account: everything readable, nothing to change. */
export function useReadOnly(): boolean {
  return useAccess()?.peran === 'pemantau';
}
