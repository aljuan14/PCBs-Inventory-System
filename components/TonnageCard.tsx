'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronRight, FileSignature, Scale } from 'lucide-react';
import { fetchAllPcbStatus } from '@/lib/company-pcb-status';
import { categoryTint, type InventoryCategory } from '@/lib/inventory';
import { PRE_1997_FILTER, sumStats, TRAFO_CATEGORIES, type CategoryFilter, type CategoryStats, type InventoryFilters, type InventoryStats, type YearScope } from '@/lib/inventory-query';
import { formatPercent, niceMax } from '@/components/DashboardCharts';
import { NEWER_COLOR, PRE_1997_COLOR, UNKNOWN_COLOR } from '@/components/InventorySummary';

/** kg as tons: one decimal below 100 t, whole tons above. */
export const formatTons = (kg: number) => (kg / 1000).toLocaleString('id-ID', { maximumFractionDigits: kg < 100_000 ? 1 : 0 });
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** All years, made before 1997, from 1997 on, or without a production year. */
type Band = YearScope | 'noyear';
type Level = 'high' | 'low' | 'untested';
type Select = (filters: Partial<InventoryFilters>, type: CategoryFilter) => void;

// Checked with the dataviz palette validator (light surface); the grey is
// neutral on purpose and every column is named under it.
const LEVELS: Array<{ key: Level; label: string; range: string; color: string; pcbRange: InventoryFilters['pcbRange'] }> = [
  { key: 'high', label: '≥ 50 ppm', range: 'mengandung PCBs', color: '#be123c', pcbRange: 'high' },
  { key: 'low', label: '< 50 ppm', range: 'di bawah ambang', color: '#10b981', pcbRange: 'below50' },
  { key: 'untested', label: 'Belum diuji', range: 'konsentrasi kosong', color: '#b4b2a9', pcbRange: 'untested' },
];

const BANDS: Record<Band, { label: string; filters: Partial<InventoryFilters> }> = {
  all: { label: 'semua tahun pembuatan', filters: {} },
  pre1997: { label: 'buatan sebelum 1997', filters: PRE_1997_FILTER },
  from1997: { label: 'buatan 1997 ke atas', filters: { yearRange: 'from1997' } },
  noyear: { label: 'tahun pembuatan tidak diketahui', filters: { yearRange: 'unknown' } },
};

const TRAFO_TITLES: Record<string, string> = { transformator_digunakan: 'Trafo digunakan', transformator_tidak_digunakan: 'Trafo tidak digunakan' };

/** Tons of one type, year band and PCBs class (inventory_stats, migration 20261008000001). */
function weightOf(stats: InventoryStats | null, category: InventoryCategory, band: Band, level: Level) {
  const figures = stats?.[category];
  if (!figures) return 0;
  if (band === 'all') return level === 'high' ? figures.weight_high_kg : level === 'low' ? figures.weight_safe_kg + figures.weight_moderate_kg : figures.weight_untested_kg;
  return figures[`weight_${band}_${level}_kg` as keyof CategoryStats];
}

/**
 * Log scale from 1 t to the next 1, 2 or 5 × 10ⁿ t above the largest column
 * (100.000 t is followed by 200.000 t, not 1 juta), so a few tons stay
 * visible beside a hundred thousand. Gridlines at every power of ten and the top.
 */
function logAxis(maxKg: number) {
  const top = Math.max(10, niceMax(maxKg / 1000));
  const span = Math.log10(top);
  const ticks = [...Array.from({ length: Math.floor(span) + 1 }, (_, power) => 10 ** power).filter((tick) => tick < top), top].reverse();
  const at = (tons: number) => Math.max(Math.log10(Math.max(tons, 1)), 0) / span;
  return { ticks, at };
}

