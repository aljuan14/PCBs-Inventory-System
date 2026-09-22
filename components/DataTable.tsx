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
    <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Tabel Data Inventarisasi Peralatan & Minyak
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Menampilkan {filteredItems.length} data dari total {items.length} unit terdaftar
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

        {/* Tipe Alat */}
        <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none"
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
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none"
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
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">Semua Kadar PCB</option>
          <option value="safe">Bebas PCB (&lt; 50 ppm)</option>
          <option value="moderate">Terkontaminasi (50 - 500 ppm)</option>
          <option value="high">Bahaya Tinggi (&gt; 500 ppm)</option>
          <option value="untested">Belum Diuji</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-700">
            <tr>
              <th className="py-3.5 px-4">Jenis</th>
              <th className="py-3.5 px-4">Merek / Seri</th>
              <th className="py-3.5 px-4">Perusahaan</th>
              <th className="py-3.5 px-4">Lokasi &amp; Koordinat</th>
              <th className="py-3.5 px-4">Konsentrasi PCB</th>
              <th className="py-3.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                  Tidak ada data yang sesuai dengan kriteria pencarian/filter.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
                let badgeTypeClass = 'bg-blue-50 text-blue-800 border-blue-200/80';
                let labelType = 'Transformator';
                if (item.type === 'kapasitor') {
                  badgeTypeClass = 'bg-amber-50 text-amber-800 border-amber-200/80';
                  labelType = 'Kapasitor';
                } else if (item.type === 'minyak_dielektrik') {
                  badgeTypeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
                  labelType = 'Minyak';
                }

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

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium">
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold ${badgeTypeClass}`}>
                        {labelType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{item.name}</div>
                      {item.serialNumber && (
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          S/N: {item.serialNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700">
                      {item.companyName}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-medium">{item.location || '-'}</div>
                      {item.latitude !== null && item.longitude !== null && item.latitude !== undefined && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {item.latitude.toFixed(4)}, {item.longitude?.toFixed(4)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${pcbBadge}`}>
                        {pcbIcon}
                        <span>{pcbText}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="capitalize font-medium text-slate-700">
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
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500 font-medium">
            Halaman {currentPage} dari {totalPages}
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
    </div>
  );
}
