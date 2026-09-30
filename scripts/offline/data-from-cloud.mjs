/**
 * npm run data:from-cloud -- "postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
 *
 * One-off move from Supabase Cloud: copy the cloud database (inventory data and
 * login accounts) into the local database. Run "npm run data:push" afterwards
 * to share it with the other laptops.
 *
 * Use the "Session pooler" connection string from the Supabase dashboard
 * (Connect button); the direct connection is IPv6 only.
 */
import {
  OfflineError, ensureDataRepo, ensureDatabase, ensureDocker, exportData, fetchRemoteHead, log, main, query,
  restoreData, step, writeState,
} from './lib.mjs';

main(async () => {
  const url = process.argv[2];
  if (!url || !url.startsWith('postgres')) {
    throw new OfflineError('Sertakan connection string database cloud:\n  npm run data:from-cloud -- "postgresql://postgres.<ref>:<password>@<host>:5432/postgres"');
  }

  await ensureDocker();
  await ensureDatabase();
  await ensureDataRepo();

  step('Menghubungi database cloud');
  await query('select 1', { url });

  step('Menyalin data dari cloud');
  const manifest = await exportData({ url });

  step('Memuat ke database lokal');
  await restoreData(manifest);

  // No fingerprint recorded, so the next data:push treats this as a change.
  writeState({ commit: await fetchRemoteHead(), fingerprint: null });
  log('Selesai. Periksa aplikasinya, lalu jalankan "npm run data:push" untuk membagikan data ke laptop lain.');
});
