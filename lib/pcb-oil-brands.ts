/**
 * Trade names of dielectric oils containing PCBs: Lampiran I of Permen LHK
 * P.29/MENLHK/SETJEN/PLB.3/12/2020 (pages 18-19), in the order and spelling
 * of the regulation (column by column; "Chorinol" is listed twice there).
 * No production year applies: every oil sold under these names counts.
 */
export const PCB_OIL_BRANDS: string[] = [
  'Aceclor', 'Adkarel', 'ALC', 'Apirolio', 'Apirorlio', 'Arochlor', 'Arochlors', 'Aroclor', 'Aroclors', 'Arubren',
  'Asbestol', 'ASK', 'Askael', 'Askarel', 'Auxol', 'Bakola', 'Biphenyl, chlorinated', 'Chlophen', 'Chloretol', 'Chlorextol',
  'Chlorinated biphenyl', 'Chlorinated diphenyl', 'Chlorinol', 'Chlorobiphenyl', 'Chlorodiphenyl',
  'Diaclor', 'Dicolor', 'Diconal', 'Diphenyl, chlorinated', 'DK', 'Duconal', 'Dykanol', 'Educarel', 'EEC-18', 'Elaol',
  'Electrophenyl', 'Elemex', 'Elinol', 'Eucarel', 'Fenchlor', 'Fenclor', 'Fenocloro', 'Gilotherm', 'Hydol', 'Hyrol',
  'Hyvol', 'Inclor', 'Inerteen', 'Inertenn',
  'Orophene', 'PCB', "PCB's", 'PCBs', 'Pheaoclor', 'Phenochlor', 'Phenoclor', 'Plastivar', 'Polychlorinated biphenyl',
  'Polychlorinated biphenyls', 'Polychlorinated diphenyl', 'Polychlorinated diphenyls', 'Polychlorobiphenyl',
  'Polychlorodiphenyl', 'Prodelec', 'Pydraul', 'Pyraclor', 'Pyralene', 'Pyranol', 'Pyroclor', 'Pyronol',
  'Chlorphen', 'Chorextol', 'Chorinol', 'Chorinol', 'Clophen', 'Clophenharz', 'Cloresil', 'Clorinal', 'Clorphen',
  'Decachlorodiphenyl', 'Delor', 'Delorene',
  'Kanechlor', 'Kaneclor', 'Kennechlor', 'Kenneclor', 'Leromoll', 'Magvar', 'MCS 1489', 'Montar', 'Nepolin', 'No-Flamol',
  'NoFlamol', 'Non-Flamol', 'Olex-sf-d',
  'Saf-T-Kuhl', 'Saf-T-Kohl', 'Santosol', 'Santotherm', 'Santothern', 'Santovac', 'Solvol', 'Sorol', 'Soval', 'Sovol',
  'Sovtol', 'Terphenychlore', 'Therminal', 'Therminol', 'Turbinol',
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Each name as a whole word of the brand, e.g. "askarel" in "askarel 1476" but not in "maskarel".
const PATTERNS = PCB_OIL_BRANDS.map((name) => new RegExp(`(?<![a-z0-9])${escape(name.toLowerCase())}(?![a-z0-9])`));

// "PCB", "PCB's" and "PCBs" are listed as names, but in the inventory they
// mostly appear in statements that the oil is free of them ("non pcb oil",
// "tidak mengandung pcbs", "roadmap pengelolaan pcbs"): those do not count.
const GENERIC = new Set(['PCB', "PCB's", 'PCBs']);
const NEGATED = /non[\s-]*pcb|tidak\s+(mengandung|ada)\s+pcb|bebas\s+pcb|pcbs?[\s-]*free|pengelolaan\s+pcb|roadmap/;

/** Index of the first listed name in an oil brand, or -1. */
export function matchOil(brand: string | null) {
  if (!brand) return -1;
  const text = brand.toLowerCase();
  const negated = NEGATED.test(text);
  return PATTERNS.findIndex((pattern, index) => !(negated && GENERIC.has(PCB_OIL_BRANDS[index])) && pattern.test(text));
}
