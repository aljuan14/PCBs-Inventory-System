'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, KeyRound, Loader2, Pencil, Plus, RotateCcw, Trash2, UserPlus, X } from 'lucide-react';
import CompanyPicker from '@/components/CompanyPicker';
import type { AccountRow } from '@/app/api/akun/route';

type Peran = 'admin' | 'pemantau' | 'perusahaan';
type Scenario = { idSimpel: string; email: string; name: string; purpose: string };
type Data = { accounts: AccountRow[]; companies: Array<{ idSimpel: string; name: string }>; scenarios: Scenario[] };

const ROLES: Record<Peran, { label: string; help: string; badge: string }> = {
  admin: { label: 'Admin', help: 'Melihat dan mengubah semua data, mengelola akun.', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  pemantau: { label: 'Pemantau', help: 'Melihat semua data tanpa dapat mengubahnya (pimpinan).', badge: 'border-sky-200 bg-sky-50 text-sky-800' },
  perusahaan: { label: 'Perusahaan', help: 'Hanya melihat dan mengisi data perusahaannya sendiri.', badge: 'border-slate-300 bg-white text-slate-700' },
};
const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600';
const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum pernah');

async function call(method: string, body?: unknown) {
  const response = await fetch('/api/akun', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? `Permintaan gagal (${response.status}).`);
  return result;
}

function RoleFields({ peran, idSimpel, companies, onChange }: { peran: Peran; idSimpel: string | null; companies: Data['companies']; onChange: (peran: Peran, idSimpel: string | null) => void }) {
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Peran" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(ROLES) as Peran[]).map((key) => (
          <button key={key} type="button" role="radio" aria-checked={peran === key} onClick={() => onChange(key, key === 'perusahaan' ? idSimpel : null)}
            className={`rounded-xl border p-3 text-left ${peran === key ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600' : 'border-slate-200 hover:bg-slate-50'}`}>
            <span className="block text-sm font-semibold text-slate-900">{ROLES[key].label}</span>
            <span className="block text-[11px] text-slate-500">{ROLES[key].help}</span>
          </button>
        ))}
      </div>
      {peran === 'perusahaan' && (
        <label className="block text-xs font-medium text-slate-600">Perusahaan (yang sudah punya ID SIMPEL)
          <CompanyPicker companies={companies.map((company) => ({ id: company.idSimpel, name: company.name }))} value={idSimpel} onChange={(value) => onChange('perusahaan', value)} allLabel={null} describe={(id) => `ID SIMPEL ${id}`} className="mt-1 w-full" />
        </label>
      )}
    </div>
  );
}

