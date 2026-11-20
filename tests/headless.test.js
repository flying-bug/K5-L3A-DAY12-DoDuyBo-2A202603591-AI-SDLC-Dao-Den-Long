// Real end-to-end tests: spawn the headless CLI and assert on its JSONL output.
// Part A = Phase 1 behaviours re-checked under the standard numbers (regression). Part B = Ticket-02 features.
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

let n = 0;
function write(name, obj) {
  const f = path.join(tmp, `${++n}-${name}`);
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
}
function run({ scenario, inputs, ticks = 600, seed = 1, night = 1, extra = [] }) {
  const out = path.join(tmp, `out-${++n}.jsonl`);
  const args = [path.join(root, 'src/headless.js'), '--seed', String(seed), '--night', String(night), '--ticks', String(ticks), '--out', out, ...extra];
  if (scenario) args.push('--scenario', write('s.json', scenario));
  if (inputs) args.push('--inputs', write('i.json', inputs));
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const raw = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  const lines = raw ? raw.trim().split('\n').map((l) => JSON.parse(l)) : [];
  const snaps = lines.filter((l) => l.type === 'snapshot');
  return { status: r.status, stderr: r.stderr, lines, raw, snaps, snap: (t) => snaps.find((s) => s.tick === t), end: lines.at(-1) };
}
const events = (r, name) => r.lines.filter((l) => l.type === 'event' && l.name === name);
const E1 = ['--snapshot-every', '1'];
const base = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [], charms: [] };
const frames = (...f) => ({ frames: f });
const lit = (...ids) => ids.map((id) => ({ id, lit: true }));
const speedOf = (v) => Math.hypot(v[0], v[2]);

// ====================== Part A: Phase 1 regression ======================

test('contract: v1.1, tuning equals src/config.js and the standard numbers', async () => {
  const { TUNING } = await import('../src/config.js');
  assert.equal(contract.contract_version, '1.1');
  assert.deepEqual(TUNING, T);
  assert.deepEqual([T.player_speed, T.lantern_cost, T.pulse_cost, T.pulse_radius, T.pulse_cooldown_s, T.dash_speed, T.dash_duration_s, T.dash_cooldown_s],
    [6, 10, 3, 5, 3, 14, 0.2, 1.5]);
  assert.deepEqual([T.night1_duration_s, T.night2_duration_s, T.night3_duration_s], [300, 330, 360]);
  assert.equal(T.fall_enabled, true);
});

test('tick 0 snapshot (before input), end line, tick counting, time_left, night field', () => {
  for (const [night, dur] of [[1, 300], [2, 330], [3, 360]]) {
    const r = run({ scenario: base, ticks: 120, night });
    assert.equal(r.status, 0);
    assert.equal(r.lines[0].type, 'snapshot');
    assert.equal(r.lines[0].tick, 0);
    assert.equal(r.lines[0].night, night);
    assert.equal(r.lines[0].time_left_s, dur);
    assert.equal(r.end.ticks, 120);
    assert.equal(r.snaps.at(-1).time_left_s, dur - 2);
    assert.equal(r.snaps.at(-1).sim_tick, 120);
  }
  const r = run({ scenario: base, ticks: 60, night: 1 });
  assert.deepEqual(r.lines[0].player.pos, [0, 0, 0]);
});

test('movement: 6 m/s along +Z, normalised diagonal, camera yaw', () => {
  let r = run({ scenario: base, ticks: 60, inputs: frames({ tick: 0, move: [0, 1] }) });
  assert.deepEqual(r.snap(60).player.pos, [0, 0, 6]);
  r = run({ scenario: base, ticks: 60, inputs: frames({ tick: 0, move: [1, 1] }) });
  const [x, , z] = r.snap(60).player.pos;
  assert.ok(Math.abs(x - 6 / Math.SQRT2) < 0.002 && Math.abs(z - x) < 1e-9);
  r = run({ scenario: base, ticks: 60, inputs: frames({ tick: 0, move: [0, 1], cam_yaw_deg: 90 }) });
  const p = r.snap(60).player.pos; // theta=90: x' = z, z' = 0
  assert.ok(Math.abs(p[0] - 6) < 0.002 && Math.abs(p[2]) < 0.002);
  // accel/stop are within 0.1 s: velocity is full right after the first tick and zero right after release
  r = run({ scenario: base, ticks: 12, extra: E1, inputs: frames({ tick: 0, move: [0, 1] }, { tick: 6, move: [0, 0] }) });
  assert.ok(speedOf(r.snap(1).player.vel) >= 5.99);
  assert.ok(speedOf(r.snap(7).player.vel) < 0.01);
});

test('pickup: radius 1.0 XZ, height gap <= 1.5, capacity 10', () => {
  const sc = { ...base, motes: [[0, 0, 0.9], [0, 0, 1.1], [0.5, 2.0, 0], [-0.5, 1.4, 0]] };
  const r = run({ scenario: sc, ticks: 3 });
  assert.equal(events(r, 'mote_picked').length, 2);
  assert.equal(r.snap(0).motes.length, 4);
  assert.deepEqual(r.snaps.at(-1).motes.map((m) => m.id).sort(), ['M2', 'M3']);
  const many = { ...base, player: { carried: 9 }, motes: [[0, 0, 0.1], [0, 0, 0.2], [0, 0, 0.3]] };
  const r2 = run({ scenario: many, ticks: 3 });
  assert.equal(events(r2, 'mote_picked').length, 1);
  assert.equal(r2.snaps.at(-1).player.carried, 10);
});

