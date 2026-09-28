'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle2, AlertOctagon, HelpCircle, Pencil, Trash2, X, Save, Loader2, SlidersHorizontal, ArrowUpDown, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getCategoryLabel, type InventoryCategory } from '@/lib/inventory';
import {
  DEFAULT_FILTERS,
  fetchCompanyUnits,
  fetchImportedBatches,
  fetchInventoryDetails,
  fetchInventoryPage,
  type CategoryFilter,
  type DashboardScope,
  type ImportNoteRow,
  type InventoryFilters,
  type InventoryRow,
  type InventorySort,
  type UnitSummary,
} from '@/lib/inventory-query';

export interface InventoryItem {
  id: string;
  no?: number | null;
  type: 'transformator' | 'transformator_digunakan' | 'transformator_tidak_digunakan' | 'kapasitor' | 'minyak_dielektrik';
  name: string;
  companyName: string;
  unit?: string | null;
  subUnit?: string | null;
  code?: string | null;
  serialNumber?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  pcbConcentration?: number | null;
  status?: string | null;
  capacity?: string | number | null;
  createdAt?: string;
  details?: Record<string, unknown>;
}

/** Filters set from outside the table; `type` picks the equipment type on tables that show all of them. */
export interface TablePreset {
  key: number;
  filters: Partial<InventoryFilters>;
  type?: CategoryFilter;
}

export interface CompanyOption {
  id: string;
  name: string;
}

interface DataTableProps {
  /** Fixed category (category pages); omit to show all with a category filter. */
  category?: InventoryCategory;
  companies: CompanyOption[];
  /** Change to refetch the current page, e.g. after an edit elsewhere. */
  reloadKey?: number;
  /** Company and unit chosen by the dashboard's own filter; replaces the table's company and unit selectors. */
  scope?: DashboardScope;
  /** Filters set from outside (e.g. the data quality panel), applied whenever `key` changes. */
  preset?: TablePreset;
  onEdit?: (item: InventoryItem, changes: EditableInventoryFields) => Promise<void> | void;
  onDelete?: (item: InventoryItem) => Promise<void> | void;
}

export interface EditableInventoryFields {
  name: string;
  serialNumber: string;
  location: string;
  pcbConcentration: number | null;
  status: string;
}

const toNumber = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));

export function toInventoryItem(row: InventoryRow, companyNames: Map<string, string>): InventoryItem {
  const daya = toNumber(row.daya_kva);
  const volume = toNumber(row.volume_l);
  return {
    id: row.id,
    no: row.no,
    type: row.category,
    name: row.name ?? '',
    companyName: companyNames.get(row.company_id) ?? 'Perusahaan',
    unit: row.unit ?? null,
    subUnit: row.sub_unit ?? null,
    code: row.kode_alat ?? null,
    serialNumber: row.serial ?? '',
    location: row.location ?? '',
    latitude: toNumber(row.lat),
    longitude: toNumber(row.lng),
    pcbConcentration: toNumber(row.ppm),
    status: row.status,
    capacity: daya !== null ? `${daya} kVA` : volume !== null ? `${volume} L` : null,
    createdAt: row.created_at,
  };
}

const PAGE_SIZE = 10;

