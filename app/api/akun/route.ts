import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ServiceKeyMissing, createServiceClient, requireAdmin } from '@/lib/supabase/admin';
import { deleteCompany } from '@/lib/company-purge';
import { TEST_SCENARIOS, seedTestCompany } from '@/lib/test-accounts';
import { selectCompanies } from '@/lib/company-sort';

/**
 * Login accounts, for the admin only (the "Akun pengguna" page). Supabase
 * Auth accounts are made and changed with the service role key, on the
 * server; the role of each sits in user_access (admin, pemantau, or
 * perusahaan with the ID SIMPEL of its company).
 *
 * GET     the accounts with their role
 * POST    { email, password, peran, idSimpel? }  a new account
 *         { action: 'uji', password, reset? }    the test companies and accounts (lib/test-accounts)
 *         { action: 'uji-ulang', idSimpel }      one test company back to its start, its account kept
 * PATCH   { userId, password?, peran?, idSimpel? }
 * DELETE  { userId }
 */

type Peran = 'admin' | 'pemantau' | 'perusahaan';
const PERAN: Peran[] = ['admin', 'pemantau', 'perusahaan'];
const MIN_PASSWORD = 8;

export type AccountRow = { id: string; email: string; peran: Peran | null; idSimpel: string | null; company: string | null; createdAt: string; lastSignIn: string | null; self: boolean };

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

async function handle(run: (admin: SupabaseClient, caller: { supabase: SupabaseClient; userId: string }) => Promise<NextResponse>) {
  try {
    const caller = await requireAdmin();
    if (!caller) return fail('Hanya admin yang dapat mengelola akun.', 403);
    return await run(createServiceClient(), caller);
  } catch (err) {
    if (err instanceof ServiceKeyMissing) return fail(err.message, 503);
    console.error('Account error:', err);
    return fail(err instanceof Error ? err.message : 'Gagal memproses akun.', 500);
  }
}

async function allUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Gagal memuat akun: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

/** The ID SIMPEL must belong to a company of the inventory: the company account sees exactly those rows. */
async function checkRole(admin: SupabaseClient, peran: unknown, idSimpel: unknown): Promise<{ peran: Peran; id_simpel: string | null } | string> {
  if (!PERAN.includes(peran as Peran)) return 'Peran tidak dikenal.';
  if (peran !== 'perusahaan') return { peran: peran as Peran, id_simpel: null };
  const id = String(idSimpel ?? '').trim();
  if (!id) return 'Akun perusahaan butuh ID SIMPEL perusahaannya.';
  const { data } = await admin.from('companies').select('id').eq('id_simpel', id).limit(1);
  if (!data?.length) return `Belum ada perusahaan dengan ID SIMPEL ${id}. Hubungkan dulu di halaman ID SIMPEL.`;
  return { peran: 'perusahaan', id_simpel: id };
}

const checkPassword = (password: unknown) => (typeof password === 'string' && password.length >= MIN_PASSWORD ? null : `Password minimal ${MIN_PASSWORD} karakter.`);

