// Signs in through the login form, as a person does (client navigation, so the
// sidebar stays mounted from the login page), and prints the sidebar menu.
// Fails when a menu named with --expect is missing or one named with --absent shows.
//
//   node scripts/check-login-menu.mjs <email> <password> [--expect "Akun pengguna"] [--absent "Upload data"]
//   BASE=http://localhost:3000 CHROME=google-chrome-stable (defaults)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [email, password, ...rest] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/check-login-menu.mjs <email> <password> [--expect <menu>] [--absent <menu>]');
  process.exit(2);
}
const expect = [];
const absent = [];
for (let i = 0; i < rest.length; i += 2) (rest[i] === '--absent' ? absent : expect).push(rest[i + 1]);

const base = process.env.BASE ?? 'http://localhost:3000';
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'pcbs-menu-'));
const chrome = spawn(process.env.CHROME ?? 'google-chrome-stable', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finish = (code) => { chrome.kill(); setTimeout(() => { rmSync(profile, { recursive: true, force: true }); process.exit(code); }, 500); };

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
if (!target) { console.error('Chrome did not start.'); finish(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (message) => {
  const data = JSON.parse(message.data);
  if (pending.has(data.id)) { pending.get(data.id)(data.result); pending.delete(data.id); }
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
const waitFor = async (expression, ms) => { for (let t = 0; t < ms; t += 250) { if (await evaluate(expression)) return true; await sleep(250); } return false; };

await send('Page.navigate', { url: `${base}/login` });
if (!(await waitFor(`!!document.querySelector('input[type=password]')`, 60000))) { console.error('The login page did not load.'); finish(1); }
await evaluate(`(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  set(document.querySelector('input[type=email]'), ${JSON.stringify(email)});
  set(document.querySelector('input[type=password]'), ${JSON.stringify(password)});
  document.querySelector('form').requestSubmit();
})()`);
if (!(await waitFor(`location.pathname !== '/login'`, 30000))) { console.error('Still on the login page: wrong password, or the sign-in failed.'); finish(1); }
// The role arrives after the page: give the menu time to settle.
await sleep(5000);

const path = await evaluate('location.pathname');
const menu = (await evaluate(`[...document.querySelectorAll('aside nav a')].map((a) => a.textContent.trim())`)) ?? [];
console.log(`${email} → ${path}`);
console.log(`Menu (${menu.length}): ${menu.join(' | ') || '(none)'}`);
const has = (label) => menu.some((item) => item.startsWith(label));
const missing = expect.filter((label) => !has(label));
const extra = absent.filter(has);
if (missing.length) console.error(`Missing: ${missing.join(', ')}`);
if (extra.length) console.error(`Should not show: ${extra.join(', ')}`);
finish(missing.length || extra.length ? 1 : 0);
