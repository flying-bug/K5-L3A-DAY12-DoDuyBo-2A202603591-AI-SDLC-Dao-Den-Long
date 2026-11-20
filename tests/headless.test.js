// Real end-to-end tests: spawn the headless CLI and assert on its JSONL output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-'));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'game.contract.json'), 'utf8'));
const T = contract.tuning;

function write(name, obj) {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
}
function run({ scenario, inputs, ticks = 600, seed = 1, extra = [] }) {
  const out = path.join(tmp, `out-${Math.random().toString(36).slice(2)}.jsonl`);
  const args = [path.join(root, 'src/headless.js'), '--seed', String(seed), '--night', '1', '--ticks', String(ticks), '--out', out, ...extra];
  if (scenario) args.push('--scenario', write('s.json', scenario));
  if (inputs) args.push('--inputs', write('i.json', inputs));
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const lines = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  return { status: r.status, stderr: r.stderr, lines, raw: fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '' };
}
const events = (r, name) => r.lines.filter((l) => l.type === 'event' && l.name === name);
const base = { random_motes: false, random_shades: false, motes: [], shades: [] };

test('contract tuning matches src/config.js', async () => {
  const { TUNING } = await import('../src/config.js');
  assert.deepEqual(TUNING, T);
});

test('tick 0 snapshot, end line, tick counting and time_left', () => {
  const r = run({ scenario: base, ticks: 120 });
  assert.equal(r.status, 0);
  assert.equal(r.lines[0].type, 'snapshot');
  assert.equal(r.lines[0].tick, 0);
  assert.deepEqual(r.lines[0].player.pos, [0, 0, 0]);
  const end = r.lines.at(-1);
  assert.deepEqual(end, { type: 'end', ticks: 120, state: 'playing', score: 0 });
  const snap120 = r.lines.filter((l) => l.type === 'snapshot').at(-1);
  assert.equal(snap120.tick, 120);
  assert.equal(snap120.time_left_s, T.night1_duration_s - 2);
});

test('movement: 1 s at speed along +Z, normalised diagonal, camera yaw', () => {
  let r = run({ scenario: base, ticks: 60, inputs: { frames: [{ tick: 0, move: [0, 1] }] } });
  assert.deepEqual(r.lines.at(-2).player.pos, [0, 0, T.player_speed]);
  r = run({ scenario: base, ticks: 60, inputs: { frames: [{ tick: 0, move: [1, 1] }] } });
  const [x, , z] = r.lines.at(-2).player.pos;
  assert.ok(Math.abs(x - T.player_speed / Math.SQRT2) < 0.002 && Math.abs(z - x) < 1e-9);
  r = run({ scenario: base, ticks: 60, inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] } });
  const p = r.lines.at(-2).player.pos; // theta=90: x' = z, z' = 0
  assert.ok(Math.abs(p[0] - T.player_speed) < 0.002 && Math.abs(p[2]) < 0.002);
});

test('pickup + deposit + light lantern + win with score', () => {
  const sc = { ...base, motes: [[0, 0, 0.2], [0, 0, 0.4], [0, 0, 0.6], [0, 0, 0.8], [0, 0, 1]], lanterns: [{ id: 'L1', pos: [0, 0, 2] }, { id: 'L2', lit: true }, { id: 'L3', lit: true }, { id: 'L4', lit: true }, { id: 'L5', lit: true }], time_left_s: 100 };
  const r = run({ scenario: sc, ticks: 300, inputs: { frames: [{ tick: 5, interact: true }, { tick: 6, interact: false }] } });
  assert.equal(events(r, 'mote_picked').length, 5);
  assert.deepEqual(events(r, 'deposit')[0].data, { lantern_id: 'L1', amount: 5, deposited: 5 });
  assert.equal(events(r, 'lantern_lit').length, 1, 'pre-lit lanterns must not emit events');
  assert.deepEqual(events(r, 'game_over')[0].data, { result: 'won', reason: 'all_lit' });
  const end = r.lines.at(-1);
  assert.equal(end.state, 'won');
  const lastSnap = r.lines.filter((l) => l.type === 'snapshot').at(-1);
  // 5 motes*10 + 100 lantern + floor(time left) + 3 flames*50
  assert.equal(end.score, 50 + 100 + Math.floor(lastSnap.time_left_s) + 150);
});

