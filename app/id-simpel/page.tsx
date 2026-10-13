'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckCheck, Info, Link2, Link2Off, Loader2, Search, X } from 'lucide-react';
import { buildIndex, exactMatch, findCandidates, searchRecords, type Candidate, type SimpelCompany, type SimpelIndex } from '@/lib/simpel-match';
import { createClient } from '@/lib/supabase/client';

type Company = { id: string; nama_perusahaan: string; pilar_company_id: string | null; id_simpel: string | null };
type Status = 'linked' | 'no_id' | 'exact' | 'candidates' | 'none';
type Row = { company: Company; status: Status; linked: SimpelCompany | null; exact: Candidate | null; candidates: Candidate[] };

const PAGE = 1000;
const SHOWN = 50;
const fmt = (value: number) => value.toLocaleString('id-ID');

const STATUSES: Record<Status, { label: string; badge: string; help: string }> = {
  linked: { label: 'Terhubung', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', help: 'Sudah dijodohkan dengan catatan PILAR yang punya ID SIMPEL.' },
  no_id: { label: 'Tanpa ID SIMPEL', badge: 'border-amber-200 bg-amber-50 text-amber-800', help: 'Sudah dijodohkan, tetapi catatan PILAR-nya belum punya ID SIMPEL. Perusahaan perlu terdaftar di SIMPEL.' },
  exact: { label: 'Cocok persis', badge: 'border-sky-200 bg-sky-50 text-sky-800', help: 'Tepat satu catatan PILAR bernama sama. Tinggal dikonfirmasi.' },
  candidates: { label: 'Perlu dipilih', badge: 'border-slate-300 bg-white text-slate-700', help: 'Ada beberapa catatan PILAR yang mirip. Pilih yang benar.' },
  none: { label: 'Tidak ditemukan', badge: 'border-rose-200 bg-rose-50 text-rose-800', help: 'Tidak ada nama yang mirip. Cari dengan kata lain, NPWP, atau NIB; bila tetap tidak ada, perusahaan belum terdaftar di PILAR.' },
};
type CompanyFilter = 'all' | 'open' | Status;
const COMPANY_FILTERS: Array<[CompanyFilter, string]> = [
  ['all', 'Semua'], ['open', 'Belum terhubung'], ['candidates', 'Perlu dipilih'], ['none', 'Tidak ditemukan'], ['exact', 'Cocok persis'], ['linked', 'Terhubung'], ['no_id', 'Tanpa ID SIMPEL'],
];
type PilarFilter = 'all' | 'with_id' | 'without_id' | 'linked';

/** An ID SIMPEL is a number; the PILAR export has a few that are not (a person's name). */
const oddId = (id: string | null) => id !== null && !/^\d+$/.test(id);

function IdBadge({ id }: { id: string | null }) {
  if (!id) return <span className="text-xs text-slate-400">–</span>;
  return <span title={oddId(id) ? 'ID SIMPEL ini tidak berupa angka: periksa di PILAR' : undefined} className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${oddId(id) ? 'border border-amber-300 bg-amber-50 text-amber-900' : 'bg-slate-900 text-white'}`}>{id}{oddId(id) && ' ⚠'}</span>;
}

async function fetchRecords(supabase: SupabaseClient): Promise<SimpelCompany[]> {
  const records: SimpelCompany[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('simpel_companies').select('id, id_simpel, nama, npwp, nib, alamat, bidang_usaha, id_perusahaan_induk').order('nama').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    records.push(...(data ?? []) as SimpelCompany[]);
    if (!data || data.length < PAGE) return records;
  }
}

function rowOf(index: SimpelIndex, company: Company): Row {
  if (company.pilar_company_id) {
    const linked = index.byId.get(company.pilar_company_id) ?? null;
    return { company, status: company.id_simpel ? 'linked' : 'no_id', linked, exact: null, candidates: [] };
  }
  const exact = exactMatch(index, company.nama_perusahaan);
  const candidates = findCandidates(index, company.nama_perusahaan, 8);
  return { company, status: exact ? 'exact' : candidates.length ? 'candidates' : 'none', linked: null, exact, candidates };
}

/** Choosing the PILAR record of one company: its candidates, or a search over the whole list. */
function PickDialog({ index, row, busy, onPick, onClose }: { index: SimpelIndex; row: Row; busy: boolean; onPick: (entry: Candidate) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  // A linked company (Ubah) has no candidates of its own yet: the names like it.
  const candidates = row.candidates.length ? row.candidates : findCandidates(index, row.company.nama_perusahaan, 8);
  const results = query.trim().length >= 2 ? searchRecords(index, query, 30) : row.exact ? [row.exact, ...candidates.filter((entry) => entry.record.id !== row.exact!.record.id)] : candidates;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center" onClick={busy ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="pick-title" className="w-full max-w-4xl rounded-2xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pilih catatan PILAR untuk</p>
            <h2 id="pick-title" className="text-base font-semibold text-slate-900">{row.company.nama_perusahaan}</h2>
            <p className="mt-1 text-xs text-slate-500">Pilih = perusahaan ini sama dengan catatan PILAR itu, dan ID SIMPEL-nya ikut tersimpan.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-emerald-600">
            <Search className="h-4 w-4 text-slate-400" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari di daftar PILAR: nama, NPWP, NIB, atau ID SIMPEL" className="min-w-0 flex-1 text-sm outline-none" />
          </label>
          <p className="mt-1.5 text-[11px] text-slate-500">{query.trim().length >= 2 ? `${fmt(results.length)} hasil pencarian` : `${fmt(results.length)} kandidat dengan nama mirip, paling mirip di atas`}</p>
        </div>
        <div className="max-h-[60vh] overflow-auto border-t border-slate-200">
          {results.length === 0 ? <p className="p-5 text-sm text-slate-500">Tidak ada yang cocok. Coba kata lain, NPWP, atau NIB.</p> : (
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2.5">Nama di PILAR</th><th className="px-3 py-2.5">ID SIMPEL</th><th className="px-3 py-2.5">NPWP / NIB</th><th className="px-3 py-2.5">Alamat</th><th className="px-3 py-2.5 text-right">Kemiripan</th><th className="w-20 px-3 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((entry) => (
                  <tr key={entry.record.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-900">{entry.record.nama}</span>
                      {entry.parent && <span className="block text-[11px] text-slate-500">Unit dari {entry.parent.nama}{!entry.record.id_simpel && entry.parent.id_simpel ? ' (ID SIMPEL dari induk)' : ''}</span>}
                    </td>
                    <td className="px-3 py-2.5"><IdBadge id={entry.idSimpel} /></td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">{entry.record.npwp ?? '–'}<span className="block text-slate-400">{entry.record.nib ?? ''}</span></td>
                    <td className="max-w-60 px-3 py-2.5 text-slate-500"><span className="line-clamp-2" title={entry.record.alamat ?? ''}>{entry.record.alamat ?? '–'}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{entry.score > 0 && entry.score <= 1 && query.trim().length < 2 ? `${Math.round(entry.score * 100)}%` : '–'}</td>
                    <td className="px-3 py-2.5 text-right"><button type="button" disabled={busy} onClick={() => onPick(entry)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"><Link2 className="h-3.5 w-3.5" /> Pilih</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Chips<K extends string>({ options, value, onChange }: { options: Array<[K, string, number]>; value: K; onChange: (key: K) => void }) {
  return (
    <div role="group" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {options.map(([key, label, count]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${value === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>{label} ({fmt(count)})</button>
      ))}
    </div>
  );
}

/**
 * ID SIMPEL: each company of the inventory is matched to its record in the
 * PILAR company list (CSV export, loaded with `npm run simpel:load`), whose
 * ID SIMPEL opens the company's report (/lapor/<ID SIMPEL>) and, later, its
 * login from PILAR / SIMPEL. Tab 1: the inventory's companies and their
 * status, a record picked in a dialog. Tab 2: the PILAR list itself.
 */
export default function IdSimpelPage() {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [index, setIndex] = useState<SimpelIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'companies' | 'pilar'>('companies');
  const [filter, setFilter] = useState<CompanyFilter>('open');
  const [query, setQuery] = useState('');
  const [pilarFilter, setPilarFilter] = useState<PilarFilter>('all');
  const [pilarQuery, setPilarQuery] = useState('');
  const [pilarLimit, setPilarLimit] = useState(SHOWN);
  const [picking, setPicking] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCompanies = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('companies').select('id, nama_perusahaan, pilar_company_id, id_simpel').order('nama_perusahaan');
    if (loadError) throw new Error(loadError.message);
    return (data ?? []) as Company[];
  }, [supabase]);

  useEffect(() => {
    let active = true;
    Promise.all([loadCompanies(), fetchRecords(supabase)])
      .then(([list, records]) => { if (!active) return; setCompanies(list); setIndex(buildIndex(records)); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [supabase, loadCompanies]);

  const rows = useMemo(() => (companies && index ? companies.map((company) => rowOf(index, company)) : []), [companies, index]);
  const counts = useMemo(() => {
    const result: Record<CompanyFilter, number> = { all: rows.length, open: 0, linked: 0, no_id: 0, exact: 0, candidates: 0, none: 0 };
    for (const row of rows) { result[row.status]++; if (row.status !== 'linked' && row.status !== 'no_id') result.open++; }
    return result;
  }, [rows]);
  // Which inventory company each PILAR record is matched to.
  const linkedTo = useMemo(() => new Map((companies ?? []).filter((company) => company.pilar_company_id).map((company) => [company.pilar_company_id!, company.nama_perusahaan])), [companies]);

  const save = async (changes: Array<{ id: string; pilar_company_id: string | null; id_simpel: string | null }>) => {
    setBusy(true);
    setError(null);
    try {
      for (const { id, ...values } of changes) {
        const { error: saveError } = await supabase.from('companies').update(values).eq('id', id);
        if (saveError) throw new Error(saveError.message);
      }
      setCompanies(await loadCompanies());
      setPicking(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const link = (company: Company, entry: Candidate) => save([{ id: company.id, pilar_company_id: entry.record.id, id_simpel: entry.idSimpel }]);
  const unlink = (company: Company) => { if (window.confirm(`Lepas hubungan ${company.nama_perusahaan} dengan PILAR?`)) save([{ id: company.id, pilar_company_id: null, id_simpel: null }]); };
  const linkAllExact = () => {
    const exact = rows.filter((row) => row.status === 'exact' && row.exact);
    if (!window.confirm(`Hubungkan ${fmt(exact.length)} perusahaan yang namanya cocok persis dengan satu ID SIMPEL? Periksa dulu daftarnya di pilihan "Cocok persis".`)) return;
    save(exact.map((row) => ({ id: row.company.id, pilar_company_id: row.exact!.record.id, id_simpel: row.exact!.idSimpel })));
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shownRows = rows.filter((row) => (filter === 'all' || (filter === 'open' ? row.status !== 'linked' && row.status !== 'no_id' : row.status === filter))
    && words.every((word) => row.company.nama_perusahaan.toLowerCase().includes(word) || row.company.id_simpel === word));

  const pilarRows = useMemo(() => {
    if (!index) return [];
    const term = pilarQuery.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return index.records.filter((record) => {
      if (pilarFilter === 'with_id' && !record.id_simpel) return false;
      if (pilarFilter === 'without_id' && record.id_simpel) return false;
      if (pilarFilter === 'linked' && !linkedTo.has(record.id)) return false;
      if (!term) return true;
      return term.split(/\s+/).every((word) => record.nama.toLowerCase().includes(word))
        || (digits.length >= 3 && [record.id_simpel, record.npwp, record.nib].some((value) => value?.replace(/\D/g, '').includes(digits)));
    });
  }, [index, pilarFilter, pilarQuery, linkedTo]);

  const loading = !companies || !index;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Administrasi</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">ID SIMPEL</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Setiap perusahaan di data inventaris dijodohkan dengan catatannya di daftar perusahaan PILAR. ID SIMPEL dari catatan itu membuka halaman laporan perusahaan (/lapor/ID SIMPEL) dan nanti dipakai untuk login dari PILAR / SIMPEL.</p>
      </header>

      {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</div>}
      {index && index.records.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Daftar perusahaan PILAR belum dimuat. Simpan ekspor tabel Company dari PILAR (.csv) di <code className="font-mono text-xs">Data-inventaris/id_simpel/</code>, lalu jalankan <code className="font-mono text-xs">npm run simpel:load</code>.</div>
      )}

      {loading ? (!error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat perusahaan dan daftar PILAR…</p>) : (
        <>
          <div role="tablist" className="flex gap-1 border-b border-slate-200">
            {([['companies', `Perusahaan kita (${fmt(rows.length)})`], ['pilar', `Daftar PILAR (${fmt(index.records.length)})`]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === key ? 'border-emerald-700 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
            ))}
          </div>

          {tab === 'companies' ? (
            <section className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-5">
                {(['linked', 'no_id', 'candidates', 'none', 'exact'] as const).map((key) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} title={STATUSES[key].help} className={`rounded-xl border p-3 text-left ${STATUSES[key].badge} ${filter === key ? 'ring-2 ring-slate-900/15' : ''}`}>
                    <span className="block text-[11px] font-semibold uppercase tracking-wide">{STATUSES[key].label}</span>
                    <span className="text-xl font-semibold tabular-nums">{fmt(counts[key])}</span>
                  </button>
                ))}
              </div>
              <p className="flex items-start gap-1.5 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {STATUSES[filter === 'all' || filter === 'open' ? 'candidates' : filter].help}</p>
              {counts.exact > 0 && (
                <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 sm:flex-row sm:items-center">
                  <p className="flex-1 text-sm text-sky-900"><span className="font-semibold">{fmt(counts.exact)} perusahaan</span> namanya sama persis dengan satu ID SIMPEL.</p>
                  <button type="button" disabled={busy} onClick={linkAllExact} className="flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><CheckCheck className="h-4 w-4" /> Hubungkan semua yang cocok persis</button>
                </div>
              )}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <Chips<CompanyFilter> options={COMPANY_FILTERS.map(([key, label]) => [key, label, counts[key]])} value={filter} onChange={setFilter} />
                  <label className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 focus-within:border-emerald-600 lg:w-72">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari perusahaan atau ID SIMPEL" className="min-w-0 flex-1 text-xs outline-none" />
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <tr><th className="px-4 py-2.5">Perusahaan (data inventaris)</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">ID SIMPEL</th><th className="px-3 py-2.5">Catatan PILAR</th><th className="w-36 px-3 py-2.5" /></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shownRows.length === 0 ? <tr><td colSpan={5} className="px-4 py-5 text-sm text-slate-500">Tidak ada perusahaan pada pilihan ini.</td></tr> : shownRows.map((row) => {
                        const best = row.exact ?? row.candidates[0];
                        return (
                          <tr key={row.company.id} className="align-top hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-900">{row.company.nama_perusahaan}</td>
                            <td className="px-3 py-2.5"><span title={STATUSES[row.status].help} className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUSES[row.status].badge}`}>{STATUSES[row.status].label}</span></td>
                            <td className="px-3 py-2.5">{row.company.pilar_company_id ? <IdBadge id={row.company.id_simpel} /> : <span className="text-slate-400">–</span>}</td>
                            <td className="max-w-72 px-3 py-2.5 text-slate-600">
                              {row.linked ? <>{row.linked.nama}<span className="block text-[11px] text-slate-400">{row.linked.npwp ? `NPWP ${row.linked.npwp}` : ''}</span></>
                                : row.company.pilar_company_id ? <span className="text-amber-700">Catatan PILAR tidak ada lagi di daftar terbaru</span>
                                  : best ? <>{row.candidates.length > 1 ? `${fmt(row.candidates.length)} kandidat, ` : ''}terbaik: {best.record.nama} <span className="text-slate-400">({Math.round(best.score * 100)}%)</span></>
                                    : <span className="text-slate-400">Tidak ada nama yang mirip</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {row.company.pilar_company_id ? (
                                <div className="flex justify-end gap-1.5">
                                  <button type="button" disabled={busy} onClick={() => setPicking(row)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Ubah</button>
                                  <button type="button" disabled={busy} onClick={() => unlink(row.company)} title="Lepas" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Link2Off className="h-3.5 w-3.5" /></button>
                                </div>
                              ) : row.status === 'exact' ? (
                                <button type="button" disabled={busy} onClick={() => link(row.company, row.exact!)} className="rounded-lg bg-sky-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Hubungkan</button>
                              ) : (
                                <button type="button" disabled={busy} onClick={() => setPicking(row)} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40">{row.status === 'none' ? 'Cari' : 'Pilih'}</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <Chips<PilarFilter> options={[
                  ['all', 'Semua', index.records.length],
                  ['with_id', 'Punya ID SIMPEL', index.records.filter((record) => record.id_simpel).length],
                  ['without_id', 'Tanpa ID SIMPEL', index.records.filter((record) => !record.id_simpel).length],
                  ['linked', 'Terhubung ke data kita', linkedTo.size],
                ]} value={pilarFilter} onChange={(key) => { setPilarFilter(key); setPilarLimit(SHOWN); }} />
                <label className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 focus-within:border-emerald-600 lg:w-80">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input value={pilarQuery} onChange={(event) => { setPilarQuery(event.target.value); setPilarLimit(SHOWN); }} placeholder="Nama, ID SIMPEL, NPWP, atau NIB" className="min-w-0 flex-1 text-xs outline-none" />
                </label>
              </div>
              <p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">{fmt(pilarRows.length)} perusahaan. Daftar ini dari ekspor PILAR; perbarui dengan <code className="font-mono">npm run simpel:load</code> setelah menyimpan ekspor baru.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-2.5">Nama di PILAR</th><th className="px-3 py-2.5">ID SIMPEL</th><th className="px-3 py-2.5">NPWP</th><th className="px-3 py-2.5">NIB</th><th className="px-3 py-2.5">Alamat</th><th className="px-3 py-2.5">Terhubung ke</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pilarRows.slice(0, pilarLimit).map((record) => {
                      const parent = record.id_perusahaan_induk ? index.byId.get(record.id_perusahaan_induk) : undefined;
                      return (
                        <tr key={record.id} className="align-top hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{record.nama}{parent && <span className="block text-[11px] font-normal text-slate-500">Unit dari {parent.nama}</span>}</td>
                          <td className="px-3 py-2.5"><IdBadge id={record.id_simpel} /></td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">{record.npwp ?? '–'}</td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">{record.nib ?? '–'}</td>
                          <td className="max-w-64 px-3 py-2.5 text-slate-500"><span className="line-clamp-2" title={record.alamat ?? ''}>{record.alamat ?? '–'}</span></td>
                          <td className="px-3 py-2.5 text-slate-700">{linkedTo.get(record.id) ?? <span className="text-slate-400">–</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pilarRows.length > pilarLimit && <button type="button" onClick={() => setPilarLimit((value) => value + SHOWN)} className="w-full border-t border-slate-100 py-3 text-xs font-semibold text-emerald-700 hover:bg-slate-50">Muat {SHOWN} lagi ({fmt(pilarRows.length - pilarLimit)} tersisa)</button>}
            </section>
          )}
        </>
      )}

      {picking && index && <PickDialog key={picking.company.id} index={index} row={picking} busy={busy} onPick={(entry) => link(picking.company, entry)} onClose={() => setPicking(null)} />}
    </div>
  );
}
