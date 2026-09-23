'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UploadCloud, FileSpreadsheet, Building2, Layers, CheckCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/lib/inventory';

interface CompanyOption {
  id: string;
  nama_perusahaan: string;
}

export default function UploadPage() {
  const router = useRouter();
  const supabase = createClient();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  // Form states
  const [jenisData, setJenisData] = useState<InventoryCategory>('transformator_digunakan');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [isNewCompany, setIsNewCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Upload & preview states
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    batchId: string;
    headers: string[];
    previewRows: Record<string, any>[];
    totalRows: number;
    fileName: string;
  } | null>(null);

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

  // Handle submit upload
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
      formData.append('jenis_data', jenisData);

      if (isNewCompany) {
        formData.append('new_company_name', newCompanyName.trim());
      } else {
        formData.append('company_id', selectedCompanyId);
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memproses berkas Excel.');
      }

      setPreviewData(json);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat upload.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-8 px-4 sm:px-6">
      {/* Step Indicator Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
          <span>Langkah 1 dari 2</span>
          <span>&bull;</span>
          <span>Upload &amp; Deteksi Header</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
          Unggah Berkas Inventarisasi PCBs
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 font-medium">
          Sistem otomatis mendeteksi baris header sebenarnya pada berkas Excel Anda meskipun memiliki judul bertingkat 2-4 baris.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 shadow-2xs">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulir Upload */}
      {!previewData ? (
        <form onSubmit={handleUpload} className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-8">
            <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" />
              1. Pilih Kategori &amp; Profil Perusahaan
            </h2>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Jenis Data */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Jenis Data Inventaris <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INVENTORY_CATEGORIES.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setJenisData(tab.key)}
                      className={`rounded-xl border py-2.5 px-3 text-xs font-bold transition-all ${
                        jenisData === tab.key
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pilihan Perusahaan */}
              <div>
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
                    <span className="text-sm font-bold text-slate-900">
                      {file.name}
                    </span>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {(file.size / 1024).toFixed(1)} KB &bull; Klik untuk mengganti file
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-bold text-slate-800">
                      Klik untuk memilih berkas Excel atau seret berkas ke sini
                    </span>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Mendukung format multi-perusahaan (.xlsx, .xls)
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
                    <span>Menganalisis Header Berkas...</span>
                  </>
                ) : (
                  <>
                    <span>Proses &amp; Deteksi Kolom</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Preview Hasil Sniffing Header & Data */
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Header Kolom Berhasil Dideteksi!
                </h3>
                <p className="text-xs text-emerald-800 font-medium">
                  File: <strong>{previewData.fileName}</strong> &bull; Ditemukan {previewData.headers.length} kolom dan {previewData.totalRows} baris data.
                </p>
              </div>
            </div>
          </div>

          {/* Tabel Preview Kolom & Baris */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Pratinjau Data (5 Baris Pertama)
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    {previewData.headers.map((h, i) => (
                      <th key={i} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.previewRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/80">
                      {previewData.headers.map((h, cIdx) => (
                        <td key={cIdx} className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap text-slate-700 font-medium">
                          {row[h] !== null && row[h] !== undefined ? String(row[h]) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
              >
                Unggah File Lain
              </button>

              <button
                type="button"
                onClick={() => router.push(`/upload/${previewData.batchId}/mapping`)}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
              >
                <span>Lanjut ke Pemetaan Kolom (Mapping)</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
