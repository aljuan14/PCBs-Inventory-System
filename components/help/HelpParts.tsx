'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BookOpen, ChevronDown, Lightbulb, Plus, Search, X, type LucideIcon } from 'lucide-react';

/**
 * The parts of a help page (the company's Bantuan, the admin's Panduan): its
 * sections, tips, the searchable questions and the contents list.
 */

const HIGHLIGHT = ['ring-4', 'ring-emerald-500/40'];

/** Where an answer leads: a page with its query, made into an address by the page's `resolve`. */
export type Goto = { label: string; path: string; query?: Record<string, string> };
export type Faq = { id: string; q: string; a: string; go?: Goto };
export type FaqGroup = { title: string; items: Faq[] };
export type HelpPart = { id: string; title: string; icon: LucideIcon };

/** One part of the guide; outlined for a moment when opened by a link to it (#id, e.g. from the status card). */
export function HelpSection({ id, title, description, icon: Icon = BookOpen, children }: { id: string; title: string; description?: string; icon?: LucideIcon; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.location.hash !== `#${id}`) return;
    // The page renders after the company loads, too late for the browser's own jump.
    element.scrollIntoView({ block: 'start' });
    element.classList.add(...HIGHLIGHT);
    const timer = window.setTimeout(() => element.classList.remove(...HIGHLIGHT), 2500);
    return () => window.clearTimeout(timer);
  }, [id]);
  return (
    <section ref={ref} id={id} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white transition-shadow duration-700">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-4.5 w-4.5" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </header>
      <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

/** A tip or caution set apart from the text. */
export function Note({ tone = 'tip', children }: { tone?: 'tip' | 'warn'; children: React.ReactNode }) {
  const Icon = tone === 'tip' ? Lightbulb : AlertTriangle;
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${tone === 'tip' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span>
    </p>
  );
}

/** The questions, each opening its answer; the search keeps the matching ones, opened. `resolve` turns an answer's link into an address. */
export function FaqList({ groups: allGroups, resolve, placeholder }: { groups: FaqGroup[]; resolve: (go: Goto) => string; placeholder: string }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // #faq-<id> opens that answer (a link from elsewhere in the app).
  useEffect(() => {
    const id = window.location.hash.startsWith('#faq-') ? window.location.hash.slice(5) : null;
    if (!id) return;
    const timer = window.setTimeout(() => {
      setOpen(new Set([id]));
      document.getElementById(`faq-${id}`)?.scrollIntoView({ block: 'center' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = allGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => words.every((word) => `${item.q} ${item.a}`.toLowerCase().includes(word))) }))
    .filter((group) => group.items.length > 0);
  const searching = words.length > 0;
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      <label className="flex items-center gap-2 rounded-xl border border-transparent bg-slate-100 px-3 py-2.5 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-600/10">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Hapus pencarian" className="rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-4 w-4" /></button>}
      </label>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Tidak ada pertanyaan yang cocok dengan &ldquo;{query}&rdquo;. Coba kata lain, atau hubungi admin di bagian bawah halaman.</p>
      ) : groups.map((group) => (
        <div key={group.title}>
          <h3 className="mb-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
          <ul className="space-y-3">
            {group.items.map((item) => {
              const expanded = searching || open.has(item.id);
              return (
                <li key={item.id} id={`faq-${item.id}`} className={`scroll-mt-4 overflow-hidden rounded-2xl border bg-white transition-shadow duration-300 ${expanded ? 'border-emerald-200 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]' : 'border-slate-200 hover:border-slate-300'}`}>
                  <button type="button" onClick={() => toggle(item.id)} aria-expanded={expanded} className={`flex w-full items-center gap-4 px-6 py-4 text-left ${expanded ? 'bg-gradient-to-b from-slate-50 to-white' : ''}`}>
                    <span className={`min-w-0 flex-1 text-[15px] font-semibold transition-colors ${expanded ? 'text-emerald-700' : 'text-slate-900'}`}>{item.q}</span>
                    {expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-emerald-700" /> : <Plus className="h-5 w-5 shrink-0 text-slate-800" strokeWidth={2.5} />}
                  </button>
                  {/* Opens smoothly: the row grows from 0fr to 1fr. */}
                  <div inert={!expanded} className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      <div className="space-y-3 px-6 pb-5 text-sm leading-7 text-slate-500">
                        <p>{item.a}</p>
                        {item.go && <Link href={resolve(item.go)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">{item.go.label} →</Link>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}


/** The contents, one pill per part, the part being read in green. */
export function Contents({ parts }: { parts: HelpPart[] }) {
  const [current, setCurrent] = useState(parts[0].id);
  useEffect(() => {
    // The last part whose top has passed the upper third of the screen.
    const update = () => {
      let found = parts[0].id;
      for (const part of parts) {
        const element = document.getElementById(part.id);
        if (element && element.getBoundingClientRect().top <= window.innerHeight / 3) found = part.id;
      }
      // At the bottom, the last part counts even when short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) found = parts[parts.length - 1].id;
      setCurrent(found);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [parts]);
  return (
    <nav aria-label="Daftar isi">
      <ul className="flex flex-col items-start gap-2">
        {parts.map((part) => {
          const active = part.id === current;
          return (
            <li key={part.id}>
              <a href={`#${part.id}`} aria-current={active ? 'location' : undefined}
                onClick={(event) => { event.preventDefault(); document.getElementById(part.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${part.id}`); }}
                className={`inline-flex origin-left items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition duration-200 ease-out hover:scale-105 hover:shadow-md ${active ? 'border-emerald-700 bg-emerald-700 font-semibold text-white shadow-md' : 'border-slate-200 bg-white font-medium text-slate-600 shadow-sm hover:text-slate-900'}`}>
                <part.icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} /> {part.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