test('scenario setup gives no score/events (lit lantern)', () => {
  const r = run({ scenario: { ...base, lanterns: [{ id: 'L1', lit: true }] }, ticks: 10 });
  assert.equal(r.lines[0].score, 0);
  assert.equal(events(r, 'lantern_lit').length, 0);
});

test('shade hit: lose a flame, drop motes, invulnerability, then lost/no_flames', () => {
  const sc = { ...base, player: { pos: [0, 0, 0], carried: 4, flames: 2 }, shades: [{ id: 'S1', pos: [3, 0, 0] }] };
  const r = run({ scenario: sc, ticks: 600 });
  const hits = events(r, 'player_hit');
  assert.deepEqual(hits[0].data, { by: 'shade', flames: 1, dropped: Math.floor(4 * T.hit_drop_ratio) });
  assert.ok(hits[1].tick - hits[0].tick >= Math.round(T.invuln_s * 60));
  assert.deepEqual(events(r, 'game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r.lines.at(-1).state, 'lost');
});

test('pulse stuns shade in radius, costs motes, pushes away', () => {
  const sc = { ...base, player: { pos: [0, 0, 0], carried: 3, flames: 3 }, shades: [{ id: 'S1', pos: [5, 0, 0] }, { id: 'S2', pos: [20, 0, 0] }] };
  const r = run({ scenario: sc, ticks: 2, inputs: { frames: [{ tick: 0, pulse: true }] }, extra: ['--snapshot-every', '1'] });
  assert.deepEqual(events(r, 'pulse')[0].data, { stunned_ids: ['S1'] });
  assert.equal(events(r, 'pulse')[0].tick, 1);
  const s1 = r.lines.filter((l) => l.type === 'snapshot' && l.tick === 1)[0];
  assert.equal(s1.player.carried, 3 - T.pulse_cost);
  assert.equal(s1.shades.find((s) => s.id === 'S1').state, 'stunned');
  assert.ok(Math.abs(s1.shades.find((s) => s.id === 'S1').pos[0] - (5 + T.pulse_push_m)) < 0.001);
  assert.equal(s1.score, T.score.per_stun);
});

test('safe radius: shade cannot enter lit lantern zone', () => {
  const sc = { ...base, player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ pos: [20, 0, 25] }], time_left_s: 60 };
  const r = run({ scenario: sc, ticks: 900 });
  assert.equal(events(r, 'player_hit').length, 0);
  for (const s of r.lines.filter((l) => l.type === 'snapshot')) {
    const d = Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2] - 25);
    assert.ok(d >= T.safe_radius - 0.01);
  }
});

test('time runs out -> lost/dawn', () => {
  const r = run({ scenario: { ...base, time_left_s: 2 }, ticks: 1000 });
  assert.deepEqual(events(r, 'game_over')[0].data, { result: 'lost', reason: 'dawn' });
  assert.equal(r.lines.at(-1).ticks, 120);
});

test('determinism with random motes/shades, same seed twice; different seed differs', () => {
  const a = run({ ticks: 1500, seed: 42, inputs: { frames: [{ tick: 0, move: [1, 0.3] }] } });
  const b = run({ ticks: 1500, seed: 42, inputs: { frames: [{ tick: 0, move: [1, 0.3] }] } });
  const c = run({ ticks: 1500, seed: 43, inputs: { frames: [{ tick: 0, move: [1, 0.3] }] } });
  assert.equal(a.raw, b.raw);
  assert.notEqual(a.raw, c.raw);
  assert.ok(events(a, 'shade_spawned').length >= 1);
});

test('bad inputs/scenario -> exit code 2', () => {
  assert.equal(run({ inputs: '{nope' }).status, 2);
  assert.equal(run({ inputs: { frames: [{ tick: 3 }, { tick: 3 }] } }).status, 2);
  assert.equal(run({ inputs: { frames: [{ tick: 0, move: [2, 0] }] } }).status, 2);
  assert.equal(run({ scenario: { shades: 'x' } }).status, 2);
  assert.equal(run({ scenario: '[1,' }).status, 2);
});

test('jump leaves and returns to ground (y=0)', () => {
  const r = run({ scenario: base, ticks: 60, inputs: { frames: [{ tick: 0, jump: true }, { tick: 1, jump: false }] }, extra: ['--snapshot-every', '1'] });
  const ys = r.lines.filter((l) => l.type === 'snapshot').map((s) => s.player.pos[1]);
  assert.ok(Math.max(...ys) > 0.5);
  assert.equal(ys.at(-1), 0);
});
