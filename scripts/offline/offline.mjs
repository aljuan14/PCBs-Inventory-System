/**
 * npm run offline [-- --dev]
 *
 * Everything needed to use the app on this laptop, in one command:
 *  1. update the app code (git pull, only when there are no local edits)
 *  2. start the local Supabase in Docker and apply new migrations
 *  3. point .env.local at the local Supabase
 *  4. pull the latest data from the data repo
 *  5. build (when the code changed) and start the app on http://localhost:3000
 *
 * --dev runs "next dev" instead of a production build, for development.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pull } from './data-pull.mjs';
import { OfflineError, ROOT, ensureDocker, log, main, run, step, supabase } from './lib.mjs';

const APP_URL = 'http://localhost:3000';
const ENV_FILE = path.join(ROOT, '.env.local');
const CLOUD_ENV_BACKUP = path.join(ROOT, '.env.cloud');
const BUILD_STAMP = path.join(ROOT, '.next', 'offline-build.txt');
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

async function updateCode() {
  step('Memeriksa pembaruan aplikasi');
  const { stdout: dirty } = await run('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true });
  if (dirty.trim()) {
    log('Ada perubahan kode lokal, pembaruan otomatis dilewati.');
    return;
  }
  const { stdout: before } = await run('git', ['rev-parse', 'HEAD'], { capture: true });
  const { code, stderr } = await run('git', ['pull', '--ff-only', '--quiet'], { capture: true, allowFail: true });
  if (code !== 0) {
    log(`Tidak bisa memperbarui kode (offline?), lanjut dengan versi yang ada.\n${stderr.trim()}`);
    return;
  }
  const { stdout: changed } = await run('git', ['diff', '--name-only', before.trim(), 'HEAD'], { capture: true });
  if (changed.split('\n').includes('package-lock.json') && process.env.npm_execpath) {
    step('Memasang dependensi baru');
    await run(process.execPath, [process.env.npm_execpath, 'install']);
  }
}

async function startDatabase() {
  step('Menyalakan database lokal (Docker)');
  await supabase(['start']);
  await supabase(['migration', 'up', '--local']);
}

/** Read keys from "supabase status" and write them to .env.local, keeping a copy of a cloud config. */
async function writeEnv() {
  const { stdout } = await supabase(['status', '-o', 'env'], { capture: true });
  const status = Object.fromEntries(
    stdout.split('\n').map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2]]),
  );
  const url = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceKey = status.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new OfflineError('Tidak bisa membaca kunci Supabase lokal dari "supabase status".');

  const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  if (current.includes(`NEXT_PUBLIC_SUPABASE_URL=${url}`) && current.includes(anonKey)) return;

  if (current && !current.includes('127.0.0.1') && !current.includes('localhost') && !fs.existsSync(CLOUD_ENV_BACKUP)) {
    fs.copyFileSync(ENV_FILE, CLOUD_ENV_BACKUP);
    log('.env.local lama (Supabase Cloud) disimpan sebagai .env.cloud');
  }
  fs.writeFileSync(ENV_FILE, [
    '# Ditulis otomatis oleh "npm run offline": Supabase lokal di Docker.',
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_URL=${url}`,
    `SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    '',
  ].join('\n'));
  log('.env.local diarahkan ke Supabase lokal.');
}

async function pullData() {
  try {
    await pull();
  } catch (error) {
    if (!(error instanceof OfflineError)) throw error;
    log(`\nPeringatan: ${error.message}\nAplikasi tetap dijalankan dengan data yang ada di laptop ini.`);
  }
}

async function codeVersion() {
  const { stdout: head } = await run('git', ['rev-parse', 'HEAD'], { capture: true });
  const { stdout: diff } = await run('git', ['diff', 'HEAD', '--stat'], { capture: true });
  return `${head.trim()}\n${diff.trim()}`;
}

async function buildIfNeeded() {
  const version = await codeVersion();
  if (fs.existsSync(BUILD_STAMP) && fs.readFileSync(BUILD_STAMP, 'utf8') === version) return;
  step('Menyiapkan aplikasi (build, beberapa menit untuk pertama kali)');
  await run(process.execPath, [nextBin, 'build']);
  fs.writeFileSync(BUILD_STAMP, version);
}

/** Open the browser once the server answers. */
async function openBrowserWhenReady() {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(APP_URL, { redirect: 'manual' });
      const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', APP_URL]]
        : process.platform === 'darwin' ? ['open', [APP_URL]] : ['xdg-open', [APP_URL]];
      run(command, args, { capture: true, allowFail: true }).catch(() => {});
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

main(async () => {
  const dev = process.argv.includes('--dev');
  await ensureDocker();
  await updateCode();
  await startDatabase();
  await writeEnv();
  await pullData();
  if (!dev) await buildIfNeeded();

  step(`Aplikasi berjalan di ${APP_URL}  (tutup jendela ini atau tekan Ctrl+C untuk berhenti)`);
  openBrowserWhenReady();
  await run(process.execPath, [nextBin, dev ? 'dev' : 'start', '-p', '3000']);
});
