import { parseDMSCoordinate } from '../lib/dms';

const testCases = [
  'S 7 2\' 17,151" E 107 35\',973"',
  'LS 07° 02\' 17.151" BT 107° 35\' 00.973"',
  '7°2\'17.151"S, 107°35\'0.973"E',
  '-7.038097, 107.583604',
  'S 6° 12\' 30" E 106° 49\' 45"',
  'LU 03° 35\' 12" BB 098° 40\' 22"',
  'invalid coordinate string',
  '',
];

console.log('--- TESTING DMS PARSER ---');
for (const tc of testCases) {
  const res = parseDMSCoordinate(tc);
  console.log(`Input: "${tc}"`);
  console.log(` -> Lat: ${res.latitude}, Lon: ${res.longitude}, Valid: ${res.isValid}\n`);
}
