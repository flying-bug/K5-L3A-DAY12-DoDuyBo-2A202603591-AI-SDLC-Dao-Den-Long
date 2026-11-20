// Ticket-04 tests: leaderboard rules + disk store + export, rebindable keys, benchmark scene, soak CLI, contract v1.3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validName, cleanEntry, sortEntries, topTen, addEntry, loadEntries } from '../src/leaderboard.js';
import { ACTIONS, DEFAULT_KEYS, rebind, findConflict, loadKeys } from '../src/keybinds.js';
import { benchScenario, benchCamera, benchStats } from '../src/bench.js';
import { Sim } from '../src/sim.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl4-'));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'game.contract.json'), 'utf8'));
const entry = (name, score, at = '2026-01-01T10:00:00+07:00', extra = {}) => ({ name, score, nights_won: 1, achieved_at: at, seed: 5, ...extra });

// ---------------- contract ----------------
test('contract v1.3 declares bench_cmd and soak_cmd and keeps every v1.0-v1.2 key', () => {
  assert.equal(contract.contract_version, '1.3');
  assert.match(contract.bench_cmd, /bench\.mjs/);
  assert.match(contract.soak_cmd, /soak\.mjs/);
  for (const k of ['build_cmd', 'run_cmd', 'headless_cmd', 'team']) assert.ok(contract[k], k);
  for (const k of ['fuel_max', 'drain_per_s', 'dash_speed', 'night3_duration_s', 'capacity_max']) assert.ok(k in contract.tuning, k);
});

// ---------------- leaderboard rules ----------------
test('name rule: 3-12 chars of letters, digits, underscore (Vietnamese letters allowed as a bonus)', () => {
  for (const ok of ['Bo_123', 'abc', 'A_B_C_D_E_F1', 'Duy_Bộ', 'Đỗ_Duy_Bộ']) assert.equal(validName(ok), true, ok);
  for (const bad of ['ab', 'a'.repeat(13), 'a b', 'a-b', 'abc!', '', ' abc', 'abc ', '<b>', null, 7]) assert.equal(validName(bad), false, String(bad));
});

test('entry validation: score, nights_won 0-3, ISO 8601 with timezone, integer seed', () => {
  assert.deepEqual(cleanEntry(entry('Bo_123', 100)), entry('Bo_123', 100));
  assert.doesNotThrow(() => cleanEntry(entry('Bo_123', 0, '2026-11-20T10:00:00Z')));
  assert.throws(() => cleanEntry(entry('Bo_123', -1)));
  assert.throws(() => cleanEntry(entry('Bo_123', 1.5)));
  assert.throws(() => cleanEntry(entry('Bo_123', 5, 'yesterday')));
  assert.throws(() => cleanEntry(entry('Bo_123', 5, '2026-01-01T10:00:00'), 'no timezone'));
  assert.throws(() => cleanEntry(entry('Bo_123', 5, undefined, { nights_won: 4 })));
  assert.throws(() => cleanEntry(entry('Bo_123', 5, undefined, { seed: 'x' })));
  assert.throws(() => cleanEntry(entry('x', 5)));
  const clean = cleanEntry({ ...entry('Bo_123', 5), evil: '<script>' });
  assert.equal('evil' in clean, false, 'unknown fields are dropped');
});

test('sorting: score descending; equal score -> whoever achieved it first is on top', () => {
  const list = [entry('late', 50, '2026-03-01T00:00:00Z'), entry('best', 90), entry('early', 50, '2026-02-01T00:00:00Z'), entry('low', 10)];
  assert.deepEqual(sortEntries(list).map((e) => e.name), ['best', 'early', 'late', 'low']);
  // same instant in different timezones: +07:00 is 7 hours earlier than Z at the same wall-clock time
  const tz = [entry('zed', 5, '2026-01-01T10:00:00Z'), entry('vn', 5, '2026-01-01T10:00:00+07:00')];
  assert.deepEqual(sortEntries(tz).map((e) => e.name), ['vn', 'zed']);
  assert.deepEqual(sortEntries([entry('a_a', 5), entry('b_b', 5), entry('c_c', 5)]).map((e) => e.name), ['a_a', 'b_b', 'c_c'], 'full tie keeps insertion order');
});

