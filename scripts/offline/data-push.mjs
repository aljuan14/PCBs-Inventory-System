/**
 * npm run data:push
 *
 * Export the local database to the data repo and push it, so the other laptops
 * get it on their next start. Refuses when the repo has data this laptop has
 * not pulled yet, so nobody overwrites someone else's changes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DATA_BRANCH, DATA_REPO_DIR, OfflineError, ensureDataRepo, ensureDatabase, ensureDocker, exportData, fetchRemoteHead, fingerprint,
  git, log, main, readState, sameFingerprint, step, writeState,
} from './lib.mjs';

export async function push() {
  await ensureDocker();
  await ensureDatabase();
  await ensureDataRepo();

  step('Memeriksa repo data');
  const remote = await fetchRemoteHead();
  const state = readState();
  if (remote && state?.commit !== remote) {
    throw new OfflineError(
      'Repo data punya versi yang belum diambil di laptop ini. Kirim data dibatalkan agar data tersebut tidak tertimpa.\n'
      + 'Jalankan "npm run data:pull" dulu, lalu ulangi perubahan yang kamu buat.',
    );
  }

  const current = await fingerprint();
  if (state && sameFingerprint(current, state.fingerprint)) {
    log('Tidak ada perubahan data sejak sinkronisasi terakhir.');
    return;
  }

  if (remote) {
    await git(['checkout', '--quiet', '-B', DATA_BRANCH, `origin/${DATA_BRANCH}`]);
    await git(['reset', '--quiet', '--hard', `origin/${DATA_BRANCH}`]);
  } else {
    await git(['checkout', '--quiet', '-B', DATA_BRANCH]);
  }

  step('Mengekspor database');
  await exportData();

  // CSV must reach every laptop byte for byte (no CRLF conversion on Windows).
  fs.writeFileSync(path.join(DATA_REPO_DIR, '.gitattributes'), '* -text\n');

  await git(['add', '-A']);
  const { code } = await git(['diff', '--cached', '--quiet'], { allowFail: true });
  if (code === 0) {
    log('Isi data sama dengan versi di repo, tidak ada yang dikirim.');
    writeState({ commit: remote, fingerprint: current });
    return;
  }

  const stamp = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  await git(['commit', '--quiet', '-m', `data: ${stamp} dari ${os.hostname()}`]);
  step('Mengirim ke GitHub');
  await git(['push', '--quiet', 'origin', `${DATA_BRANCH}:${DATA_BRANCH}`]);

  const { stdout } = await git(['rev-parse', 'HEAD'], { capture: true });
  writeState({ commit: stdout.trim(), fingerprint: current });
  log('Selesai: data terkirim. Laptop lain akan mendapatkannya saat aplikasi dijalankan.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(push);
}
