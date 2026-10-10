'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Info } from 'lucide-react';

/**
 * On the web (summary mode): when the figures were sent from the offline
 * app (summary_meta, written by "npm run web:publish").
 */
export default function SummaryStamp({ supabase }: { supabase: SupabaseClient }) {
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.from('summary_meta').select('built_at').maybeSingle().then(({ data }) => {
      if (!cancelled && data) setBuiltAt(data.built_at as string);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Web ini menampilkan ringkasan data inventarisasi
        {builtAt ? <> per <span className="font-semibold">{new Date(builtAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</span></> : ''}.
        {' '}Data lengkap, tabel, dan pengolahan ada di aplikasi offline.
      </span>
    </div>
  );
}
