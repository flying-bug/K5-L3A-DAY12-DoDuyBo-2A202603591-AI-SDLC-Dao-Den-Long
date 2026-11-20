// Zero-dependency game server + local leaderboard store.
//   node scripts/serve.js [port]                       start the game (http://localhost:8080)
//   node scripts/serve.js --export-leaderboard out.json  write {"entries":[...]} (top 10, best first) and exit
// The leaderboard lives on disk in <data dir>/leaderboard.json (default ./data, override with DDL_DATA_DIR) so it survives restarts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, loadEntries } from '../src/leaderboard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DDL_DATA_DIR ? path.resolve(process.env.DDL_DATA_DIR) : path.join(root, 'data');
const lbFile = path.join(dataDir, 'leaderboard.json');

const readBoard = () => { try { return loadEntries(fs.readFileSync(lbFile, 'utf8')); } catch { return []; } };
function writeBoard(entries) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${lbFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2));
  fs.renameSync(tmp, lbFile); // atomic replace: a crash never leaves a half-written file
}

const argv = process.argv.slice(2);
const exportAt = argv.indexOf('--export-leaderboard');
if (exportAt >= 0) {
  const out = argv[exportAt + 1];
  if (!out) { process.stderr.write('error: --export-leaderboard needs a file path\n'); process.exit(2); }
  try { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ entries: readBoard() }, null, 2)); } catch (e) { process.stderr.write(`error: ${e.message}\n`); process.exit(1); }
  process.exit(0);
}

const portArg = argv.find((a) => /^\d+$/.test(a));
const port = Number(portArg || process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const allowed = ['/web/', '/src/', '/node_modules/three/build/'];

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/leaderboard') {
    if (req.method === 'GET') return json(res, 200, { entries: readBoard() });
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try { const entries = addEntry(readBoard(), JSON.parse(body)); writeBoard(entries); json(res, 200, { entries }); }
        catch (e) { json(res, 400, { error: e.message }); }
      });
      return undefined;
    }
    return json(res, 405, { error: 'method not allowed' });
  }
  const p = url === '/' ? '/web/index.html' : url;
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root) || !allowed.some((a) => p.startsWith(a))) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, host, () => console.log(`Dao Den Long: http://localhost:${port}  (leaderboard: ${lbFile})`));
