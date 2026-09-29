/**
 * Progress of a long request (scanning a workbook, checking or importing a
 * sheet), streamed as newline-delimited JSON so the page can show which step
 * is running, how far it is, and roughly how long is left. The last line is
 * the result or an error. The upload step is reported by the browser itself.
 */

export type ProgressStage = 'upload' | 'download' | 'parse' | 'scan' | 'save' | 'load' | 'transform' | 'existing' | 'insert' | 'replace';

/** What the count of a step is in. */
export type ProgressUnit = 'rows' | 'sheets' | 'bytes';

export const STAGE_LABELS: Record<ProgressStage, string> = {
  upload: 'Mengunggah berkas',
  download: 'Mengambil berkas dari penyimpanan',
  parse: 'Membaca isi Excel',
  scan: 'Memindai sheet',
  save: 'Menyimpan hasil pemindaian',
  load: 'Membaca berkas',
  transform: 'Memeriksa baris',
  existing: 'Mencocokkan dengan data yang sudah ada',
  insert: 'Menyimpan ke database',
  replace: 'Mengganti data unggahan lama',
};

// Rough share of the total time per step, for the overall percentage.
const STAGE_WEIGHTS: Record<ProgressStage, number> = {
  upload: 3, download: 1, parse: 3, scan: 3, save: 1,
  load: 3, transform: 1, existing: 2, insert: 8, replace: 1,
};

export type ProgressEvent =
  | { type: 'plan'; stages: ProgressStage[] }
  | { type: 'stage'; stage: ProgressStage }
  /** `label` names the item being worked on, e.g. the sheet being scanned. */
  | { type: 'progress'; done: number; total: number; unit?: ProgressUnit; label?: string }
  | { type: 'result'; data: unknown }
  /** `status` is the HTTP status when the result is sent as plain JSON. */
  | { type: 'error'; error: string; detail?: string | null; code?: string | null; status?: number };

type FinalEvent = Extract<ProgressEvent, { type: 'result' | 'error' }>;
export type SendProgress = (event: Exclude<ProgressEvent, FinalEvent>) => void;

export const PROGRESS_CONTENT_TYPE = 'application/x-ndjson';

/**
 * Lets what was sent reach the page before synchronous work (parsing a
 * workbook, transforming rows) holds the event loop.
 */
export const flushProgress = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Streams the events of `run`, ending with the result or error it returns.
 * The work carries on if the page stops listening (an import must not stop
 * halfway), so sending after a disconnect is silently dropped.
 * Only a client that asks for the stream (Accept: application/x-ndjson) gets
 * it; others, such as a page still open from before the stream existed, get
 * the plain JSON result they expect.
 */
export async function progressResponse(req: Request, label: string, run: (send: SendProgress) => Promise<FinalEvent>): Promise<Response> {
  if (!(req.headers.get('accept') ?? '').includes(PROGRESS_CONTENT_TYPE)) {
    let final: FinalEvent;
    try {
      final = await run(() => {});
    } catch (err) {
      console.error(`${label} error:`, err);
      final = { type: 'error', error: (err instanceof Error && err.message) || 'Terjadi kesalahan pada server.' };
    }
    if (final.type === 'result') return Response.json(final.data);
    const { error, detail, code, status } = final;
    return Response.json({ error, detail, code }, { status: status ?? 500 });
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: ProgressEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      let final: FinalEvent;
      try {
        final = await run(write);
      } catch (err) {
        console.error(`${label} error:`, err);
        final = { type: 'error', error: (err instanceof Error && err.message) || 'Terjadi kesalahan pada server.' };
      }
      write(final);
      if (open) controller.close();
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: { 'Content-Type': `${PROGRESS_CONTENT_TYPE}; charset=utf-8`, 'Cache-Control': 'no-cache, no-transform' } });
}

export class RequestError extends Error {
  constructor(message: string, readonly detail: string | null = null, readonly code: string | null = null) {
    super(message);
  }
}

/**
 * Posts JSON and follows the progress stream, returning the final result.
 * Errors found before the work starts come back as a plain JSON reply.
 */