function NewAccount({ companies, onSaved }: { companies: Data['companies']; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [peran, setPeran] = useState<Peran>('pemantau');
  const [idSimpel, setIdSimpel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('POST', { email, password, peran, idSimpel });
      setEmail('');
      setPassword('');
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold"><UserPlus className="h-4.5 w-4.5 text-emerald-700" /> Tambah akun</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" className={`${inputClass} mt-1`} /></label>
        <label className="text-xs font-medium text-slate-600">Password (minimal 8 karakter)<input type="text" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={`${inputClass} mt-1 font-mono`} /></label>
      </div>
      <RoleFields peran={peran} idSimpel={idSimpel} companies={companies} onChange={(nextPeran, nextId) => { setPeran(nextPeran); setIdSimpel(nextId); }} />
      {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy || (peran === 'perusahaan' && !idSimpel)} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Buat akun</button>
      </div>
    </form>
  );
}

function TestAccounts({ scenarios, accounts, onSaved }: { scenarios: Scenario[]; accounts: AccountRow[]; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'create' | 'reset' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const emails = new Set(accounts.map((account) => account.email.toLowerCase()));
  const made = scenarios.filter((scenario) => emails.has(scenario.email)).length;

  const run = async (reset: boolean) => {
    if (reset && !window.confirm('Hapus semua data perusahaan uji (ZZ Uji A sampai E), lalu buat ulang dari awal? Data asli tidak tersentuh.')) return;
    setBusy(reset ? 'reset' : 'create');
    setMessage(null);
    try {
      const result = await call('POST', { action: 'uji', password, reset });
      setMessage({ ok: true, text: `${result.accounts.length} akun uji siap dengan password yang diisi.` });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><FlaskConical className="h-4.5 w-4.5 text-violet-700" /> Akun uji coba</h2>
        <p className="mt-1 text-xs text-slate-500">Satu perusahaan uji per skenario, dengan ID SIMPEL palsu (UJI-…) agar tidak bercampur dengan perusahaan asli. Semua akun uji memakai password yang sama.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-violet-100 bg-white">
        {scenarios.map((scenario) => (
          <div key={scenario.idSimpel} className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{scenario.name}</div>
              <div className="text-xs text-slate-500">{scenario.purpose}</div>
            </div>
            <span className="shrink-0 font-mono text-xs text-slate-700">{scenario.email}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${emails.has(scenario.email) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{emails.has(scenario.email) ? 'Sudah ada' : 'Belum dibuat'}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-medium text-slate-600">Password untuk semua akun uji (minimal 8 karakter)<input type="text" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={`${inputClass} mt-1 font-mono`} /></label>
        <button type="button" disabled={password.length < 8 || busy !== null} onClick={() => run(false)} className="flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} {made ? 'Perbarui akun uji' : 'Buat akun uji'}</button>
        {made > 0 && <button type="button" disabled={password.length < 8 || busy !== null} onClick={() => run(true)} className="flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-xs font-semibold text-violet-800 disabled:opacity-40">{busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Ulang dari awal</button>}
      </div>
      <p className="text-[11px] text-slate-500">&quot;Perbarui&quot; hanya membuat yang belum ada dan mengganti password. &quot;Ulang dari awal&quot; menghapus isian perusahaan uji lalu mengisinya lagi dengan data awal.</p>
      {message && <p className={`rounded-xl border p-3 text-xs ${message.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{message.text}</p>}
    </section>
  );
}

function EditAccount({ account, companies, onClose, onSaved }: { account: AccountRow; companies: Data['companies']; onClose: () => void; onSaved: () => void }) {
  const [peran, setPeran] = useState<Peran>(account.peran ?? 'perusahaan');
  const [idSimpel, setIdSimpel] = useState<string | null>(account.idSimpel);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleChanged = peran !== account.peran || idSimpel !== account.idSimpel;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('PATCH', { userId: account.id, ...(password ? { password } : {}), ...(roleChanged ? { peran, idSimpel } : {}) });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="edit-account-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-account-title" className="text-base font-semibold">Ubah akun</h2>
            <p className="font-mono text-xs text-slate-500">{account.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {account.self ? <p className="text-xs text-slate-500">Ini akun Anda sendiri: perannya tetap admin.</p> : <RoleFields peran={peran} idSimpel={idSimpel} companies={companies} onChange={(nextPeran, nextId) => { setPeran(nextPeran); setIdSimpel(nextId); }} />}
        <label className="block text-xs font-medium text-slate-600">Password baru (kosongkan bila tidak diganti)<input type="text" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={`${inputClass} mt-1 font-mono`} /></label>
        {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700">Batal</button>
          <button type="button" onClick={save} disabled={busy || (!password && !roleChanged) || (password !== '' && password.length < 8) || (peran === 'perusahaan' && !idSimpel)} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Simpan</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Akun pengguna (admin only): the login accounts and their role, a new one,
 * a password or role changed, an account removed, and the test companies
 * with their accounts (lib/test-accounts.ts). Served by app/api/akun.
 */
export default function AccountsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let active = true;
    call('GET').then((result) => { if (active) { setData(result); setError(null); } }, (err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [reloadKey]);

  const remove = async (account: AccountRow) => {
    if (!window.confirm(`Hapus akun ${account.email}? Pemiliknya tidak dapat login lagi. Data perusahaannya tidak ikut terhapus.`)) return;
    try {
      await call('DELETE', { userId: account.id });
      reload();
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Administrasi</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Akun pengguna</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Akun login dan perannya. Untuk masa uji coba; nanti akun perusahaan datang dari login PILAR / SIMPEL.</p>
      </header>

      {error && <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
      {!data && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat akun…</p>}

      {data && (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold">Daftar akun ({data.accounts.length.toLocaleString('id-ID')})</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-5 py-2.5">Email</th><th className="px-3 py-2.5">Peran</th><th className="px-3 py-2.5">Perusahaan</th><th className="px-3 py-2.5">Terakhir login</th><th className="w-28 px-3 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="px-5 py-3 font-mono text-slate-800">{account.email}{account.self && <span className="ml-2 font-sans text-[10px] font-semibold uppercase text-slate-400">Anda</span>}</td>
                      <td className="px-3 py-3">{account.peran ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLES[account.peran].badge}`}>{ROLES[account.peran].label}</span> : <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">Tanpa peran</span>}</td>
                      <td className="px-3 py-3 text-slate-600">{account.idSimpel ? <>{account.company ?? '–'} <span className="font-mono text-slate-400">· {account.idSimpel}</span></> : '–'}</td>
                      <td className="px-3 py-3 text-slate-500">{formatDate(account.lastSignIn)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => setEditing(account)} title="Ubah peran atau password" aria-label={`Ubah ${account.email}`} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><Pencil className="h-4 w-4" /></button>
                          {!account.self && <button type="button" onClick={() => remove(account)} title="Hapus akun" aria-label={`Hapus ${account.email}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <NewAccount companies={data.companies} onSaved={reload} />
          <TestAccounts scenarios={data.scenarios} accounts={data.accounts} onSaved={reload} />
        </>
      )}
      {editing && data && <EditAccount account={editing} companies={data.companies} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
