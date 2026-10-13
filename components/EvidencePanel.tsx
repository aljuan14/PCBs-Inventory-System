'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, Loader2 } from 'lucide-react';
import { EVIDENCE_ITEMS, isLink } from '@/lib/evidence';
import type { InventoryCategory } from '@/lib/inventory';
import { createClient } from '@/lib/supabase/client';

type Saved = { tautan: Array<{ label: string; tautan: string | null }>; created_at: string };

const fmtDate = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The "Tabel Bukti Dukung" of a form 1.x: one link per documentation item,
 * filled in from the last save; each save keeps the earlier links as history.
 */
export default function EvidencePanel({ companyId, category }: { companyId: string; category: InventoryCategory }) {
  const supabase = useMemo(() => createClient(), []);
  const items = EVIDENCE_ITEMS[category];
  const [links, setLinks] = useState<string[]>(() => items.map(() => ''));
  const [lastSaved, setLastSaved] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from('bukti_dukung').select('tautan, created_at').eq('company_id', companyId).eq('formulir', category).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const saved = data as Saved | null;
        // Matched by label, so a reordered list in a later version keeps its links.
        if (saved) setLinks(items.map((item) => saved.tautan.find((entry) => entry.label === item.label)?.tautan ?? ''));
        setLastSaved(saved?.created_at ?? null);
      });
    return () => { active = false; };
  }, [supabase, companyId, category, items]);

  const invalid = links.map((link) => link.trim() !== '' && !isLink(link));
  const filled = links.filter((link) => isLink(link)).length;

  const save = async () => {
    if (invalid.some(Boolean)) return setError('Ada tautan yang tidak valid. Tautan harus diawali https://');
    setSaving(true);
    setError(null);
    const { data, error: saveError } = await supabase.from('bukti_dukung').insert({
      company_id: companyId,
      formulir: category,
      tautan: items.map((item, index) => ({ label: item.label, tautan: links[index].trim() || null })),
    }).select('created_at').single();
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setLastSaved((data as { created_at: string }).created_at);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Bukti dukung</h3>
            <p className="text-xs text-slate-500">Tautan Google Drive untuk dokumentasi formulir ini, sesuai tabel bukti dukung di template. Pastikan tautannya bisa dibuka oleh KLH.</p>
            <p className="mt-1 text-xs text-slate-500">{lastSaved === undefined ? 'Memuat…' : lastSaved ? `Terakhir disimpan ${fmtDate(lastSaved)}.` : 'Belum pernah diisi.'} {filled}/{items.length} terisi.</p>
          </div>
        </div>
      </div>
      <ol className="mt-4 space-y-2.5">
        {items.map((item, index) => {
          const heading = items[index - 1]?.group !== item.group ? item.group : null;
          return (
            <li key={item.label}>
              {heading && heading.startsWith('A') && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{heading}</p>}
              <label className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
                <span className="text-xs text-slate-700">{item.group.startsWith('A') ? `${index + 1}. ` : `${item.group}. `}{item.label}</span>
                <span className={`flex items-center rounded-lg border bg-white focus-within:border-emerald-600 ${invalid[index] ? 'border-rose-300' : 'border-slate-200'}`}>
                  <input value={links[index]} onChange={(event) => setLinks((current) => current.map((link, at) => (at === index ? event.target.value : link)))} placeholder="https://drive.google.com/…" className="min-w-0 flex-1 rounded-lg px-3 py-1.5 text-xs outline-none" />
                  {isLink(links[index]) && <a href={links[index].trim()} target="_blank" rel="noreferrer" aria-label="Buka tautan" className="px-2 text-slate-400 hover:text-emerald-700"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      {error && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
      <button type="button" onClick={save} disabled={saving || lastSaved === undefined} className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan bukti dukung
      </button>
    </div>
  );
}