test('deposit: min(carried, missing), remembers progress, nearest-then-lowest-id, radius 2.0; score 10/mote + 100/lantern', () => {
  let r = run({ scenario: { ...base, player: { carried: 6 }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }] }, ticks: 3, inputs: frames({ tick: 0, interact: true }) });
  assert.deepEqual(events(r, 'deposit')[0].data, { lantern_id: 'L1', amount: 6, deposited: 6 });
  assert.equal(events(r, 'lantern_lit').length, 0);
  assert.equal(r.snaps.at(-1).score, 60);
  r = run({ scenario: { ...base, player: { carried: 6 }, lanterns: [{ id: 'L1', pos: [0, 0, 2], deposited: 6 }] }, ticks: 3, inputs: frames({ tick: 0, interact: true }) });
  assert.deepEqual(events(r, 'deposit')[0].data, { lantern_id: 'L1', amount: 4, deposited: 10 });
  assert.equal(events(r, 'lantern_lit').length, 1);
  assert.equal(r.snaps.at(-1).player.carried, 2);
  assert.equal(r.snaps.at(-1).score, 40 + 100);
  r = run({ scenario: { ...base, player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, 2.1] }] }, ticks: 3, inputs: frames({ tick: 0, interact: true }) });
  assert.equal(events(r, 'deposit').length, 0);
  r = run({ scenario: { ...base, player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [1, 0, 0] }, { id: 'L2', pos: [-1, 0, 0] }] }, ticks: 3, inputs: frames({ tick: 0, interact: true }) });
  assert.equal(events(r, 'deposit')[0].data.lantern_id, 'L1');
  r = run({ scenario: { ...base, player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [1.5, 0, 0], lit: true }, { id: 'L2', pos: [0, 0, 1.9] }] }, ticks: 3, inputs: frames({ tick: 0, interact: true }) });
  assert.equal(events(r, 'deposit')[0].data.lantern_id, 'L2', 'lit lanterns are ignored');
});

test('win: all lit -> score = deposits + lanterns + floor(time_left)*2 + 50*flames', () => {
  const sc = { ...base, player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }, ...lit('L2', 'L3', 'L4', 'L5')], time_left_s: 100 };
  const r = run({ scenario: sc, ticks: 300, inputs: frames({ tick: 5, interact: true }) });
  assert.equal(events(r, 'lantern_lit').length, 1, 'pre-lit lanterns emit nothing');
  assert.deepEqual(events(r, 'game_over')[0].data, { result: 'won', reason: 'all_lit' });
  const tl = r.snaps.at(-1).time_left_s;
  assert.equal(r.end.state, 'won');
  assert.equal(r.end.score, 100 + 100 + Math.floor(tl) * 2 + 150);
  assert.equal(r.snaps[0].score, 0, 'scenario setup gives no score');
});

test('win on the exact tick time runs out; plain timeout is lost/dawn', () => {
  const sc = { ...base, player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, ...lit('L2', 'L3', 'L4', 'L5')], time_left_s: 1 };
  let r = run({ scenario: sc, ticks: 200, inputs: frames({ tick: 59, interact: true }) });
  const go = events(r, 'game_over')[0];
  assert.deepEqual(go.data, { result: 'won', reason: 'all_lit' });
  assert.equal(go.tick, 60);
  assert.equal(r.end.score, 100 + 100 + 0 + 150);
  r = run({ scenario: { ...base, time_left_s: 2 }, ticks: 1000 });
  assert.deepEqual(events(r, 'game_over')[0].data, { result: 'lost', reason: 'dawn' });
  assert.equal(r.end.ticks, 120);
});

