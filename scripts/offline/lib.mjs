/**
 * Shared helpers for the offline mode: local Supabase (Docker, via the Supabase
 * CLI) plus a data sync through a separate private git repo.
 *
 * The database is the source of truth. The data repo only carries CSV exports
 * of it: one file per table, and the inventory tables split per import batch so
 * an import only adds or removes the files of the batches it touched.
 *
 * Plain Node (no tsx) so the same commands work on Windows and Linux.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_REPO_DIR = path.join(ROOT, 'offline-data');
export const DATA_DIR = path.join(DATA_REPO_DIR, 'data');
export const STATE_FILE = path.join(ROOT, '.offline-state.json');
export const DATA_REPO_URL = process.env.DATA_REPO_URL || 'https://github.com/aljuan14/PCBs-Inventory-Data.git';
export const DATA_BRANCH = 'main';

/** Container name comes from project_id in supabase/config.toml. */
export const DB_CONTAINER = 'supabase_db_pcbs-inventory';
const NETWORK = 'supabase_network_pcbs-inventory';
const LOOPBACK_OPTION = 'com.docker.network.bridge.host_binding_ipv4';

/** Filled by supabase/seed.sql, not by the sync. */
const SKIP_TABLES = new Set(['public.field_definitions']);
/** Login accounts travel with the data so every laptop has the same users. */
const AUTH_TABLES = ['auth.users', 'auth.identities'];
/** Tables large enough to split per import batch. */
const BATCH_COLUMN = 'import_batch_id';
const NO_BATCH = '_tanpa-batch';

// ---------------------------------------------------------------------------
// Output

export const log = (message = '') => console.log(message);
export const step = (message) => console.log(`\n> ${message}`);

export class OfflineError extends Error {}

