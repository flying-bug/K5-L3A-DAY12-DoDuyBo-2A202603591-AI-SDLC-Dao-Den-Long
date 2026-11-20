// Benchmark (Ticket-04):  node scripts/bench.mjs --seed 42 --duration 30 --out bench.json [--headless] [--browser <path>]
// Opens the game in a real Chrome/Edge window of 1280x720 (not fullscreen), vsync/frame cap disabled by flags, loads the
// benchmark scene (/?bench=1), waits for the page to measure 3 s warm-up + <duration> s, then writes bench.json and exits 0.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const processStart = Date.now();
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const seed = Number(arg('seed', 42)), duration = Number(arg('duration', 30)), out = arg('out');
const headless = process.argv.includes('--headless');
if (!Number.isFinite(seed) || !(duration > 0) || !out) { process.stderr.write('usage: bench.mjs --seed <int> --duration <s> --out <file> [--headless] [--browser <path>]\n'); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [arg('browser'), process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { process.stderr.write('error: no Chrome/Edge/Chromium found; pass --browser <path> or set CHROME\n'); process.exit(1); }

const PORT = 8143, DEBUG = 9343;
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.js'), String(PORT)], { stdio: 'ignore', env: { ...process.env, DDL_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-bench-data-')) } });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-bench-chrome-'));
const flags = ['--remote-debugging-port=' + DEBUG, `--user-data-dir=${profile}`, '--window-size=1280,800', '--window-position=0,0',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
if (headless) flags.unshift('--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
const chrome = spawn(browser, [...flags, 'about:blank'], { stdio: 'ignore' });
let done = false;
const cleanup = () => { if (done) return; done = true; try { chrome.kill(); } catch { /* gone */ } try { server.kill(); } catch { /* gone */ } };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

const getJson = (url) => new Promise((res, rej) => http.get(url, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 100; i++) { try { tabs = await getJson(`http://127.0.0.1:${DEBUG}/json`); if (tabs.length) break; } catch { /* retry */ } await sleep(200); }
if (!tabs?.length) { process.stderr.write('error: could not reach the browser\n'); process.exit(1); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const extra = arg('query', ''); // optional experiment switches, e.g. --query noshadow=1
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?bench=1&seed=${seed}&duration=${duration}${extra ? '&' + extra : ''}` });

// poll until the page reports a result (warm-up 3 s + duration + load)
const deadline = Date.now() + (duration + 3 + 60) * 1000;
let page = null;
while (Date.now() < deadline) {
  page = await ev('window.__bench ? JSON.stringify(window.__bench) : null');
  if (page) break;
  await sleep(500);
}
if (!page) { process.stderr.write('error: benchmark did not finish in time\n'); process.exit(1); }
const r = JSON.parse(page);
if (errors.length) { process.stderr.write(`page errors:\n${errors.join('\n')}\n`); }
const version = await getJson(`http://127.0.0.1:${DEBUG}/json/version`).catch(() => ({}));

const result = {
  contract_version: '1.3',
  avg_fps: r.avg_fps,
  p1_low_fps: r.p1_low_fps,
  frame_ms_p95: r.frame_ms_p95,
  frames: r.frames,
  load_ms: Math.max(0, Math.round(r.first_frame_epoch_ms - processStart)),
  peak_mem_mb: null, // web build: the browser's RSS is not exposed to the page (js_heap_peak_mb below is a different measure)
  vsync_off: !!r.vsync_off,
  renderer: `three.js ${r.three_revision} (WebGL2) on ${r.gpu} in ${version.Browser || 'Chromium'}${headless ? ' (headless, software GL)' : ''}`,
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  js_heap_peak_mb: r.js_heap_peak_mb,
  cpu_ms_p99: r.cpu_ms_p99,
  draw: r.draw,
  notes: 'peak_mem_mb is null: this is a web build and the page cannot read the browser process RSS. vsync_off is true only if flags were applied and frames shorter than 16.6 ms were observed.',
};
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
cleanup();
process.exit(0);