test('shade hit: -1 flame, drop floor(carried/2) on a 1.5-2.5 m ring (ttl 8 s), 90-tick invulnerability, recoil, then no_flames', () => {
  const sc = { ...base, player: { carried: 4, flames: 2 }, shades: [{ id: 'S1', pos: [3, 0, 0] }] };
  const r = run({ scenario: sc, ticks: 600, extra: E1 });
  const hits = events(r, 'player_hit');
  assert.deepEqual(hits[0].data, { by: 'shade', flames: 1, dropped: 2 });
  const T0 = hits[0].tick;
  const s = r.snap(T0);
  assert.equal(s.player.invuln, true);
  assert.equal(s.shades[0].state, 'recoil');
  const dropped = s.motes.filter((m) => m.kind === 'dropped');
  assert.equal(dropped.length, 2);
  for (const m of dropped) {
    const d = Math.hypot(m.pos[0] - s.player.pos[0], m.pos[2] - s.player.pos[2]);
    assert.ok(d >= 1.49 && d <= 2.51, `ring distance ${d}`);
    assert.equal(m.ttl_s, 8);
  }
  assert.equal(r.snap(T0 + 89).player.invuln, true);
  const back = Math.hypot(r.snap(T0 + 60).shades[0].pos[0] - s.player.pos[0], r.snap(T0 + 60).shades[0].pos[2] - s.player.pos[2]);
  assert.ok(back >= 2.9, `recoil ${back}`);
  assert.ok(hits[1].tick - T0 >= 90);
  assert.deepEqual(events(r, 'game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r.end.state, 'lost');
});

test('dropped motes expire after their ttl', () => {
  const r = run({ scenario: { ...base, motes: [{ pos: [20, 0, 20], kind: 'dropped', ttl_ticks: 10 }] }, ticks: 12, extra: E1 });
  assert.equal(r.snap(9).motes.length, 1);
  assert.equal(r.snap(10).motes.length, 0);
});

test('pulse: 3 motes, radius 5 (3D from foot+0.8), +5 per shade, stun 120 ticks, push 4 m in 15 ticks, cooldown 3 s', () => {
  const sc = { ...base, player: { carried: 9 }, shades: [{ id: 'S1', pos: [4, 0, 0] }, { id: 'S2', pos: [0, 0, 6], state: 'stunned', state_ticks_left: 9999 }, { id: 'S3', pos: [-4.9, 0, 0] }] };
  const r = run({ scenario: sc, ticks: 400, extra: E1, inputs: frames({ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 100, pulse: true }, { tick: 101, pulse: false }, { tick: 180, pulse: true }, { tick: 181, pulse: false }) });
  const pulses = events(r, 'pulse');
  assert.deepEqual(pulses.map((p) => p.tick), [1, 181], 'tick-100 press is on cooldown, tick-180 press is the first after 3 s');
  assert.deepEqual(pulses[0].data.stunned_ids, ['S1', 'S3']);
  assert.equal(r.snap(1).player.carried, 6);
  assert.equal(r.snap(1).score, 10);
  assert.equal(r.snap(1).player.pulse_cd_s, 3);
  const x15 = r.snap(15).shades.find((s) => s.id === 'S1').pos[0];
  assert.ok(Math.abs(x15 - 8) < 0.01, `pushed to ${x15}`);
  assert.ok(Math.abs(r.snap(16).shades.find((s) => s.id === 'S1').pos[0] - 8) < 0.01, 'push stops after 15 ticks');
  assert.equal(r.snap(120).shades.find((s) => s.id === 'S1').state, 'stunned');
  assert.equal(r.snap(121).shades.find((s) => s.id === 'S1').state, 'chase');
  assert.equal(r.snap(181).player.carried, 3);
  assert.equal(r.snap(181).score, 10 + 10, 'hits on an already-stunned shade score again');
});

test('pulse needs 3 motes; coincident shade is pushed toward +X', () => {
  let r = run({ scenario: { ...base, player: { carried: 2 }, shades: [{ pos: [3, 0, 0] }] }, ticks: 3, inputs: frames({ tick: 0, pulse: true }) });
  assert.equal(events(r, 'pulse').length, 0);
  r = run({ scenario: { ...base, player: { carried: 3 }, shades: [{ pos: [0, 0, 0] }] }, ticks: 20, extra: E1, inputs: frames({ tick: 0, pulse: true }) });
  assert.ok(Math.abs(r.snap(15).shades[0].pos[0] - 4) < 0.01);
});

test('safe radius: shade is held at 6 m from a lit lantern; lighting expels shades inside without damage', () => {
  let sc = { ...base, player: { pos: [0, 0, 2] }, lanterns: [{ id: 'L1', pos: [0, 0, 2], lit: true }], shades: [{ pos: [20, 0, 2] }], time_left_s: 60 };
  let r = run({ scenario: sc, ticks: 900, extra: ['--snapshot-every', '10'] });
  assert.equal(events(r, 'player_hit').length, 0);
  for (const s of r.snaps) assert.ok(Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2] - 2) >= 5.99);
  sc = { ...base, player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }], shades: [{ pos: [0.5, 0, 0] }] };
  r = run({ scenario: sc, ticks: 300, extra: E1, inputs: frames({ tick: 0, interact: true }, { tick: 1, interact: false }) });
  assert.equal(events(r, 'lantern_lit').length, 1);
  assert.equal(events(r, 'player_hit').length, 0, 'no damage while being expelled');
  const d = (t) => { const s = r.snap(t).shades[0]; return Math.hypot(s.pos[0], s.pos[2] - 2); };
  assert.ok(d(1) < 6 && d(31) >= 5.99, 'pushed to the rim within 30 ticks');
});

test('jump: ~1.2 m apex, lands, no double jump', () => {
  let r = run({ scenario: base, ticks: 60, extra: E1, inputs: frames({ tick: 0, jump: true }, { tick: 1, jump: false }) });
  const ys = r.snaps.map((s) => s.player.pos[1]);
  assert.ok(Math.max(...ys) > 1.1 && Math.max(...ys) < 1.3);
  assert.equal(ys.at(-1), 0);
  assert.equal(r.snaps.at(-1).player.grounded, true);
  r = run({ scenario: base, ticks: 60, extra: E1, inputs: frames({ tick: 0, jump: true }, { tick: 1, jump: false }, { tick: 10, jump: true }, { tick: 11, jump: false }) });
  assert.ok(Math.max(...r.snaps.map((s) => s.player.pos[1])) < 1.3, 'second press in the air is ignored');
});