test('top 10 only; a better late entry pushes the worst out; a worse one does not enter', () => {
  let list = [];
  for (let i = 1; i <= 12; i++) list = addEntry(list, entry(`p${String(i).padStart(2, '0')}`, i * 10, `2026-01-${String(i).padStart(2, '0')}T00:00:00Z`));
  assert.equal(list.length, 10);
  assert.deepEqual([list[0].name, list[9].name], ['p12', 'p03']);
  list = addEntry(list, entry('tiny', 1));
  assert.equal(list.some((e) => e.name === 'tiny'), false);
  list = addEntry(list, entry('champ', 999));
  assert.equal(list[0].name, 'champ');
  assert.equal(list.length, 10);
  assert.equal(topTen(Array.from({ length: 30 }, (_, i) => entry('n' + String(i).padStart(2, '0'), i))).length, 10);
});

test('loader ignores corrupt entries and corrupt files', () => {
  assert.deepEqual(loadEntries('not json'), []);
  assert.deepEqual(loadEntries(null), []);
  assert.deepEqual(loadEntries({ entries: [entry('good_one', 5), { name: 'x' }, 7, null] }).map((e) => e.name), ['good_one']);
  assert.deepEqual(loadEntries([entry('arr_form', 5)]).map((e) => e.name), ['arr_form']);
});

// ---------------- disk store, API and export ----------------
const run = (args, env = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, ...env }, cwd: root });

test('--export-leaderboard writes {"entries":[...]} in the right order from the on-disk file', () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'data-'));
  const list = [entry('mid_one', 50), entry('top_one', 99), entry('tie_late', 50, '2026-05-01T00:00:00Z'), ...Array.from({ length: 10 }, (_, i) => entry('filler' + String(i).padStart(2, '0'), i))];
  fs.writeFileSync(path.join(dir, 'leaderboard.json'), JSON.stringify({ entries: list }));
  const out = path.join(tmp, 'export.json');
  const r = run(['scripts/serve.js', '--export-leaderboard', out], { DDL_DATA_DIR: dir });
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(data), ['entries']);
  assert.equal(data.entries.length, 10);
  assert.deepEqual(data.entries.slice(0, 3).map((e) => e.name), ['top_one', 'mid_one', 'tie_late']);
  for (const e of data.entries) assert.deepEqual(Object.keys(e).sort(), ['achieved_at', 'name', 'nights_won', 'score', 'seed']);
});

test('export of an empty store, and a usage error, behave', () => {
  const out = path.join(tmp, 'empty.json');
  assert.equal(run(['scripts/serve.js', '--export-leaderboard', out], { DDL_DATA_DIR: path.join(tmp, 'nope') }).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { entries: [] });
  assert.equal(run(['scripts/serve.js', '--export-leaderboard'], { DDL_DATA_DIR: tmp }).status, 2);
});

async function withServer(port, dir, fn) {
  const srv = spawn(process.execPath, ['scripts/serve.js', String(port)], { cwd: root, stdio: 'ignore', env: { ...process.env, DDL_DATA_DIR: dir } });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/api/leaderboard`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    await fn(`http://127.0.0.1:${port}`);
  } finally { srv.kill(); await new Promise((r) => setTimeout(r, 200)); }
}

test('server: score is saved on disk, survives a restart, bad input is rejected', async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'api-'));
  await withServer(8191, dir, async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/leaderboard`)).json(), { entries: [] });
    let r = await fetch(`${base}/api/leaderboard`, { method: 'POST', body: JSON.stringify(entry('Bo_123', 420, '2026-11-20T10:00:00+07:00', { nights_won: 3, seed: 77 })) });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/leaderboard`, { method: 'POST', body: JSON.stringify(entry('x', 1)) });
    assert.equal(r.status, 400);
    r = await fetch(`${base}/api/leaderboard`, { method: 'POST', body: '{broken' });
    assert.equal(r.status, 400);
    r = await fetch(`${base}/api/leaderboard`, { method: 'DELETE' });
    assert.equal(r.status, 405);
    const { entries } = await (await fetch(`${base}/api/leaderboard`)).json();
    assert.deepEqual(entries.map((e) => [e.name, e.score, e.nights_won, e.seed]), [['Bo_123', 420, 3, 77]]);
  });
  assert.ok(fs.existsSync(path.join(dir, 'leaderboard.json')), 'file on disk');
  await withServer(8192, dir, async (base) => { // "close and reopen the game"
    const { entries } = await (await fetch(`${base}/api/leaderboard`)).json();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'Bo_123');
  });
  const out = path.join(tmp, 'after-restart.json');
  assert.equal(run(['scripts/serve.js', '--export-leaderboard', out], { DDL_DATA_DIR: dir }).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).entries[0].name, 'Bo_123');
});

