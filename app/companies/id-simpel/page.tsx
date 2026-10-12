'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, ArrowLeft, Check, CheckCheck, Link2, Link2Off, Loader2, Search } from 'lucide-react';
import { buildIndex, exactMatch, findCandidates, searchRecords, type Candidate, type SimpelCompany, type SimpelIndex } from '@/lib/simpel-match';
import { createClient } from '@/lib/supabase/client';

type Company = { id: string; nama_perusahaan: string; pilar_company_id: string | null; id_simpel: string | null };
type Status = 'linked' | 'no_id' | 'exact' | 'candidates' | 'none';
type Row = { company: Company; status: Status; linked: SimpelCompany | null; exact: Candidate | null; candidates: Candidate[] };

const PAGE = 1000;
const fmt = (value: number) => value.toLocaleString('id-ID');

const STATUSES: Record<Status, { label: string; badge: string }> = {
  linked: { label: 'Terhubung', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  no_id: { label: 'Terhubung, tanpa ID SIMPEL', badge: 'border-amber-200 bg-amber-50 text-amber-800' },
  exact: { label: 'Cocok persis', badge: 'border-sky-200 bg-sky-50 text-sky-800' },
  candidates: { label: 'Perlu dipilih', badge: 'border-slate-200 bg-slate-50 text-slate-700' },
  none: { label: 'Tidak ditemukan', badge: 'border-rose-200 bg-rose-50 text-rose-800' },
};
const FILTERS: Array<['all' | 'open' | Status, string]> = [
  ['all', 'Semua'], ['open', 'Belum terhubung'], ['exact', 'Cocok persis'], ['candidates', 'Perlu dipilih'], ['none', 'Tidak ditemukan'], ['linked', 'Terhubung'], ['no_id', 'Tanpa ID SIMPEL'],
];

async function fetchRecords(supabase: SupabaseClient): Promise<SimpelCompany[]> {
  const records: SimpelCompany[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('simpel_companies').select('id, id_simpel, nama, npwp, nib, alamat, bidang_usaha, id_perusahaan_induk').order('id').range(from, from + PAGE - 1);
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
  const candidates = findCandidates(index, company.nama_perusahaan);
  return { company, status: exact ? 'exact' : candidates.length ? 'candidates' : 'none', linked: null, exact, candidates };
}

/** One PILAR record: name, IDs and address, with the button that links it. */
function RecordLine({ entry, action }: { entry: Candidate; action?: React.ReactNode }) {
  const { record, idSimpel, parent, score } = entry;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-slate-900">{record.nama}</span>
          {idSimpel
            ? <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">ID SIMPEL {idSimpel}</span>
            : <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">tanpa ID SIMPEL</span>}
          {score > 0 && score < 1 && <span className="text-[11px] tabular-nums text-slate-400">kemiripan {Math.round(score * 100)}%</span>}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {[record.npwp && `NPWP ${record.npwp}`, record.nib && `NIB ${record.nib}`, record.bidang_usaha].filter(Boolean).join(' · ')}
        </div>
        {record.alamat && <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-400" title={record.alamat}>{record.alamat}</div>}
        {parent && <div className="mt-0.5 text-[11px] text-slate-500">Unit dari <span className="font-medium">{parent.nama}</span>{!record.id_simpel && parent.id_simpel && ' (ID SIMPEL diambil dari induk)'}</div>}
      </div>
      {action}
    </div>
  );
}

function CompanyRow({ row, index, busy, onLink, onUnlink }: { row: Row; index: SimpelIndex; busy: boolean; onLink: (company: Company, entry: Candidate) => void; onUnlink: (company: Company) => void }) {
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState('');
  const results = useMemo(() => (searching ? searchRecords(index, text) : []), [index, searching, text]);
  const { company, status, linked } = row;
  const pick = (entry: Candidate) => (
    <button type="button" disabled={busy} onClick={() => onLink(company, entry)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40">
      <Link2 className="h-3.5 w-3.5" /> Pilih
    </button>
  );
  const shown = row.exact ? [row.exact, ...row.candidates.filter((entry) => entry.record.id !== row.exact!.record.id)].slice(0, 5) : row.candidates;

  return (
    <div className="border-b border-slate-100 px-5 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{company.nama_perusahaan}</div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUSES[status].badge}`}>{STATUSES[status].label}</span>
      </div>

      <div className="mt-3 space-y-2">
        {linked || company.pilar_company_id ? (
          linked
            ? <RecordLine entry={{ record: linked, score: 0, idSimpel: company.id_simpel, parent: linked.id_perusahaan_induk ? index.byId.get(linked.id_perusahaan_induk) ?? null : null }} action={
                <button type="button" disabled={busy} onClick={() => onUnlink(company)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Link2Off className="h-3.5 w-3.5" /> Lepas</button>
              } />
            : <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <span>Terhubung ke data PILAR yang tidak ada lagi di daftar terbaru{company.id_simpel ? ` (ID SIMPEL ${company.id_simpel})` : ''}.</span>
                <button type="button" disabled={busy} onClick={() => onUnlink(company)} className="shrink-0 font-semibold underline">Lepas</button>
              </div>
        ) : (
          <>
            {shown.map((entry) => <RecordLine key={entry.record.id} entry={entry} action={pick(entry)} />)}
            {status === 'none' && <p className="text-xs text-slate-500">Tidak ada nama yang mirip di daftar PILAR. Cari dengan kata lain, NPWP, NIB, atau ID SIMPEL.</p>}
          </>
        )}

        {!company.pilar_company_id && (searching ? (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-emerald-600">
              <Search className="h-4 w-4 text-slate-400" />
              <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Nama, NPWP, NIB, atau ID SIMPEL" className="min-w-0 flex-1 text-sm outline-none" />
            </label>
            {text.trim().length >= 2 && results.length === 0 && <p className="text-xs text-slate-500">Tidak ada yang cocok.</p>}
            {results.map((entry) => <RecordLine key={entry.record.id} entry={entry} action={pick(entry)} />)}
          </div>
        ) : (
          <button type="button" onClick={() => setSearching(true)} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900"><Search className="h-3.5 w-3.5" /> Cari sendiri di daftar PILAR</button>
        ))}
      </div>
    </div>
  );
}

export default function IdSimpelPage() {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [index, setIndex] = useState<SimpelIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('open');
  const [query, setQuery] = useState('');
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
    const result = { all: rows.length, open: 0, linked: 0, no_id: 0, exact: 0, candidates: 0, none: 0 };
    for (const row of rows) { result[row.status]++; if (row.status !== 'linked' && row.status !== 'no_id') result.open++; }
    return result;
  }, [rows]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((row) => (filter === 'all' || (filter === 'open' ? row.status !== 'linked' && row.status !== 'no_id' : row.status === filter))
    && words.every((word) => row.company.nama_perusahaan.toLowerCase().includes(word) || row.company.id_simpel === word));

  const save = async (changes: Array<{ id: string; pilar_company_id: string | null; id_simpel: string | null }>) => {
    setBusy(true);
    setError(null);
    try {
      for (const { id, ...values } of changes) {
        const { error: saveError } = await supabase.from('companies').update(values).eq('id', id);
        if (saveError) throw new Error(saveError.message);
      }
      setCompanies(await loadCompanies());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const link = (company: Company, entry: Candidate) => save([{ id: company.id, pilar_company_id: entry.record.id, id_simpel: entry.idSimpel }]);
  const unlink = (company: Company) => save([{ id: company.id, pilar_company_id: null, id_simpel: null }]);
  const linkAllExact = () => {
    const exact = rows.filter((row) => row.status === 'exact' && row.exact);
    if (!window.confirm(`Hubungkan ${fmt(exact.length)} perusahaan yang namanya cocok persis dengan satu ID SIMPEL? Periksa dulu daftarnya di tab "Cocok persis".`)) return;
    save(exact.map((row) => ({ id: row.company.id, pilar_company_id: row.exact!.record.id, id_simpel: row.exact!.idSimpel })));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <Link href="/companies" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" /> Manajemen Perusahaan</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">ID SIMPEL</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Hubungkan setiap perusahaan dengan datanya di PILAR. Nantinya akun perusahaan di PILAR masuk ke data inventarisnya lewat ID SIMPEL ini.
          {index && ` Daftar PILAR: ${fmt(index.records.length)} perusahaan, ${fmt(index.records.filter((record) => record.id_simpel).length)} dengan ID SIMPEL.`}
        </p>
      </header>

      {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</div>}

      {companies && index && index.records.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Daftar perusahaan PILAR belum dimuat. Simpan ekspor tabel Company dari PILAR (.csv) di <code className="font-mono text-xs">Data-inventaris/id_simpel/</code>, lalu jalankan <code className="font-mono text-xs">npm run simpel:load</code>.
        </div>
      )}

      {!companies || !index ? (
        !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat daftar perusahaan dan PILAR…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['linked', counts.linked + counts.no_id, 'Terhubung'], ['exact', counts.exact, 'Cocok persis'], ['candidates', counts.candidates, 'Perlu dipilih'], ['none', counts.none, 'Tidak ditemukan']] as const).map(([key, value, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-2xl border p-4 text-left transition-colors hover:brightness-95 ${STATUSES[key].badge}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide">{label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(value)}</div>
              </button>
            ))}
          </div>

          {counts.exact > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-sky-900"><span className="font-semibold">{fmt(counts.exact)} perusahaan</span> namanya sama persis dengan satu ID SIMPEL (setelah tanda baca, &quot;PT&quot;, dan &quot;Tbk&quot; diabaikan).</p>
              <button type="button" disabled={busy} onClick={linkAllExact} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} Hubungkan semua yang cocok persis
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4">
              <div role="group" aria-label="Saring perusahaan" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {FILTERS.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>
                    {label} ({fmt(counts[key])})
                  </button>
                ))}
              </div>
              <label className="flex max-w-md items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-emerald-600">
                <Search className="h-4 w-4 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari perusahaan atau ID SIMPEL" className="min-w-0 flex-1 text-sm outline-none" />
              </label>
            </div>
            {shown.length === 0
              ? <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Check className="h-4 w-4" /> Tidak ada perusahaan pada pilihan ini.</p>
              : shown.map((row) => <CompanyRow key={row.company.id} row={row} index={index} busy={busy} onLink={link} onUnlink={unlink} />)}
          </div>
        </>
      )}
    </div>
  );
}