export async function postWithProgress<T>(url: string, body: unknown, onEvent: (event: ProgressEvent) => void): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: PROGRESS_CONTENT_TYPE }, body: JSON.stringify(body) });
  if (!res.body || !(res.headers.get('content-type') ?? '').includes(PROGRESS_CONTENT_TYPE)) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new RequestError(json.error || `Permintaan gagal (${res.status}).`, json.detail ?? null, json.code ?? null);
    return json as T;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as ProgressEvent;
      if (event.type === 'result') return event.data as T;
      if (event.type === 'error') throw new RequestError(event.error, event.detail ?? null, event.code ?? null);
      onEvent(event);
    }
  }
  throw new RequestError('Koneksi terputus sebelum proses selesai. Buka riwayat upload untuk memastikan hasilnya.');
}

/**
 * Uploads a file to a Supabase Storage signed upload URL, reporting the bytes
 * sent (supabase-js uploadToSignedUrl does not report progress). The request
 * matches supabase-js: a form with cacheControl and the file, no upsert.
 */
export function uploadWithProgress(signedUrl: string, file: File, apiKey: string, onProgress: (sent: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('apikey', apiKey);
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded, event.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `status ${xhr.status}`;
      try {
        const json = JSON.parse(xhr.responseText);
        message = json.message || json.error || message;
      } catch { /* keep the status */ }
      reject(new RequestError(`Gagal mengunggah berkas ke penyimpanan: ${message}`));
    };
    xhr.onerror = () => reject(new RequestError('Gagal mengunggah berkas ke penyimpanan: koneksi terputus.'));
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file);
    xhr.send(body);
  });
}

export interface ProgressState {
  startedAt: number;
  stages: Array<{ stage: ProgressStage; startedAt?: number; endedAt?: number }>;
  current: ProgressStage | null;
  /** Count done of the current step, when it reports one. */
  done: number;
  total: number;
  unit: ProgressUnit;
  /** Item the current step is working on, e.g. a sheet name. */
  label: string | null;
}

/** A new progress, optionally with steps the page already knows about (such as its own upload). */
export const startProgress = (now: number, stages: ProgressStage[] = []): ProgressState => ({
  startedAt: now, stages: stages.map((stage) => ({ stage })), current: null, done: 0, total: 0, unit: 'rows', label: null,
});

export function applyProgress(state: ProgressState, event: ProgressEvent, now: number): ProgressState {
  // The server's plan follows the steps already started on the page (the upload).
  if (event.type === 'plan') {
    const started = state.stages.filter((entry) => entry.startedAt);
    return { ...state, stages: [...started, ...event.stages.filter((stage) => !started.some((entry) => entry.stage === stage)).map((stage) => ({ stage }))] };
  }
  if (event.type === 'progress') return { ...state, done: event.done, total: event.total, unit: event.unit ?? 'rows', label: event.label ?? null };
  if (event.type !== 'stage') return state;
  const known = state.stages.some((entry) => entry.stage === event.stage);
  const stages = (known ? state.stages : [...state.stages, { stage: event.stage }]).map((entry) => {
    if (entry.stage === state.current) return { ...entry, endedAt: now };
    if (entry.stage === event.stage) return { ...entry, startedAt: now };
    return entry;
  });
  return { ...state, stages, current: event.stage, done: 0, total: 0, label: null };
}

/** Overall share done (0–1), from finished steps and the current step's own count. */
export function progressShare(state: ProgressState) {
  const total = state.stages.reduce((sum, entry) => sum + STAGE_WEIGHTS[entry.stage], 0);
  if (total === 0) return 0;
  const done = state.stages.reduce((sum, entry) => {
    if (entry.endedAt) return sum + STAGE_WEIGHTS[entry.stage];
    if (entry.stage === state.current && state.total > 0) return sum + STAGE_WEIGHTS[entry.stage] * (state.done / state.total);
    return sum;
  }, 0);
  return Math.min(done / total, 0.99);
}

/** Estimated milliseconds left, once enough has happened to judge the pace; null before that. */
export function remainingMs(state: ProgressState, now: number) {
  const share = progressShare(state);
  const elapsed = now - state.startedAt;
  if (share < 0.1 || elapsed < 1500) return null;
  return (elapsed * (1 - share)) / share;
}
