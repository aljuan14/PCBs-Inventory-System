import fs from 'fs';
import path from 'path';
import type { InventoryCategory } from '@/lib/inventory';
import type { ImportProfile } from '@/lib/import-profiles';

/**
 * Local working files for the upload → review → mapping → import flow.
 * One upload (a workbook) produces one session file; every sheet the admin
 * confirms becomes an import batch with its own meta file.
 */
export const UPLOAD_DIR = path.join(process.cwd(), 'tmp_uploads');

export interface UploadSheet {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  totalRows: number;
  /** Rows carrying real inventory data (excludes empty pre-filled form rows). */
  dataRows: number;
  previewRows: Record<string, unknown>[];
  profile: ImportProfile | null;
  category: InventoryCategory | null;
  include: boolean;
  reason: string;
}

export interface UploadSession {
  uploadId: string;
  companyId: string;
  fileName: string;
  storagePath: string | null;
  createdAt: string;
  sheets: UploadSheet[];
  batches: Array<{ batchId: string; sheetName: string; category: InventoryCategory }>;
}

export interface BatchMeta {
  batchId: string;
  /** Absent on batches created before multi-sheet uploads; their file is `<batchId>.xlsx`. */
  uploadId?: string;
  companyId: string;
  jenisData: InventoryCategory;
  fileName: string;
  sheetName?: string;
  profile?: ImportProfile | null;
  headers: string[];
  totalRows: number;
  dataRows?: number;
  previewRows: Record<string, unknown>[];
  suggestedMapping?: Record<string, string>;
}

const readJson = <T>(file: string): T | null => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T) : null);
const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};

const sessionPath = (uploadId: string) => path.join(UPLOAD_DIR, `${uploadId}.upload.json`);
const batchMetaPath = (batchId: string) => path.join(UPLOAD_DIR, `${batchId}.json`);

export const readUploadSession = (uploadId: string) => readJson<UploadSession>(sessionPath(uploadId));
export const writeUploadSession = (session: UploadSession) => writeJson(sessionPath(session.uploadId), session);
export const readBatchMeta = (batchId: string) => readJson<BatchMeta>(batchMetaPath(batchId));
export const writeBatchMeta = (meta: BatchMeta) => writeJson(batchMetaPath(meta.batchId), meta);

export function saveWorkbook(uploadId: string, buffer: Buffer) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, `${uploadId}.xlsx`), buffer);
}

/** Local copy of the workbook behind a batch, or null when only the storage copy remains. */
export function readBatchWorkbook(batchId: string, meta: BatchMeta | null) {
  const file = path.join(UPLOAD_DIR, `${meta?.uploadId ?? batchId}.xlsx`);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

export const isUploadId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
