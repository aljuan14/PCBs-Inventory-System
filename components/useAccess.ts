'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type Peran = 'admin' | 'pemantau' | 'perusahaan';
export type Access = { peran: Peran; id_simpel: string | null };

// One request per signed-in account; read again on sign-in or sign-out.
let cached: Promise<Access | null> | null = null;
const reloaders = new Set<() => void>();
let watching = false;

function watchAuth() {
  if (watching) return;
  watching = true;
  // The menu is already mounted on the login page (signed out, no role) and stays
  // mounted after signing in, so every mounted reader loads the role again.
  createClient().auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
    cached = null;
    // Not inside the callback: Supabase calls made there wait on the auth lock.
    setTimeout(() => reloaders.forEach((reload) => reload()), 0);
  });
}

function loadAccess(): Promise<Access | null> {
  watchAuth();
  if (!cached) {
    // Not readable: no role. The proxy refuses the pages then, and the menu shows only what any account may open.
    cached = Promise.resolve(createClient().rpc('my_access')).then(({ data, error }) => (error ? null : (data as Access | null)), () => null);
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
    const load = () => { loadAccess().then((value) => { if (active) setAccess(value); }); };
    load();
    reloaders.add(load);
    return () => { active = false; reloaders.delete(load); };
  }, []);
  return access;
}

/** True for a pemantau account: everything readable, nothing to change. */
export function useReadOnly(): boolean {
  return useAccess()?.peran === 'pemantau';
}
