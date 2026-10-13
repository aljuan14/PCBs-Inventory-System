/**
 * Suggesting the PILAR record (simpel_companies) of an inventory company by
 * name. The names rarely match letter for letter: "PT." against "PT", a plant
 * suffix ("PT Charoen Pokphand Indonesia - Demak"), "Tbk" or "(Persero)". The
 * admin confirms every link on the ID SIMPEL page; only a name that is the
 * same after normalising and belongs to one ID SIMPEL counts as exact.
 */

export type SimpelCompany = {
  id: string;
  id_simpel: string | null;
  nama: string;
  npwp: string | null;
  nib: string | null;
  alamat: string | null;
  bidang_usaha: string | null;
  id_perusahaan_induk: string | null;
};

export type Candidate = {
  record: SimpelCompany;
  /** 0–1, how close the names are. */
  score: number;
  /** The record's ID SIMPEL, or its parent's when it has none. */
  idSimpel: string | null;
  parent: SimpelCompany | null;
};

// Legal forms and filler that every other name also has.
const STOP_WORDS = new Set(['pt', 'cv', 'tbk', 'persero', 'perseroan', 'terbatas', 'pabrik', 'plant', 'unit', 'the', 'dan', 'and', 'co', 'ltd', 'inc', 'ud', 'koperasi']);

// English and Indonesian spellings of the same word, so "Noodle Division" meets "Divisi Noodle".
const SYNONYMS: Record<string, string> = {
  division: 'divisi', div: 'divisi', factory: 'pabrik', mill: 'pabrik', refinery: 'kilang', branch: 'cabang',
  office: 'kantor', field: 'lapangan', regional: 'regional', indonesian: 'indonesia', persada: 'persada',
};

/** Lowercase words without punctuation, legal forms left out, English spellings made Indonesian. */
export function nameTokens(name: string): string[] {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').map((word) => SYNONYMS[word] ?? word).filter((word) => word && !STOP_WORDS.has(word));
}

export const normalName = (name: string) => nameTokens(name).join(' ');

/**
 * Share of the record's words found in the company's name: a company named
 * after a plant ("… Indonesia Demak") still matches its parent record fully,
 * while one shared word ("Indonesia") does not. Short, partly matching record
 * names weigh a little less than long ones.
 */
export function nameScore(company: string[], record: string[]): number {
  if (company.length === 0 || record.length === 0) return 0;
  const words = new Set(company);
  const shared = record.filter((word) => words.has(word)).length;
  const covered = shared / record.length;
  const reverse = shared / company.length;
  return Math.round((covered * 0.7 + reverse * 0.3) * 100) / 100;
}

export type SimpelIndex = {
  records: SimpelCompany[];
  byId: Map<string, SimpelCompany>;
  tokens: Map<string, string[]>;
  /** Records per word, to look at only the records sharing a word. */
  byWord: Map<string, SimpelCompany[]>;
};

export function buildIndex(records: SimpelCompany[]): SimpelIndex {
  const byId = new Map(records.map((record) => [record.id, record]));
  const tokens = new Map<string, string[]>();
  const byWord = new Map<string, SimpelCompany[]>();
  for (const record of records) {
    const words = [...new Set(nameTokens(record.nama))];
    tokens.set(record.id, words);
    for (const word of words) {
      const list = byWord.get(word);
      if (list) list.push(record);
      else byWord.set(word, [record]);
    }
  }
  return { records, byId, tokens, byWord };
}

function candidate(index: SimpelIndex, record: SimpelCompany, score: number): Candidate {
  const parent = record.id_perusahaan_induk ? index.byId.get(record.id_perusahaan_induk) ?? null : null;
  return { record, score, idSimpel: record.id_simpel ?? parent?.id_simpel ?? null, parent };
}

/** The best records for a company name, best first. */
export function findCandidates(index: SimpelIndex, name: string, limit = 5, minScore = 0.5): Candidate[] {
  const words = [...new Set(nameTokens(name))];
  const seen = new Set<string>();
  const found: Candidate[] = [];
  for (const word of words) {
    for (const record of index.byWord.get(word) ?? []) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      const score = nameScore(words, index.tokens.get(record.id)!);
      if (score >= minScore) found.push(candidate(index, record, score));
    }
  }
  // Records with an ID SIMPEL first among equal scores: those can be linked.
  return found.sort((a, b) => b.score - a.score || Number(Boolean(b.idSimpel)) - Number(Boolean(a.idSimpel)) || a.record.nama.localeCompare(b.record.nama)).slice(0, limit);
}

/** Free-text search over name, ID SIMPEL, NPWP and NIB, for picking by hand. */
export function searchRecords(index: SimpelIndex, text: string, limit = 8): Candidate[] {
  const query = text.trim().toLowerCase();
  if (query.length < 2) return [];
  const digits = query.replace(/\D/g, '');
  const words = query.split(/\s+/);
  const hits: Candidate[] = [];
  for (const record of index.records) {
    const name = record.nama.toLowerCase();
    const byName = words.every((word) => name.includes(word));
    const byNumber = digits.length >= 3 && [record.id_simpel, record.npwp, record.nib].some((value) => value?.replace(/\D/g, '') === digits || (digits.length >= 6 && value?.replace(/\D/g, '').includes(digits)));
    if (byName || byNumber) hits.push(candidate(index, record, byNumber ? 1 : 0));
    if (hits.length >= 200) break;
  }
  return hits.sort((a, b) => b.score - a.score || a.record.nama.length - b.record.nama.length).slice(0, limit);
}

/**
 * The one ID SIMPEL whose records carry exactly this name after normalising,
 * or null when there is none or more than one.
 */
export function exactMatch(index: SimpelIndex, name: string): Candidate | null {
  const normal = normalName(name);
  if (!normal) return null;
  const words = normal.split(' ');
  const same = (index.byWord.get(words[0]) ?? []).filter((record) => normalName(record.nama) === normal)
    .map((record) => candidate(index, record, 1))
    .filter((entry) => entry.idSimpel);
  const ids = new Set(same.map((entry) => entry.idSimpel));
  if (ids.size !== 1) return null;
  // Of the records sharing that ID SIMPEL, the one that is not a unit of another.
  return same.find((entry) => !entry.parent) ?? same[0];
}