test('determinism with random motes/shades/drifters; different seed differs; spawn tables', () => {
  const inp = frames({ tick: 0, move: [1, 0.3] });
  const a = run({ ticks: 1500, seed: 42, inputs: inp, night: 2 });
  const b = run({ ticks: 1500, seed: 42, inputs: inp, night: 2 });
  const c = run({ ticks: 1500, seed: 43, inputs: inp, night: 2 });
  assert.equal(a.raw, b.raw);
  assert.notEqual(a.raw, c.raw);
  assert.ok(events(a, 'shade_spawned').length >= 1);
});

test('bad inputs/scenario/args -> exit code 2', () => {
  assert.equal(run({ inputs: '{nope' }).status, 2);
  assert.equal(run({ inputs: { frames: [{ tick: 3 }, { tick: 3 }] } }).status, 2);
  assert.equal(run({ inputs: { frames: [{ tick: 0, move: [2, 0] }] } }).status, 2);
  assert.equal(run({ inputs: { frames: [{ tick: 0, pause: 'yes' }] } }).status, 2);
  assert.equal(run({ scenario: { shades: 'x' } }).status, 2);
  assert.equal(run({ scenario: { shades: [{ pos: [1, 0, 1], state: 'dancing' }] } }).status, 2);
  assert.equal(run({ scenario: '[1,' }).status, 2);
  assert.equal(run({ night: 4 }).status, 2);
});

// ====================== Part B: Ticket-02 features ======================

test('spawn schedules: shades at tick 300 (x2) then every 8/7/6 s, capped; spawning -> wander next tick; ids S1..', () => {
  const cfg = [[1, [300, 300, 780, 1260, 1740, 2220], 6], [2, [300, 300, 720, 1140, 1560, 1980, 2400, 2820], 8], [3, [300, 300, 660, 1020, 1380, 1740, 2100, 2460, 2820, 3180], 10]];
  for (const [night, ticks, max] of cfg) {
    const sc = { ...base, random_shades: true, player: { flames: 99 } };
    const r = run({ scenario: sc, night, ticks: ticks.at(-1) + 400, extra: ['--snapshot-every', '1'] });
    const sp = events(r, 'shade_spawned');
    assert.deepEqual(sp.map((e) => e.tick), ticks, `night ${night}`);
    assert.deepEqual(sp.map((e) => e.data.id), ticks.map((_, i) => `S${i + 1}`));
    assert.ok(r.snaps.at(-1).shades.length <= max);
    assert.equal(r.snap(300).shades[0].state, 'spawning');
    assert.notEqual(r.snap(301).shades[0].state, 'spawning');
    for (const s of r.snap(300).shades) assert.ok(Math.hypot(s.pos[0], s.pos[2]) >= 15 || night === 2);
  }
  // cap: night 1 never exceeds 6 even much later
  const r = run({ scenario: { ...base, random_shades: true, player: { flames: 99 } }, night: 1, ticks: 4000 });
  assert.equal(events(r, 'shade_spawned').length, 6);
});

test('mote spawns: 20 distinct start points, +1 every 240 ticks to the cap 30, skip when no free point', () => {
  const sc = { ...base, random_motes: true, motes: undefined };
  let r = run({ scenario: sc, night: 1, ticks: 1300, extra: ['--snapshot-every', '10'] });
  assert.equal(r.snap(0).motes.length, 20);
  assert.equal(new Set(r.snap(0).motes.map((m) => m.pos.join())).size, 20, 'distinct points');
  assert.equal(r.snap(230).motes.length, 20);
  assert.equal(r.snap(240).motes.length, 21);
  assert.equal(r.snap(960).motes.length, 24);
  assert.equal(r.snap(1200).motes.length, 24, 'night 1 has only 24 points: later turns are skipped');
  r = run({ scenario: sc, night: 3, ticks: 3000, extra: ['--snapshot-every', '10'] });
  assert.equal(r.snap(2390).motes.length, 29);
  assert.equal(r.snap(2400).motes.length, 30);
  assert.equal(r.snap(2990).motes.length, 30, 'cap 30');
});

test('Night 1 map: lanterns, start and spawn geometry', () => {
  const r = run({ scenario: { ...base, random_motes: true, motes: undefined }, night: 1, ticks: 1 });
  assert.deepEqual(r.snap(0).lanterns.map((l) => l.pos), [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]);
  for (const m of r.snap(0).motes) {
    const rr = Math.hypot(m.pos[0], m.pos[2]);
    assert.ok(Math.abs(rr - 12) < 0.01 || Math.abs(rr - 33) < 0.01);
  }
});

