'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle2, AlertOctagon, HelpCircle, Pencil, Trash2, X, Save, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { InventoryCategory } from '@/lib/inventory';
import { fetchInventoryDetails, fetchInventoryPage, type CategoryFilter, type InventoryRow, type PcbRange } from '@/lib/inventory-query';

export interface InventoryItem {
  id: string;
  no?: number | null;
  type: 'transformator' | 'transformator_digunakan' | 'transformator_tidak_digunakan' | 'kapasitor' | 'minyak_dielektrik';
  name: string;
  companyName: string;
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

export default function DataTable({ category, companies, reloadKey = 0, onEdit, onDelete }: DataTableProps) {
  const supabase = useMemo(() => createClient(), []);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedType, setSelectedType] = useState<CategoryFilter>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedPcbRange, setSelectedPcbRange] = useState<PcbRange>('all');
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

  // Tunggu sebentar setelah mengetik agar tidak mengirim query per huruf.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Data diambil per halaman dari server; filter dan pencarian dijalankan di database.
  const query = useMemo(() => ({
    category: category ?? selectedType,
    companyId: selectedCompany === 'all' ? null : selectedCompany,
    pcbRange: selectedPcbRange,
    search: debouncedSearch,
    page: currentPage,
    pageSize: PAGE_SIZE,
  }), [category, selectedType, selectedCompany, selectedPcbRange, debouncedSearch, currentPage]);
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
            placeholder="Cari merek, no seri, lokasi..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>
      </div>

      {/* Filter Chips / Selectors */}
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mr-1">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter:</span>
        </div>

        {/* Tipe Alat (hanya di halaman gabungan) */}
        {!category && <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value as CategoryFilter);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">Semua Jenis Alat</option>
          <option value="transformator">Transformator</option>
          <option value="kapasitor">Kapasitor</option>
          <option value="minyak_dielektrik">Minyak Dielektrik</option>
        </select>}

        {/* Perusahaan */}
        <select
          value={selectedCompany}
          onChange={(e) => {
            setSelectedCompany(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">Semua Perusahaan</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Rentang PCB */}
        <select
          value={selectedPcbRange}
          onChange={(e) => {
            setSelectedPcbRange(e.target.value as PcbRange);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">Semua Kadar PCB</option>
          <option value="safe">Bebas PCB (&lt; 50 ppm)</option>
          <option value="moderate">Terkontaminasi (50 - 500 ppm)</option>
          <option value="high">Bahaya Tinggi (&gt; 500 ppm)</option>
          <option value="untested">Belum Diuji</option>
        </select>
      </div>

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
                const detailEntries = Object.entries(details[item.id] || {}).filter(([key]) => !['id', 'company_id', 'import_batch_id'].includes(key)).filter(([, value]) => value !== null && value !== undefined && value !== '');
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
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700">
                      {item.companyName}
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
                  {isExpanded && <tr key={`${item.id}-details`} className="bg-slate-50/70"><td colSpan={tableColumnCount} className="px-6 py-4"><div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">{detailEntries.length > 0 ? detailEntries.map(([key, value]) => <div key={key}><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{key.replaceAll('_', ' ')}</div><div className="text-xs font-medium text-slate-700">{String(value)}</div></div>) : <span className="text-xs text-slate-500">{details[item.id] ? 'Tidak ada detail tambahan.' : 'Memuat detail...'}</span>}</div></td></tr>}
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
