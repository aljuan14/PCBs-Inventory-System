/**
 * Progress of a long request (checking or importing a sheet), streamed as
 * newline-delimited JSON so the page can show which step is running, how far
 * it is, and roughly how long is left. The last line is the result or an error.
 */

export type ProgressStage = 'load' | 'transform' | 'existing' | 'insert' | 'replace';

export const STAGE_LABELS: Record<ProgressStage, string> = {
  load: 'Membaca berkas',
  transform: 'Memeriksa baris',
  existing: 'Mencocokkan dengan data yang sudah ada',
  insert: 'Menyimpan ke database',
  replace: 'Mengganti data unggahan lama',
};

// Rough share of the total time per step, for the overall percentage.
const STAGE_WEIGHTS: Record<ProgressStage, number> = { load: 3, transform: 1, existing: 2, insert: 8, replace: 1 };

export type ProgressEvent =
  | { type: 'plan'; stages: ProgressStage[] }
  | { type: 'stage'; stage: ProgressStage }
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; data: unknown }
  | { type: 'error'; error: string; detail?: string | null; code?: string | null };

type FinalEvent = Extract<ProgressEvent, { type: 'result' | 'error' }>;
export type SendProgress = (event: Exclude<ProgressEvent, FinalEvent>) => void;

/**
 * Streams the events of `run`, ending with the result or error it returns.
 * The work carries on if the page stops listening (an import must not stop
 * halfway), so sending after a disconnect is silently dropped.
 */
export function progressResponse(label: string, run: (send: SendProgress) => Promise<FinalEvent>): Response {
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
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } });
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
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.body || !(res.headers.get('content-type') ?? '').includes('ndjson')) {
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

export interface ProgressState {
  startedAt: number;
  stages: Array<{ stage: ProgressStage; startedAt?: number; endedAt?: number }>;
  current: ProgressStage | null;
  /** Rows (or chunks) done of the current step, when it reports them. */
  done: number;
  total: number;
}

export const startProgress = (now: number): ProgressState => ({ startedAt: now, stages: [], current: null, done: 0, total: 0 });

export function applyProgress(state: ProgressState, event: ProgressEvent, now: number): ProgressState {
  if (event.type === 'plan') return { ...state, stages: event.stages.map((stage) => ({ stage })) };
  if (event.type === 'progress') return { ...state, done: event.done, total: event.total };
  if (event.type !== 'stage') return state;
  const known = state.stages.some((entry) => entry.stage === event.stage);
  const stages = (known ? state.stages : [...state.stages, { stage: event.stage }]).map((entry) => {
    if (entry.stage === state.current) return { ...entry, endedAt: now };
    if (entry.stage === event.stage) return { ...entry, startedAt: now };
    return entry;
  });
  return { ...state, stages, current: event.stage, done: 0, total: 0 };
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
