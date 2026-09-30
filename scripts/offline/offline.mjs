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
import { OfflineError, ROOT, ensureDocker, log, main, run, startSupabase, step, supabase, writeLocalEnv } from './lib.mjs';

const APP_URL = 'http://localhost:3000';
// Only this laptop: the browser talks to Supabase on 127.0.0.1, so other devices could not use it anyway.
const HOST = '127.0.0.1';
const BUILD_STAMP = path.join(ROOT, '.next', 'offline-build.txt');
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

async function updateCode() {
  step('Memeriksa pembaruan aplikasi');
  const { stdout: dirty } = await run('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true });
  if (dirty.trim()) {
    log('Ada perubahan kode lokal, pembaruan otomatis dilewati.');
    return;
  }
  const upstream = await run('git', ['rev-parse', '--abbrev-ref', '@{u}'], { capture: true, allowFail: true });
  if (upstream.code !== 0) {
    log('Branch ini tidak terhubung ke GitHub, pembaruan otomatis dilewati.');
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
  await startSupabase();
  await supabase(['migration', 'up', '--local']);
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
      await fetch(`http://${HOST}:3000`, { redirect: 'manual' });
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
  await writeLocalEnv();
  await pullData();
  if (!dev) await buildIfNeeded();

  step(`Aplikasi berjalan di ${APP_URL}  (tutup jendela ini atau tekan Ctrl+C untuk berhenti)`);
  openBrowserWhenReady();
  await run(process.execPath, [nextBin, dev ? 'dev' : 'start', '-p', '3000', '-H', HOST]);
});
