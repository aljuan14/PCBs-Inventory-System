/**
 * The company last opened on Isi formulir or Roadmap, so either page opens on
 * it again; kept in this browser only. Storage may be blocked (private
 * window): then nothing is remembered.
 */
const KEY = 'pcbs:perusahaan-terakhir';

export function readLastCompany(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLastCompany(companyId: string | null) {
  try {
    if (companyId) window.localStorage.setItem(KEY, companyId);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Not remembered.
  }
}
