'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCategoryColor, getCategoryLabel, INVENTORY_CATEGORIES, pcbClassLabel, pcbClassOf } from '@/lib/inventory';

export interface MapPoint {
  id: string;
  type: 'transformator' | 'transformator_digunakan' | 'transformator_tidak_digunakan' | 'kapasitor' | 'minyak_dielektrik';
  name: string;
  companyName: string;
  serialNumber?: string;
  location?: string;
  latitude: number;
  longitude: number;
  pcbConcentration?: number | null;
  status?: string | null;
}

// Popup content is HTML built from spreadsheet values; escape them so a cell
// cannot inject markup or scripts.
const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

interface MapProps {
  points: MapPoint[];
  height?: string;
  /** Clicking a marker passes every point at its coordinates; details then show on hover instead of in a popup. */
  onSelectPoint?: (points: MapPoint[]) => void;
}

// Points closer than ~0.1 m share a marker, so a click must cover all of them.
const coordinateKey = (point: MapPoint) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;

export default function MapLeaflet({ points, height = '480px', onSelectPoint }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  // Kept in a ref so a new callback identity does not rebuild the markers and reset the view.
  const onSelectRef = useRef(onSelectPoint);
  useEffect(() => {
    onSelectRef.current = onSelectPoint;
  });
  const selectable = Boolean(onSelectPoint);
  const shownTypes = new Set(points.map((point) => (point.type === 'transformator' ? 'transformator_digunakan' : point.type)));

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    // Load Leaflet dynamically
    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      // Inisialisasi peta jika belum ada
      if (!mapInstanceRef.current) {
        const defaultCenter: [number, number] = [-2.5489, 118.0149]; // Titik tengah Kepulauan Indonesia
        const map = L.map(mapContainerRef.current).setView(defaultCenter, 5);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Bersihkan marker lama
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
          map.removeLayer(layer);
        }
      });

      // Filter poin yang memiliki koordinat valid
      const validPoints = points.filter(
        (p) =>
          p.latitude !== null &&
          p.longitude !== null &&
          !isNaN(p.latitude) &&
          !isNaN(p.longitude) &&
          p.latitude >= -90 &&
          p.latitude <= 90 &&
          p.longitude >= -180 &&
          p.longitude <= 180
      );

      if (validPoints.length === 0) {
        map.setView([-2.5489, 118.0149], 5);
        return;
      }

      const bounds = L.latLngBounds([]);
      const pointsAt = new Map<string, MapPoint[]>();
      for (const point of validPoints) {
        const key = coordinateKey(point);
        pointsAt.set(key, [...(pointsAt.get(key) ?? []), point]);
      }

      validPoints.forEach((point) => {
        const latLng: [number, number] = [point.latitude, point.longitude];
        bounds.extend(latLng);

        // Legacy 'transformator' points are drawn as transformers in use.
        const category = point.type === 'transformator' ? 'transformator_digunakan' : point.type;
        const color = getCategoryColor(category);
        const typeBadge = getCategoryLabel(category);

        // Tentukan status bahaya PCB
        let pcbClass = pcbClassLabel('safe');
        let pcbColor = 'bg-emerald-100 text-emerald-800';
        if (point.pcbConcentration !== undefined && point.pcbConcentration !== null) {
          const risk = pcbClassOf(point.pcbConcentration);
          pcbClass = pcbClassLabel(risk);
          if (risk === 'high') pcbColor = 'bg-rose-100 text-rose-800';
          else if (risk === 'moderate') pcbColor = 'bg-amber-100 text-amber-800';
        } else {
          pcbClass = 'Belum diuji';
          pcbColor = 'bg-slate-100 text-slate-700';
        }

        const sameSpot = pointsAt.get(coordinateKey(point)) ?? [point];
        const marker = L.circleMarker(latLng, {
          radius: 8,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        }).addTo(map);

        const popupContent = `
          <div style="font-family: sans-serif; font-size: 13px; line-height: 1.4; min-width: 200px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #0f172a;">${escapeHtml(point.name || 'Alat')}</div>
            <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">${escapeHtml(point.companyName || 'Perusahaan')}</div>
            <div style="margin-bottom: 4px;"><strong>Jenis:</strong> ${typeBadge}</div>
            ${point.serialNumber ? `<div><strong>No. Seri:</strong> ${escapeHtml(point.serialNumber)}</div>` : ''}
            ${point.location ? `<div><strong>Lokasi:</strong> ${escapeHtml(point.location)}</div>` : ''}
            <div style="margin-top: 6px; padding: 4px 6px; border-radius: 4px; display: inline-block; font-size: 11px; font-weight: 600;" class="${pcbColor}">
              PCB: ${point.pcbConcentration !== undefined && point.pcbConcentration !== null ? `${point.pcbConcentration} ppm · ${pcbClass}` : pcbClass}
            </div>
            <div style="margin-top: 6px; font-size: 10px; color: #94a3b8;">
              Koordinat: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}
            </div>
            ${sameSpot.length > 1 ? `<div style="margin-top: 4px; font-size: 11px; font-weight: 600; color: #b45309;">+${sameSpot.length - 1} data lain di koordinat yang sama</div>` : ''}
            ${selectable ? '<div style="margin-top: 6px; font-size: 11px; color: #047857;">Klik untuk melihat datanya di tabel</div>' : ''}
          </div>
        `;

        if (selectable) {
          marker.bindTooltip(popupContent, { direction: 'top', offset: [0, -8], opacity: 1 });
          marker.on('click', () => onSelectRef.current?.(sameSpot));
        } else {
          marker.bindPopup(popupContent);
        }
      });

      // Fit peta ke seluruh marker jika ada marker valid
      if (validPoints.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [points, selectable]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xs">
      <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-10" />
      
      {/* Legend Overlay */}
      {shownTypes.size > 0 && <div className="absolute bottom-4 right-4 z-20 rounded-xl bg-white/95 p-3 shadow-md backdrop-blur-sm border border-slate-200/80 text-xs text-slate-800">
        <div className="font-semibold mb-2">Jenis alat</div>
        <div className="flex flex-col gap-1.5">
          {INVENTORY_CATEGORIES.filter((category) => shownTypes.has(category.key)).map((category) => (
            <div key={category.key} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: category.color }} />
              <span>{category.label}</span>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}
