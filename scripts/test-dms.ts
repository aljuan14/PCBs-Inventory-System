import { parseDMSCoordinate, repairIndonesianCoordinate } from '../lib/dms';

/**
 * Regression cases for the coordinate parser, many taken from real PLN reports.
 *   npx tsx scripts/test-dms.ts
 * Expected values are [latitude, longitude], or null when the input must be rejected.
 */
type Expected = [number, number] | null;

const parserCases: Array<[string, Expected]> = [
  ['S 7 2\' 17,151" E 107 35\',973"', [-7.0380975, 107.5836036]],
  ['LS 07° 02\' 17.151" BT 107° 35\' 00.973"', [-7.0380975, 107.5836036]],
  ['7°2\'17.151"S, 107°35\'0.973"E', [-7.0380975, 107.5836036]],
  ['-7.038097, 107.583604', [-7.038097, 107.583604]],
  ['S 6° 12\' 30" E 106° 49\' 45"', [-6.2083333, 106.8291667]],
  ['LU 03° 35\' 12" BB 098° 40\' 22"', [3.5866667, -98.6727778]],
  // Hemisphere letter after the value, no separator between the two parts.
  ['0°00\'24.7"S 103°44\'31.8"E', [-0.0068611, 103.7421667]],
  ['01°04\'57,5"N 101°16\'37,4"E', [1.0826389, 101.2770556]],
  ['6 54\' 14" s 105 39\' 47" E', [-6.9038889, 105.6630556]],
  ['0,7786°S, 100.3133°E', [-0.7786, 100.3133]],
  // Longitude written first.
  ['107,652644 -6,860176', [-6.860176, 107.652644]],
  ['117.20883;-8.47924', [-8.47924, 117.20883]],
  // Brackets and a space after the minus sign must keep the value south.
  ['(-6.8639137, 107.9067197)', [-6.8639137, 107.9067197]],
  ['( - 7.060094 , 108.085394)', [-7.060094, 108.085394]],
  ['( - 7.353595, 108.208250 )', [-7.353595, 108.20825]],
  ['[-6.9, 107.6]', [-6.9, 107.6]],
  // A leading minus on a DMS value without hemisphere letters.
  ['-7 2 17.151, 107 35 0.973', [-7.0380975, 107.5836036]],
  // Two decimals in one part are not degrees + minutes (minutes < 60).
  ['-6.52400 106.79730;106,7973', null],
  ['-8.34345116.02921,132,0ft', null],
  // A short tail after a stray second point is dropped, not a reason to reject.
  ['3.524503,98.6698.94', [3.524503, 98.6698]],
  ['invalid coordinate string', null],
  ['', null],
];

const repairCases: Array<[string, Expected]> = [
  ['5196385, 97142441', [5.196385, 97.142441]],
  ['-6933021 107725087', [-6.933021, 107.725087]],
  ['-10265982, 123646179', [-10.265982, 123.646179]],
  ['-5.22015105.17231', [-5.22015, 105.17231]],
  ['-6206113106.64094', [-6.206113, 106.64094]],
  ['5.1166257105.1387473', [5.1166257, 105.1387473]],
  ['-3,80065119,642233333333', [-3.80065, 119.642233333333]],
  ['-6.206.113.106,64', [-6.206113, 106.64]],
  ['-6.326832,1063923065', [-6.326832, 106.3923065]],
  ['.-7045020,107.736247', [-7.04502, 107.736247]],
  ['100.372.191 1.083.183', [1.083183, 100.372191]],
  ['95.338272 - 5.539508', [5.539508, 95.338272]],
  ['lat -3.934081 long 119,795295', [-3.934081, 119.795295]],
  ['-6 35.589 108 17.936', [-6.59315, 108.2989333]],
  // Must stay unreadable rather than land somewhere plausible but wrong.
  ['-615.894.271', null],
  ['-6.198.254', null],
  ['105.239115.354094', null],
  ['122085, 1228897222', null],
  ['9644397 120000000', null],
  ['Tersebar', null],
];

let failures = 0;
const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6;
const check = (label: string, input: string, actual: { latitude: number | null; longitude: number | null } | null, expected: Expected) => {
  const ok = expected === null ? actual === null : actual !== null && close(actual.latitude, expected[0]) && close(actual.longitude, expected[1]);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label} ${JSON.stringify(input)} -> ${actual ? `${actual.latitude}, ${actual.longitude}` : 'null'}${ok ? '' : `  (harusnya ${expected ? expected.join(', ') : 'null'})`}`);
};

for (const [input, expected] of parserCases) {
  const result = parseDMSCoordinate(input);
  check('parse ', input, result.isValid ? result : null, expected);
}
for (const [input, expected] of repairCases) {
  check('repair', input, repairIndonesianCoordinate(input), expected);
}

console.log(failures === 0 ? '\nSemua kasus lolos.' : `\n${failures} kasus gagal.`);
process.exit(failures === 0 ? 0 : 1);
