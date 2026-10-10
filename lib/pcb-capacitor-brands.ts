/**
 * Trade names of capacitors containing PCBs: Lampiran II of Permen LHK
 * P.29/MENLHK/SETJEN/PLB.3/12/2020 (pages 20-23), in the order and spelling
 * of the regulation, "Vlk Leopold" listed twice as there.
 *
 * `untilYear` is the last production year that contains PCBs ("Semua sampai
 * tahun 1982" is 1982); null means every year ("Semua Kapasitor (saat ini
 * sudah tidak berproduksi)"). `pattern` matches the brand as written in the
 * inventory (nama_merek, lower-cased), where it is often one word among
 * others ("lvmdp 2-p1/nokian"). ABB is deliberately not matched for BICC:
 * the ABB brand dates from 1988, after every year in the list.
 */
export interface PcbCapacitorBrand {
  name: string;
  rule: string;
  untilYear: number | null;
  pattern: RegExp;
  /** The rule also depends on a label the inventory does not record. */
  labelNote?: string;
}

const ALL = 'Semua Kapasitor (saat ini sudah tidak berproduksi)';
const until = (year: number) => `Semua sampai tahun ${year}`;

export const PCB_CAPACITOR_BRANDS: PcbCapacitorBrand[] = [
  { name: 'AEg Hydra, Berlin', rule: 'Sampai tahun 1982, semua Kapasitor berlabel "CD", "CPA", "Clophen"', untilYear: 1982, pattern: /\baeg\b/, labelNote: 'Hanya yang berlabel "CD", "CPA" atau "Clophen"' },
  { name: 'Arcotronics, Italy', rule: until(1977), untilYear: 1977, pattern: /arcotronic/ },
  { name: 'Asea Kabel, Sweden', rule: 'Semua sampai tahun 1981, semua Kapasitor berlabel "Askarel"', untilYear: 1981, pattern: /\basea\b(?!.*lepper)/, labelNote: 'Juga semua yang berlabel "Askarel"' },
  { name: 'Asea - Lepper (or Dominit or Brilon D)', rule: until(1980), untilYear: 1980, pattern: /lepper|dominit|brilon/ },
  { name: 'Baugatz Ludwig, Berlin', rule: until(1983), untilYear: 1983, pattern: /baugatz.*(ludwig|berlin)|ludwig.*baugatz/ },
  { name: 'Baugatz Kondensatorien, Austria', rule: until(1982), untilYear: 1982, pattern: /baugatz/ },
  { name: 'BICC Capacitors LTD, Helsby England (subsequently commercialized as ABB capacitors)', rule: 'Semua Kapasitor hingga tahun 1982, kecuali Kapasitor kering', untilYear: 1982, pattern: /\bbicc\b/, labelNote: 'Kecuali kapasitor kering' },
  { name: 'Brandt W. Gmbh, Leopoldstadt, Lippe', rule: ALL, untilYear: null, pattern: /\bbrandt\b/ },
  { name: 'CAF Kondensatoren, Duisburg – Hamborn', rule: ALL, untilYear: null, pattern: /\bcaf\b/ },
  { name: 'Comar Condensatori, Italy', rule: until(1981), untilYear: 1981, pattern: /\bcomar\b/ },
  { name: 'Cond. Fribourg,', rule: until(1983), untilYear: 1983, pattern: /fribourg/ },
  { name: 'Detron Stein', rule: until(1981), untilYear: 1981, pattern: /detron/ },
  { name: 'Dubiler, England', rule: until(1982), untilYear: 1982, pattern: /dubil/ },
  { name: 'Ducati Energia SpA, Italy', rule: until(1982), untilYear: 1982, pattern: /ducati/ },
  { name: 'Egra KG,', rule: ALL, untilYear: null, pattern: /\begra\b/ },
  { name: 'Elcontrol spa, Italy', rule: until(1984), untilYear: 1984, pattern: /elcontrol/ },
  { name: 'Electronicon Gmbh', rule: until(1985), untilYear: 1985, pattern: /electronicon/ },
  { name: 'Elektrica (F. Kucera)', rule: ALL, untilYear: null, pattern: /kucera|\belektrica\b/ },
  { name: 'Elkonda Gmbh, Germany', rule: ALL, untilYear: null, pattern: /elkonda/ },
  { name: 'Felten + Guilleaume, Energie technik, Cologne, Germany', rule: until(1982), untilYear: 1982, pattern: /felten|guilleaume/ },
  { name: 'Frako, Teningen', rule: until(1983), untilYear: 1983, pattern: /\bfrako\b/ },
  { name: 'General Electric, Usa', rule: until(1980), untilYear: 1980, pattern: /general electric|\bge\b/ },
  { name: 'Grunow Ernst KG, Monaco', rule: ALL, untilYear: null, pattern: /grunow/ },
  { name: 'Haefely SA, France and Germany', rule: until(1984), untilYear: 1984, pattern: /haefely/ },
  { name: 'Hitachi, Japan', rule: until(1982), untilYear: 1982, pattern: /hitachi/ },
  { name: 'Hunts, England', rule: until(1982), untilYear: 1982, pattern: /\bhunts\b/ },
  { name: 'I.B.M, USA', rule: until(1979), untilYear: 1979, pattern: /\bi\.?b\.?m\b/ },
  { name: 'ICar – Slimotor', rule: until(1981), untilYear: 1981, pattern: /\bicar\b|slimotor/ },
  { name: 'Internally, USA', rule: until(1979), untilYear: 1979, pattern: /\binternally\b/ },
  { name: 'Iskra Semic, Yugoslavia', rule: until(1985), untilYear: 1985, pattern: /iskra/ },
  { name: 'Isokond Gmbh, Germany', rule: until(1985), untilYear: 1985, pattern: /isokond/ },
  { name: 'Italfarad Spa, Italy', rule: until(1981), untilYear: 1981, pattern: /italfarad/ },
  { name: 'Jensen Tobias, Denmark', rule: 'Semua dengan huruf "C..." atau "O...", sampai tahun 1982', untilYear: 1982, pattern: /jensen/, labelNote: 'Hanya tipe berhuruf "C..." atau "O..."' },
  { name: 'Otto Junker, Gmbh, Germany', rule: until(1983), untilYear: 1983, pattern: /junker/ },
  { name: 'Kapsch & Sohne, Austria', rule: until(1982), untilYear: 1982, pattern: /kapsch/ },
  { name: 'KD Kondensatoren, Monaco, Germany', rule: until(1982), untilYear: 1982, pattern: /\bkd kondens/ },
  { name: 'Knobel, Emenda GL', rule: until(1982), untilYear: 1982, pattern: /knobel/ },
  { name: 'Konig, Vienna', rule: until(1982), untilYear: 1982, pattern: /\bk(o|ö)nig\b/ },
  { name: 'Leclanche, SA, France', rule: until(1975), untilYear: 1975, pattern: /leclanch/ },
  { name: 'Liljeholmens, Kabel AB, Stockholm, Sweden', rule: until(1981), untilYear: 1981, pattern: /liljeholmen/ },
  { name: 'Leopold Vlk, Pocking Niederbayern', rule: ALL, untilYear: null, pattern: /\bvlk\b/ },
  { name: 'Lorenzetti, Brasileira', rule: until(1982), untilYear: 1982, pattern: /lorenzetti/ },
  { name: 'Mallory Capacitors, USA', rule: until(1979), untilYear: 1979, pattern: /mallory/ },
  { name: 'Mikafil AG, Switzerland', rule: until(1977), untilYear: 1977, pattern: /mikafil/ },
  { name: 'NCC', rule: until(1982), untilYear: 1982, pattern: /\bncc\b/ },
  { name: 'Neuberger Gmbh', rule: ALL, untilYear: null, pattern: /neuberger/ },
  { name: 'Neuko, Germany', rule: until(1982), untilYear: 1982, pattern: /neuko/ },
  { name: 'Nokia Capacitors, Finland', rule: until(1982), untilYear: 1982, pattern: /nokia/ },
  { name: 'Pressey TCC, England', rule: until(1982), untilYear: 1982, pattern: /pressey/ },
  { name: 'Rectiphase SA, France', rule: until(1982), untilYear: 1982, pattern: /rectiphase/ },
  { name: 'Richmont', rule: until(1982), untilYear: 1982, pattern: /richmont/ },
  { name: 'Roederstein Gmbh', rule: until(1983), untilYear: 1983, pattern: /roederstein|röderstein/ },
  { name: 'Ruppel & Co, Germany', rule: ALL, untilYear: null, pattern: /ruppel/ },
  { name: 'Saarland Kondensatorenbau', rule: ALL, untilYear: null, pattern: /saarland/ },
  { name: 'Si Safco Colombes, France', rule: ALL, untilYear: null, pattern: /safco/ },
  { name: 'Siemes AG Dynamowerk, Berlin', rule: until(1982), untilYear: 1982, pattern: /siemens|siemes/ },
  { name: 'STR Standard Telephon + Radio', rule: ALL, untilYear: null, pattern: /standard telephon|\bstr\b/ },
  { name: 'SukoHerrsching D', rule: until(1982), untilYear: 1982, pattern: /suko/ },
  { name: 'System Electric Gmbh', rule: until(1983), untilYear: 1983, pattern: /system electric/ },
  { name: 'Tesla, Czechoslovakia', rule: until(1986), untilYear: 1986, pattern: /tesla/ },
  { name: 'Thomson', rule: until(1982), untilYear: 1982, pattern: /thomson/ },
  { name: 'Unitra Telpod, Polski', rule: until(1986), untilYear: 1986, pattern: /unitra|telpod/ },
  { name: 'Varilec SA, France', rule: until(1984), untilYear: 1984, pattern: /varilec/ },
  { name: 'Varo S.R.L, Italy', rule: until(1982), untilYear: 1982, pattern: /\bvaro\b/ },
  { name: 'VA-RU Kondens, Eckernforde D', rule: ALL, untilYear: null, pattern: /\bva-?ru\b/ },
  { name: 'Vauka MPKO GmbH', rule: ALL, untilYear: null, pattern: /vauka/ },
  { name: 'Vlk Leopold, Pocking', rule: ALL, untilYear: null, pattern: /\bvlk\b/ },
  { name: 'Wegowerke, Rinkling + Winterhalter, Freiburg / Breisgau D', rule: until(1982), untilYear: 1982, pattern: /wego|winterhalter/ },
  { name: 'Wico, Japan', rule: until(1982), untilYear: 1982, pattern: /\bwico\b/ },
  { name: 'Xamax AG, Embrach', rule: until(1984), untilYear: 1984, pattern: /xamax/ },
  { name: 'Zeh Wilhelm KG, Freiburg / Breisgau', rule: ALL, untilYear: null, pattern: /\bzeh\b/ },
  { name: 'Zellweger, Uster ZH', rule: ALL, untilYear: null, pattern: /zellweger/ },
];

/**
 * potential: brand listed and made within its years (or the rule covers all
 * years); check: brand listed but no production year; after: brand listed
 * but made after its last year.
 */
export type CapacitorMatchStatus = 'potential' | 'check' | 'after';

export const MATCH_STATUS_LABELS: Record<CapacitorMatchStatus, string> = {
  potential: 'Berpotensi PCBs',
  check: 'Perlu dicek (tahun kosong)',
  after: 'Di luar batas tahun',
};

/** The first listed brand matching a capacitor, with its status; null when none matches. */
export function matchCapacitor(brand: string | null, year: number | null): { index: number; status: CapacitorMatchStatus } | null {
  if (!brand) return null;
  const text = brand.toLowerCase();
  const index = PCB_CAPACITOR_BRANDS.findIndex((entry) => entry.pattern.test(text));
  if (index < 0) return null;
  const { untilYear } = PCB_CAPACITOR_BRANDS[index];
  const status: CapacitorMatchStatus = untilYear === null || (year !== null && year <= untilYear) ? 'potential' : year === null ? 'check' : 'after';
  return { index, status };
}