/** Tonnage per PCBs class of one transformer type and year band, as columns on a log scale. */
function TonnageColumns({ stats, category, band, onSelect }: { stats: InventoryStats | null; category: InventoryCategory; band: Band; onSelect?: Select }) {
  const levels = LEVELS.map((level) => ({ ...level, kg: weightOf(stats, category, band, level.key) }));
  const total = levels.reduce((sum, level) => sum + level.kg, 0);
  const { ticks, at } = logAxis(Math.max(...levels.map((level) => level.kg)));
  const filters = BANDS[band].filters;

  return (
    <div className="flex min-w-0 flex-col rounded-xl border p-5" style={categoryTint(category)}>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{TRAFO_TITLES[category]} · {BANDS[band].label}</h4>
          <p className="text-[11px] text-slate-500">Total {formatTons(total)} ton, per kadar PCBs</p>
        </div>
        {onSelect && (
          <button type="button" disabled={total === 0} onClick={() => onSelect(filters, category)} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-500">
            Lihat datanya <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative h-56 w-16 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(1 - at(tick)) * 100}%` }}>{tick.toLocaleString('id-ID')} t</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-56">
            {ticks.map((tick) => <div key={tick} className="absolute inset-x-0 border-t border-dashed border-slate-300" style={{ top: `${(1 - at(tick)) * 100}%` }} />)}
            <div className="relative flex h-full items-end gap-3 px-2">
              {levels.map((level) => (
                <button
                  key={level.key}
                  type="button"
                  disabled={!onSelect || level.kg === 0}
                  onClick={() => onSelect?.({ ...filters, pcbRange: level.pcbRange }, category)}
                  title={`${level.label}: ${formatTons(level.kg)} ton (${formatPercent(share(level.kg, total))})`}
                  className="relative min-w-0 flex-1 rounded-t-[3px] transition-opacity enabled:cursor-pointer enabled:hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500"
                  style={{ height: level.kg > 0 ? `max(${at(level.kg / 1000) * 100}%, 2px)` : 0, backgroundColor: level.color }}
                >
                  <span className="absolute inset-x-0 bottom-full mb-1 whitespace-nowrap text-center text-[11px] font-semibold tabular-nums text-slate-800">{formatTons(level.kg)} t</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-3 border-t border-slate-300 px-2 pt-1">
            {levels.map((level) => <span key={level.key} className="min-w-0 flex-1 text-center text-[10px] leading-tight text-slate-600">{level.label}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

type YearBand = 'pre1997' | 'from1997' | 'noyear';
const YEAR_BANDS: Array<{ key: YearBand; label: string; color: string; filters: Partial<InventoryFilters> }> = [
  { key: 'pre1997', label: 'Sebelum 1997', color: PRE_1997_COLOR, filters: PRE_1997_FILTER },
  { key: 'from1997', label: '1997 ke atas', color: NEWER_COLOR, filters: { yearRange: 'from1997' } },
  { key: 'noyear', label: 'Tahun tidak diketahui', color: UNKNOWN_COLOR, filters: { yearRange: 'unknown' } },
];

const bandWeight = (stats: InventoryStats | null, band: YearBand) => TRAFO_CATEGORIES.reduce((sum, category) => {
  const figures = stats?.[category];
  return figures ? sum + figures[`weight_${band}_high_kg`] + figures[`weight_${band}_low_kg`] + figures[`weight_${band}_untested_kg`] : sum;
}, 0);

type Declared = { tons: number; units: number; companies: number };

/**
 * Tons of transformers from 1997 on that companies declared on their
 * statement (company_statements, through the status counts so the web has
 * them too). Company-wide, so left out when a unit is picked.
 */
function useDeclared(supabase: SupabaseClient | undefined, companyId: string | null, unitPicked: boolean, reloadKey: number) {
  const [declared, setDeclared] = useState<{ key: string; value: Declared | null } | null>(null);
  const key = `${companyId}|${unitPicked}|${reloadKey}`;
  useEffect(() => {
    if (!supabase || unitPicked) return;
    let active = true;
    fetchAllPcbStatus(supabase).then((map) => {
      if (!active) return;
      const value: Declared = { tons: 0, units: 0, companies: 0 };
      for (const [id, status] of map) {
        const statement = status.pernyataan;
        if ((companyId && id !== companyId) || !statement?.punya_trafo_1997_keatas) continue;
        value.tons += Number(statement.tonase_trafo_1997_keatas_ton) || 0;
        value.units += Number(statement.jumlah_trafo_1997_keatas) || 0;
        value.companies++;
      }
      setDeclared({ key, value });
    }, () => { if (active) setDeclared({ key, value: null }); });
    return () => { active = false; };
  }, [supabase, companyId, unitPicked, key]);
  return !supabase || unitPicked || declared?.key !== key ? null : declared.value;
}

/** Tons per production-year band, the boss's split of before 1997 against 1997 on. */
function YearSplit({ stats, declared, onSelect }: { stats: InventoryStats | null; declared: Declared | null; onSelect?: Select }) {
  const bands = YEAR_BANDS.map((band) => ({ ...band, kg: bandWeight(stats, band.key) }));
  const total = bands.reduce((sum, band) => sum + band.kg, 0);
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h4 className="text-sm font-bold text-slate-900">Menurut tahun pembuatan</h4>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={bands.map((band) => `${band.label} ${formatTons(band.kg)} ton`).join(', ')}>
        {bands.map((band) => band.kg > 0 && <div key={band.key} style={{ width: `${share(band.kg, total)}%`, backgroundColor: band.color }} />)}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {bands.map((band) => (
          <button key={band.key} type="button" disabled={!onSelect || band.kg === 0} onClick={() => onSelect?.(band.filters, 'transformator')}
            className="rounded-lg bg-slate-50 px-3 py-2.5 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-500">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: band.color }} />{band.label}</span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tracking-tight text-slate-900">{formatTons(band.kg)}</span>
              <span className="text-xs text-slate-500">ton · {formatPercent(share(band.kg, total))}</span>
            </span>
            {band.key === 'from1997' && declared && declared.companies > 0 && (
              <span className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-600">
                <FileSignature className="mt-0.5 h-3 w-3 shrink-0" />
                <span>Pernyataan perusahaan: <span className="font-semibold">{declared.tons.toLocaleString('id-ID', { maximumFractionDigits: 1 })} ton</span> ({declared.units.toLocaleString('id-ID')} unit, {declared.companies.toLocaleString('id-ID')} perusahaan), dicatat terpisah</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Transformer tonnage from the total weight in the inventory form: all, in
 * use and not in use as figures, then per PCBs class for each type. The
 * switch shows either the ones made before 1997 or all of them; those
 * without a production year follow as their own row, to be filled in.
 */
export default function TonnageCard({ stats, scope, loading, onSelect, supabase, companyId = null, unitPicked = false, reloadKey = 0 }: {
  stats: InventoryStats | null;
  /** The dashboard's production-year switch. */
  scope: YearScope;
  loading: boolean;
  onSelect?: Select;
  /** With these, the tons companies declared for transformers from 1997 on show beside the inventory's. */
  supabase?: SupabaseClient;
  companyId?: string | null;
  unitPicked?: boolean;
  reloadKey?: number;
}) {
  const declared = useDeclared(supabase, companyId, unitPicked, reloadKey);
  const band: Band = scope;
  const weighed = stats ? sumStats(stats, TRAFO_CATEGORIES, 'with_weight') : 0;
  const units = stats ? sumStats(stats, TRAFO_CATEGORIES, 'total') : 0;
  const suffix = scope === 'pre1997' ? ' < 1997' : scope === 'from1997' ? ' ≥ 1997' : '';
  // Tons of the types for the switch's years, every PCBs class together.
  const tons = (categories: InventoryCategory[]) => categories.reduce((sum, category) => sum + LEVELS.reduce((kg, level) => kg + weightOf(stats, category, band, level.key), 0), 0);
  const tiles: Array<{ label: string; kg: number; type: CategoryFilter }> = [
    { label: `Total trafo${suffix}`, kg: tons(TRAFO_CATEGORIES), type: 'transformator' },
    ...TRAFO_CATEGORIES.map((category) => ({ label: `${TRAFO_TITLES[category]}${suffix}`, kg: tons([category]), type: category })),
  ];

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-5">
        <div className="flex items-start gap-3">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Tonase Transformator</h3>
            <p className="text-xs font-medium text-slate-500">
              {scope === 'pre1997' ? 'Trafo buatan sebelum 1997' : scope === 'from1997' ? 'Trafo buatan 1997 ke atas' : 'Semua trafo'} · berat total dari formulir inventarisasi{onSelect ? ' · klik untuk melihat datanya di tabel' : ''}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : weighed === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-8 text-center text-xs text-slate-500">Belum ada berat yang tercatat untuk transformator.</div>
      ) : (
        <div className="space-y-4">
          <YearSplit stats={stats} declared={declared} onSelect={onSelect} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tiles.map((tile) => (
              <button
                key={tile.type}
                type="button"
                disabled={!onSelect || tile.kg === 0}
                onClick={() => onSelect?.(BANDS[band].filters, tile.type)}
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
            {TRAFO_CATEGORIES.map((category) => <TonnageColumns key={category} stats={stats} category={category} band={band} onSelect={onSelect} />)}
          </div>

          <div className="pt-2">
            <h4 className="text-sm font-bold text-slate-900">Tahun pembuatan tidak diketahui</h4>
            <p className="text-[11px] text-slate-500">Risikonya belum bisa dinilai karena tahun pembuatannya kosong · perlu dilengkapi</p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {TRAFO_CATEGORIES.map((category) => <TonnageColumns key={category} stats={stats} category={category} band="noyear" onSelect={onSelect} />)}
          </div>
        </div>
      )}
      {!loading && weighed > 0 && (
        <p className="mt-4 text-[11px] text-slate-400">
          Grafik memakai skala logaritmik: garis bantu bernilai 1, 10, 100, … ton, jadi bandingkan angkanya, bukan tinggi kolomnya.
          Dihitung dari {weighed.toLocaleString('id-ID')} dari {units.toLocaleString('id-ID')} trafo ({formatPercent(share(weighed, units))}) yang beratnya tercatat; berat 0 di formulir dianggap kosong.
        </p>
      )}
    </section>
  );
}
