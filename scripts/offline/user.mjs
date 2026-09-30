/**
 * npm run offline:user -- <email> <password>
 *
 * Create a login account in the local Supabase, or set a new password when the
 * email already exists. Accounts travel with the data, so run
 * "npm run data:push" afterwards to apply the change on every laptop.
 */
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { OfflineError, ROOT, log, main } from './lib.mjs';

main(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new OfflineError('Pemakaian: npm run offline:user -- <email> <password>');
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
  if (existing) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (updateError) throw new OfflineError(updateError.message);
    log(`Password ${email} diperbarui.`);
  } else {
    const { error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError) throw new OfflineError(createError.message);
    log(`Akun ${email} dibuat.`);
  }
  log('Jalankan "npm run data:push" agar perubahan akun berlaku di laptop lain.');
});
