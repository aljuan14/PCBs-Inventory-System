/**
 * Before "npm run dev": make sure the local Supabase answers. Docker on this
 * laptop starts on its first command, not at boot, so right after boot the
 * app would wait on a database that is not there (AuthRetryableFetchError).
 * Starts Docker and Supabase when needed and waits until sign-in works.
 * Does nothing when .env.local points to Supabase Cloud.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DB_CONTAINER, ROOT, ensureDocker, log, main, run, startSupabase, step, OfflineError } from './lib.mjs';

const envFile = path.join(ROOT, '.env.local');
const url = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim() : undefined;

// supabase_db_pcbs-inventory -> _pcbs-inventory: this project's containers.
const PROJECT = DB_CONTAINER.replace('supabase_db', '');

const containers = async (...filters) => {
  const { stdout } = await run('docker', ['ps', '-a', '--filter', `name=${PROJECT}$`, ...filters.flatMap((f) => ['--filter', f]), '--format', '{{.Names}}'], { capture: true });
  return stdout.split('\n').filter(Boolean);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const healthy = () => fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(2000) }).then((response) => response.ok, () => false);

/**
 * Waits up to `seconds` for sign-in to answer three times in a row: a container
 * just started can answer once and then restart while the database comes up.
 */
async function waitHealthy(seconds) {
  let inARow = 0;
  for (let i = 0; i < seconds; i++) {
    inARow = (await healthy()) ? inARow + 1 : 0;
    if (inARow === 3) return true;
    await sleep(1000);
  }
  return false;
}

main(async () => {
  if (!url || !/127\.0\.0\.1|localhost/.test(url)) return;
  if (await healthy()) return;

  step('Supabase lokal belum siap: menyalakan Docker...');
  await ensureDocker();
  if ((await containers()).length === 0) {
    // Never started on this laptop (or removed by "supabase stop"): create the stack.
    step('Menjalankan Supabase lokal (supabase start)...');
    await startSupabase();
  } else {
    // Stopped containers stay stopped: "supabase start" skips a stack that is partly up.
    const stopped = await containers('status=exited', 'status=created');
    if (stopped.length) await run('docker', ['start', ...stopped], { capture: true });
  }
  log('Menunggu Supabase lokal (biasanya 10-20 detik)...');
  if (!(await waitHealthy(90))) throw new OfflineError('Supabase lokal tidak bisa dihubungi. Cek dengan  npx supabase status  lalu ulangi npm run dev.');
  log('Supabase lokal siap.');
});
