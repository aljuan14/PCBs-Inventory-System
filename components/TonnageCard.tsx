'use client';

import { Scale } from 'lucide-react';
import type { InventoryCategory } from '@/lib/inventory';
import { PRE_1997_FILTER, sumStats, TRAFO_CATEGORIES, type CategoryFilter, type CategoryStats, type InventoryFilters, type InventoryStats } from '@/lib/inventory-query';
import { formatPercent } from '@/components/DashboardCharts';

/** kg as tons: one decimal below 100 t, whole tons above. */
export const formatTons = (kg: number) => (kg / 1000).toLocaleString('id-ID', { maximumFractionDigits: kg < 100_000 ? 1 : 0 });
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

type Band = 'pre1997' | 'noyear';
type Select = (filters: Partial<InventoryFilters>, type: CategoryFilter) => void;

// Checked with the dataviz palette validator (light surface); the grey is
// neutral on purpose and every column is named under it.
const LEVELS: Array<{ key: 'high' | 'low' | 'untested'; label: string; range: string; color: string; pcbRange: InventoryFilters['pcbRange'] }> = [
  { key: 'high', label: '> 50 ppm', range: 'mengandung PCBs', color: '#be123c', pcbRange: 'high' },
  { key: 'low', label: '≤ 50 ppm', range: 'di bawah ambang', color: '#10b981', pcbRange: 'upto50' },
  { key: 'untested', label: 'Belum diuji', range: 'konsentrasi kosong', color: '#b4b2a9', pcbRange: 'untested' },
];

const BANDS: Record<Band, { label: string; filters: Partial<InventoryFilters> }> = {
  pre1997: { label: 'Buatan sebelum 1997', filters: PRE_1997_FILTER },
  noyear: { label: 'Tahun tidak diketahui', filters: { yearRange: 'unknown' } },
};

/** The year bands shown per transformer type. */
const CARDS: Array<{ category: InventoryCategory; title: string; bands: Band[] }> = [
  { category: 'transformator_digunakan', title: 'Trafo digunakan', bands: ['pre1997', 'noyear'] },
  { category: 'transformator_tidak_digunakan', title: 'Trafo tidak digunakan', bands: ['pre1997'] },
];

/**
 * Height of a column on a log scale from 1 t to 10^top t, so a few tons stay
 * visible beside a hundred thousand. Under 1 t gets a sliver.
 */
const logHeight = (kg: number, top: number) => (kg <= 0 ? 0 : `max(${(Math.max(Math.log10(kg / 1000), 0) / top) * 100}%, 2px)`);