const SELECT_CLASS = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none';
const FIELD_LABEL_CLASS = 'flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const PCB_LABELS: Record<InventoryFilters['pcbRange'], string> = { all: 'Semua kadar PCBs', safe: 'Bebas PCBs (< 50 ppm)', moderate: 'Terkontaminasi PCBs (50–500 ppm)', high: 'Bahaya tinggi (> 500 ppm)', untested: 'Belum diuji' };
const TEST_LABELS: Record<InventoryFilters['test'], string> = { all: 'Semua jenis uji', lab: 'Uji lab (GC)', cepat: 'Uji cepat (Dexil)', none: 'Belum diuji' };
const YEAR_LABELS: Record<InventoryFilters['yearRange'], string> = { all: 'Semua tahun', pre1985: 'Sebelum 1985', '1985_1996': '1985 – 1996', from1997: '1997 ke atas', unknown: 'Tahun tidak diketahui', custom: 'Rentang tertentu' };
const COORDINATE_LABELS: Record<InventoryFilters['coordinates'], string> = {
  all: 'Semua',
  with: 'Ada koordinat (tampil di peta)',
  without: 'Tidak tampil di peta',
  empty: 'Koordinat tidak diisi',
  unreadable: 'Koordinat tidak terbaca / di luar wilayah',
  fixed: 'Koordinat diperbaiki otomatis',
};
const MISSING_LABELS: Record<InventoryFilters['missing'], string> = {
  all: 'Semua',
  serial: 'Tanpa nomor seri',
  name: 'Tanpa merek',
  year: 'Tanpa tahun pembuatan',
  location: 'Tanpa lokasi',
  daya: 'Tanpa daya (kVA)',
  volume: 'Tanpa volume minyak',
  code: 'Tanpa kode alat',
  cleared: 'Ada nilai dikosongkan saat impor',
};
const NOTE_TONES: Record<ImportNoteRow['jenis'], string> = {
  diperbaiki: 'border-sky-200 bg-sky-50 text-sky-800',
  dikosongkan: 'border-amber-200 bg-amber-50 text-amber-800',
  tidak_terbaca: 'border-rose-200 bg-rose-50 text-rose-800',
  di_luar_wilayah: 'border-rose-200 bg-rose-50 text-rose-800',
};
const NOTE_LABELS: Record<ImportNoteRow['jenis'], string> = { diperbaiki: 'Diperbaiki', dikosongkan: 'Dikosongkan', tidak_terbaca: 'Tidak terbaca', di_luar_wilayah: 'Di luar wilayah' };

