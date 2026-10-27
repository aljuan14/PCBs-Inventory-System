'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Canvas, DivIcon, LayerGroup, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { House, Loader2, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { INVENTORY_CATEGORIES, PCB_GROUPS, PCB_GROUP_PARTS, getCategoryColor, getCategoryLabel, pcbGroupLabel, pcbGroupOf, type InventoryCategory, type PcbGroup } from '@/lib/inventory';
import { DEFAULT_MAP_FILTERS, fetchMapCells, fetchMapPointsIn, fetchSummaryCells, type CategoryFilter, type DashboardScope, type MapBounds, type MapCell, type MapFilters } from '@/lib/inventory-query';
import CompanyPicker from '@/components/CompanyPicker';
import { SUMMARY_MODE } from '@/lib/data-mode';
import type { CompanyOption } from '@/components/DataTable';
import { BASEMAPS, BASEMAP_ATTRIBUTION, type Basemap } from '@/lib/basemaps';

export interface MapPoint {
  id: string;
  type: InventoryCategory;
  name: string;
  companyName: string;
  serialNumber?: string;
  location?: string;
  latitude: number;
  longitude: number;
  pcbConcentration: number | null;
  year: number | null;
}

type ColorMode = 'pcb' | 'category';
/** Dots: many small dots, one per nearby data (fine cells); groups: numbered bubbles (coarse cells). */
type ViewMode = 'dots' | 'groups';
// The same groups and colours as the dashboard (PCB_GROUPS): the 50 ppm Batas Konsentrasi only.
const PCB_COLORS: Array<{ key: PcbGroup; label: string; color: string }> = (['high', 'below50', 'untested'] as const).map((key) => ({ key, label: pcbGroupLabel(key), color: PCB_GROUPS[key].color }));
const CELL_CATEGORIES: Array<{ key: keyof MapCell; category: InventoryCategory }> = [
  { key: 'trafo_used', category: 'transformator_digunakan' },
  { key: 'trafo_unused', category: 'transformator_tidak_digunakan' },
  { key: 'kapasitor', category: 'kapasitor' },
  { key: 'minyak', category: 'minyak_dielektrik' },
];

// Indonesia, and the box a company's points are fitted within: a few rows
// carry coordinates far outside it (swapped or mistyped), which must not
// zoom the map out to the whole world.
const INDONESIA: [[number, number], [number, number]] = [[-11, 95], [6, 141]];
const FIT_BOX = { south: -15, west: 90, north: 10, east: 145 };
// All of Indonesia, as close as fits: zoom moves in quarter levels (zoomSnap), so the map is
// not left at the whole level out with wide margins.
const showIndonesia = (map: LeafletMap) => map.fitBounds(INDONESIA);
// Single points are drawn once at most this many are in view; above it, cells (dots or bubbles).
const POINT_LIMIT = 1500;
// Grid cell of about 40 px at a zoom level (groups), or of about 6 px (dots).
const cellSize = (zoom: number, view: ViewMode) => view === 'dots'
  ? Math.min(1, Math.max(0.0001, 84 / 10 / 2 ** zoom))
  : Math.min(5, Math.max(0.0005, 84 / 1.5 / 2 ** zoom));
// Summary mode: the levels prepared by summary_build (migration 20261010000003), one finer for groups
// (cells half the size) and three finer for dots (an eighth).
const summaryLevel = (zoom: number, view: ViewMode) => Math.min(11, Math.max(4, Math.round(zoom) + (view === 'dots' ? 3 : 1)));
// A dot's radius grows a little with what it holds: 3 px for one, up to 6 px.
const dotRadius = (total: number) => Math.min(6, 3 + Math.log2(total) * 0.5);



const CATEGORY_OPTIONS: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: 'Semua kategori' },
  { key: 'transformator', label: 'Semua transformator' },
  ...INVENTORY_CATEGORIES.map((category) => ({ key: category.key as CategoryFilter, label: category.shortLabel })),
];
const PCB_OPTIONS: Array<{ key: MapFilters['pcbRange']; label: string }> = [
  { key: 'all', label: 'Semua hasil uji' },
  ...PCB_COLORS.map((entry) => ({ key: entry.key as MapFilters['pcbRange'], label: entry.label })),
];
const YEAR_OPTIONS: Array<{ key: MapFilters['year']; label: string }> = [
  { key: 'all', label: 'Semua tahun' },
  { key: 'pre1997', label: 'Buatan sebelum 1997' },
  { key: 'from1997', label: 'Buatan 1997 ke atas' },
  { key: 'unknown', label: 'Tahun kosong' },
];
const SELECT_CLASS = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs focus:border-emerald-500 focus:outline-none';

