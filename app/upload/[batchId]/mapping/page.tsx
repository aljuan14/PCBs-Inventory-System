'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { FieldDefinition, ImportBatch } from '@/lib/types';
import { 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Layers, 
  Sparkles, 
  MapPin, 
  ChevronRight,
  Database
} from 'lucide-react';

export default function MappingPage({ params }: { params: Promise<{ batchId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const batchId = resolvedParams.batchId;

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [fieldDefs, setFieldDefs] = useState<FieldDefinition[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [sampleRow, setSampleRow] = useState<Record<string, any>>({});

  // State mapping: { [excelHeader]: fieldKey }
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // Hasil import sukses
  const [importSuccess, setImportSuccess] = useState<{ count: number } | null>(null);

  // Ambil data batch, field definitions, dan headers
  useEffect(() => {
    async function loadMappingData() {
      try {
        const res = await fetch(`/api/mapping/${batchId}`);
        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || 'Gagal mengambil konfigurasi mapping.');
        }

        setBatch(data.batch);
        setFieldDefs(data.fieldDefinitions || []);
        setExcelHeaders(data.headers || []);
        setSampleRow(data.sampleRow || {});

        // Auto-match kolom cerdas awal
        const initialMapping: Record<string, string> = {};
        const availableDefs: FieldDefinition[] = data.fieldDefinitions || [];

        for (const h of data.headers || []) {
          const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
          let matchedKey = '__ignore__';

          for (const fd of availableDefs) {
            const cleanKey = fd.field_key.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanLabel = fd.label.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (cleanH === cleanKey || cleanH === cleanLabel) {
              matchedKey = fd.field_key;
              break;
            }

            // Keyword heuristics
            if (cleanH.includes('merek') || cleanH.includes('merk')) {
              if (fd.field_key === 'nama_merek' || fd.field_key === 'merek') matchedKey = fd.field_key;
            } else if (cleanH.includes('seri') || cleanH.includes('serial')) {
              if (fd.field_key === 'nomor_serial') matchedKey = fd.field_key;
            } else if (cleanH.includes('koordinat') || cleanH.includes('dms') || cleanH.includes('latlon')) {
              if (fd.field_key === 'titik_koordinat_raw') matchedKey = fd.field_key;
            } else if (cleanH.includes('pcb') || cleanH.includes('ppm')) {
              if (fd.field_key === 'konsentrasi_pcb_ppm') matchedKey = fd.field_key;
            } else if (cleanH.includes('kva') || cleanH.includes('daya')) {
              if (fd.field_key === 'daya_kva') matchedKey = fd.field_key;
            } else if (cleanH.includes('tahun')) {
              if (fd.field_key === 'tahun_pembuatan') matchedKey = fd.field_key;
            } else if (cleanH.includes('lokasi')) {
              if (fd.field_key.includes('lokasi')) matchedKey = fd.field_key;
            }
          }

          initialMapping[h] = matchedKey;
        }

        setMappings(initialMapping);
      } catch (err: any) {
        setErrorMsg(err.message || 'Gagal memuat batch.');
      } finally {
        setLoading(false);
      }
    }

    loadMappingData();
  }, [batchId]);

  // Handle perubahan dropdown mapping
  const handleSelectChange = (header: string, selectedFieldKey: string) => {
    setMappings((prev) => ({
      ...prev,
      [header]: selectedFieldKey,
    }));
  };

  // Cek apakah semua field wajib sudah terpetakan
  const mandatoryFields = fieldDefs.filter((f) => f.wajib);
  const mappedFieldKeys = new Set(Object.values(mappings));
  const missingMandatory = mandatoryFields.filter((f) => !mappedFieldKeys.has(f.field_key));

  // Handle Simpan & Import
  const handleSaveAndImport = async () => {
    setErrorMsg(null);
    setImporting(true);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId,
          mappings,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal mengimpor data.');
      }

      setImportSuccess({ count: json.importedCount });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat mengimpor data.');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mb-3" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Memuat kamus field baku dan kolom berkas...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8 px-4 sm:px-6">
      {/* Header Info */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
          <span>Langkah 2 dari 2</span>
          <span>&bull;</span>
          <span>Pemetaan Kolom Excel ke Skema Baku</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">
          Pemetaan Kolom (Manual Field Mapping)
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Petakan kolom asli dari file Excel Anda (kiri) ke kolom baku database (kanan). Nilai koordinat DMS akan otomatis di-parse menjadi desimal.
        </p>

        {batch && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-md bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              File: {batch.nama_file_asli}
            </span>
            <span className="rounded-md bg-emerald-100 px-3 py-1 font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 capitalize">
              Jenis: {batch.jenis_data}
            </span>
            {batch.companies && (
              <span className="rounded-md bg-blue-100 px-3 py-1 font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                Perusahaan: {batch.companies.nama_perusahaan}
              </span>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Modal / Banner Sukses */}
      {importSuccess ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-inner dark:bg-emerald-900">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Data Inventarisasi Berhasil Diimpor!
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Sebanyak <strong>{importSuccess.count} baris peralatan</strong> telah berhasil disimpan ke database lengkap dengan koordinat spasial desimal.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
            >
              <span>Buka Dashboard &amp; Peta GIS</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push('/upload')}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Unggah File Lain
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status Kolom Wajib */}
          {missingMandatory.length > 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                Kolom wajib berikut belum dipetakan:{' '}
                <strong>{missingMandatory.map((m) => m.label).join(', ')}</strong>. Pastikan memilih field ini sebelum mengimpor.
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>Semua kolom wajib database telah terpetakan!</span>
            </div>
          )}

          {/* Tabel Pemetaan Kolom */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 font-semibold text-xs text-slate-600 dark:text-slate-300">
                <div className="sm:col-span-6">Kolom File Excel Asli &amp; Contoh Data</div>
                <div className="sm:col-span-1 text-center hidden sm:block">Arah</div>
                <div className="sm:col-span-5">Target Field Baku Database</div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 p-2 sm:p-4">
              {excelHeaders.map((header, idx) => {
                const sampleVal = sampleRow[header];
                const selectedKey = mappings[header] || '__ignore__';
                const isCoordinateCol = selectedKey === 'titik_koordinat_raw';

                return (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 py-3 items-center">
                    {/* Sisi Kiri: Kolom Asli Excel */}
                    <div className="sm:col-span-6">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {header}
                        </span>
                        {isCoordinateCol && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
                            <MapPin className="h-3 w-3" />
                            Auto DMS Parser
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-sm">
                        Sampel: {sampleVal !== null && sampleVal !== undefined ? String(sampleVal) : '(kosong)'}
                      </div>
                    </div>

                    {/* Simbol Panah */}
                    <div className="sm:col-span-1 text-center text-slate-400 hidden sm:block">
                      <ChevronRight className="h-4 w-4 mx-auto" />
                    </div>

                    {/* Sisi Kanan: Dropdown Target Field */}
                    <div className="sm:col-span-5">
                      <select
                        value={selectedKey}
                        onChange={(e) => handleSelectChange(header, e.target.value)}
                        className={`w-full rounded-xl border py-2 px-3 text-xs font-medium transition-colors focus:outline-none ${
                          selectedKey === '__ignore__'
                            ? 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-800/50'
                            : 'border-emerald-500 bg-white text-emerald-950 font-semibold dark:border-emerald-500 dark:bg-slate-800 dark:text-white'
                        }`}
                      >
                        <option value="__ignore__">-- Abaikan Kolom Ini --</option>
                        {fieldDefs.map((fd) => (
                          <option key={fd.field_key} value={fd.field_key}>
                            {fd.label} {fd.wajib ? '*(Wajib)' : ''} [{fd.tipe_data}]
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Aksi */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => router.push('/upload')}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
              >
                Kembali
              </button>

              <button
                type="button"
                onClick={handleSaveAndImport}
                disabled={importing || missingMandatory.length > 0}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Mentransformasi &amp; Menyimpan Data...</span>
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" />
                    <span>Simpan &amp; Import ke Database</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