/** Run a script's main function, printing OfflineError messages without a stack trace. */
export function main(fn) {
  fn().catch((error) => {
    if (error instanceof OfflineError) {
      console.error(`\nGagal: ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Processes

/**
 * Run a command. `capture` returns stdout as a string, otherwise output goes to
 * the terminal. `input` (string or readable stream) is piped to stdin.
 */
export function run(command, args, { cwd = ROOT, capture = false, input, allowFail = false, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    }
    if (input !== undefined) {
      child.stdin.on('error', () => {}); // the child's exit code reports the real problem
      if (typeof input === 'string') child.stdin.end(input);
      else input.pipe(child.stdin);
    }
    child.on('error', (error) => {
      if (error.code === 'ENOENT') reject(new OfflineError(`Perintah "${command}" tidak ditemukan. Pastikan sudah terpasang dan ada di PATH.`));
      else reject(error);
    });
    child.on('close', (code) => {
      if (code === 0 || allowFail) resolve({ code, stdout, stderr });
      else reject(new OfflineError(`${command} ${args.join(' ')} gagal (exit ${code}).${stderr ? `\n${stderr.trim()}` : ''}`));
    });
  });
}

/** Supabase CLI from node_modules, called through node so no shell is needed on Windows. */
export function supabase(args, options) {
  return run(process.execPath, [path.join(ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js'), ...args], options);
}

export const git = (args, options) => run('git', args, { cwd: DATA_REPO_DIR, ...options });

export async function ensureDocker() {
  const { code } = await run('docker', ['info'], { capture: true, allowFail: true }).catch((error) => {
    if (error instanceof OfflineError) throw new OfflineError('Docker belum terpasang. Pasang Docker Desktop (Windows) atau Docker Engine (Linux) terlebih dahulu.');
    throw error;
  });
  if (code !== 0) throw new OfflineError('Docker belum berjalan. Buka Docker Desktop, tunggu sampai statusnya "running", lalu ulangi.');
}

/**
 * The Supabase CLI publishes its ports on every network interface, while the
 * local stack uses the CLI's well-known default passwords and keys. The CLI
 * reuses an existing Docker network of the right name, so create that network
 * first with loopback as the default host address: the ports then only open
 * for this laptop. Call before "supabase start".
 */
export async function ensureLoopbackNetwork() {
  const { code, stdout } = await run('docker', ['network', 'inspect', NETWORK, '--format', '{{json .Options}}'], { capture: true, allowFail: true });
  if (code === 0) {
    if (stdout.includes(`"${LOOPBACK_OPTION}":"127.0.0.1"`)) return;
    // Created by the CLI without the option: recreate it (the stack must be down).
    await supabase(['stop'], { capture: true, allowFail: true });
    await run('docker', ['network', 'rm', NETWORK], { capture: true, allowFail: true });
  }
  await run('docker', ['network', 'create', '-o', `${LOOPBACK_OPTION}=127.0.0.1`, NETWORK], { capture: true });
}

/** Safety net after start: stop the stack if any port is still reachable from the network. */
export async function ensurePortsPrivate() {
  const { stdout } = await run('docker', ['ps', '--filter', 'name=_pcbs-inventory', '--format', '{{.Names}}\t{{.Ports}}'], { capture: true });
  const exposed = stdout.split('\n').filter((line) => /(^|[\s,])(0\.0\.0\.0|\[::\]|::):\d+->/.test(line));
  if (!exposed.length) return;
  await supabase(['stop'], { capture: true, allowFail: true });
  throw new OfflineError(
    'Port Supabase terbuka ke jaringan (bisa diakses laptop lain di Wi-Fi yang sama), jadi Supabase dimatikan lagi.\n'
    + 'Jalankan ulang "npm run offline"; kalau pesan ini muncul lagi, hubungi admin.',
  );
}

/** supabase start with the loopback network and the port check around it. */
export async function startSupabase() {
  await ensureLoopbackNetwork();
  await supabase(['start']);
  await ensurePortsPrivate();
}

// ---------------------------------------------------------------------------
// Database access (psql inside the local database container)

const PSQL = ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1'];

/**
 * psql inside the local DB container. With `url` it connects to that database
 * instead (used to copy the cloud database once), reusing the container's psql.
 */
function psqlArgs(url) {
  return url ? ['exec', '-i', DB_CONTAINER, 'psql', url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'] : PSQL;
}

/** Run a query and return rows as arrays of strings (tab separated, unaligned). */
export async function query(sql, { url } = {}) {
  const { stdout } = await run('docker', [...psqlArgs(url), '-A', '-t', '-F', '\t', '-c', sql], { capture: true });
  return stdout.split('\n').filter((line) => line !== '').map((line) => line.split('\t'));
}

export async function ensureDatabase() {
  const { code } = await run('docker', [...PSQL, '-c', 'select 1'], { capture: true, allowFail: true });
  if (code !== 0) throw new OfflineError('Database lokal belum berjalan. Jalankan "npm run offline" (atau "npm run db:start") terlebih dahulu.');
  await ensurePortsPrivate();
}

// ---------------------------------------------------------------------------
// Table metadata

const qi = (name) => `"${name.replaceAll('"', '""')}"`;
const qt = (table) => table.split('.').map(qi).join('.');

/** Tables to sync: every base table in public (minus SKIP_TABLES) plus the auth tables. */
export async function syncedTables({ url } = {}) {
  const rows = await query(`select table_schema || '.' || table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`, { url });
  return [...rows.map(([name]) => name).filter((name) => !SKIP_TABLES.has(name)), ...AUTH_TABLES];
}

/** Writable columns (no generated columns) in table order. */
export async function tableColumns(table, { url } = {}) {
  const [schema, name] = table.split('.');
  const rows = await query(`select column_name from information_schema.columns where table_schema = '${schema}' and table_name = '${name}' and is_generated = 'NEVER' and identity_generation is distinct from 'ALWAYS' order by ordinal_position`, { url });
  return rows.map(([column]) => column);
}

/** Primary key columns, or null when the table has none. */
async function primaryKey(table, { url } = {}) {
  const rows = await query(`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = '${qt(table)}'::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)`, { url });
  return rows.length ? rows.map(([column]) => column) : null;
}

// ---------------------------------------------------------------------------
// Export: database -> CSV files in DATA_DIR

/** Split a CSV stream into records, respecting quoted fields that contain newlines. */
export async function* csvRecords(stream) {
  let buffer = '';
  let inQuotes = false;
  let start = 0;
  let scanned = 0;
  for await (const chunk of stream) {
    buffer += chunk;
    for (let i = scanned; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === '\n' && !inQuotes) {
        yield buffer.slice(start, i + 1);
        start = i + 1;
      }
    }
    buffer = buffer.slice(start);
    start = 0;
    scanned = buffer.length;
  }
  if (buffer.length) yield buffer.endsWith('\n') ? buffer : `${buffer}\n`;
}

/**
 * Write every synced table from the database at `url` (default: local) into
 * DATA_DIR, replacing what is there. Returns the manifest.
 * With `url` (copying from the cloud), columns are limited to those the local
 * database also has, since the two may run different Supabase versions.
 */
export async function exportData({ url } = {}) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const manifest = { format: 1, tables: {} };
  const tables = await syncedTables({ url });

  for (const table of tables) {
    let columns = await tableColumns(table, { url });
    if (url) {
      const target = new Set(await tableColumns(table));
      if (!target.size) { log(`  ${table}: tidak ada di database tujuan, dilewati`); continue; }
      columns = columns.filter((column) => target.has(column));
    }
    const key = (await primaryKey(table, { url })) ?? columns;
    const split = columns.includes(BATCH_COLUMN);
    const ordered = split ? [BATCH_COLUMN, ...columns.filter((column) => column !== BATCH_COLUMN)] : columns;
    const orderBy = (split ? [BATCH_COLUMN, ...key.filter((column) => column !== BATCH_COLUMN)] : key).map(qi).join(', ');
    const sql = `copy (select ${ordered.map(qi).join(', ')} from ${qt(table)} order by ${orderBy}) to stdout with (format csv)`;

    const child = spawn('docker', [...psqlArgs(url), '-c', sql], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const exited = new Promise((resolve) => child.on('close', resolve));
    child.stdout.setEncoding('utf8');

    const files = [];
    let rows = 0;
    let out = null;
    let currentBatch = null;
    const openFile = (relative) => {
      const file = path.join(DATA_DIR, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      files.push(relative.split(path.sep).join('/'));
      return fs.openSync(file, 'w');
    };

    if (!split) out = openFile(`${table}.csv`);
    for await (const record of csvRecords(child.stdout)) {
      if (split) {
        const batch = record.slice(0, record.indexOf(',')) || NO_BATCH;
        if (batch !== currentBatch) {
          if (out !== null) fs.closeSync(out);
          out = openFile(path.join(table, `${batch}.csv`));
          currentBatch = batch;
        }
      }
      fs.writeSync(out, record);
      rows++;
    }
    if (out !== null) fs.closeSync(out);

    const code = await exited;
    if (code !== 0) throw new OfflineError(`Ekspor ${table} gagal.\n${stderr.trim()}`);
    manifest.tables[table] = { columns: ordered, rows, files };
    log(`  ${table.padEnd(36)} ${rows.toLocaleString('id-ID').padStart(9)} baris`);
  }

  fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// ---------------------------------------------------------------------------
// Restore: CSV files in DATA_DIR -> local database (replaces its contents)

export function readManifest() {
  const file = path.join(DATA_DIR, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Build the whole restore as one psql script, streamed so large tables never sit in memory. */
async function* restoreScript(manifest) {
  const tables = Object.keys(manifest.tables);
  yield 'begin;\n';
  // Skip triggers and foreign key checks: the export is already consistent,
  // and the stats trigger would otherwise recount every inserted row.
  yield 'set session_replication_role = replica;\n';
  yield `truncate ${[...tables, 'auth.sessions', 'auth.refresh_tokens'].map(qt).join(', ')} cascade;\n`;
  for (const table of tables) {
    const { columns, files } = manifest.tables[table];
    for (const file of files) {
      yield `copy ${qt(table)} (${columns.map(qi).join(', ')}) from stdin with (format csv);\n`;
      for await (const chunk of fs.createReadStream(path.join(DATA_DIR, file), { encoding: 'utf8' })) yield chunk;
      yield '\\.\n';
    }
  }
  yield 'commit;\n';
}

export async function restoreData(manifest) {
  const { Readable } = await import('node:stream');
  await run('docker', PSQL, { input: Readable.from(restoreScript(manifest)), capture: true });
}

// ---------------------------------------------------------------------------
// Fingerprint: detects local changes that were not pushed yet

/** Row count and an order-independent hash of every synced public table and of the login accounts. */
export async function fingerprint() {
  const tables = (await syncedTables()).filter((table) => table.startsWith('public.'));
  const parts = tables.map((table) => `select '${table}', count(*), coalesce(sum(hashtextextended(t::text, 0)), 0) from ${qt(table)} t`);
  // Accounts: only who exists and their password. Other columns change on every login.
  parts.push(`select 'auth.users', count(*), coalesce(sum(hashtextextended(concat_ws('|', id, email, encrypted_password), 0)), 0) from auth.users`);
  const rows = await query(parts.join(' union all '));
  return Object.fromEntries(rows.map(([table, count, hash]) => [table, `${count}:${hash}`]));
}

export const sameFingerprint = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// Local sync state

/** { commit, fingerprint } recorded after the last pull or push on this laptop. */
export function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function writeState(state) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Data repo

export async function ensureDataRepo() {
  if (fs.existsSync(path.join(DATA_REPO_DIR, '.git'))) return;
  step(`Mengunduh repo data (${DATA_REPO_URL})`);
  await run('git', ['clone', DATA_REPO_URL, DATA_REPO_DIR]);
  // Keep CSV bytes identical on Windows (no CRLF conversion).
  await git(['config', 'core.autocrlf', 'false']);
}

/** Latest commit on the remote data branch, or null when the repo is still empty. */
export async function fetchRemoteHead() {
  await git(['fetch', '--quiet', 'origin']);
  const { code, stdout } = await git(['rev-parse', '--verify', '--quiet', `origin/${DATA_BRANCH}`], { capture: true, allowFail: true });
  return code === 0 ? stdout.trim() : null;
}
