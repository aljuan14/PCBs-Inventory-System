/**
 * Utility: DMS (Degrees, Minutes, Seconds) & Geographic Coordinate Parser
 * Proyek: PCBs Inventory System
 * 
 * Mengonversi beragam format penulisan koordinat DMS (termasuk format Indonesia)
 * menjadi koordinat desimal { latitude: number | null, longitude: number | null }.
 */

export interface ParsedCoordinate {
  latitude: number | null;
  longitude: number | null;
  raw?: string;
  isValid: boolean;
}

/**
 * Normalisasi string: ganti simbol derajat/menit/detik,
 * ubah arah Indonesia (LU, LS, BT, BB) menjadi (N, S, E, W),
 * dan standardisasi karakter kutip serta koma desimal gantung.
 */
function normalizeCoordinateString(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  return raw
    .trim()
    // Normalisasi kutip dan simbol derajat
    .replace(/[°º˚]/g, ' ')
    .replace(/['`’′]/g, "'")
    .replace(/["”″]|''/g, '"')
    // Tangani kasus typo umum seperti "35',973\"" -> "35' 0,973\""
    .replace(/'\s*[,.](\d+)\s*"/g, "' 0.$1\"")
    // Tangani koma desimal tanpa angka di depan: misal ",973\"" -> "0.973\""
    .replace(/(^|\s)[,.](\d+)/g, '$10.$2')
    // Buang label seperti "lat -3.93 long 119.79" atau "LATITUDE-6.9LONGITUDE107.5";
    // huruf di dalamnya (mis. "n" pada "long") terbaca sebagai arah mata angin.
    .replace(/latitude|longitude|\blat\b|\blong\b|\blng\b|\blon\b/gi, ' ')
    // Normalisasi arah mata angin Indonesia ke Standar Internasional
    .replace(/\bLU\b/gi, 'N')
    .replace(/\bLS\b/gi, 'S')
    .replace(/\bBT\b/gi, 'E')
    .replace(/\bBB\b/gi, 'W')
    // Rapikan spasi berlebih
    .replace(/\s+/g, ' ');
}

/**
 * Parsing satu komponen koordinat (latitude atau longitude)
 * Format yang didukung:
 * 1. "S 7 2' 17,151\"" atau "7° 2' 17.151\" S"
 * 2. "107 35' 0,973\" E" atau "E 107 35.973'"
 * 3. "-7.038097" atau "107.583604"
 */
function parseSingleComponent(componentStr: string, defaultHemisphere?: 'N' | 'S' | 'E' | 'W'): number | null {
  if (!componentStr) return null;
  const str = componentStr.trim();

  // 1. Deteksi arah mata angin (N, S, E, W)
  let hemisphere: string | null = null;
  const matchHemi = str.match(/([NSEW])/i);
  if (matchHemi) {
    hemisphere = matchHemi[1].toUpperCase();
  } else if (defaultHemisphere) {
    hemisphere = defaultHemisphere;
  }

  // Buang huruf arah untuk mengekstrak angka
  const cleanStr = str.replace(/[NSEW]/gi, '').trim();

  // Cek jika murni angka desimal biasa (misal: "-7.038097" atau "-7,038097")
  const simpleDecimal = cleanStr.replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(simpleDecimal)) {
    let val = parseFloat(simpleDecimal);
    if (hemisphere === 'S' || hemisphere === 'W') {
      val = -Math.abs(val);
    } else if (hemisphere === 'N' || hemisphere === 'E') {
      val = Math.abs(val);
    }
    return isNaN(val) ? null : val;
  }

  // Ekstraksi angka derajat, menit, detik
  // Ubah koma desimal antara dua digit menjadi titik desimal (17,151 -> 17.151)
  const numTokens = cleanStr
    .replace(/(\d+),(\d+)/g, '$1.$2')
    .replace(/[^0-9.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((s) => parseFloat(s))
    .filter((n) => !isNaN(n));

  if (numTokens.length === 0) return null;

  let deg = 0;
  let min = 0;
  let sec = 0;

  if (numTokens.length === 1) {
    deg = numTokens[0];
  } else if (numTokens.length === 2) {
    // Format Deg + Decimal Minutes (misal 107 deg 35.973 min)
    deg = numTokens[0];
    min = numTokens[1];
  } else if (numTokens.length >= 3) {
    // Format Deg + Min + Sec
    deg = numTokens[0];
    min = numTokens[1];
    sec = numTokens[2];

    // Jika sec >= 60 karena kesalahan penulisan tanpa koma (misal 973 bukannya 0.973 atau 17151 bukannya 17.151)
    if (sec >= 60) {
      if (sec < 1000) {
        sec = sec / 1000;
      }
    }
  }

  let decimal = deg + min / 60 + sec / 3600;

  if (hemisphere === 'S' || hemisphere === 'W') {
    decimal = -Math.abs(decimal);
  }

  return Number(decimal.toFixed(7));
}

function swapIfLongitudeFirst(pair: { latitude: number | null; longitude: number | null }) {
  const { latitude, longitude } = pair;
  if (latitude !== null && longitude !== null && Math.abs(latitude) > 90 && Math.abs(latitude) <= 180 && Math.abs(longitude) <= 90) {
    pair.latitude = longitude;
    pair.longitude = latitude;
  }
}

/**
 * Parser utama koordinat DMS ke Desimal.
 * 
 * Contoh input yang didukung:
 * - `S 7 2' 17,151" E 107 35',973"`
 * - `LS 07° 02' 17.151" BT 107° 35' 00.973"`
 * - `7°2'17.151"S, 107°35'0.973"E`
 * - `-7.038097, 107.583604`
 * - `-7,038097; 107,583604`
 */
export function parseDMSCoordinate(rawInput: string | null | undefined): ParsedCoordinate {
  const result: ParsedCoordinate = {
    latitude: null,
    longitude: null,
    raw: rawInput || '',
    isValid: false,
  };

  if (!rawInput || typeof rawInput !== 'string') {
    return result;
  }

  // Pasangan desimal biasa, termasuk koma desimal gaya Indonesia:
  // "-6,858005 107,578106", "-6,1711789, 106,7265942", "6.35 ; 106.85",
  // dan titik sebagai pemisah "-6.150885.106.659203".
  const decimalPair =
    /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:[;/|]\s*|,\s+|\s+|,(?=-?\d{1,3}\.))(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(rawInput) ??
    /^\s*(-?\d{1,2}\.\d+)\.(\d{2,3}\.\d+)\s*$/.exec(rawInput);
  // Desimal dengan huruf arah di belakang: "7.1000S 107.1263E".
  const hemiPair = /^\s*(\d{1,2}(?:[.,]\d+)?)\s*([NS])[\s,;:]+(\d{1,3}(?:[.,]\d+)?)\s*([EW])\s*$/i.exec(rawInput);
  if (hemiPair) {
    const latitude = parseFloat(hemiPair[1].replace(',', '.')) * (/s/i.test(hemiPair[2]) ? -1 : 1);
    const longitude = parseFloat(hemiPair[3].replace(',', '.')) * (/w/i.test(hemiPair[4]) ? -1 : 1);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { ...result, latitude, longitude, isValid: true };
    }
  }
  if (decimalPair) {
    const pair = { latitude: parseFloat(decimalPair[1].replace(',', '.')), longitude: parseFloat(decimalPair[2].replace(',', '.')) };
    swapIfLongitudeFirst(pair);
    if (Math.abs(pair.latitude) <= 90 && Math.abs(pair.longitude) <= 180) {
      return { ...result, ...pair, isValid: true };
    }
  }

  const normalized = normalizeCoordinateString(rawInput);
  if (!normalized) return result;

  // Kasus 1: Mengandung tanda arah eksplisit (N/S dan E/W)
  const hasLatDir = /[NS]/i.test(normalized);
  const hasLonDir = /[EW]/i.test(normalized);

  if (hasLatDir && hasLonDir) {
    // Koma desimal di dalam komponen DMS: 01°04'57,5"N -> 01°04'57.5"N
    const text = normalized.replace(/(\d),(\d)/g, '$1.$2');
    const latIdx = text.search(/[NS]/i);
    const lonIdx = text.search(/[EW]/i);
    const [firstIdx, secondIdx] = latIdx < lonIdx ? [latIdx, lonIdx] : [lonIdx, latIdx];
    // Arah di belakang angka ("7 2' 17"S 107 35' 0.9"E") bila ada angka sebelum huruf
    // pertama; selain itu arah di depan ("S 7 2' 17" E 107 35' 0.9"").
    const suffixStyle = /\d/.test(text.slice(0, firstIdx));
    const firstPart = suffixStyle ? text.slice(0, firstIdx + 1) : text.slice(firstIdx, secondIdx);
    const secondPart = suffixStyle ? text.slice(firstIdx + 1) : text.slice(secondIdx);
    const clean = (part: string) => part.replace(/^[\s,;:/|]+|[\s,;:/|]+$/g, '');
    const [latPart, lonPart] = latIdx < lonIdx ? [firstPart, secondPart] : [secondPart, firstPart];
    result.latitude = parseSingleComponent(clean(latPart));
    result.longitude = parseSingleComponent(clean(lonPart));
  } else {
    // Kasus 2: Koordinat dipisah koma atau titik koma (misal "-7.12345, 107.6789" atau "7 2 17.15, 107 35 0.9")
    let splitChar = '';
    if (normalized.includes(';') || normalized.includes('/') || normalized.includes('|')) {
      splitChar = ';';
    } else if (normalized.includes(',')) {
      const commaCount = (normalized.match(/,/g) || []).length;
      if (commaCount === 1) {
        splitChar = ',';
      } else {
        splitChar = ',';
      }
    }

    const parts = splitChar
      ? normalized.split(splitChar === ';' ? /[/;|]/ : ',')
      : normalized.split(/\s{2,}/);

    if (parts.length >= 2) {
      result.latitude = parseSingleComponent(parts[0]);
      result.longitude = parseSingleComponent(parts[1]);
    }
  }

  // Tanpa huruf arah, urutan bujur-lintang ("107.61 -6.87") dikenali dari nilai > 90.
  if (!(hasLatDir && hasLonDir)) swapIfLongitudeFirst(result);

  // Validasi rentang koordinat bumi
  const validLat = result.latitude !== null && !isNaN(result.latitude) && result.latitude >= -90 && result.latitude <= 90;
  const validLon = result.longitude !== null && !isNaN(result.longitude) && result.longitude >= -180 && result.longitude <= 180;

  result.isValid = validLat && validLon;
  return result;
}

// ---------------------------------------------------------------------------
// Perbaikan koordinat rusak yang umum di laporan Indonesia. Hanya dipakai bila
// parser biasa gagal, dan hasilnya hanya diterima bila jatuh di wilayah
// Indonesia (rentang lintang dan bujurnya tidak tumpang tindih, sehingga
// urutan dan posisi desimal yang hilang dapat ditebak dengan aman).

const INDONESIA_LAT = [-11.5, 6.5] as const;
const INDONESIA_LNG = [94, 141.5] as const;
const inLat = (value: number) => value >= INDONESIA_LAT[0] && value <= INDONESIA_LAT[1];
const inLng = (value: number) => value >= INDONESIA_LNG[0] && value <= INDONESIA_LNG[1];

/** Lintang dari angka yang titik desimalnya hilang: "-6128964" -> -6.128964. */
function latitudeFromDigits(negative: boolean, digits: string): number[] {
  if (digits.length < 4) return [];
  const sign = negative ? -1 : 1;
  const values = [sign * Number(`${digits[0]}.${digits.slice(1)}`)];
  if (/^1[01]/.test(digits)) values.push(sign * Number(`${digits.slice(0, 2)}.${digits.slice(2)}`));
  return values;
}

/** Bujur dari angka yang titik desimalnya hilang: "12303038" -> 123.03038. */
function longitudeFromDigits(digits: string): number[] {
  if (digits.length < 4) return [];
  const three = Number(digits.slice(0, 3));
  if (three >= 100 && three <= 141) return [Number(`${digits.slice(0, 3)}.${digits.slice(3)}`)];
  const two = Number(digits.slice(0, 2));
  return two >= 94 && two <= 99 ? [Number(`${digits.slice(0, 2)}.${digits.slice(2)}`)] : [];
}

interface Candidate {
  value: number;
  /** Digits the decimal point was guessed for (0 when the value was written as a decimal). */
  guessedDigits: number;
  /** Decimal places implied by the guess. */
  places?: number;
}

/** Kemungkinan nilai satu angka, sebagai lintang atau bujur. */
function candidates(token: string, role: 'lat' | 'lng'): Candidate[] {
  const negative = token.startsWith('-');
  const sign = negative ? -1 : 1;
  const groups = token.replace(/^-/, '').split(/[.,]/);
  if (groups.length === 2 && groups[1] !== '') return [{ value: sign * Number(`${groups[0]}.${groups[1]}`), guessedDigits: 0 }];
  // Titik ribuan tempat titik desimal seharusnya: "100.372.191" -> 100.372191.
  if (groups.length > 2) return [{ value: sign * Number(`${groups[0]}.${groups.slice(1).join('')}`), guessedDigits: 0 }];
  const digits = groups[0];
  // Angka seperti "120000000" lebih mungkin isian asal daripada koordinat.
  if (/^\d{1,3}0{4,}$/.test(digits)) return [];
  const values = role === 'lat' ? latitudeFromDigits(negative, digits) : negative ? [] : longitudeFromDigits(digits);
  return values.map((value) => ({ value, guessedDigits: digits.length, places: digits.length - String(Math.trunc(Math.abs(value))).length }));
}

function assignPair(first: string, second: string) {
  for (const [latToken, lngToken] of [[first, second], [second, first]]) {
    const longitude = candidates(lngToken, 'lng').find((candidate) => inLng(candidate.value));
    const latitudes = candidates(latToken, 'lat').filter((candidate) => inLat(candidate.value));
    if (!longitude || latitudes.length === 0) continue;
    if (!latitudes[0].guessedDigits || !longitude.guessedDigits) return { latitude: latitudes[0].value, longitude: longitude.value };
    // Both decimal points guessed: both values were written with the same
    // precision, which also tells -1.0265982 from -10.265982. Pairs that match
    // no precision ("122085, 1228897222") are noise.
    const latitude = latitudes.find((candidate) => candidate.places === longitude.places);
    if (latitude) return { latitude: latitude.value, longitude: longitude.value };
  }
  return null;
}

/** Lintang dan bujur yang tergabung: "-5.22015105.17231", "-6206113106.64094". */
function splitGlued(token: string) {
  const negative = token.startsWith('-');
  const groups = token.replace(/^-/, '').split(/[.,]/);
  // "-615.894.271" is one thousands-grouped number (a latitude alone), not two values.
  if (groups.length > 2 && groups.slice(1).every((group) => group.length === 3)) return null;
  // Longitude written first ("105.239115.354094"): where its decimals end is a guess.
  if (groups.length > 2 && Number(groups[0]) > 11) return null;
  const lastSeparator = Math.max(token.lastIndexOf('.'), token.lastIndexOf(','));
  if (lastSeparator < 0) return null;
  const head = token.slice(0, lastSeparator).replace(/[-.,]/g, '');
  const decimals = token.slice(lastSeparator + 1);
  if (decimals.length < 2) return null;
  for (const size of [3, 2]) {
    const longitude = Number(`${head.slice(-size)}.${decimals}`);
    const latDigits = head.slice(0, -size);
    const latitude = (negative ? -1 : 1) * Number(`${latDigits[0]}.${latDigits.slice(1)}`);
    if (latDigits.length >= 4 && inLng(longitude) && inLat(latitude)) return { latitude, longitude };
  }
  return null;
}

/**
 * Mencoba memulihkan koordinat berformat rusak di wilayah Indonesia:
 * - titik desimal hilang: "5196385, 97142441", "-6933021 107725087"
 * - lintang & bujur tergabung: "-5.22015105.17231", "-3,80065119,642233333333"
 * - pemisah " - " yang bukan tanda minus: "95.338272 - 5.539508"
 * - derajat + menit desimal: "-6 35.589 108 17.936"
 * Mengembalikan null bila tidak ada tafsiran yang jatuh di Indonesia.
 */
export function repairIndonesianCoordinate(rawInput: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!rawInput) return null;
  const text = String(rawInput)
    .replace(/latitude|longitude|\blat\b|\blong\b|\blng\b/gi, ' ')
    .replace(/\s-\s/g, ' ')
    .replace(/[^\d.,\-\s]/g, ' ');
  const tokens = (text.match(/-?\d+(?:[.,]\d+)*/g) ?? []).filter((token) => /\d/.test(token));

  if (tokens.length === 2) return assignPair(tokens[0], tokens[1]);
  if (tokens.length === 4) {
    // Derajat + menit desimal, lintang atau bujur lebih dulu.
    const [a, b, c, d] = tokens.map((token) => Number(token.replace(',', '.')));
    const toDecimal = (deg: number, min: number) => Number((Math.sign(deg || 1) * (Math.abs(deg) + min / 60)).toFixed(7));
    if (b >= 60 || d >= 60) return null;
    for (const [latitude, longitude] of [[toDecimal(a, b), toDecimal(c, d)], [toDecimal(c, d), toDecimal(a, b)]]) {
      if (inLat(latitude) && inLng(longitude)) return { latitude, longitude };
    }
    return null;
  }
  if (tokens.length === 1) {
    const token = tokens[0];
    const glued = splitGlued(token);
    if (glued) return glued;
    // Dua angka dipisah koma tanpa spasi: "-6.326832,1063923065".
    const comma = token.indexOf(',');
    const [left, right] = [token.slice(0, comma), token.slice(comma + 1)];
    if (comma > 0 && /^-?\d+\.\d+$/.test(left) && /^\d+$/.test(right)) return assignPair(left, right);
  }
  return null;
}
