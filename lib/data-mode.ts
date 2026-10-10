/**
 * The web on Vercel runs with NEXT_PUBLIC_DATA_MODE=summary: Supabase Cloud
 * holds only the dashboard summary sent by "npm run web:publish" (migration
 * 20261010000003), not the inventory rows. The dashboards keep their look;
 * the tables, uploads, edits and the pages built on rows are left out.
 * Offline (and anywhere without the variable) everything works on the rows.
 */
export const SUMMARY_MODE = process.env.NEXT_PUBLIC_DATA_MODE === 'summary';

/** Pages that need the inventory rows, closed in summary mode. */
export const ROW_ONLY_PATHS = ['/upload', '/companies', '/kualitas-data', '/laporan'];
