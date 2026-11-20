// Real-browser check: opens the game in headless Chrome/Edge (software GL if no GPU), plays a night for a few seconds,
// samples FPS in real time and saves a screenshot. Usage:
//   node scripts/browser-check.mjs --night 2 --seconds 8 --out docs/proof/phase-2/night2.png [--eval "js"] [--browser path]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const night = arg('night', '1'), seconds = Number(arg('seconds', '8')), out = arg('out', `night${night}.png`), evalJs = arg('eval', '');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [arg('browser'), process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { console.error('no Chrome/Edge found; pass --browser <path>'); process.exit(1); }

const server = spawn(process.execPath, [path.join(root, 'scripts/serve.js'), '8141'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-chrome-'));
const chrome = spawn(browser, ['--headless=new', '--remote-debugging-port=9341', `--user-data-dir=${profile}`, '--window-size=1280,720',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { chrome.kill(); server.kill(); };
process.on('exit', cleanup);

const getJson = (url) => new Promise((res, rej) => http.get(url, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 50; i++) { try { tabs = await getJson('http://127.0.0.1:9341/json'); if (tabs.length) break; } catch { /* retry */ } await sleep(200); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:8141/?night=${night}&debug` });
await sleep(2500);
if (evalJs) await ev(evalJs);
const samples = [];
for (let s = 0; s < seconds; s++) { await sleep(1000); samples.push(await ev('window.__ddl.fps')); }
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
const state = await ev('JSON.stringify({screen: window.__ddl.screen, score: window.__ddl.sim?.score, tick: window.__ddl.sim?.simTick})');
const ok = samples.filter((x) => x > 0);
const avg = ok.reduce((a, b) => a + b, 0) / Math.max(1, ok.length);
console.log(JSON.stringify({ browser: path.basename(browser), night: Number(night), avg_fps: Math.round(avg * 10) / 10, samples: samples.map((x) => Math.round(x)), state: JSON.parse(state), js_errors: errors, screenshot: out }));
cleanup();
process.exit(errors.length ? 1 : 0);
