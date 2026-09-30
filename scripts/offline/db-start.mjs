/** npm run db:start: start the local Supabase only (ports open for this laptop only). */
import { ensureDocker, main, startSupabase } from './lib.mjs';

main(async () => {
  await ensureDocker();
  await startSupabase();
});
