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
  const hemiPair = /^\s*(\d{1,2}(?:[.,]\d+)?)\s*([NS])[\s,;]+(\d{1,3}(?:[.,]\d+)?)\s*([EW])\s*$/i.exec(rawInput);
  if (hemiPair) {
    const latitude = parseFloat(hemiPair[1].replace(',', '.')) * (/s/i.test(hemiPair[2]) ? -1 : 1);
    const longitude = parseFloat(hemiPair[3].replace(',', '.')) * (/w/i.test(hemiPair[4]) ? -1 : 1);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { ...result, latitude, longitude, isValid: true };
    }
  }
  if (decimalPair) {
    const latitude = parseFloat(decimalPair[1].replace(',', '.'));
    const longitude = parseFloat(decimalPair[2].replace(',', '.'));
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { ...result, latitude, longitude, isValid: true };
    }
  }

  const normalized = normalizeCoordinateString(rawInput);
  if (!normalized) return result;

  // Kasus 1: Mengandung tanda arah eksplisit (N/S dan E/W)
  const hasLatDir = /[NS]/i.test(normalized);
  const hasLonDir = /[EW]/i.test(normalized);

  if (hasLatDir && hasLonDir) {
    // Pola A: Arah di depan (S ... E ...)
    const patternPrefix = /(^[NS]\s*[^EW]+)\s+([EW]\s*.+$)/i.exec(normalized);
    if (patternPrefix) {
      const latPart = patternPrefix[1];
      const lonPart = patternPrefix[2];
      result.latitude = parseSingleComponent(latPart);
      result.longitude = parseSingleComponent(lonPart);
    } else {
      // Pola B: Arah di belakang atau dipisahkan koma/titik-koma/garis miring (..S, ..E atau ..S / ..E)
      const parts = normalized.split(/[,;/|]|\s+(?=[EW])/i);
      if (parts.length >= 2) {
        let latStr = '';
        let lonStr = '';
        for (const p of parts) {
          if (/[NS]/i.test(p) && !latStr) latStr = p;
          else if (/[EW]/i.test(p) && !lonStr) lonStr = p;
        }
        result.latitude = parseSingleComponent(latStr);
        result.longitude = parseSingleComponent(lonStr);
      } else {
        // Coba regex tangkap grup N/S dan E/W
        const matchLat = normalized.match(/([^,;]*?[NS][^EW,;]*|[NS]\s*[^EW,;]+)/i);
        const matchLon = normalized.match(/([^,;]*?[EW][^NS,;]*|[EW]\s*[^NS,;]+)/i);
        if (matchLat && matchLon) {
          result.latitude = parseSingleComponent(matchLat[0]);
          result.longitude = parseSingleComponent(matchLon[0]);
        }
      }
    }
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

  // Validasi rentang koordinat bumi
  const validLat = result.latitude !== null && !isNaN(result.latitude) && result.latitude >= -90 && result.latitude <= 90;
  const validLon = result.longitude !== null && !isNaN(result.longitude) && result.longitude >= -180 && result.longitude <= 180;

  result.isValid = validLat && validLon;
  return result;
}