/** Tonnage per PCBs class of the given year bands of one transformer type, as columns on one log scale. */
function TonnageColumns({ stats, category, title, bands, onSelect }: { stats: InventoryStats | null; category: InventoryCategory; title: string; bands: Band[]; onSelect?: Select }) {
  const groups = bands.map((band) => {
    const levels = LEVELS.map((level) => ({ ...level, kg: stats?.[category][`weight_${band}_${level.key}_kg` as keyof CategoryStats] ?? 0 }));
    return { band, levels, kg: levels.reduce((sum, level) => sum + level.kg, 0) };
  });
  // Powers of ten from 1 t up to the first one at or above the largest column.
  const top = Math.max(1, Math.ceil(Math.log10(Math.max(1, ...groups.flatMap((group) => group.levels.map((level) => level.kg / 1000))))));
  const gridlines = Array.from({ length: top + 1 }, (_, power) => top - power);

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 p-5">
      <h4 className="text-sm font-bold text-slate-900">{title}</h4>
      <p className="mb-6 text-[11px] text-slate-500">
        {groups.map((group) => `${BANDS[group.band].label.toLowerCase()} ${formatTons(group.kg)} t`).join(' · ')}
      </p>
      <div className="flex gap-2">
        <div className="flex h-48 w-14 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-slate-400">
          {gridlines.map((power) => <span key={power} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{(10 ** power).toLocaleString('id-ID')} t</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            {gridlines.map((power) => <div key={power} className="absolute inset-x-0 border-t border-slate-100" style={{ top: `${(1 - power / top) * 100}%` }} />)}
            <div className="relative flex h-full items-end gap-6">
              {groups.map((group) => (
                <div key={group.band} className="flex h-full min-w-0 flex-1 items-end gap-2">
                  {group.levels.map((level) => (
                    <button
                      key={level.key}
                      type="button"
                      disabled={!onSelect || level.kg === 0}
                      onClick={() => onSelect?.({ ...BANDS[group.band].filters, pcbRange: level.pcbRange }, category)}
                      title={`${BANDS[group.band].label}, ${level.label}: ${formatTons(level.kg)} ton (${formatPercent(share(level.kg, group.kg))})`}
                      className="relative min-w-0 flex-1 rounded-t-[3px] transition-opacity enabled:cursor-pointer enabled:hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500"
                      style={{ height: logHeight(level.kg, top), backgroundColor: level.color }}
                    >
                      <span className="absolute inset-x-0 bottom-full mb-1 whitespace-nowrap text-center text-[11px] font-semibold tabular-nums text-slate-800">{formatTons(level.kg)} t</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-6 border-t border-slate-200 pt-1">
            {groups.map((group) => (
              <div key={group.band} className="min-w-0 flex-1">
                <div className="flex gap-2">
                  {group.levels.map((level) => <span key={level.key} className="min-w-0 flex-1 text-center text-[10px] leading-tight text-slate-500">{level.label}</span>)}
                </div>
                {groups.length > 1 && <div className="mt-1.5 text-center text-[11px] font-semibold text-slate-700">{BANDS[group.band].label}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Transformer tonnage from the total weight in the inventory form: all and
 * per type as figures, then per PCBs class the in-use ones made before 1997
 * or in an unknown year and the not-in-use ones made before 1997 (migration 20261008000001).
 */
export default function TonnageCard({ stats, loading, onSelect }: { stats: InventoryStats | null; loading: boolean; onSelect?: Select }) {
  const sum = (key: keyof CategoryStats) => (stats ? sumStats(stats, TRAFO_CATEGORIES, key) : 0);
  const total = sum('weight_kg');
  const weighed = sum('with_weight');
  const units = sum('total');
  const tiles: Array<{ label: string; kg: number; type: CategoryFilter }> = [
    { label: 'Total trafo', kg: total, type: 'transformator' },
    { label: 'Trafo digunakan', kg: stats?.transformator_digunakan.weight_kg ?? 0, type: 'transformator_digunakan' },
    { label: 'Trafo tidak digunakan', kg: stats?.transformator_tidak_digunakan.weight_kg ?? 0, type: 'transformator_tidak_digunakan' },
  ];

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5 flex items-start gap-3">
        <Scale className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        <div>
          <h3 className="text-base font-bold text-slate-900">Tonase Transformator</h3>
          <p className="text-xs font-medium text-slate-500">Berat total dari formulir inventarisasi{onSelect ? ' · klik untuk melihat datanya di tabel' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : weighed === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-8 text-center text-xs text-slate-500">Belum ada berat yang tercatat untuk transformator.</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tiles.map((tile) => (
              <button
                key={tile.label}
                type="button"
                disabled={!onSelect || tile.kg === 0}
                onClick={() => onSelect?.({}, tile.type)}
                className="rounded-xl bg-slate-50 px-4 py-3 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tile.label}</span>
                <span className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tracking-tight text-slate-900">{formatTons(tile.kg)}</span>
                  <span className="text-sm text-slate-500">ton</span>
                </span>
              </button>
            ))}
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-2">
            {LEVELS.map((level) => (
              <li key={level.key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: level.color }} />
                {level.label} <span className="text-slate-400">{level.range}</span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {CARDS.map((card) => <TonnageColumns key={card.category} stats={stats} {...card} onSelect={onSelect} />)}
          </div>
        </div>
      )}
      {!loading && weighed > 0 && (
        <p className="mt-4 text-[11px] text-slate-400">
          Grafik memakai skala logaritmik: setiap garis bernilai 10 kali garis di bawahnya, jadi bandingkan angkanya, bukan tinggi kolomnya.
          Dihitung dari {weighed.toLocaleString('id-ID')} dari {units.toLocaleString('id-ID')} trafo ({formatPercent(share(weighed, units))}) yang beratnya tercatat; berat 0 di formulir dianggap kosong.
        </p>
      )}
    </section>
  );
}
