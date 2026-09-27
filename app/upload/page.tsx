'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UploadCloud, FileSpreadsheet, Building2, Layers, CheckCircle, ArrowRight, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';
import { IMPORT_PROFILE_LABELS, type ImportProfile } from '@/lib/import-profiles';

interface CompanyOption {
  id: string;
  nama_perusahaan: string;
}

interface ScannedSheet {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  headerCount: number;
  totalRows: number;
  dataRows: number;
  previewRows: Record<string, unknown>[];
  profile: ImportProfile | null;
  category: InventoryCategory | null;
  include: boolean;
  reason: string;
}

interface ScanResult {
  uploadId: string;
  fileName: string;
  sheets: ScannedSheet[];
}

const formatNumber = (value: number) => value.toLocaleString('id-ID');

function ProfileBadge({ profile }: { profile: ImportProfile | null }) {
  if (!profile) {
    return <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">Tidak dikenali</span>;
  }
  return <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{IMPORT_PROFILE_LABELS[profile]}</span>;
}

function SheetPreview({ sheet }: { sheet: ScannedSheet }) {
  // Show the columns that actually hold values in the preview rows.
  const columns = sheet.headers.filter((header) => sheet.previewRows.some((row) => row[header] !== null && row[header] !== undefined)).slice(0, 10);
  if (sheet.previewRows.length === 0) return <p className="px-4 pb-4 text-xs text-slate-500">Tidak ada baris data untuk ditampilkan.</p>;
  return (
    <div className="mx-4 mb-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
          <tr>{columns.map((header) => <th key={header} className="whitespace-nowrap border-r border-slate-200 px-2.5 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sheet.previewRows.slice(0, 3).map((row, index) => (
            <tr key={index}>
              {columns.map((header) => <td key={header} className="max-w-48 truncate whitespace-nowrap border-r border-slate-100 px-2.5 py-2 text-slate-700">{row[header] !== null && row[header] !== undefined ? String(row[header]) : '-'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {sheet.headerCount > columns.length && <p className="border-t border-slate-100 bg-slate-50/60 px-2.5 py-1.5 text-[10px] text-slate-500">Menampilkan {columns.length} dari {sheet.headerCount} kolom.</p>}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const supabase = createClient();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  // Form states
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [isNewCompany, setIsNewCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Upload & review states
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selection, setSelection] = useState<Record<string, { include: boolean; category: InventoryCategory | '' }>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  // Fetch daftar perusahaan dari Supabase
  useEffect(() => {
    async function loadCompanies() {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, nama_perusahaan')
          .order('nama_perusahaan', { ascending: true });

        if (error) {
          console.warn('Gagal memuat perusahaan (mungkin tabel belum dibuat):', error.message);
        } else if (data) {
          setCompanies(data);
          if (data.length > 0) {
            setSelectedCompanyId(data[0].id);
          } else {
            setIsNewCompany(true);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingCompanies(false);
      }
    }
    loadCompanies();
  }, [supabase]);

  // Handle submit upload: scan all sheets
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!file) {
      setErrorMsg('Pilih berkas Excel (.xlsx / .xls) terlebih dahulu.');
      return;
    }
    if (isNewCompany && !newCompanyName.trim()) {
      setErrorMsg('Nama perusahaan baru wajib diisi.');
      return;
    }
    if (!isNewCompany && !selectedCompanyId) {
      setErrorMsg('Pilih perusahaan pelapor terlebih dahulu.');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (isNewCompany) {
        formData.append('new_company_name', newCompanyName.trim());
      } else {
        formData.append('company_id', selectedCompanyId);
      }

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memproses berkas Excel.');
      }

      setScan(json);
      setSelection(Object.fromEntries((json.sheets as ScannedSheet[]).map((sheet) => [sheet.sheetName, { include: sheet.include, category: sheet.category ?? '' }])));
      setExpanded(null);
    } catch (err) {
      setErrorMsg((err instanceof Error && err.message) || 'Terjadi kesalahan saat upload.');
    } finally {
      setUploading(false);
    }
  };

  const chosen = scan ? scan.sheets.filter((sheet) => selection[sheet.sheetName]?.include) : [];
  const missingCategory = chosen.filter((sheet) => !selection[sheet.sheetName]?.category);
  const chosenRows = chosen.reduce((sum, sheet) => sum + sheet.dataRows, 0);

  const updateSelection = (sheetName: string, changes: Partial<{ include: boolean; category: InventoryCategory | '' }>) => {
    setSelection((prev) => ({ ...prev, [sheetName]: { ...prev[sheetName], ...changes } }));
  };

  // Handle confirm: create one batch per chosen sheet
  const handleConfirm = async () => {
    if (!scan) return;
    setErrorMsg(null);
    if (chosen.length === 0) {
      setErrorMsg('Pilih minimal satu sheet untuk diimpor.');
      return;
    }
    if (missingCategory.length > 0) {
      setErrorMsg(`Pilih kategori untuk sheet: ${missingCategory.map((sheet) => sheet.sheetName).join(', ')}.`);
      return;
    }

    setConfirming(true);
    try {
      const res = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: scan.uploadId,
          sheets: chosen.map((sheet) => ({ sheetName: sheet.sheetName, category: selection[sheet.sheetName].category })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal membuat batch import.');
      }
      router.push(`/upload/${json.batches[0].batchId}/mapping`);
    } catch (err) {
      setErrorMsg((err instanceof Error && err.message) || 'Terjadi kesalahan saat membuat batch.');
      setConfirming(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-8 px-4 sm:px-6">
      {/* Step Indicator Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
          <span>Langkah {scan ? 2 : 1} dari 3</span>
          <span>&bull;</span>
          <span>{scan ? 'Tinjau Sheet' : 'Upload Berkas'}</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
          {scan ? 'Pilih Sheet yang Akan Diimpor' : 'Unggah Berkas Inventarisasi PCBs'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 font-medium">
          {scan
            ? 'Sistem memindai semua sheet, mengenali format (Template KLHK atau Format PLN), dan menebak kategorinya. Sheet rekap, salinan, dan daftar pilihan tidak dicentang secara bawaan.'
            : 'Unggah satu berkas Excel; semua sheet di dalamnya akan dipindai dan kategorinya dideteksi otomatis.'}
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 shadow-2xs">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!scan ? (
        <form onSubmit={handleUpload} className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-8">
            <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              1. Profil Perusahaan
            </h2>

            <div className="max-w-md">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Perusahaan Pemilik <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewCompany(!isNewCompany)}
                  className="text-[11px] font-bold text-emerald-700 hover:underline"
                >
                  {isNewCompany ? 'Pilih dari daftar' : '+ Tambah Perusahaan Baru'}
                </button>
              </div>

              {isNewCompany ? (
                <input
                  type="text"
                  placeholder="Masukkan nama perusahaan baru..."
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 px-3.5 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                />
              ) : (
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  disabled={loadingCompanies || companies.length === 0}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                >
                  {companies.length === 0 ? (
                    <option value="">(Belum ada perusahaan, klik tambah baru)</option>
                  ) : (
                    companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama_perusahaan}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {/* Dropzone File */}
            <div className="mt-8">
              <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                2. Pilih File Spreadsheet Excel (.xlsx / .xls)
              </h2>

              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center transition-colors hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/20 cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 mb-3 shadow-inner">
                  <UploadCloud className="h-7 w-7" />
                </div>
                {file ? (
                  <div>
                    <span className="text-sm font-bold text-slate-900">{file.name}</span>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {(file.size / 1024 / 1024).toFixed(1)} MB &bull; Klik untuk mengganti file
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-bold text-slate-800">
                      Klik untuk memilih berkas Excel atau seret berkas ke sini
                    </span>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Berkas dengan banyak sheet (mis. Trafo Online, Trafo Offline, Kapasitor) didukung
                    </p>
                  </div>
                )}
              </label>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="submit"
                disabled={uploading || !file}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memindai semua sheet...</span>
                  </>
                ) : (
                  <>
                    <span>Pindai Berkas</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 shrink-0 text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold text-emerald-950">{scan.fileName}</h3>
                <p className="text-xs text-emerald-800 font-medium">
                  {scan.sheets.length} sheet dipindai &bull; {chosen.length} dipilih &bull; {formatNumber(chosenRows)} baris data akan diimpor
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-xs font-bold text-slate-700">
              <Layers className="h-4 w-4 text-emerald-600" />
              Sheet dalam berkas
            </div>
            <ul className="divide-y divide-slate-100">
              {scan.sheets.map((sheet) => {
                const state = selection[sheet.sheetName] ?? { include: false, category: '' };
                const isOpen = expanded === sheet.sheetName;
                const disabled = sheet.headerCount === 0;
                return (
                  <li key={sheet.sheetName} className={state.include ? '' : 'bg-slate-50/50'}>
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <label className="flex min-w-0 flex-1 items-start gap-3">
                        <input
                          type="checkbox"
                          checked={state.include}
                          disabled={disabled}
                          onChange={(e) => updateSelection(sheet.sheetName, { include: e.target.checked })}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm font-bold ${state.include ? 'text-slate-900' : 'text-slate-500'}`}>{sheet.sheetName}</span>
                            <ProfileBadge profile={sheet.profile} />
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {formatNumber(sheet.dataRows)} baris data
                            {sheet.totalRows > sheet.dataRows && ` (${formatNumber(sheet.totalRows - sheet.dataRows)} baris formulir kosong diabaikan)`}
                            {sheet.headerCount > 0 && ` • ${sheet.headerCount} kolom`}
                          </p>
                          {sheet.reason && <p className="mt-1 text-[11px] font-medium text-amber-700">{sheet.reason}</p>}
                        </div>
                      </label>
                      <div className="flex items-center gap-2 sm:w-80">
                        <select
                          value={state.category}
                          disabled={disabled}
                          onChange={(e) => updateSelection(sheet.sheetName, { category: e.target.value as InventoryCategory | '', include: e.target.value ? true : state.include })}
                          className={`w-full rounded-xl border py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 ${state.include && !state.category ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-800'}`}
                        >
                          <option value="">-- Pilih kategori --</option>
                          {INVENTORY_CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : sheet.sheetName)}
                          disabled={disabled}
                          aria-label={isOpen ? 'Tutup pratinjau' : 'Lihat pratinjau'}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {isOpen && <SheetPreview sheet={sheet} />}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => { setScan(null); setErrorMsg(null); }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
              >
                Unggah File Lain
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || chosen.length === 0}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
              >
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Lanjut ke Pemetaan Kolom ({chosen.length} sheet)</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