// ---------------- rebindable keys ----------------
test('keys: defaults are unique and cover every action; conflicts are detected and reported', () => {
  const codes = ACTIONS.map(([a]) => DEFAULT_KEYS[a]);
  assert.equal(new Set(codes).size, codes.length);
  for (const a of ['up', 'down', 'left', 'right', 'jump', 'dash', 'interact', 'pulse', 'pause']) assert.ok(ACTIONS.some(([x]) => x === a), a);
  assert.equal(findConflict(DEFAULT_KEYS, 'jump', 'KeyW'), 'up');
  assert.equal(findConflict(DEFAULT_KEYS, 'jump', 'Space'), null, 'rebinding to its own key is not a conflict');
  const bad = rebind(DEFAULT_KEYS, 'jump', 'KeyE');
  assert.deepEqual(bad, { ok: false, conflict: 'interact' });
  const good = rebind(DEFAULT_KEYS, 'jump', 'KeyJ');
  assert.equal(good.ok, true);
  assert.equal(good.keys.jump, 'KeyJ');
  assert.equal(DEFAULT_KEYS.jump, 'Space', 'input object is never mutated');
  assert.throws(() => rebind(DEFAULT_KEYS, 'fly', 'KeyJ'));
});

test('keys: saved bindings load, missing ones fall back, duplicates in a saved file are repaired; reset = defaults', () => {
  const saved = loadKeys(JSON.stringify({ jump: 'KeyJ', dash: 'KeyK' }));
  assert.equal(saved.jump, 'KeyJ');
  assert.equal(saved.up, 'KeyW');
  assert.equal(loadKeys('garbage').jump, 'Space');
  const dup = loadKeys({ jump: 'KeyW' }); // KeyW is already "up"
  const vals = Object.values(dup);
  assert.equal(new Set(vals).size, vals.length, 'no duplicates after repair');
  assert.deepEqual(loadKeys(undefined), DEFAULT_KEYS);
});

// ---------------- benchmark scene ----------------
test('bench scene: 200 wandering shades, 100 motes, L1-L3 lit with fuel 100, deterministic from the seed', () => {
  const a = benchScenario(42), b = benchScenario(42), c = benchScenario(43);
  assert.equal(a.shades.length, 200);
  assert.equal(a.motes.length, 100);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.shades[0].pos, c.shades[0].pos);
  assert.ok(a.shades.every((s) => s.state === 'wander' && Math.hypot(s.pos[0], s.pos[2]) <= 38));
  const sim = new Sim({ seed: 42, night: 1, scenario: a, bench: true });
  assert.deepEqual(sim.lanterns.slice(0, 3).map((l) => [l.lit, l.fuel / 60]), [[true, 100], [true, 100], [true, 100]]);
  assert.deepEqual(sim.lanterns.slice(3).map((l) => l.lit), [false, false]);
  assert.deepEqual(sim.player.pos, [0, 0, 0]);
  assert.equal(sim.snapshot().shades.length, 200);
});

