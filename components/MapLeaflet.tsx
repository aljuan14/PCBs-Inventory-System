'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
}

export default function MapLeaflet({ points, height = '480px' }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);

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

      validPoints.forEach((point) => {
        const latLng: [number, number] = [point.latitude, point.longitude];
        bounds.extend(latLng);

        // Tentukan warna berdasarkan jenis alat
        let color = '#0f766e'; // Teal untuk trafo digunakan
        let typeBadge = 'Transformator';

        if (point.type === 'kapasitor') {
          color = '#f59e0b'; // Amber untuk kapasitor
          typeBadge = 'Kapasitor';
        } else if (point.type === 'minyak_dielektrik') {
          color = '#10b981'; // Emerald untuk minyak
          typeBadge = 'Minyak Dielektrik';
        } else if (point.type === 'transformator_tidak_digunakan') {
          color = '#b45309';
          typeBadge = 'Trafo Tidak Digunakan';
        } else if (point.type === 'transformator_digunakan') {
          typeBadge = 'Trafo Masih Digunakan';
        }

        // Tentukan status bahaya PCB
        let pcbClass = 'Aman (< 50 ppm)';
        let pcbColor = 'bg-emerald-100 text-emerald-800';
        if (point.pcbConcentration !== undefined && point.pcbConcentration !== null) {
          if (point.pcbConcentration > 500) {
            pcbClass = 'Bahaya Tinggi (> 500 ppm)';
            pcbColor = 'bg-rose-100 text-rose-800';
          } else if (point.pcbConcentration >= 50) {
            pcbClass = 'Terkontaminasi (50-500 ppm)';
            pcbColor = 'bg-amber-100 text-amber-800';
          }
        } else {
          pcbClass = 'Belum diuji';
          pcbColor = 'bg-slate-100 text-slate-700';
        }

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
          </div>
        `;

        marker.bindPopup(popupContent);
      });

      // Fit peta ke seluruh marker jika ada marker valid
      if (validPoints.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [points]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xs">
      <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-10" />
      
      {/* Legend Overlay */}
      <div className="absolute bottom-4 right-4 z-20 rounded-xl bg-white/95 p-3 shadow-md backdrop-blur-sm border border-slate-200/80 text-xs text-slate-800">
        <div className="font-semibold mb-2">Legenda Jenis Alat:</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-blue-500 shadow-sm" />
            <span>Transformator</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-500 shadow-sm" />
            <span>Kapasitor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm" />
            <span>Minyak Dielektrik</span>
          </div>
        </div>
      </div>
    </div>
  );
}