/** What the import changed or could not read in this row (catatan_impor). */
function ImportNotes({ notes, excelRow }: { notes: ImportNoteRow[]; excelRow: unknown }) {
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Catatan impor{typeof excelRow === 'number' ? ` · baris Excel ${excelRow}` : ''}</div>
      <ul className="space-y-1.5">
        {notes.map((note, index) => (
          <li key={`${note.kode}-${index}`} className="flex flex-wrap items-start gap-2 text-xs text-slate-700">
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${NOTE_TONES[note.jenis]}`}>{NOTE_LABELS[note.jenis]}</span>
            <span className="min-w-0 flex-1">
              {note.pesan}
              {note.nilai_asli && <span className="ml-1 font-mono text-[11px] text-slate-500">“{note.nilai_asli}”{note.nilai_baru ? ` → ${note.nilai_baru}` : ''}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
const ADDED_LABELS: Record<InventoryFilters['addedWithin'], string> = { all: 'Kapan saja', '1d': '24 jam terakhir', '7d': '7 hari terakhir', '30d': '30 hari terakhir' };
const SORT_LABELS: Record<InventorySort, string> = { newest: 'Terbaru diinput', oldest: 'Terlama diinput', ppm_desc: 'Kadar PCB tertinggi', year_asc: 'Tahun pembuatan tertua', year_desc: 'Tahun pembuatan terbaru', daya_desc: 'Daya terbesar', name_asc: 'Merek A–Z' };
const CATEGORY_FILTER_LABELS: Record<CategoryFilter, string> = {
  all: 'Semua jenis alat',
  transformator: 'Semua transformator',
  transformator_digunakan: 'Trafo masih digunakan',
  transformator_tidak_digunakan: 'Trafo tidak digunakan',
  kapasitor: 'Kapasitor',
  minyak_dielektrik: 'Minyak dielektrik',
};

/** Number field that only applies its value on blur or Enter, so typing "1985" does not query "1", "19", ... */
function NumberFilter({ value, onCommit, placeholder, label }: { value: number | null; onCommit: (value: number | null) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [committed, setCommitted] = useState(value);
  if (committed !== value) {
    // Reset from outside (chip removed, "reset all").
    setCommitted(value);
    setDraft(value === null ? '' : String(value));
  }
  const commit = () => {
    const next = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
    if (next === null || Number.isFinite(next)) onCommit(next);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
    />
  );
}

export default function DataTable({ category, companies, reloadKey = 0, scope, preset, onEdit, onDelete }: DataTableProps) {
  const supabase = useMemo(() => createClient(), []);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // A preset given at mount (e.g. from a link in the upload history) applies right away.
  const [selectedType, setSelectedType] = useState<CategoryFilter>(() => (!category && preset?.type) || 'all');
  const [filters, setFilters] = useState<InventoryFilters>(() => ({ ...DEFAULT_FILTERS, ...preset?.filters }));
  const [sort, setSort] = useState<InventorySort>('newest');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batches, setBatches] = useState<Awaited<ReturnType<typeof fetchImportedBatches>>>([]);
  const [units, setUnits] = useState<{ companyId: string; rows: UnitSummary[] } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState<EditableInventoryFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Record<string, unknown>>>({});

  const [paginatedItems, setPaginatedItems] = useState<InventoryItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const companyNames = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);

  // A dashboard scope overrides the table's own company and unit filters.
  const scoped = scope !== undefined;
  const scopeCompanyId = scope?.companyId ?? null;
  const scopeUnit = scope?.unit ?? null;
  const scopeSubUnit = scope?.subUnit ?? null;
  const appliedFilters = useMemo(
    () => (scoped ? { ...filters, companyId: scopeCompanyId, unit: scopeUnit, subUnit: scopeSubUnit } : filters),
    [filters, scoped, scopeCompanyId, scopeUnit, scopeSubUnit],
  );
  // A new scope starts from the first page, and a batch of another company no longer applies.
  const scopeKey = `${scopeCompanyId}|${scopeUnit}|${scopeSubUnit}`;
  const [seenScopeKey, setSeenScopeKey] = useState(scopeKey);
  if (seenScopeKey !== scopeKey) {
    setSeenScopeKey(scopeKey);
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, batchId: null }));
  }
  // A preset replaces the current filters so the table shows exactly the rows it describes.
  const [seenPresetKey, setSeenPresetKey] = useState(preset?.key);
  if (preset && seenPresetKey !== preset.key) {
    setSeenPresetKey(preset.key);
    setFilters({ ...DEFAULT_FILTERS, ...preset.filters });
    if (!category) setSelectedType(preset.type ?? 'all');
    setSearchTerm('');
    setDebouncedSearch('');
    setCurrentPage(1);
  }

  // Tunggu sebentar setelah mengetik agar tidak mengirim query per huruf.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const updateFilter = <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  // Choosing a company or unit narrows the options below it, so their selections reset.
  const selectCompany = (companyId: string | null) => {
    setFilters((prev) => ({ ...prev, companyId, unit: null, subUnit: null, batchId: null }));
    setCurrentPage(1);
  };
  const selectUnit = (unit: string | null) => {
    setFilters((prev) => ({ ...prev, unit, subUnit: null }));
    setCurrentPage(1);
  };

  // Units of the selected company for the cascading unit / sub-unit filter.
  useEffect(() => {
    const companyId = filters.companyId;
    if (!companyId) return;
    let cancelled = false;
    fetchCompanyUnits(supabase, companyId)
      .then((rows) => { if (!cancelled) setUnits({ companyId, rows }); })
      .catch(() => { if (!cancelled) setUnits({ companyId, rows: [] }); });
    return () => { cancelled = true; };
  }, [supabase, filters.companyId]);

  // Only the units of the currently selected company (a previous company's list may still be loaded).
  const companyUnits = useMemo(() => (units && units.companyId === filters.companyId ? units.rows : []), [units, filters.companyId]);
  const unitOptions = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of companyUnits) totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.total);
    return [...totals].map(([name, total]) => ({ name, total }));
  }, [companyUnits]);
  const subUnitOptions = companyUnits.filter((row) => row.unit === filters.unit && row.sub_unit);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    if (!category) setSelectedType('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Batch list for the "import batch" filter, loaded once the advanced panel is opened.
  useEffect(() => {
    if (!showAdvanced) return;
    let cancelled = false;
    fetchImportedBatches(supabase, appliedFilters.companyId)
      .then((rows) => { if (!cancelled) setBatches(category ? rows.filter((row) => row.jenis_data === category) : rows); })
      .catch(() => { if (!cancelled) setBatches([]); });
    return () => { cancelled = true; };
  }, [supabase, showAdvanced, appliedFilters.companyId, category]);

  const effectiveCategory = category ?? selectedType;
  const hasTransformers = effectiveCategory === 'all' || effectiveCategory.startsWith('transformator');
  const hasTests = effectiveCategory !== 'kapasitor';

  // Data diambil per halaman dari server; filter dan pencarian dijalankan di database.
  const query = useMemo(() => ({
    category: effectiveCategory,
    search: debouncedSearch,
    filters: appliedFilters,
    sort,
    page: currentPage,
    pageSize: PAGE_SIZE,
  }), [effectiveCategory, debouncedSearch, appliedFilters, sort, currentPage]);

  // Active filters as removable chips.
  const batchLabel = (id: string) => {
    const batch = batches.find((item) => item.id === id);
    return batch ? `${batch.nama_file_asli}${batch.sheet_name ? ` › ${batch.sheet_name}` : ''}` : 'batch terpilih';
  };
  const yearChip = filters.yearRange === 'custom'
    ? `Tahun ${filters.yearMin ?? '…'} – ${filters.yearMax ?? '…'}`
    : YEAR_LABELS[filters.yearRange];
  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [
    !category && selectedType !== 'all' ? { key: 'type', label: CATEGORY_FILTER_LABELS[selectedType], clear: () => { setSelectedType('all'); setCurrentPage(1); } } : null,
    filters.companyId ? { key: 'company', label: companyNames.get(filters.companyId) ?? 'Perusahaan', clear: () => selectCompany(null) } : null,
    filters.unit ? { key: 'unit', label: filters.unit, clear: () => selectUnit(null) } : null,
    filters.subUnit ? { key: 'subUnit', label: filters.subUnit, clear: () => updateFilter('subUnit', null) } : null,
    filters.pcbRange !== 'all' ? { key: 'pcb', label: PCB_LABELS[filters.pcbRange], clear: () => updateFilter('pcbRange', 'all') } : null,
    filters.test !== 'all' ? { key: 'test', label: TEST_LABELS[filters.test], clear: () => updateFilter('test', 'all') } : null,
    filters.yearRange !== 'all' ? { key: 'year', label: yearChip, clear: () => setFilters((prev) => ({ ...prev, yearRange: 'all', yearMin: null, yearMax: null })) } : null,
    filters.dayaMin !== null || filters.dayaMax !== null ? { key: 'daya', label: `Daya ${filters.dayaMin ?? '…'} – ${filters.dayaMax ?? '…'} kVA`, clear: () => setFilters((prev) => ({ ...prev, dayaMin: null, dayaMax: null })) } : null,
    filters.coordinates !== 'all' ? { key: 'coords', label: COORDINATE_LABELS[filters.coordinates], clear: () => updateFilter('coordinates', 'all') } : null,
    filters.missing !== 'all' ? { key: 'missing', label: MISSING_LABELS[filters.missing], clear: () => updateFilter('missing', 'all') } : null,
    filters.mapPoint ? { key: 'mapPoint', label: filters.mapPoint.label, clear: () => updateFilter('mapPoint', null) } : null,
    filters.note ? { key: 'note', label: `Temuan impor: ${filters.note.label}`, clear: () => updateFilter('note', null) } : null,
    filters.batchId ? { key: 'batch', label: `Batch: ${batchLabel(filters.batchId)}`, clear: () => updateFilter('batchId', null) } : null,
    filters.addedWithin !== 'all' ? { key: 'added', label: `Diinput ${ADDED_LABELS[filters.addedWithin].toLowerCase()}`, clear: () => updateFilter('addedWithin', 'all') } : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => chip !== null);
  const advancedCount = activeChips.filter((chip) => !['type', 'company', 'unit', 'subUnit', 'pcb', 'mapPoint', 'note'].includes(chip.key)).length;
  const queryKey = `${JSON.stringify(query)}#${reloadKey}`;
  const loading = loadedKey !== queryKey;

  useEffect(() => {
    let cancelled = false;
    fetchInventoryPage(supabase, query)
      .then(({ rows, total }) => {
        if (cancelled) return;
        setPaginatedItems(rows.map((row) => toInventoryItem(row, companyNames)));
        setDetails({});
        setTotalItems(total);
        setLoadError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(queryKey);
      });
    return () => { cancelled = true; };
  }, [supabase, query, queryKey, companyNames]);

  const toggleDetails = async (item: InventoryItem) => {
    const next = expandedItemId === item.id ? null : item.id;
    setExpandedItemId(next);
    if (next && !details[item.id]) {
      try {
        const record = await fetchInventoryDetails(supabase, item.type as InventoryCategory, item.id);
        setDetails((prev) => ({ ...prev, [item.id]: record }));
      } catch (err) {
        setLoadError((err as Error).message);
      }
    }
  };

  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  const showTrafoCapacity = paginatedItems.some((item) => item.type.startsWith('transformator'));
  const showOilVolume = paginatedItems.some((item) => item.type === 'minyak_dielektrik');
  const showPcb = paginatedItems.some((item) => item.pcbConcentration !== null && item.pcbConcentration !== undefined);
  const tableColumnCount = 5 + Number(showTrafoCapacity) + Number(showOilVolume) + Number(showPcb);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Tabel Data Inventarisasi Peralatan & Minyak
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            {loading ? 'Memuat data...' : `${totalItems.toLocaleString('id-ID')} data sesuai filter`}
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari merek, no seri, kode, lokasi..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>
      </div>

      {/* Filter utama */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="mr-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter:</span>
        </div>

        {/* Jenis alat (hanya di halaman gabungan) */}
        {!category && (
          <select
            aria-label="Jenis alat"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as CategoryFilter);
              setCurrentPage(1);
            }}
            className={SELECT_CLASS}
          >
            {(Object.keys(CATEGORY_FILTER_LABELS) as CategoryFilter[]).map((key) => <option key={key} value={key}>{CATEGORY_FILTER_LABELS[key]}</option>)}
          </select>
        )}

        {!scoped && (
          <select aria-label="Perusahaan" value={filters.companyId ?? 'all'} onChange={(e) => selectCompany(e.target.value === 'all' ? null : e.target.value)} className={SELECT_CLASS}>
            <option value="all">Semua perusahaan</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {/* Unit dan sub-unit perusahaan terpilih (PLN: Unit Induk › Unit Pelaksana) */}
        {unitOptions.length > 0 && (
          <select aria-label="Unit" value={filters.unit ?? 'all'} onChange={(e) => selectUnit(e.target.value === 'all' ? null : e.target.value)} className={SELECT_CLASS}>
            <option value="all">Semua unit ({unitOptions.length})</option>
            {unitOptions.map((option) => <option key={option.name} value={option.name}>{option.name} · {option.total.toLocaleString('id-ID')}</option>)}
          </select>
        )}
        {subUnitOptions.length > 0 && (
          <select aria-label="Sub-unit" value={filters.subUnit ?? 'all'} onChange={(e) => updateFilter('subUnit', e.target.value === 'all' ? null : e.target.value)} className={SELECT_CLASS}>
            <option value="all">Semua sub-unit ({subUnitOptions.length})</option>
            {subUnitOptions.map((option) => <option key={option.sub_unit} value={option.sub_unit as string}>{option.sub_unit} · {option.total.toLocaleString('id-ID')}</option>)}
          </select>
        )}

        {hasTests && (
          <select aria-label="Kadar PCB" value={filters.pcbRange} onChange={(e) => updateFilter('pcbRange', e.target.value as InventoryFilters['pcbRange'])} className={SELECT_CLASS}>
            {(Object.keys(PCB_LABELS) as Array<InventoryFilters['pcbRange']>).map((key) => <option key={key} value={key}>{PCB_LABELS[key]}</option>)}
          </select>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced((open) => !open)}
          aria-expanded={showAdvanced}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-2xs transition-colors ${showAdvanced || advancedCount > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter lanjutan{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </button>

        <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only">Urutkan:</span>
          <select aria-label="Urutkan" value={sort} onChange={(e) => { setSort(e.target.value as InventorySort); setCurrentPage(1); }} className={SELECT_CLASS}>
            {(Object.keys(SORT_LABELS) as InventorySort[])
              .filter((key) => (key === 'daya_desc' ? hasTransformers : key === 'ppm_desc' ? hasTests : true))
              .map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
          </select>
        </label>
      </div>

      {/* Filter lanjutan */}
      {showAdvanced && (
        <div className="mb-3 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {hasTests && (
            <label className={FIELD_LABEL_CLASS}>
              Jenis uji PCB
              <select value={filters.test} onChange={(e) => updateFilter('test', e.target.value as InventoryFilters['test'])} className={SELECT_CLASS}>
                {(Object.keys(TEST_LABELS) as Array<InventoryFilters['test']>).map((key) => <option key={key} value={key}>{TEST_LABELS[key]}</option>)}
              </select>
            </label>
          )}

          <div className={FIELD_LABEL_CLASS}>
            <label htmlFor="filter-year">Tahun pembuatan</label>
            <select id="filter-year" value={filters.yearRange} onChange={(e) => updateFilter('yearRange', e.target.value as InventoryFilters['yearRange'])} className={SELECT_CLASS}>
              {(Object.keys(YEAR_LABELS) as Array<InventoryFilters['yearRange']>).map((key) => <option key={key} value={key}>{YEAR_LABELS[key]}</option>)}
            </select>
            {filters.yearRange === 'custom' && (
              <div className="flex items-center gap-2 normal-case tracking-normal">
                <NumberFilter label="Tahun dari" placeholder="Dari" value={filters.yearMin} onCommit={(value) => updateFilter('yearMin', value)} />
                <span className="text-slate-400">–</span>
                <NumberFilter label="Tahun sampai" placeholder="Sampai" value={filters.yearMax} onCommit={(value) => updateFilter('yearMax', value)} />
              </div>
            )}
          </div>

          {hasTransformers && (
            <div className={FIELD_LABEL_CLASS}>
              <span>Daya trafo (kVA)</span>
              <div className="flex items-center gap-2 normal-case tracking-normal">
                <NumberFilter label="Daya minimal" placeholder="Min" value={filters.dayaMin} onCommit={(value) => updateFilter('dayaMin', value)} />
                <span className="text-slate-400">–</span>
                <NumberFilter label="Daya maksimal" placeholder="Maks" value={filters.dayaMax} onCommit={(value) => updateFilter('dayaMax', value)} />
              </div>
            </div>
          )}

          <label className={FIELD_LABEL_CLASS}>
            Koordinat
            <select value={filters.coordinates} onChange={(e) => updateFilter('coordinates', e.target.value as InventoryFilters['coordinates'])} className={SELECT_CLASS}>
              {(Object.keys(COORDINATE_LABELS) as Array<InventoryFilters['coordinates']>).map((key) => <option key={key} value={key}>{COORDINATE_LABELS[key]}</option>)}
            </select>
          </label>

          <label className={FIELD_LABEL_CLASS}>
            Kelengkapan data
            <select value={filters.missing} onChange={(e) => updateFilter('missing', e.target.value as InventoryFilters['missing'])} className={SELECT_CLASS}>
              {(Object.keys(MISSING_LABELS) as Array<InventoryFilters['missing']>).map((key) => <option key={key} value={key}>{MISSING_LABELS[key]}</option>)}
            </select>
          </label>

          <label className={`${FIELD_LABEL_CLASS} lg:col-span-2`}>
            Batch import (berkas › sheet)
            <select value={filters.batchId ?? 'all'} onChange={(e) => updateFilter('batchId', e.target.value === 'all' ? null : e.target.value)} className={SELECT_CLASS}>
              <option value="all">Semua batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {new Date(batch.uploaded_at).toLocaleDateString('id-ID')} · {batch.nama_file_asli}{batch.sheet_name ? ` › ${batch.sheet_name}` : ''}{category ? '' : ` (${getCategoryLabel(batch.jenis_data)})`}
                </option>
              ))}
            </select>
          </label>

          <label className={FIELD_LABEL_CLASS}>
            Waktu input
            <select value={filters.addedWithin} onChange={(e) => updateFilter('addedWithin', e.target.value as InventoryFilters['addedWithin'])} className={SELECT_CLASS}>
              {(Object.keys(ADDED_LABELS) as Array<InventoryFilters['addedWithin']>).map((key) => <option key={key} value={key}>{ADDED_LABELS[key]}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* Filter aktif */}
      {(activeChips.length > 0 || searchTerm) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {searchTerm && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-[11px] font-semibold text-slate-700">
              Cari: “{searchTerm}”
              <button type="button" aria-label="Hapus pencarian" onClick={() => setSearchTerm('')} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3 w-3" /></button>
            </span>
          )}
          {activeChips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1 text-[11px] font-semibold text-emerald-800">
              {chip.label}
              <button type="button" aria-label={`Hapus filter ${chip.label}`} onClick={() => { chip.clear(); setCurrentPage(1); }} className="rounded-full p-0.5 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-900"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800">
            <RotateCcw className="h-3 w-3" /> Reset semua
          </button>
        </div>
      )}
      {activeChips.length === 0 && !searchTerm && <div className="mb-3" />}

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* Table */}
      <div className={`relative overflow-x-auto rounded-xl border border-slate-200/80 ${loading ? 'opacity-60' : ''}`}>
        {loading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-700">
            <tr>
              <th className="py-3.5 px-4">No.</th>
              <th className="py-3.5 px-4">Merek / Seri</th>
              <th className="py-3.5 px-4">Perusahaan</th>
              <th className="py-3.5 px-4">Lokasi</th>
              {showTrafoCapacity && <th className="py-3.5 px-4">Daya (kVA)</th>}
              {showOilVolume && <th className="py-3.5 px-4">Volume (L)</th>}
              {showPcb && <th className="py-3.5 px-4">Konsentrasi Uji</th>}
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={tableColumnCount} className="py-12 text-center text-slate-400 font-medium">
                  {loading ? 'Memuat data...' : 'Tidak ada data yang sesuai dengan kriteria pencarian/filter.'}
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
                // PCB status pill
                let pcbIcon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
                let pcbBadge = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
                let pcbText = `${item.pcbConcentration} ppm (<50)`;

                if (item.pcbConcentration === null || item.pcbConcentration === undefined) {
                  pcbIcon = <HelpCircle className="h-3.5 w-3.5 text-slate-400" />;
                  pcbBadge = 'bg-slate-50 text-slate-600 border-slate-200';
                  pcbText = 'Belum Diuji';
                } else if (item.pcbConcentration > 500) {
                  pcbIcon = <AlertOctagon className="h-3.5 w-3.5 text-rose-600" />;
                  pcbBadge = 'bg-rose-50 text-rose-800 border-rose-200/80';
                  pcbText = `${item.pcbConcentration} ppm (>500)`;
                } else if (item.pcbConcentration >= 50) {
                  pcbIcon = <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
                  pcbBadge = 'bg-amber-50 text-amber-800 border-amber-200/80';
                  pcbText = `${item.pcbConcentration} ppm (50-500)`;
                }

                const isExpanded = expandedItemId === item.id;
                const detailEntries = Object.entries(details[item.id] || {}).filter(([key]) => !['id', 'company_id', 'import_batch_id', 'catatan_impor', 'baris_excel'].includes(key)).filter(([, value]) => value !== null && value !== undefined && value !== '');
                const importNotes = (details[item.id]?.catatan_impor ?? []) as ImportNoteRow[];
                return (
                  <Fragment key={item.id}>
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium">{item.no ?? '-'}</td>
                    <td className="py-3.5 px-4">
                      <button type="button" onClick={() => toggleDetails(item)} className={`text-left font-bold hover:text-emerald-700 ${item.name ? 'text-slate-900' : 'italic text-slate-400'}`}>{item.name || 'Merek tidak tercatat'}</button>
                      {item.type !== 'minyak_dielektrik' && (
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          S/N: {item.serialNumber || <span className="font-sans italic text-slate-400">tidak tercatat</span>}
                        </div>
                      )}
                      {item.code && <div className="text-[11px] text-slate-500 font-mono">Kode: {item.code}</div>}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700">
                      {item.companyName}
                      {item.unit && <div className="mt-0.5 text-[11px] font-normal text-slate-500">{item.unit}{item.subUnit ? ` › ${item.subUnit}` : ''}</div>}
                    </td>
                    <td className="py-3.5 px-4"><div className="text-slate-800 font-medium">{item.location || '-'}</div></td>
                    {showTrafoCapacity && <td className="py-3.5 px-4">{item.type.startsWith('transformator') ? item.capacity || '-' : '-'}</td>}
                    {showOilVolume && <td className="py-3.5 px-4">{item.type === 'minyak_dielektrik' ? item.capacity || '-' : '-'}</td>}
                    {showPcb && <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${pcbBadge}`}>
                        {pcbIcon}
                        <span>{pcbText}</span>
                      </span>
                    </td>}
                    <td className="py-3.5 px-4">
                      <span className="capitalize font-medium text-slate-700">
                        {item.status || 'Aktif'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          title="Edit data"
                          aria-label={`Edit ${item.name || 'data'}`}
                          onClick={() => {
                            setEditingItem(item);
                            setEditForm({
                              name: item.name || '',
                              serialNumber: item.serialNumber || '',
                              location: item.location || '',
                              pcbConcentration: item.pcbConcentration ?? null,
                              status: item.status || 'Aktif',
                            });
                          }}
                          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Hapus data"
                          aria-label={`Hapus ${item.name || 'data'}`}
                          onClick={async () => {
                            if (onDelete && window.confirm(`Hapus data ${item.name || `nomor ${item.no ?? '-'}`}?`)) {
                              await onDelete(item);
                            }
                          }}
                          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && <tr key={`${item.id}-details`} className="bg-slate-50/70"><td colSpan={tableColumnCount} className="px-6 py-4">{importNotes.length > 0 && <ImportNotes notes={importNotes} excelRow={details[item.id]?.baris_excel} />}<div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">{detailEntries.length > 0 ? detailEntries.map(([key, value]) => <div key={key}><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{key.replaceAll('_', ' ')}</div><div className="text-xs font-medium text-slate-700">{String(value)}</div></div>) : <span className="text-xs text-slate-500">{details[item.id] ? 'Tidak ada detail tambahan.' : 'Memuat detail...'}</span>}</div></td></tr>}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500 font-medium">
            Halaman {currentPage.toLocaleString('id-ID')} dari {totalPages.toLocaleString('id-ID')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {editingItem && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-inventory-title">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h4 id="edit-inventory-title" className="text-lg font-bold text-slate-900">Edit Data Inventarisasi</h4>
                <p className="mt-1 text-xs text-slate-500">Perbarui informasi {editingItem.name || 'alat ini'}.</p>
              </div>
              <button type="button" title="Tutup" aria-label="Tutup form edit" onClick={() => setEditingItem(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Merek / Nama
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Nomor Serial
                <input value={editForm.serialNumber} onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Lokasi
                <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Konsentrasi PCB (ppm)
                <input type="number" min="0" value={editForm.pcbConcentration ?? ''} onChange={(e) => setEditForm({ ...editForm, pcbConcentration: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Status
                <input value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingItem(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (!onEdit) return;
                  setSaving(true);
                  try {
                    await onEdit(editingItem, editForm);
                    setEditingItem(null);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