test('bench scene rules: no spawns, damage, pickups, fuel burn or night end; shades still move', () => {
  const sc = benchScenario(42);
  const sim = new Sim({ seed: 42, night: 1, scenario: sc, bench: true });
  const before = sim.shades.map((s) => [...s.pos]);
  let events = 0;
  for (let i = 0; i < 3 * 60 * 60; i++) events += sim.step({}).length; // 3 simulated minutes, no input
  assert.equal(sim.state, 'playing');
  assert.equal(events, 0);
  assert.equal(sim.shades.length, 200);
  assert.equal(sim.motes.length, 100);
  assert.equal(sim.player.flames, 3);
  assert.equal(sim.score, 0);
  assert.deepEqual(sim.lanterns.slice(0, 3).map((l) => l.fuel / 60), [100, 100, 100]);
  assert.ok(sim.timeLeft > 0);
  const moved = sim.shades.filter((s, i) => Math.hypot(s.pos[0] - before[i][0], s.pos[2] - before[i][2]) > 1).length;
  assert.ok(moved > 150, `${moved} shades moved`);
  // the normal game does NOT have these shortcuts: same scene without the flag ends or hurts
  const live = new Sim({ seed: 42, night: 1, scenario: sc });
  for (let i = 0; i < 3 * 60 * 60 && live.state === 'playing'; i++) live.step({});
  assert.ok(live.player.flames < 3 || live.state !== 'playing', 'without bench the shades hurt Mây');
});

test('bench camera: circle radius 30, height 15, starts at (30,15,0), anticlockwise, one lap per 15 s', () => {
  const at = (t) => benchCamera(t).pos.map((x) => Math.round(x * 1000) / 1000 + 0);
  assert.deepEqual(at(0), [30, 15, 0]);
  assert.deepEqual(at(3.75), [0, 15, 30]);
  assert.deepEqual(at(7.5), [-30, 15, 0]);
  assert.deepEqual(at(15), [30, 15, 0]);
  assert.deepEqual(benchCamera(4).look, [0, 0, 0]);
  for (const t of [1, 2.2, 9.9]) { const [x, y, z] = benchCamera(t).pos; assert.ok(Math.abs(Math.hypot(x, z) - 30) < 1e-9 && y === 15); }
});

test('bench statistics follow the ticket definitions', () => {
  const s = benchStats([...Array(99).fill(10), 50]); // N = 100
  assert.equal(s.frames, 100);
  assert.equal(s.avg_fps, 96.2); // 1000 * 100 / (990 + 50)
  assert.equal(s.p1_low_fps, 20); // k = ceil(1) = 1 -> 1000 / 50
  assert.equal(s.frame_ms_p95, 10); // nearest rank, the 95th of 100
  const t = benchStats([...Array(198).fill(10), 40, 60]); // N = 200 -> k = 2
  assert.equal(t.p1_low_fps, 20); // 1000 / mean(40, 60)
  assert.equal(benchStats([16.6]).p1_low_fps, 60.2); // k = max(1, ceil(0.01)) = 1
  assert.equal(benchStats([]).frames, 0);
});

// ---------------- soak CLI ----------------
test('soak: runs nights in one process, no crashes, memory within 1.2x, deterministic results', () => {
  const o1 = path.join(tmp, 'soak1.json'), o2 = path.join(tmp, 'soak2.json');
  const args = (o) => contract.soak_cmd.split(' ').slice(1).concat(['--seed', '7', '--nights', '6', '--out', o]);
  const r1 = run(args(o1)), r2 = run(args(o2));
  assert.equal(r1.status, 0, r1.stderr + r1.stdout);
  const a = JSON.parse(fs.readFileSync(o1, 'utf8')), b = JSON.parse(fs.readFileSync(o2, 'utf8'));
  assert.deepEqual(Object.keys(a).sort(), ['crashes', 'duration_s', 'mem_end_mb', 'mem_start_mb', 'nights', 'results']);
  assert.equal(a.nights, 6);
  assert.equal(a.crashes, 0);
  assert.equal(a.results.length, 6);
  assert.ok(a.results.every((x) => x === 'won' || x === 'lost'));
  assert.ok(a.mem_end_mb <= 1.2 * a.mem_start_mb, `${a.mem_start_mb} -> ${a.mem_end_mb}`);
  assert.deepEqual(a.results, b.results, 'same seed, same outcomes');
});

test('soak: bad arguments exit 2', () => {
  assert.equal(run(['scripts/soak.mjs', '--nights', '3']).status, 2);
  assert.equal(run(['scripts/soak.mjs', '--nights', '0', '--out', path.join(tmp, 'x.json')]).status, 2);
});
