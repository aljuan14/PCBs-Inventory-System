/**
 * npm run offline:user -- <email> <password>                        (admin)
 * npm run offline:user -- <email> <password> perusahaan <ID SIMPEL>  (company account)
 *
 * Create a login account in the local Supabase, or set a new password when the
 * email already exists, and give it its role (user_access, migration
 * 20261013000011): an admin sees everything, a company account only the
 * companies with its ID SIMPEL, on /lapor/<ID SIMPEL>. Accounts travel with
 * the data, so run "npm run data:push" afterwards to apply the change on every
 * laptop.
 */
// @next/env is CommonJS: newer Node versions refuse its named export in an ES module.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { OfflineError, ROOT, log, main } from './lib.mjs';

const { loadEnvConfig } = nextEnv;

main(async () => {
  const [email, password, role = 'admin', idSimpel] = process.argv.slice(2);
  if (!email || !password) throw new OfflineError('Pemakaian: npm run offline:user -- <email> <password> [perusahaan <ID SIMPEL>]');
  if (role !== 'admin' && role !== 'perusahaan') throw new OfflineError('Peran harus "admin" atau "perusahaan".');
  if (role === 'perusahaan' && !idSimpel) throw new OfflineError('Akun perusahaan butuh ID SIMPEL: npm run offline:user -- <email> <password> perusahaan <ID SIMPEL>');
  if (password.length < 8) throw new OfflineError('Password minimal 8 karakter.');

  loadEnvConfig(ROOT);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new OfflineError('Jalankan "npm run offline" sekali dulu agar .env.local terisi.');
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) throw new OfflineError(`.env.local mengarah ke ${url}, bukan Supabase lokal.`);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new OfflineError(error.message);

  const existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  let userId = existing?.id;
  if (existing) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (updateError) throw new OfflineError(updateError.message);
    log(`Password ${email} diperbarui.`);
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError) throw new OfflineError(createError.message);
    userId = created.user.id;
    log(`Akun ${email} dibuat.`);
  }

  const { error: roleError } = await supabase.from('user_access').upsert({ user_id: userId, peran: role, id_simpel: role === 'perusahaan' ? idSimpel : null });
  if (roleError) throw new OfflineError(`Peran gagal disimpan: ${roleError.message}`);
  if (role === 'perusahaan') {
    const { data: companies } = await supabase.from('companies').select('nama_perusahaan').eq('id_simpel', idSimpel);
    log(`Peran: perusahaan, ID SIMPEL ${idSimpel} (${companies?.length ? companies.map((company) => company.nama_perusahaan).join(', ') : 'belum ada perusahaan dengan ID ini'}).`);
  } else {
    log('Peran: admin.');
  }
  log('Jalankan "npm run data:push" agar perubahan akun berlaku di laptop lain.');
});