// Tooltip content is HTML built from spreadsheet values; escape them so a
// cell cannot inject markup or scripts.
const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
const formatNumber = (value: number) => value.toLocaleString('id-ID');

// Points closer than ~0.1 m share a marker, so a click must cover all of them.
const coordinateKey = (point: MapPoint) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;

const pointColor = (point: MapPoint, mode: ColorMode) =>
  mode === 'pcb' ? PCB_GROUPS[pcbGroupOf(point.pcbConcentration)].color : getCategoryColor(point.type);

/** A cell's shares as (colour, count), in the order of its legend. */
function cellShares(cell: MapCell, mode: ColorMode) {
  return mode === 'pcb'
    ? PCB_COLORS.map((entry) => ({ color: entry.color, label: entry.label, count: PCB_GROUP_PARTS[entry.key].reduce((sum, part) => sum + cell[part], 0) }))
    : CELL_CATEGORIES.map((entry) => ({ color: getCategoryColor(entry.category), label: getCategoryLabel(entry.category), count: cell[entry.key] }));
}

/** A round bubble: a ring split by the shares (conic gradient), the count inside. */
function cellIconHtml(cell: MapCell, mode: ColorMode, size: number) {
  let from = 0;
  const stops = cellShares(cell, mode).filter((share) => share.count > 0).map((share) => {
    const to = from + (share.count / cell.total) * 360;
    const stop = `${share.color} ${from}deg ${to}deg`;
    from = to;
    return stop;
  });
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:conic-gradient(${stops.join(',')});box-shadow:0 1px 4px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;cursor:pointer">
    <div style="width:${size - 8}px;height:${size - 8}px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font:600 ${size > 40 ? 12 : 11}px/1 system-ui,sans-serif;color:#0f172a">${cell.total >= 10000 ? `${Math.round(cell.total / 1000)}rb` : formatNumber(cell.total)}</div>
  </div>`;
}

function cellTooltip(cell: MapCell, mode: ColorMode) {
  const rows = cellShares(cell, mode).filter((share) => share.count > 0)
    .map((share) => `<div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${share.color}"></span><span style="flex:1">${escapeHtml(share.label)}</span><b>${formatNumber(share.count)}</b></div>`).join('');
  return `<div style="font:12px/1.5 system-ui,sans-serif;min-width:200px"><div style="font-weight:700;margin-bottom:4px">${formatNumber(cell.total)} data di area ini</div>${rows}<div style="margin-top:4px;color:#047857;font-size:11px">Klik untuk memperbesar</div></div>`;
}

function pointTooltip(point: MapPoint, sameSpot: number, selectable: boolean) {
  const pcb = pcbGroupOf(point.pcbConcentration);
  const pcbEntry = PCB_COLORS.find((entry) => entry.key === pcb)!;
  const ppm = point.pcbConcentration !== null ? `${formatNumber(point.pcbConcentration)} ppm · ` : '';
  const line = (label: string, value: unknown) => (value ? `<div><span style="color:#64748b">${label}:</span> ${escapeHtml(value)}</div>` : '');
  return `<div style="font:12px/1.5 system-ui,sans-serif;min-width:220px;max-width:280px;white-space:normal">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="width:8px;height:8px;border-radius:50%;background:${getCategoryColor(point.type)}"></span><span style="font-size:11px;color:#64748b">${escapeHtml(getCategoryLabel(point.type))}</span></div>
    <div style="font-weight:700;font-size:13px;color:#0f172a">${escapeHtml(point.name || 'Tanpa nama')}</div>
    <div style="color:#64748b;font-size:11px;margin-bottom:4px">${escapeHtml(point.companyName || 'Perusahaan')}</div>
    ${line('No. seri', point.serialNumber)}${line('Lokasi', point.location)}${line('Tahun', point.year)}
    <div style="margin-top:6px;display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${pcbEntry.color}1f;color:#0f172a"><span style="width:7px;height:7px;border-radius:50%;background:${pcbEntry.color}"></span>${escapeHtml(ppm + pcbEntry.label)}</div>
    ${sameSpot > 1 ? `<div style="margin-top:4px;font-size:11px;font-weight:600;color:#b45309">+${sameSpot - 1} data lain di koordinat yang sama</div>` : ''}
    ${selectable ? '<div style="margin-top:4px;font-size:11px;color:#047857">Klik untuk melihat datanya di tabel</div>' : ''}
  </div>`;
}