export async function GET() {
  return handle(async (admin, caller) => {
    const [users, { data: access }, { data: companies }] = await Promise.all([
      allUsers(admin),
      admin.from('user_access').select('user_id, peran, id_simpel'),
      selectCompanies<{ id_simpel: string | null; nama_perusahaan: string; terakhir_diubah?: string }>(admin, 'id_simpel, nama_perusahaan'),
    ]);
    const roles = new Map((access ?? []).map((row) => [row.user_id as string, row]));
    const names = new Map<string, string>();
    const edited = new Map<string, string>();
    for (const company of companies) {
      if (!company.id_simpel) continue;
      if (!names.has(company.id_simpel)) names.set(company.id_simpel, company.nama_perusahaan);
      if (company.terakhir_diubah && company.terakhir_diubah > (edited.get(company.id_simpel) ?? '')) edited.set(company.id_simpel, company.terakhir_diubah);
    }
    const accounts: AccountRow[] = users.map((user) => {
      const role = roles.get(user.id);
      return {
        id: user.id, email: user.email ?? '(tanpa email)', peran: (role?.peran as Peran) ?? null, idSimpel: role?.id_simpel ?? null,
        company: role?.id_simpel ? names.get(role.id_simpel) ?? null : null, createdAt: user.created_at, lastSignIn: user.last_sign_in_at ?? null, self: user.id === caller.userId,
      };
    }).sort((a, b) => PERAN.indexOf(a.peran ?? 'perusahaan') - PERAN.indexOf(b.peran ?? 'perusahaan') || a.email.localeCompare(b.email));
    return NextResponse.json({
      accounts,
      companies: [...names].map(([idSimpel, name]) => ({ idSimpel, name, lastEdited: edited.get(idSimpel) ?? null })),
      // Empty at the start: the company's first page asks whether it owns transformers.
      scenarios: TEST_SCENARIOS.map(({ idSimpel, email, name, purpose, seed, storage }) => ({ idSimpel, email, name, purpose, startsEmpty: Object.keys(seed).length === 0 && !storage?.length })),
    });
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === 'uji') return handle((admin, caller) => createTestAccounts(admin, caller.supabase, body.password, Boolean(body.reset)));
  if (body.action === 'uji-ulang') return handle((admin, caller) => resetTestCompany(admin, caller.supabase, String(body.idSimpel ?? '')));
  return handle(async (admin) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email tidak valid.');
    const passwordError = checkPassword(body.password);
    if (passwordError) return fail(passwordError);
    const role = await checkRole(admin, body.peran, body.idSimpel);
    if (typeof role === 'string') return fail(role);
    const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
    if (error || !data.user) return fail(/already|exists|registered/i.test(error?.message ?? '') ? 'Email ini sudah punya akun.' : `Gagal membuat akun: ${error?.message}`);
    const { error: roleError } = await admin.from('user_access').upsert({ user_id: data.user.id, ...role });
    if (roleError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return fail(`Gagal menyimpan peran: ${roleError.message}`, 500);
    }
    return NextResponse.json({ ok: true });
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(async (admin, caller) => {
    const userId = String(body.userId ?? '');
    if (!userId) return fail('Akun tidak dipilih.');
    if (body.password !== undefined) {
      const passwordError = checkPassword(body.password);
      if (passwordError) return fail(passwordError);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: body.password });
      if (error) return fail(`Gagal mengganti password: ${error.message}`, 500);
    }
    if (body.peran !== undefined) {
      if (userId === caller.userId && body.peran !== 'admin') return fail('Peran akun sendiri tidak dapat diturunkan; minta admin lain.');
      const role = await checkRole(admin, body.peran, body.idSimpel);
      if (typeof role === 'string') return fail(role);
      const { error } = await admin.from('user_access').upsert({ user_id: userId, ...role });
      if (error) return fail(`Gagal mengubah peran: ${error.message}`, 500);
    }
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(async (admin, caller) => {
    const userId = String(body.userId ?? '');
    if (!userId) return fail('Akun tidak dipilih.');
    if (userId === caller.userId) return fail('Akun sendiri tidak dapat dihapus.');
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return fail(`Gagal menghapus akun: ${error.message}`, 500);
    await admin.from('user_access').delete().eq('user_id', userId);
    return NextResponse.json({ ok: true });
  });
}

/** A test company's rows, forms and letters removed, as "Ulang dari awal" does for all of them. */
async function clearTestCompany(admin: SupabaseClient, supabase: SupabaseClient, companyId: string) {
  const { data: letters } = await admin.storage.from('surat-pernyataan').list(companyId);
  if (letters?.length) await admin.storage.from('surat-pernyataan').remove(letters.map((file) => `${companyId}/${file.name}`));
  await deleteCompany(supabase, companyId);
}

/** Makes a test company as at the start: its scenario's rows and nothing else. Returns its id. */
async function makeTestCompany(supabase: SupabaseClient, scenario: (typeof TEST_SCENARIOS)[number]) {
  const { data, error } = await supabase.from('companies').insert({ nama_perusahaan: scenario.name, id_simpel: scenario.idSimpel }).select('id').single();
  if (error || !data) throw new Error(`Gagal membuat ${scenario.name}: ${error?.message}`);
  await seedTestCompany(supabase, data.id as string, scenario);
  return data.id as string;
}

/**
 * One test company back to its start (e.g. ZZ Uji C, to answer the first
 * question again), the others and every account left as they are.
 */
async function resetTestCompany(admin: SupabaseClient, supabase: SupabaseClient, idSimpel: string) {
  const scenario = TEST_SCENARIOS.find((entry) => entry.idSimpel === idSimpel);
  if (!scenario) return fail('Perusahaan uji tidak dikenal.');
  const { data: existing } = await admin.from('companies').select('id').eq('id_simpel', scenario.idSimpel);
  for (const { id } of existing ?? []) await clearTestCompany(admin, supabase, id);
  await makeTestCompany(supabase, scenario);
  return NextResponse.json({ ok: true, name: scenario.name });
}

/**
 * Every test company with its account: made when missing, the password set
 * again when it exists. With reset the companies are removed first (data,
 * forms, letters) and made again, so a test starts from the beginning.
 */
async function createTestAccounts(admin: SupabaseClient, supabase: SupabaseClient, password: unknown, reset: boolean) {
  const passwordError = checkPassword(password);
  if (passwordError) return fail(passwordError);
  const users = await allUsers(admin);
  const done: string[] = [];
  for (const scenario of TEST_SCENARIOS) {
    const { data: existing } = await admin.from('companies').select('id').eq('id_simpel', scenario.idSimpel);
    if (reset) for (const { id } of existing ?? []) await clearTestCompany(admin, supabase, id);
    if (reset || !existing?.length) await makeTestCompany(supabase, scenario);
    let user = users.find((entry) => entry.email?.toLowerCase() === scenario.email);
    if (user) {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password: password as string });
      if (error) throw new Error(`Gagal mengganti password ${scenario.email}: ${error.message}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email: scenario.email, password: password as string, email_confirm: true });
      if (error || !data.user) throw new Error(`Gagal membuat akun ${scenario.email}: ${error?.message}`);
      user = data.user;
    }
    const { error } = await admin.from('user_access').upsert({ user_id: user.id, peran: 'perusahaan', id_simpel: scenario.idSimpel });
    if (error) throw new Error(`Gagal menyimpan peran ${scenario.email}: ${error.message}`);
    done.push(scenario.email);
  }
  return NextResponse.json({ ok: true, accounts: done });
}