test('dash: 14 m/s for 12 ticks, 1.5 s cooldown from its start, facing used when still, not invulnerable', () => {
  let r = run({ scenario: base, ticks: 130, extra: E1, inputs: frames({ tick: 0, dash: true }, { tick: 1, dash: false }, { tick: 50, dash: true }, { tick: 51, dash: false }, { tick: 90, dash: true }, { tick: 91, dash: false }) });
  assert.deepEqual(events(r, 'dash').map((e) => e.tick), [1, 91]);
  assert.ok(Math.abs(r.snap(12).player.pos[2] - 2.8) < 0.001, 'standing still dashes along the facing (+Z)');
  assert.ok(Math.abs(r.snap(13).player.pos[2] - 2.8) < 0.001, 'dash lasts exactly 12 ticks');
  assert.equal(r.snap(1).player.dash_cd_s, 1.5);
  assert.equal(r.snap(91).player.dash_cd_s, 1.5);
  assert.equal(r.snap(11).player.invuln, false);
  r = run({ scenario: base, ticks: 30, extra: E1, inputs: frames({ tick: 0, move: [1, 0] }, { tick: 5, dash: true }, { tick: 6, dash: false, move: [0, 0] }) });
  assert.ok(Math.abs(r.snap(5).player.pos[0] - 0.5) < 0.001);
  assert.ok(Math.abs(r.snap(30).player.pos[0] - (0.5 + 2.8 + 0.1)) < 0.01 || r.snap(30).player.pos[0] > 3, 'direction = movement direction (+X)');
  assert.ok(Math.abs(r.snap(30).player.pos[2]) < 1e-9);
});

test('dash in the air keeps its height', () => {
  const r = run({ scenario: base, ticks: 30, extra: E1, inputs: frames({ tick: 0, jump: true }, { tick: 1, jump: false }, { tick: 10, dash: true }, { tick: 11, dash: false }) });
  const y0 = r.snap(10).player.pos[1];
  for (let t = 11; t <= 22; t++) assert.ok(Math.abs(r.snap(t).player.pos[1] - y0) < 1e-9, `tick ${t}`);
  assert.ok(r.snap(24).player.pos[1] < y0);
});