type Shown =
  | { mode: 'cells'; cells: MapCell[]; total: number }
  | { mode: 'points'; points: MapPoint[]; truncated: boolean };

interface MapProps {
  supabase: SupabaseClient;
  companies: CompanyOption[];
  /** Company / unit of the page; with `onScopeChange` the map's company picker changes it, else the map keeps its own. */
  scope: DashboardScope;
  onScopeChange?: (scope: DashboardScope) => void;
  /** Fixed category (category pages); omit to show all with a category filter. */
  category?: InventoryCategory;
  reloadKey?: number;
  height?: string;
  /** Clicking a point passes every point at its coordinates. */
  onSelectPoint?: (points: MapPoint[]) => void;
  /** One company only (its own area): no company picker. */
  fixedCompany?: boolean;
}

/**
 * Inventory map: filters above, satellite imagery (or a clean basemap), and every
 * point with coordinates. Zoomed out it shows the points summed per grid
 * cell: as many small dots, one per fine cell in the colour most of it has
 * (Titik), or as numbered bubbles split by PCBs class or category
 * (Kelompok, the default); zoomed in far enough, the single points. Only what is on screen is loaded (map_clusters, migration
 * 20261010000002).
 */
export default function MapLeaflet({ supabase, companies, scope, onScopeChange, category, reloadKey = 0, height = '480px', onSelectPoint, fixedCompany = false }: MapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  // Thousands of dots are drawn on one canvas, not as as many page elements.
  const canvasRef = useRef<Canvas | null>(null);
  const basemapLayers = useRef<Partial<Record<Basemap, LayerGroup>>>({});
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSelectRef = useRef(onSelectPoint);
  useEffect(() => {
    onSelectRef.current = onSelectPoint;
  });

  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(() => ({ ...DEFAULT_MAP_FILTERS, category: category ?? 'all' }));
  const [ownCompany, setOwnCompany] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>(category === 'kapasitor' ? 'category' : 'pcb');
  const [basemap, setBasemap] = useState<Basemap>('satellite');
  const [view, setView] = useState<ViewMode>('groups');
  const [fullscreen, setFullscreen] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveScope = useMemo<DashboardScope>(
    () => (onScopeChange ? scope : { companyId: ownCompany, unit: null, subUnit: null }),
    [onScopeChange, scope, ownCompany],
  );
  const companyNames = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const hasPcb = filters.category !== 'kapasitor';
  // The web's summary has no production years.
  const hasYear = filters.category !== 'minyak_dielektrik' && !SUMMARY_MODE;

  // Leaflet once; it is loaded in the browser only.
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true, minZoom: 3, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.5 });
      showIndonesia(map);
      for (const key of Object.keys(BASEMAPS) as Basemap[]) {
        const { layers, maxNativeZoom } = BASEMAPS[key];
        basemapLayers.current[key] = L.layerGroup(layers.map((url) => L.tileLayer(url, { attribution: BASEMAP_ATTRIBUTION, maxZoom: 19, maxNativeZoom })));
      }
      basemapLayers.current.satellite!.addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      canvasRef.current = L.canvas({ padding: 0.5 });
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Swap the basemap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [key, layer] of Object.entries(basemapLayers.current) as Array<[Basemap, LayerGroup]>) {
      if (key === basemap) { if (!map.hasLayer(layer)) layer.addTo(map); } else map.removeLayer(layer);
    }
  }, [basemap, ready]);

  // Load what is on screen: the cells, or the single points when few enough.
  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const request = ++requestRef.current;
    // A margin around the view so a small pan does not empty its edges.
    const padded = map.getBounds().pad(0.25);
    const bounds: MapBounds = [Math.max(-180, padded.getWest()), Math.max(-90, padded.getSouth()), Math.min(180, padded.getEast()), Math.min(90, padded.getNorth())];
    setLoading(true);
    try {
      const cells = SUMMARY_MODE
        ? await fetchSummaryCells(supabase, filters, effectiveScope, bounds, summaryLevel(map.getZoom(), view))
        : await fetchMapCells(supabase, filters, effectiveScope, bounds, cellSize(map.getZoom(), view));
      const total = cells.reduce((sum, cell) => sum + cell.total, 0);
      let next: Shown = { mode: 'cells', cells, total };
      // The web has the cells only, never the single points.
      if (!SUMMARY_MODE && (total <= POINT_LIMIT || map.getZoom() >= 16)) {
        const rows = await fetchMapPointsIn(supabase, filters, effectiveScope, bounds, POINT_LIMIT);
        next = {
          mode: 'points',
          truncated: rows.length >= POINT_LIMIT && total > POINT_LIMIT,
          points: rows.filter((row) => row.lat !== null && row.lng !== null).map((row) => ({
            id: row.id,
            type: row.category,
            name: row.name ?? '',
            companyName: companyNames.get(row.company_id) ?? '',
            serialNumber: row.serial ?? undefined,
            location: row.location ?? undefined,
            latitude: Number(row.lat),
            longitude: Number(row.lng),
            pcbConcentration: row.ppm === null ? null : Number(row.ppm),
            year: row.tahun_pembuatan,
          })),
        };
      }
      if (request !== requestRef.current) return;
      setShown(next);
      setError(null);
    } catch (err) {
      if (request === requestRef.current) setError((err as Error).message);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [supabase, filters, effectiveScope, companyNames, view]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void load(); }, 250);
  }, [load]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.on('moveend', schedule);
    return () => { map.off('moveend', schedule); };
  }, [schedule, ready]);

  /** Fit the view to the filtered points (within Indonesia's box), or to Indonesia. */
  const fitToData = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const box: MapBounds = [FIT_BOX.west, FIT_BOX.south, FIT_BOX.east, FIT_BOX.north];
      const cells = SUMMARY_MODE ? await fetchSummaryCells(supabase, filters, effectiveScope, box, 6) : await fetchMapCells(supabase, filters, effectiveScope, box, 2);
      if (!mapRef.current) return;
      if (cells.length === 0 || (!effectiveScope.companyId && filters.category === 'all')) showIndonesia(map);
      else {
        map.fitBounds([
          [Math.min(...cells.map((cell) => cell.south)), Math.min(...cells.map((cell) => cell.west))],
          [Math.max(...cells.map((cell) => cell.north)), Math.max(...cells.map((cell) => cell.east))],
        ], { padding: [40, 40], maxZoom: 14 });
      }
    } catch {
      showIndonesia(map);
    }
    schedule();
  }, [supabase, filters, effectiveScope, schedule]);

  // New filters, scope or data: fit to them and load.
  useEffect(() => {
    if (ready) void fitToData();
  }, [ready, fitToData, reloadKey]);

  // Draw what was loaded, in the chosen colours.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!L || !layer || !map || !shown) return;
    layer.clearLayers();
    const renderer = canvasRef.current ?? undefined;
    const zoomInto = (cell: MapCell) => {
      const spread = cell.north - cell.south > 1e-6 || cell.east - cell.west > 1e-6;
      if (spread) map.fitBounds([[cell.south, cell.west], [cell.north, cell.east]], { padding: [40, 40], maxZoom: 18 });
      else map.setView([cell.lat, cell.lng], Math.min(map.getZoom() + 3, 18));
    };
    if (shown.mode === 'cells' && view === 'dots') {
      // One dot per fine cell, in the colour most of its data has.
      for (const cell of shown.cells) {
        const color = cellShares(cell, colorMode).reduce((top, share) => (share.count > top.count ? share : top), { color: '#64748b', count: 0, label: '' }).color;
        L.circleMarker([cell.lat, cell.lng], { renderer, radius: dotRadius(cell.total), fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.85 })
          .bindTooltip(cellTooltip(cell, colorMode), { direction: 'top', opacity: 1 })
          .on('click', () => zoomInto(cell))
          .addTo(layer);
      }
      return;
    }
    if (shown.mode === 'cells') {
      for (const cell of shown.cells) {
        if (cell.total === 1) {
          const color = cellShares(cell, colorMode).find((share) => share.count > 0)?.color ?? '#64748b';
          L.circleMarker([cell.lat, cell.lng], { renderer, radius: 5, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9 })
            .bindTooltip(cellTooltip(cell, colorMode), { direction: 'top', opacity: 1 })
            .on('click', () => map.setView([cell.lat, cell.lng], Math.min(map.getZoom() + 3, 18)))
            .addTo(layer);
          continue;
        }
        const size = Math.round(Math.min(44, 24 + Math.log10(cell.total) * 7));
        const icon: DivIcon = L.divIcon({ html: cellIconHtml(cell, colorMode, size), className: '', iconSize: [size, size] });
        L.marker([cell.lat, cell.lng], { icon })
          .bindTooltip(cellTooltip(cell, colorMode), { direction: 'top', offset: [0, -size / 2], opacity: 1 })
          .on('click', () => zoomInto(cell))
          .addTo(layer);
      }
      return;
    }
    const pointsAt = new Map<string, MapPoint[]>();
    for (const point of shown.points) pointsAt.set(coordinateKey(point), [...(pointsAt.get(coordinateKey(point)) ?? []), point]);
    const selectable = Boolean(onSelectRef.current);
    for (const group of pointsAt.values()) {
      const [point] = group;
      L.circleMarker([point.latitude, point.longitude], { renderer, radius: group.length > 1 ? 9 : 7, fillColor: pointColor(point, colorMode), color: '#fff', weight: 2, fillOpacity: 0.9 })
        .bindTooltip(pointTooltip(point, group.length, selectable), { direction: 'top', offset: [0, -6], opacity: 1 })
        .on('click', () => onSelectRef.current?.(group))
        .addTo(layer);
    }
  }, [shown, colorMode, view]);

  // Full screen for the map card; Leaflet must remeasure afterwards.
  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === wrapperRef.current);
      setTimeout(() => mapRef.current?.invalidateSize(), 50);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapperRef.current?.requestFullscreen();
  };

  const setFilter = <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const filtered = (!category && filters.category !== 'all') || filters.pcbRange !== 'all' || filters.year !== 'all';
  const companyValue = effectiveScope.companyId;
  const pickCompany = (companyId: string | null) => (onScopeChange ? onScopeChange({ companyId, unit: null, subUnit: null }) : setOwnCompany(companyId));
  // The legend sits bottom left, small, over the Indian Ocean west of Java.
  const legend = colorMode === 'pcb'
    ? PCB_COLORS.map((entry) => ({ key: entry.key, label: entry.label, color: entry.color }))
    : INVENTORY_CATEGORIES.filter((entry) => filters.category === 'all' || filters.category === entry.key || (filters.category === 'transformator' && entry.key.startsWith('transformator')))
      .map((entry) => ({ key: entry.key, label: entry.label, color: entry.color }));

  return (
    <div ref={wrapperRef} className={`flex flex-col gap-3 ${fullscreen ? 'bg-white p-4' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {!category && (
          <select aria-label="Kategori peta" value={filters.category} onChange={(e) => setFilter('category', e.target.value as CategoryFilter)} className={SELECT_CLASS}>
            {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        )}
        {!fixedCompany && <CompanyPicker companies={companies} value={companyValue} onChange={pickCompany} allLabel="Semua perusahaan" className="w-64" />}
        {hasPcb && (
          <select aria-label="Hasil uji minyak dielektrik" value={filters.pcbRange} onChange={(e) => setFilter('pcbRange', e.target.value as MapFilters['pcbRange'])} className={SELECT_CLASS}>
            {PCB_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        )}
        {hasYear && (
          <select aria-label="Tahun pembuatan" value={filters.year} onChange={(e) => setFilter('year', e.target.value as MapFilters['year'])} className={SELECT_CLASS}>
            {YEAR_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        )}
        {filtered && (
          <button type="button" onClick={() => setFilters({ ...DEFAULT_MAP_FILTERS, category: category ?? 'all' })} className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500">
          <div role="group" aria-label="Tampilan peta" className="flex items-center gap-2">
            Tampilan:
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {([['dots', 'Titik'], ['groups', 'Kelompok']] as const).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`rounded-md px-2.5 py-1 transition-colors ${view === key ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-700'}`}>{label}</button>
              ))}
            </div>
          </div>
          {!category && (
            <div role="group" aria-label="Warna titik" className="flex items-center gap-2">
              Warna:
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {([['pcb', 'Hasil uji'], ['category', 'Kategori']] as const).map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={colorMode === key} onClick={() => setColorMode(key)} className={`rounded-md px-2.5 py-1 transition-colors ${colorMode === key ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-700'}`}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <div ref={containerRef} style={{ height: fullscreen ? 'calc(100vh - 140px)' : height, width: '100%' }} className="z-0" />

        <div className="absolute right-3 top-3 z-[500] flex items-center gap-2">
          <div role="group" aria-label="Peta dasar" className="flex rounded-lg bg-white/95 p-0.5 text-[11px] font-semibold shadow-md ring-1 ring-slate-200">
            {(Object.keys(BASEMAPS) as Basemap[]).map((key) => (
              <button key={key} type="button" aria-pressed={basemap === key} onClick={() => setBasemap(key)} className={`rounded-md px-2.5 py-1 transition-colors ${basemap === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{BASEMAPS[key].label}</button>
            ))}
          </div>
          <button type="button" title="Kembali ke data" aria-label="Kembali ke data" onClick={() => void fitToData()} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md ring-1 ring-slate-200 hover:text-slate-900"><House className="h-3.5 w-3.5" /></button>
          <button type="button" title={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'} aria-label={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'} onClick={toggleFullscreen} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md ring-1 ring-slate-200 hover:text-slate-900">{fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        </div>

        {legend.length > 0 && (
          <div className="absolute bottom-3 left-3 z-[500] rounded-lg bg-white/95 px-2.5 py-2 text-[10px] leading-tight text-slate-700 shadow-md ring-1 ring-slate-200 backdrop-blur-sm">
            <div className="mb-1 font-semibold text-slate-900">{colorMode === 'pcb' ? 'Hasil uji minyak dielektrik' : 'Jenis alat'}</div>
            <div className="flex flex-col gap-0.5">
              {legend.map((entry) => (
                <div key={entry.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full ring-1 ring-white" style={{ backgroundColor: entry.color }} />{entry.label}</div>
              ))}
            </div>
            {shown?.mode === 'cells' && <div className="mt-1.5 max-w-[11rem] border-t border-slate-100 pt-1 text-slate-500">{view === 'dots' ? 'Titik besar = lebih banyak data di sekitarnya' : 'Lingkaran berangka = jumlah data di area itu'}</div>}
          </div>
        )}

        {loading && <div className="absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-md ring-1 ring-slate-200"><Loader2 className="h-3 w-3 animate-spin" /> Memuat peta…</div>}
      </div>

      <p className={`text-xs ${error ? 'text-rose-700' : 'text-slate-500'}`}>
        {error
          ? `${error}. Pastikan migrasi ${SUMMARY_MODE ? '20261010000003_web_summary' : '20261010000002_map_clusters'} sudah dijalankan.`
          : !shown ? 'Memuat peta…'
            : shown.mode === 'cells'
              ? `${formatNumber(shown.total)} data berkoordinat di area ini${view === 'dots' ? ', data yang berdekatan digambar sebagai satu titik' : ', dikelompokkan per wilayah'}${SUMMARY_MODE ? '' : ' · perbesar peta untuk melihat titik satuan'}.`
              : shown.points.length === 0
                ? 'Tidak ada data berkoordinat di area ini untuk filter yang dipilih.'
                : `Menampilkan ${formatNumber(shown.points.length)} titik di area ini${shown.truncated ? ' (dibatasi; perbesar peta untuk melihat semuanya)' : ''}${onSelectPoint ? ' · klik titik untuk melihat datanya di tabel' : ''}.`}
      </p>
    </div>
  );
}
