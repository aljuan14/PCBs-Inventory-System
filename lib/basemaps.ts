// Esri tiles need no API key (CARTO's now do and draw "API key required").
// The light gray canvas comes as a base and a labels layer; tiles beyond
// the native zoom are scaled up rather than shown as "no data".
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
export const BASEMAPS = {
  map: { label: 'Peta', layers: [`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`], maxNativeZoom: 16 },
  satellite: { label: 'Satelit', layers: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], maxNativeZoom: 18 },
} as const;
export const BASEMAP_ATTRIBUTION = 'Tiles &copy; Esri';
export type Basemap = keyof typeof BASEMAPS;
