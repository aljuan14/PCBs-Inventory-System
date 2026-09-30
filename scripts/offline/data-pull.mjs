/**
 * npm run data:pull [-- --force]
 *
 * Replace the local database with the latest data from the data repo.
 * Refuses when this laptop has changes that were never pushed (they would be
 * lost), unless --force is given.
 */
import { pathToFileURL } from 'node:url';
import {
  DATA_BRANCH, OfflineError, ensureDataRepo, ensureDatabase, ensureDocker, fetchRemoteHead, fingerprint, git,
  log, main, readManifest, readState, restoreData, sameFingerprint, step, writeState,
} from './lib.mjs';

export async function pull({ force = false } = {}) {
  await ensureDocker();
  await ensureDatabase();
  await ensureDataRepo();

  step('Memeriksa data terbaru');
  const remote = await fetchRemoteHead();
  if (!remote) {
    log('Repo data masih kosong, belum ada yang bisa diambil.');
    return;
  }

  const state = readState();
  const current = await fingerprint();
  const localChanged = state ? !sameFingerprint(current, state.fingerprint) : Object.values(current).some((value) => !value.startsWith('0:'));

  if (state?.commit === remote) {
    log(localChanged
      ? 'Data sudah versi terbaru, tetapi ada perubahan di laptop ini yang belum dikirim. Jalankan "npm run data:push" untuk mengirimnya.'
      : 'Data sudah versi terbaru.');
    return;
  }

  if (localChanged && !force) {
    throw new OfflineError(
      'Ada data baru di repo, tetapi database di laptop ini juga punya perubahan yang belum dikirim.\n'
      + 'Mengambil data sekarang akan menghapus perubahan lokal tersebut.\n'
      + '- Kalau perubahan lokal tidak penting: npm run data:pull -- --force\n'
      + '- Kalau penting: catat dulu apa yang diubah (misalnya file Excel yang diimpor), pull dengan --force, lalu ulangi impornya.',
    );
  }

  await git(['checkout', '--quiet', '-B', DATA_BRANCH, `origin/${DATA_BRANCH}`]);
  await git(['reset', '--quiet', '--hard', `origin/${DATA_BRANCH}`]);
  const manifest = readManifest();
  if (!manifest) throw new OfflineError('Repo data tidak berisi data/manifest.json.');

  const { stdout: info } = await git(['log', '-1', '--format=%ad oleh %an: %s', '--date=format:%d-%m-%Y %H:%M'], { capture: true });
  step(`Memuat data (${info.trim()})`);
  const total = Object.values(manifest.tables).reduce((sum, table) => sum + table.rows, 0);
  await restoreData(manifest);
  writeState({ commit: remote, fingerprint: await fingerprint() });
  log(`Selesai: ${total.toLocaleString('id-ID')} baris dimuat.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(() => pull({ force: process.argv.includes('--force') }));
}
