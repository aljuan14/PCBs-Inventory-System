'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ImportBatch } from '@/lib/types';
import type { ValidationIssue } from '@/lib/import-transform';
import CheckIssueList from '@/components/CheckIssueList';
import { getCategoryLabel, suggestInventoryField, type InventoryCategory, type InventoryField } from '@/lib/inventory';
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  MapPin,
  ChevronDown,
  ChevronRight,
  Database,
  RefreshCw,
  Wand2
} from 'lucide-react';

const IGNORE = '__ignore__';

type MappingField = Pick<InventoryField, 'field_key' | 'label' | 'tipe_data' | 'wajib'> & { derived?: boolean };

interface SiblingBatch {
  batchId: string;
  sheetName: string;
  category: InventoryCategory;
  status: string;
}

interface ValidationReport {
  totalRows: number;
  dataRows: number;
  skippedEmpty: number;
  duplicatesInDb: { count: number; rows: number[] };
  issues: ValidationIssue[];
  missingImportant: string[];
  dashboard: { before1997: number; from1997: number; unknownYear: number; labTested: number; labAtLeast50: number } | null;
  samples: Record<string, string[]>;
}

type ColumnState = 'changed' | 'guess' | 'unmapped' | 'auto' | 'ignored';

const formatNumber = (value: number) => value.toLocaleString('id-ID');

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export default function MappingPage({ params }: { params: Promise<{ batchId: string }> }) {
  const router = useRouter();
  const { batchId } = use(params);

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [fieldDefs, setFieldDefs] = useState<MappingField[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [sampleRow, setSampleRow] = useState<Record<string, unknown>>({});
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [profileLabel, setProfileLabel] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<SiblingBatch[]>([]);
  const [suggested, setSuggested] = useState<Record<string, string>>({});

  // State mapping: { [excelHeader]: fieldKey }
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // Pemeriksaan data (dry run) untuk mapping saat ini
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [showMatched, setShowMatched] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  const [importSuccess, setImportSuccess] = useState<{ count: number; skippedEmpty: number; skippedDuplicates: number } | null>(null);

  const runCheck = useCallback(async (currentMappings: Record<string, string>) => {
    setChecking(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mapping/${batchId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: currentMappings }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memeriksa data.');
      setReport(json);
      setCheckedKey(JSON.stringify(currentMappings));
    } catch (err) {
      setErrorMsg((err instanceof Error && err.message) || 'Gagal memeriksa data.');
    } finally {
      setChecking(false);
    }
  }, [batchId]);

  // Ambil data batch, field definitions, dan headers, lalu langsung periksa.
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
        setSheetName(data.sheetName);
        setProfileLabel(data.profileLabel);
        setSiblings(data.siblings || []);

        // Profil format (Template KLHK / PLN) sudah menyiapkan mapping; kolom
        // di luar profil dicocokkan dengan kata kunci kategori.
        const initialMapping: Record<string, string> = {};
        for (const h of data.headers || []) {
          initialMapping[h] = data.suggestedMapping?.[h] ?? suggestInventoryField(data.batch?.jenis_data, h);
        }
        setSuggested(data.suggestedMapping || {});
        setMappings(initialMapping);
        if (data.batch?.status !== 'imported') runCheck(initialMapping);
      } catch (err) {
        setErrorMsg((err instanceof Error && err.message) || 'Gagal memuat batch.');
      } finally {
        setLoading(false);
      }
    }

    loadMappingData();
  }, [batchId, runCheck]);

  // Satu field database hanya boleh berasal dari satu kolom: kolom lama yang
  // memakai field yang sama dikembalikan ke "Abaikan".
  const handleSelectChange = (header: string, selectedFieldKey: string) => {
    setMappings((prev) => {
      const next = { ...prev, [header]: selectedFieldKey };
      if (selectedFieldKey !== IGNORE) {
        for (const [otherHeader, fieldKey] of Object.entries(prev)) {
          if (otherHeader !== header && fieldKey === selectedFieldKey) next[otherHeader] = IGNORE;
        }
      }
      return next;
    });
  };

  const isStale = checkedKey !== JSON.stringify(mappings);
  const samplesFor = (header: string) => report?.samples[header] ?? (sampleRow[header] !== null && sampleRow[header] !== undefined ? [String(sampleRow[header])] : []);

  const columnState = (header: string): ColumnState => {
    const selected = mappings[header] || IGNORE;
    const original = suggested[header] ?? IGNORE;
    if (selected !== original) return 'changed';
    if (selected !== IGNORE) return profileLabel ? 'auto' : 'guess';
    // Tanpa profil, kolom berisi data yang belum dipetakan perlu dilihat.
    return !profileLabel && samplesFor(header).length > 0 ? 'unmapped' : 'ignored';
  };
  const groups = { attention: [] as string[], matched: [] as string[], ignored: [] as string[] };
  for (const header of excelHeaders) {
    const state = columnState(header);
    if (state === 'auto') groups.matched.push(header);
    else if (state === 'ignored') groups.ignored.push(header);
    else groups.attention.push(header);
  }

  const duplicates = report?.duplicatesInDb.count ?? 0;
  const importCount = report ? report.dataRows - (skipDuplicates ? duplicates : 0) : 0;
  const nextSibling = siblings.find((item) => item.batchId !== batchId && item.status !== 'imported');

  const handleSaveAndImport = async () => {
    setErrorMsg(null);
    setImporting(true);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, mappings, skipDuplicates }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        // Tampilkan pesan error detail dari Supabase
        const errMsg = json.error || 'Gagal mengimpor data.';
        const errDetail = json.detail ? `\nDetail: ${json.detail}` : '';
        const errCode = json.code ? ` (kode: ${json.code})` : '';
        throw new Error(errMsg + errDetail + errCode);
      }

      setImportSuccess({ count: json.importedCount, skippedEmpty: json.skippedEmpty ?? 0, skippedDuplicates: json.skippedDuplicates ?? 0 });
      setSiblings((prev) => prev.map((item) => (item.batchId === batchId ? { ...item, status: 'imported' } : item)));
    } catch (err) {
      setErrorMsg((err instanceof Error && err.message) || 'Terjadi kesalahan saat mengimpor data.');
    } finally {
      setImporting(false);
    }
  };

  const renderColumn = (header: string) => {
    const selectedKey = mappings[header] || IGNORE;
    const state = columnState(header);
    const samples = samplesFor(header);
    const badge = {
      changed: { text: 'Diubah', className: 'border-sky-200 bg-sky-50 text-sky-800' },
      guess: { text: 'Tebakan, periksa', className: 'border-amber-200 bg-amber-50 text-amber-800' },
      unmapped: { text: 'Berisi data, belum dipetakan', className: 'border-slate-200 bg-slate-50 text-slate-600' },
      auto: { text: 'Otomatis', className: 'border-violet-200 bg-violet-50 text-violet-800' },
      ignored: null,
    }[state];

    return (
      <div key={header} className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-12">
        <div className="min-w-0 sm:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-900">{header}</span>
            {badge && <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>{state === 'auto' && <Wand2 className="h-3 w-3" />}{badge.text}</span>}
            {selectedKey === 'koordinat_raw' && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                <MapPin className="h-3 w-3" />
                DMS / desimal
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {samples.length > 0
              ? samples.map((sample) => <span key={sample} className="max-w-56 truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{sample}</span>)
              : <span className="text-[11px] text-slate-400">(kolom kosong)</span>}
          </div>
        </div>
        <div className="sm:col-span-5">
          <select
            value={selectedKey}
            onChange={(e) => handleSelectChange(header, e.target.value)}
            className={`w-full rounded-xl border py-2 px-3 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/10 ${
              selectedKey === IGNORE
                ? 'border-slate-200 bg-slate-50/70 text-slate-400 hover:border-slate-300'
                : 'border-emerald-500 bg-white text-emerald-950 font-bold shadow-2xs'
            }`}
          >
            <option value={IGNORE}>-- Abaikan Kolom Ini --</option>
            <optgroup label="Kolom database">
              {fieldDefs.filter((fd) => !fd.derived).map((fd) => (
                <option key={fd.field_key} value={fd.field_key}>
                  {fd.label} [{fd.tipe_data}]
                </option>
              ))}
            </optgroup>
            {fieldDefs.some((fd) => fd.derived) && (
              <optgroup label="Konversi otomatis">
                {fieldDefs.filter((fd) => fd.derived).map((fd) => (
                  <option key={fd.field_key} value={fd.field_key}>
                    {fd.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>
    );
  };

  const collapsibleGroup = (title: string, headers: string[], open: boolean, toggle: () => void, hint: string) => (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div>
          <div className="text-sm font-bold text-slate-900">{title} ({headers.length})</div>
          <div className="text-[11px] text-slate-500">{hint}</div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
      </button>
      {open && <div className="divide-y divide-slate-100 border-t border-slate-100 px-4">{headers.map(renderColumn)}</div>}
    </div>
  );

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
          <span>Langkah 3 dari 3</span>
          <span>&bull;</span>
          <span>Verifikasi &amp; Impor</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
          Verifikasi Pemetaan &amp; Data
        </h1>
        <p className="mt-1 text-sm text-slate-600 font-medium">
          Periksa bagian yang ditandai saja. Kolom yang dikenali dari profil format sudah dipetakan, dan setiap baris diperiksa sebelum disimpan.
        </p>

        {batch && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs">
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 shadow-2xs">
              File: {batch.nama_file_asli}
            </span>
            {sheetName && (
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 shadow-2xs">
                Sheet: {sheetName}
              </span>
            )}
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-800 shadow-2xs">
              Kategori: {getCategoryLabel(batch.jenis_data as InventoryCategory)}
            </span>
            {profileLabel && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1 font-bold text-violet-800 shadow-2xs">
                <Wand2 className="h-3 w-3" /> {profileLabel}
              </span>
            )}
            {batch.companies && (
              <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 font-bold text-blue-800 shadow-2xs">
                Perusahaan: {batch.companies.nama_perusahaan}
              </span>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 whitespace-pre-line rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 shadow-2xs">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {importSuccess ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-8 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Data Inventarisasi Berhasil Diimpor!
          </h2>
          <p className="mt-2 text-sm text-slate-600 font-medium">
            Sebanyak <strong>{formatNumber(importSuccess.count)} baris peralatan</strong> telah disimpan ke database.
          </p>
          {(importSuccess.skippedEmpty > 0 || importSuccess.skippedDuplicates > 0) && (
            <p className="mt-2 text-xs text-slate-500 font-medium">
              Dilewati: {formatNumber(importSuccess.skippedEmpty)} baris formulir kosong &bull; {formatNumber(importSuccess.skippedDuplicates)} baris yang sudah ada di database.
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {nextSibling && (
              <button
                type="button"
                onClick={() => router.push(`/upload/${nextSibling.batchId}/mapping`)}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
              >
                <span>Lanjut: sheet {nextSibling.sheetName}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className={nextSibling
                ? 'rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors'
                : 'flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 transition-all'}
            >
              <span>Buka Dashboard &amp; Peta GIS</span>
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
      ) : batch?.status === 'imported' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-xs">
          Batch ini sudah diimpor.{' '}
          {nextSibling && <button type="button" onClick={() => router.push(`/upload/${nextSibling.batchId}/mapping`)} className="font-semibold text-emerald-700 hover:underline">Lanjut ke sheet {nextSibling.sheetName}</button>}
        </div>
      ) : (
        <div className="space-y-6">
          {siblings.length > 1 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="mb-2 text-xs font-bold text-slate-700">Sheet lain dari berkas ini</div>
              <div className="flex flex-wrap gap-2">
                {siblings.map((item) => (
                  <button
                    key={item.batchId}
                    type="button"
                    onClick={() => item.batchId !== batchId && router.push(`/upload/${item.batchId}/mapping`)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                      item.batchId === batchId
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.status === 'imported' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                    {item.sheetName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hasil pemeriksaan data */}
          <section className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 shadow-xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Hasil pemeriksaan data</h2>
                <p className="text-[11px] text-slate-500">Semua baris diproses seperti saat impor, tanpa menyimpan apa pun.</p>
              </div>
              <button
                type="button"
                onClick={() => runCheck(mappings)}
                disabled={checking}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Memeriksa...' : 'Periksa ulang'}
              </button>
            </div>

            {isStale && report && !checking && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
                <Info className="h-4 w-4 shrink-0" /> Pemetaan berubah sejak pemeriksaan terakhir. Periksa ulang sebelum mengimpor.
              </div>
            )}

            {!report ? (
              <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
                {checking ? <><Loader2 className="h-4 w-4 animate-spin" /> Memeriksa semua baris...</> : 'Belum diperiksa.'}
              </div>
            ) : (
              <div className={`space-y-4 ${checking ? 'opacity-50' : ''}`}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Akan diimpor" value={formatNumber(importCount)} tone="text-emerald-700" />
                  <Stat label="Baris data di sheet" value={formatNumber(report.dataRows)} />
                  <Stat label="Formulir kosong (dilewati)" value={formatNumber(report.skippedEmpty)} tone="text-slate-500" />
                  <Stat label="Sudah ada di database" value={formatNumber(duplicates)} tone={duplicates > 0 ? 'text-amber-700' : 'text-slate-500'} />
                </div>

                {duplicates > 0 && (
                  <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
                    <span>
                      <strong>Lewati {formatNumber(duplicates)} baris yang isinya identik dengan data perusahaan ini di database</strong> (misalnya berkas yang sama terunggah dua kali).
                      {' '}Baris Excel: {report.duplicatesInDb.rows.join(', ')}{duplicates > report.duplicatesInDb.rows.length ? ', …' : ''}
                    </span>
                  </label>
                )}

                {report.missingImportant.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Field penting belum dipetakan: <strong>{report.missingImportant.join(', ')}</strong>. Data tetap bisa diimpor, tetapi field ini akan kosong di dashboard.
                    </span>
                  </div>
                )}

                <CheckIssueList issues={report.issues} dataRows={report.dataRows} />

                {report.dashboard && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-[11px] font-semibold text-slate-500">Tambahan pada dashboard dari impor ini</div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
                      <span>Tahun &lt; 1997: <strong className="tabular-nums">{formatNumber(report.dashboard.before1997)}</strong></span>
                      <span>Tahun ≥ 1997: <strong className="tabular-nums">{formatNumber(report.dashboard.from1997)}</strong></span>
                      <span>Tahun tidak diketahui: <strong className="tabular-nums">{formatNumber(report.dashboard.unknownYear)}</strong></span>
                      <span>Sudah uji lab: <strong className="tabular-nums">{formatNumber(report.dashboard.labTested)}</strong></span>
                      <span>Hasil lab ≥ 50 ppm: <strong className="tabular-nums text-rose-700">{formatNumber(report.dashboard.labAtLeast50)}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Pemetaan kolom, dikelompokkan menurut perlu-tidaknya dicek */}
          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="border-b border-slate-100 p-4">
                <div className="text-sm font-bold text-slate-900">Perlu dicek ({groups.attention.length})</div>
                <div className="text-[11px] text-slate-500">Kolom hasil tebakan kata kunci, kolom yang Anda ubah, dan kolom berisi data yang belum dipetakan.</div>
              </div>
              {groups.attention.length > 0
                ? <div className="divide-y divide-slate-100 px-4">{groups.attention.map(renderColumn)}</div>
                : <div className="flex items-center gap-2 p-4 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Tidak ada kolom yang perlu dicek.</div>}
            </div>
            {groups.matched.length > 0 && collapsibleGroup('Cocok otomatis', groups.matched, showMatched, () => setShowMatched(!showMatched), `Dipetakan oleh profil ${profileLabel ?? ''}.`)}
            {groups.ignored.length > 0 && collapsibleGroup('Tidak dipakai', groups.ignored, showIgnored, () => setShowIgnored(!showIgnored), 'Kolom di luar skema inventaris (mis. Unit Induk, dimensi, simbol & label) atau kosong.')}
          </section>

          {/* Footer Aksi */}
          <div className="flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => router.push('/upload')}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              Kembali
            </button>

            <button
              type="button"
              onClick={isStale ? () => runCheck(mappings) : handleSaveAndImport}
              disabled={importing || checking || (!isStale && importCount === 0)}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menyimpan {formatNumber(importCount)} baris...</span>
                </>
              ) : isStale ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>Periksa data dulu</span>
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  <span>Impor {formatNumber(importCount)} baris ke database</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