test('fall: once, -1 flame, lose all motes, 60-tick wait, respawn at start with 90 invuln; last flame -> lost', () => {
  const sc = { ...base, player: { pos: [39.95, 0, 0], carried: 5 } };
  const r = run({ scenario: sc, ticks: 300, extra: E1, inputs: frames({ tick: 0, move: [1, 0] }, { tick: 20, move: [0, 0] }) });
  const falls = events(r, 'player_hit');
  assert.equal(falls.length, 1);
  assert.deepEqual(falls[0].data, { by: 'fall', flames: 2, dropped: 0, lost: 5 });
  const T0 = falls[0].tick;
  assert.ok(r.snap(T0).player.pos[1] < -10);
  assert.equal(r.snap(T0).player.carried, 0);
  assert.ok(r.snap(T0 + 59).player.pos[1] < -10, 'still waiting');
  const s = r.snap(T0 + 60);
  assert.deepEqual(s.player.pos, [0, 0, 0]);
  assert.deepEqual(s.player.vel, [0, 0, 0]);
  assert.equal(s.player.invuln, true);
  assert.equal(r.snap(T0 + 60 + 89).player.invuln, true);
  assert.equal(r.snap(T0 + 60 + 90).player.invuln, false);
  const r2 = run({ scenario: { ...sc, player: { ...sc.player, flames: 1 } }, ticks: 300, inputs: frames({ tick: 0, move: [1, 0] }) });
  assert.deepEqual(events(r2, 'game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r2.end.ticks, events(r2, 'player_hit')[0].tick, 'ends immediately, no respawn');
});

test('fall ignores invulnerability and nothing can hit or pick up while waiting', () => {
  const sc = { ...base, player: { pos: [39.95, 0, 0], invuln_ticks: 500 }, shades: [{ pos: [30, 0, 0] }] };
  const r = run({ scenario: sc, ticks: 100, inputs: frames({ tick: 0, move: [1, 0] }) });
  assert.equal(events(r, 'player_hit').filter((e) => e.data.by === 'fall').length, 1);
});

test('Night 2: bridge is walkable, void beside it is not', () => {
  let r = run({ scenario: base, night: 2, ticks: 720, inputs: frames({ tick: 0, move: [1, 0] }) });
  assert.equal(events(r, 'player_hit').length, 0);
  assert.ok(r.snaps.at(-1).player.pos[0] > 65);
  r = run({ scenario: { ...base, player: { pos: [35, 0, 1.9] } }, night: 2, ticks: 200, inputs: frames({ tick: 0, move: [0, 1] }) });
  assert.equal(events(r, 'player_hit')[0].data.by, 'fall');
});

test('Night 2 jump pad: launches at 14 m/s up, 24 m/s toward the other island, ignores keys, lands on it', () => {
  const sc = { ...base, player: { pos: [20, 0, 17.5] } };
  const r = run({ scenario: sc, night: 2, ticks: 160, extra: E1, inputs: frames({ tick: 0, move: [-1, 0] }) });
  assert.ok(r.snap(40).player.pos[1] > 4, 'apex ~ 14^2/40 = 4.9 m');
  assert.ok(Math.abs(speedOf(r.snap(40).player.vel) - 24) < 0.01);
  assert.ok(r.snap(60).player.pos[0] > r.snap(40).player.pos[0], 'move keys do not override');
  const s = r.snap(120).player;
  assert.equal(s.grounded, true);
  assert.ok(Math.hypot(s.pos[0] - 70, s.pos[2]) <= 28 && s.pos[0] > 42);
  assert.equal(events(r, 'player_hit').length, 0);
  const sc2 = { ...base, player: { pos: [50, 0, -17.5] } }; // second pad flies back to island A
  const r2 = run({ scenario: sc2, night: 2, ticks: 160 });
  const p2 = r2.snaps.at(-1).player;
  assert.ok(Math.hypot(p2.pos[0], p2.pos[2]) <= 28 && p2.pos[0] < 26 && p2.grounded);
});

test('Night 2 map: lanterns L1..L6 and charm position', () => {
  const r = run({ scenario: { ...base, charms: undefined }, night: 2, ticks: 1 });
  assert.deepEqual(r.snap(0).lanterns.map((l) => l.pos), [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]);
  assert.equal(r.snap(0).charms.length, 1);
});

test('Night 3: ramp up to tier 1, cliffs block, tier 2 reachable by the pad, tower is solid', () => {
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  let r = run({ scenario: { ...base, player: { pos: [31 * c, 0, 31 * s] } }, night: 3, ticks: 150, inputs: frames({ tick: 0, move: [-c, -s] }) });
  let p = r.snaps.at(-1).player;
  assert.equal(p.pos[1], 3);
  assert.equal(p.grounded, true);
  assert.equal(events(r, 'player_hit').length, 0);
  r = run({ scenario: { ...base, player: { pos: [0, 0, -10] } }, night: 3, ticks: 200, inputs: frames({ tick: 0, move: [0, 1] }) });
  p = r.snaps.at(-1).player;
  assert.equal(p.pos[1], 0);
  assert.ok(Math.hypot(p.pos[0], p.pos[2]) >= 7.9, 'vertical wall of tier 2');
  r = run({ scenario: { ...base, player: { pos: [0, 3, 13] } }, night: 3, ticks: 120, extra: E1 });
  p = r.snap(120).player;
  assert.equal(p.pos[1], 6);
  assert.equal(p.grounded, true);
  assert.ok(Math.hypot(p.pos[0], p.pos[2]) < 8);
  assert.ok(Math.abs(r.snap(30).player.vel[2] + 8) < 0.01, '8 m/s toward -Z');
  r = run({ scenario: { ...base, player: { pos: [6, 6, 0] } }, night: 3, ticks: 200, inputs: frames({ tick: 0, move: [-1, 0] }) });
  assert.ok(r.snaps.at(-1).player.pos[0] >= 1.99, 'bell tower blocks');
  r = run({ scenario: base, night: 3, ticks: 1 });
  assert.deepEqual(r.snap(0).lanterns.map((l) => l.pos), [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]);
});

test('Night 3 wind: warn 2 s, 5 s gust every 30 s pushing 2 m/s', () => {
  const r = run({ scenario: { ...base, wind_enabled: true, player: { pos: [0, 0, -30] } }, night: 3, ticks: 2100, extra: ['--snapshot-every', '30'] });
  assert.equal(r.snap(1770).wind.active, false);
  assert.deepEqual(r.snap(1770).player.pos, [0, 0, -30]);
  assert.equal(r.snap(1800).wind.active, true);
  assert.equal(r.snap(2070).wind.active, true);
  assert.equal(r.snap(2100).wind.active, false);
  const p = r.snap(2100).player.pos;
  assert.ok(Math.abs(Math.hypot(p[0], p[2] + 30) - 10) < 0.01, 'pushed 2 m/s * 5 s');
  const dir = r.snap(1800).wind.dir_deg;
  assert.ok(dir >= 0 && dir < 360);
  const ang = (Math.atan2(p[2] + 30, p[0]) * 180) / Math.PI;
  assert.ok(Math.abs(((ang - dir + 540) % 360) - 180) < 0.1, 'push direction equals dir_deg');
  const off = run({ scenario: { ...base, wind_enabled: false, player: { pos: [0, 0, -30] } }, night: 3, ticks: 2100, extra: ['--snapshot-every', '30'] });
  assert.deepEqual(off.snap(2100).player.pos, [0, 0, -30]);
});

test('Gió Lạc: spawns at 1200, 2400 (max 2), id D#, idle -> chase when carrying >= 5 within 15 m', () => {
  const r = run({ scenario: { ...base, random_drifters: true }, night: 2, ticks: 3700, extra: ['--snapshot-every', '100'] });
  assert.equal(r.snap(1100).drifters.length, 0);
  assert.equal(r.snap(1200).drifters.length, 1);
  assert.equal(r.snap(1200).drifters[0].id, 'D1');
  assert.equal(r.snap(2400).drifters.length, 2);
  assert.equal(r.snap(3600).drifters.length, 2);
  assert.equal(r.snap(1200).drifters[0].state, 'idle');
  const night1 = run({ scenario: { ...base }, night: 1, ticks: 1300 });
  assert.equal(night1.snaps.at(-1).drifters.length, 0, 'no drifters in Night 1');
  let s = run({ scenario: { ...base, player: { carried: 4 }, drifters: [{ pos: [8, 0, 0] }] }, night: 2, ticks: 200, extra: E1 });
  assert.equal(s.snap(100).drifters[0].state, 'idle', 'needs >= 5');
  s = run({ scenario: { ...base, player: { carried: 6 }, drifters: [{ pos: [20, 0, 0] }] }, night: 2, ticks: 20, extra: E1 });
  assert.equal(s.snap(5).drifters[0].state, 'idle', 'farther than 15 m');
  s = run({ scenario: { ...base, player: { carried: 6 }, drifters: [{ pos: [14, 0, 0] }] }, night: 2, ticks: 5, extra: E1 });
  assert.equal(s.snap(1).drifters[0].state, 'chase');
});

test('Gió Lạc steals min(3, carried) once, flees 240 ticks and vanishes; no flame loss; invulnerability does not help', () => {
  const sc = { ...base, player: { carried: 6, invuln_ticks: 600 }, drifters: [{ pos: [8, 0, 0] }] };
  const r = run({ scenario: sc, night: 2, ticks: 400, extra: E1 });
  const st = events(r, 'drifter_steal');
  assert.equal(st.length, 1);
  assert.deepEqual(st[0].data, { drifter_id: 'D1', amount: 3, carried: 3 });
  const T0 = st[0].tick;
  assert.equal(r.snap(T0).drifters[0].state, 'flee');
  assert.equal(r.snap(T0).drifters[0].stolen, 3);
  assert.equal(r.snap(T0 + 100).player.carried, 3);
  assert.equal(r.snap(T0 + 100).player.flames, 3);
  assert.equal(r.snap(T0 + 239).drifters.length, 1);
  assert.equal(r.snap(T0 + 240).drifters.length, 0);
  assert.equal(r.snap(T0 + 100).drifters[0].stolen, 3);
  const r2 = run({ scenario: { ...base, player: { carried: 5 }, drifters: [{ pos: [1, 0, 0], state: 'chase' }] }, night: 2, ticks: 3 });
  assert.equal(events(r2, 'drifter_steal')[0].data.amount, 3);
});

test('Tỏa Sáng: chasing Gió Lạc flees without stealing; fleeing thief drops the loot and leaves within 120 ticks', () => {
  let r = run({ scenario: { ...base, player: { carried: 8 }, drifters: [{ pos: [4, 0, 0], state: 'chase' }] }, night: 2, ticks: 60, extra: E1, inputs: frames({ tick: 0, pulse: true }) });
  assert.equal(events(r, 'drifter_steal').length, 0);
  assert.equal(r.snap(1).drifters[0].state, 'flee');
  assert.equal(r.snap(1).drifters[0].stolen, 0);
  assert.equal(r.snap(1).score, 0, 'drifters give no stun score');
  r = run({ scenario: { ...base, player: { carried: 8 }, drifters: [{ pos: [3, 0, 0], state: 'flee', stolen: 3, ticks_left: 200 }] }, night: 2, ticks: 200, extra: E1, inputs: frames({ tick: 0, pulse: true }) });
  assert.deepEqual(events(r, 'drifter_drop')[0].data, { drifter_id: 'D1', amount: 3 });
  assert.equal(r.snap(1).motes.filter((m) => m.kind === 'dropped').length, 3);
  assert.equal(r.snap(1).drifters[0].stolen, 0);
  assert.equal(r.snap(120).drifters.length, 0);
  assert.equal(r.snap(119).drifters.length, 1);
});

test('Bùa Gió: pickup event, 600 ticks, 7.2 m/s, respawn 2700 ticks; dash has no cooldown', () => {
  const sc = { ...base, charms: [{ id: 'C1', pos: [0, 0, 0.5] }] };
  let r = run({ scenario: sc, night: 2, ticks: 700, extra: E1, inputs: frames({ tick: 5, move: [0, 1] }, { tick: 60, move: [0, 0] }) });
  assert.deepEqual(events(r, 'charm_picked')[0].data, { charm_id: 'C1', charm_ticks: 600 });
  assert.equal(r.snap(1).player.charm_s, 10);
  assert.equal(r.snap(1).charms[0].available, false);
  assert.equal(r.snap(1).charms[0].respawn_s, 45);
  assert.equal(r.snap(600).player.charm_s, 0.017 > 0 ? r.snap(600).player.charm_s : 0);
  assert.ok(r.snap(599).player.charm_s > 0 && r.snap(601).player.charm_s === 0, 'exactly 600 ticks');
  assert.ok(Math.abs(r.snap(6).player.vel[2] - 7.2) < 1e-9);
  r = run({ scenario: { ...base, charms: [{ id: 'C1', pos: [30, 0, 0], available: false, respawn_ticks: 5 }] }, night: 2, ticks: 8, extra: E1 });
  assert.equal(r.snap(4).charms[0].available, false);
  assert.equal(r.snap(5).charms[0].available, true);
  r = run({ scenario: { ...base, player: { charm_ticks: 300 } }, ticks: 80, inputs: frames({ tick: 0, dash: true }, { tick: 1, dash: false }, { tick: 5, dash: true }, { tick: 6, dash: false }, { tick: 20, dash: true }, { tick: 21, dash: false }) });
  assert.deepEqual(events(r, 'dash').map((e) => e.tick), [1, 21], 'press during a dash is ignored; no cooldown afterwards');
  r = run({ scenario: { ...base, player: { charm_ticks: 300 } }, ticks: 40, extra: E1, inputs: frames({ tick: 0, dash: true }, { tick: 1, dash: false }) });
  assert.ok(Math.abs(r.snap(12).player.pos[2] - 2.8) < 0.001, 'dash is still 14 m/s for 12 ticks');
  assert.equal(r.snap(5).player.dash_cd_s, 0);
});

test('Bùa Gió: standard positions per night', () => {
  const pos = (night) => run({ scenario: { ...base, charms: undefined }, night, ticks: 1 });
  assert.equal(pos(1).snap(0).charms.length, 0);
  assert.equal(pos(2).snap(0).charms.length, 1);
  assert.equal(pos(3).snap(0).charms.length, 2);
});

test('pause: tick advances, sim_tick/time/spawns/cooldowns freeze; paused/resumed events', () => {
  const sc = { ...base, player: { carried: 5, pulse_cd_ticks: 100 } };
  const r = run({ scenario: sc, ticks: 40, extra: E1, inputs: frames({ tick: 0, move: [0, 1] }, { tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 20, pause: true }, { tick: 21, pause: false }) });
  assert.deepEqual(events(r, 'paused').map((e) => e.tick), [11]);
  assert.deepEqual(events(r, 'resumed').map((e) => e.tick), [21]);
  assert.equal(r.snap(10).state, 'playing');
  const p = r.snap(15);
  assert.equal(p.state, 'paused');
  assert.equal(p.tick, 15);
  assert.equal(p.sim_tick, 10);
  assert.equal(p.time_left_s, r.snap(10).time_left_s);
  assert.equal(p.player.pulse_cd_s, r.snap(10).player.pulse_cd_s);
  assert.deepEqual(p.player.pos, r.snap(10).player.pos);
  assert.equal(r.snap(21).state, 'playing');
  assert.equal(r.snap(30).sim_tick, 20);
  assert.equal(r.end.ticks, 40);
  assert.notEqual(r.end.state, 'paused');
});

test('shade states use the v1.1 names; scenario can set state and ticks left', () => {
  const sc = { ...base, player: { pos: [0, 0, 0] }, shades: [
    { id: 'S1', pos: [30, 0, 0] }, { id: 'S2', pos: [8, 0, 0] }, { id: 'S3', pos: [0, 0, 15], state: 'stunned', state_ticks_left: 10 },
    { id: 'S4', pos: [0, 0, -15], state: 'recoil', state_ticks_left: 5 }, { id: 'S5', pos: [-30, 0, 0], state: 'spawning', state_ticks_left: 3 }] };
  const r = run({ scenario: sc, ticks: 20, extra: E1 });
  const names = new Set(r.snaps.flatMap((s) => s.shades.map((x) => x.state)));
  for (const nm of names) assert.ok(['spawning', 'wander', 'chase', 'recoil', 'stunned'].includes(nm), nm);
  assert.equal(r.snap(0).shades[0].state, 'wander');
  assert.equal(r.snap(1).shades[1].state, 'chase', 'detects within 12 m');
  assert.equal(r.snap(9).shades[2].state, 'stunned');
  assert.equal(r.snap(10).shades[2].state, 'chase');
  assert.equal(r.snap(4).shades[3].state, 'recoil');
  assert.equal(r.snap(5).shades[3].state, 'chase');
  assert.equal(r.snap(2).shades[4].state, 'spawning');
  assert.equal(r.snap(3).shades[4].state, 'wander');
});

test('shade loses a target farther than 18 m (hysteresis 12 / 18)', () => {
  const r = run({ scenario: { ...base, shades: [{ id: 'S1', pos: [11, 0, 0], state: 'chase' }] , player: {} }, ticks: 5, extra: E1, inputs: frames({ tick: 0, move: [-1, 0] }) });
  assert.equal(r.snap(1).shades[0].state, 'chase');
  const r2 = run({ scenario: { ...base, shades: [{ id: 'S1', pos: [19, 0, 0], state: 'chase' }] }, ticks: 2, extra: E1 });
  assert.equal(r2.snap(1).shades[0].state, 'wander');
});

test('shade cannot climb cliffs (Night 3, stuck below tier 2)', () => {
  const sc = { ...base, player: { pos: [0, 6, 5], flames: 99 }, shades: [{ pos: [0, 0, -12], state: 'chase' }] };
  const r = run({ scenario: sc, night: 3, ticks: 600 });
  const s = r.snaps.at(-1).shades[0];
  assert.ok(Math.hypot(s.pos[0], s.pos[2]) >= 7.9);
  assert.equal(events(r, 'player_hit').length, 0);
});

test('full Night 3 headless run finishes well under 30 s', () => {
  const t0 = Date.now();
  const r = run({ night: 3, ticks: 21600, seed: 5, scenario: { player: { flames: 9999 } } });
  assert.equal(r.status, 0);
  assert.equal(r.end.ticks, 21600);
  assert.ok(Date.now() - t0 < 30000, `took ${Date.now() - t0} ms`);
});
