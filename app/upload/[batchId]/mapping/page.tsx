'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { FieldDefinition, ImportBatch } from '@/lib/types';
import type { InventoryCategory } from '@/lib/inventory';
import { 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
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

        // Auto-match memakai vocabulary yang relevan dengan kategori resmi.
        const initialMapping: Record<string, string> = {};
        const availableDefs: FieldDefinition[] = data.fieldDefinitions || [];
        const category = data.batch?.jenis_data as InventoryCategory;
        const categoryHints: Record<InventoryCategory, Array<[string, string[]]>> = {
          transformator_digunakan: [['perawatan_penyedia_jasa', ['penyedia', 'jasa', 'perawatan']], ['daya_kva', ['daya', 'kva']], ['uji_konsentrasi_ppm', ['konsentrasi', 'ppm']]],
          transformator_tidak_digunakan: [['kondisi_di_dalam_alat', ['kondisi', 'dalam', 'alat']], ['status_kondisi', ['status', 'kondisi']], ['waktu_terakhir_digunakan', ['terakhir', 'digunakan']]],
          kapasitor: [['status_alat', ['status', 'alat', 'kapasitor']]],
          minyak_dielektrik: [['merek_minyak_dielektrik', ['merek', 'minyak', 'dielektrik']], ['status_minyak', ['status', 'minyak']], ['uji_konsentrasi_ppm', ['konsentrasi', 'ppm']]],
        };

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

            const hint = categoryHints[category]?.find(([, words]) => words.every((word) => cleanH.includes(word)));
            if (hint && fd.field_key === hint[0]) matchedKey = fd.field_key;
            // Keyword heuristics khusus field tetap
            if (cleanH.includes('merek') || cleanH.includes('merk')) {
              if (fd.field_key === 'nama_merek' || fd.field_key === 'merek_minyak_dielektrik') matchedKey = fd.field_key;
            } else if (cleanH.includes('seri') || cleanH.includes('serial')) {
              if (fd.field_key === 'nomor_serial') matchedKey = fd.field_key;
            } else if (cleanH.includes('koordinat') || cleanH.includes('dms') || cleanH.includes('latlon')) {
              if (fd.field_key === 'koordinat_raw') matchedKey = fd.field_key;
            } else if (cleanH.includes('pcb') || cleanH.includes('ppm')) {
              if (fd.field_key === 'uji_konsentrasi_ppm') matchedKey = fd.field_key;
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
        // Tampilkan pesan error detail dari Supabase
        const errMsg = json.error || 'Gagal mengimpor data.';
        const errDetail = json.detail ? `\nDetail: ${json.detail}` : '';
        const errCode = json.code ? ` (kode: ${json.code})` : '';
        throw new Error(errMsg + errDetail + errCode);
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
        <p className="text-xs font-semibold text-slate-600">
          Memuat kamus field baku dan kolom berkas...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8 px-4 sm:px-6">
      {/* Header Info */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
          <span>Langkah 2 dari 2</span>
          <span>&bull;</span>
          <span>Pemetaan Kolom Excel ke Skema Baku</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
          Pemetaan Kolom (Manual Field Mapping)
        </h1>
        <p className="mt-1 text-sm text-slate-600 font-medium">
          Petakan kolom asli dari file Excel Anda (kiri) ke kolom baku database (kanan). Nilai koordinat DMS akan otomatis di-parse menjadi desimal.
        </p>

        {batch && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs">
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 shadow-2xs">
              File: {batch.nama_file_asli}
            </span>
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-800 capitalize shadow-2xs">
              Jenis: {batch.jenis_data}
            </span>
            {batch.companies && (
              <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 font-bold text-blue-800 shadow-2xs">
                Perusahaan: {batch.companies.nama_perusahaan}
              </span>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 shadow-2xs">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Modal / Banner Sukses */}
      {importSuccess ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-8 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Data Inventarisasi Berhasil Diimpor!
          </h2>
          <p className="mt-2 text-sm text-slate-600 font-medium">
            Sebanyak <strong>{importSuccess.count} baris peralatan</strong> telah berhasil disimpan ke database lengkap dengan koordinat spasial desimal.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
            >
              <span>Buka Dashboard &amp; Peta GIS</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push('/upload')}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              Unggah File Lain
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status Kolom Wajib */}
          {missingMandatory.length > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900 shadow-xs">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                Kolom wajib berikut belum dipetakan:{' '}
                <strong className="text-amber-950 font-bold">{missingMandatory.map((m) => m.label).join(', ')}</strong>. Pastikan memilih field ini sebelum mengimpor.
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 shadow-xs">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>Semua kolom wajib database telah terpetakan!</span>
            </div>
          )}

          {/* Tabel Pemetaan Kolom */}
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50/80 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 font-bold text-xs text-slate-700">
                <div className="sm:col-span-6">Kolom File Excel Asli &amp; Contoh Data</div>
                <div className="sm:col-span-1 text-center hidden sm:block">Arah</div>
                <div className="sm:col-span-5">Target Field Baku Database</div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 p-2 sm:p-4">
              {excelHeaders.map((header, idx) => {
                const sampleVal = sampleRow[header];
                const selectedKey = mappings[header] || '__ignore__';
                const isCoordinateCol = selectedKey === 'titik_koordinat_raw';

                return (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 py-3 items-center">
                    {/* Sisi Kiri: Kolom Asli Excel */}
                    <div className="sm:col-span-6">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          {header}
                        </span>
                        {isCoordinateCol && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                            <MapPin className="h-3 w-3" />
                            Auto DMS Parser
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 font-mono truncate max-w-sm">
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
                        className={`w-full rounded-xl border py-2 px-3 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/10 ${
                          selectedKey === '__ignore__'
                            ? 'border-slate-200 bg-slate-50/70 text-slate-400 hover:border-slate-300'
                            : 'border-emerald-500 bg-white text-emerald-950 font-bold shadow-2xs'
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
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 p-4">
              <button
                type="button"
                onClick={() => router.push('/upload')}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
              >
                Kembali
              </button>

              <button
                type="button"
                onClick={handleSaveAndImport}
                disabled={importing}
                className={`flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all`}
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
