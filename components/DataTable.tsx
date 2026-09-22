'use client';

import { useState, useMemo } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle2, AlertOctagon, HelpCircle } from 'lucide-react';

export interface InventoryItem {
  id: string;
  type: 'transformator' | 'kapasitor' | 'minyak_dielektrik';
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
}

interface DataTableProps {
  items: InventoryItem[];
  companies: string[];
}

export default function DataTable({ items, companies }: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedPcbRange, setSelectedPcbRange] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Filter tipe alat
      if (selectedType !== 'all' && item.type !== selectedType) {
        return false;
      }

      // 2. Filter perusahaan
      if (selectedCompany !== 'all' && item.companyName !== selectedCompany) {
        return false;
      }

      // 3. Filter rentang PCB
      if (selectedPcbRange !== 'all') {
        const conc = item.pcbConcentration;
        if (selectedPcbRange === 'safe') {
          if (conc === null || conc === undefined || conc >= 50) return false;
        } else if (selectedPcbRange === 'moderate') {
          if (conc === null || conc === undefined || conc < 50 || conc > 500) return false;
        } else if (selectedPcbRange === 'high') {
          if (conc === null || conc === undefined || conc <= 500) return false;
        } else if (selectedPcbRange === 'untested') {
          if (conc !== null && conc !== undefined) return false;
        }
      }

      // 4. Search query
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = item.name?.toLowerCase().includes(term);
        const matchSerial = item.serialNumber?.toLowerCase().includes(term);
        const matchCompany = item.companyName?.toLowerCase().includes(term);
        const matchLocation = item.location?.toLowerCase().includes(term);
        return matchName || matchSerial || matchCompany || matchLocation;
      }

      return true;
    });
  }, [items, selectedType, selectedCompany, selectedPcbRange, searchTerm]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Tabel Data Inventarisasi Peralatan & Minyak
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Menampilkan {filteredItems.length} data dari total {items.length} unit terdaftar
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari merek, no seri, lokasi..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-400"
          />
        </div>
      </div>

      {/* Filter Chips / Selectors */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter:</span>
        </div>

        {/* Tipe Alat */}
        <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="all">Semua Jenis Alat</option>
          <option value="transformator">Transformator</option>
          <option value="kapasitor">Kapasitor</option>
          <option value="minyak_dielektrik">Minyak Dielektrik</option>
        </select>

        {/* Perusahaan */}
        <select
          value={selectedCompany}
          onChange={(e) => {
            setSelectedCompany(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="all">Semua Perusahaan</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Rentang PCB */}
        <select
          value={selectedPcbRange}
          onChange={(e) => {
            setSelectedPcbRange(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="all">Semua Kadar PCB</option>
          <option value="safe">Bebas PCB (&lt; 50 ppm)</option>
          <option value="moderate">Terkontaminasi (50 - 500 ppm)</option>
          <option value="high">Bahaya Tinggi (&gt; 500 ppm)</option>
          <option value="untested">Belum Diuji</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            <tr>
              <th className="py-3 px-4">Jenis</th>
              <th className="py-3 px-4">Merek / Seri</th>
              <th className="py-3 px-4">Perusahaan</th>
              <th className="py-3 px-4">Lokasi &amp; Koordinat</th>
              <th className="py-3 px-4">Konsentrasi PCB</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Tidak ada data yang sesuai dengan filter.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
                let badgeTypeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                let labelType = 'Transformator';
                if (item.type === 'kapasitor') {
                  badgeTypeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                  labelType = 'Kapasitor';
                } else if (item.type === 'minyak_dielektrik') {
                  badgeTypeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  labelType = 'Minyak';
                }

                // PCB status pill
                let pcbIcon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
                let pcbBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                let pcbText = `${item.pcbConcentration} ppm (<50)`;

                if (item.pcbConcentration === null || item.pcbConcentration === undefined) {
                  pcbIcon = <HelpCircle className="h-3.5 w-3.5 text-slate-400" />;
                  pcbBadge = 'bg-slate-50 text-slate-600 border-slate-200';
                  pcbText = 'Belum Diuji';
                } else if (item.pcbConcentration > 500) {
                  pcbIcon = <AlertOctagon className="h-3.5 w-3.5 text-rose-600" />;
                  pcbBadge = 'bg-rose-50 text-rose-700 border-rose-200';
                  pcbText = `${item.pcbConcentration} ppm (>500)`;
                } else if (item.pcbConcentration >= 50) {
                  pcbIcon = <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
                  pcbBadge = 'bg-amber-50 text-amber-700 border-amber-200';
                  pcbText = `${item.pcbConcentration} ppm (50-500)`;
                }

                return (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-medium">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badgeTypeClass}`}>
                        {labelType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{item.name}</div>
                      {item.serialNumber && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          S/N: {item.serialNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {item.companyName}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 dark:text-slate-200">{item.location || '-'}</div>
                      {item.latitude !== null && item.longitude !== null && item.latitude !== undefined && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.latitude.toFixed(4)}, {item.longitude?.toFixed(4)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pcbBadge}`}>
                        {pcbIcon}
                        <span>{pcbText}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="capitalize text-slate-600 dark:text-slate-300">
                        {item.status || 'Aktif'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="text-xs text-slate-500">
            Halaman {currentPage} dari {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
