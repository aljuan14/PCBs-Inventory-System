'use client';

import { useEffect, useRef, useState } from 'react';
import L, { type CircleMarker, type LayerGroup, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, X } from 'lucide-react';
import { BASEMAPS, BASEMAP_ATTRIBUTION, type Basemap } from '@/lib/basemaps';

// Indonesia, the view when no point is known yet.
const INDONESIA: [[number, number], [number, number]] = [[-11, 94], [6.5, 141.5]];
const round = (value: number) => Number(value.toFixed(6));

/**
 * A map to click the equipment's location on (satellite by default, to see
 * the substation). Loaded with next/dynamic, ssr: false: Leaflet needs the
 * window. Returns "lat, lng" in decimal degrees.
 */
export default function CoordinatePicker({ initial, onPick, onClose }: { initial: { lat: number; lng: number } | null; onPick: (value: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const layers = useRef<Partial<Record<Basemap, LayerGroup>>>({});
  const [basemap, setBasemap] = useState<Basemap>('satellite');
  const [point, setPoint] = useState(initial);

  useEffect(() => {
    if (!box.current || map.current) return;
    const instance = L.map(box.current, { zoomControl: true, attributionControl: true });
    map.current = instance;
    const place = (lat: number, lng: number) => {
      if (marker.current) marker.current.setLatLng([lat, lng]);
      else marker.current = L.circleMarker([lat, lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#047857', fillOpacity: 1 }).addTo(instance);
      setPoint({ lat: round(lat), lng: round(lng) });
    };
    if (initial) {
      instance.setView([initial.lat, initial.lng], 17);
      place(initial.lat, initial.lng);
    } else {
      instance.fitBounds(INDONESIA);
    }
    instance.on('click', (event) => place(event.latlng.lat, event.latlng.lng));
    return () => { instance.remove(); map.current = null; marker.current = null; layers.current = {}; };
  }, [initial]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const [key, group] of Object.entries(layers.current)) if (key !== basemap) group.remove();
    const { layers: urls, maxNativeZoom } = BASEMAPS[basemap];
    layers.current[basemap] ??= L.layerGroup(urls.map((url) => L.tileLayer(url, { attribution: BASEMAP_ATTRIBUTION, maxZoom: 19, maxNativeZoom })));
    layers.current[basemap]!.addTo(instance);
  }, [basemap]);

  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Pilih titik koordinat" className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Pilih titik di peta</h3>
            <p className="text-xs text-slate-500">Perbesar peta, lalu klik letak peralatan.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
              {(Object.keys(BASEMAPS) as Basemap[]).map((key) => (
                <button key={key} type="button" aria-pressed={basemap === key} onClick={() => setBasemap(key)} className={`rounded-md px-2.5 py-1 ${basemap === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}>{BASEMAPS[key].label}</button>
              ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div ref={box} className="h-[60vh] min-h-72 w-full cursor-crosshair" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <span className="text-xs tabular-nums text-slate-600">{point ? `${point.lat}, ${point.lng}` : 'Belum ada titik dipilih.'}</span>
          <button type="button" disabled={!point} onClick={() => point && onPick(`${point.lat}, ${point.lng}`)} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
            <Check className="h-4 w-4" /> Pakai titik ini
          </button>
        </div>
      </div>
    </div>
  );
}
