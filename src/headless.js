#!/usr/bin/env node
// Headless runner per Test Contract v1.0.
import fs from 'node:fs';
import { Sim, SHADE_STATES } from './sim.js';

class UsageError extends Error {}
const fail = (code, msg) => { process.stderr.write(`error: ${msg}\n`); process.exit(code); };

function parseArgs(argv) {
  const a = { snapshotEvery: 10 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { if (i + 1 >= argv.length) throw new UsageError(`missing value for ${k}`); return argv[++i]; };
    const int = () => { const s = v(); if (!/^-?\d+$/.test(s)) throw new UsageError(`${k} needs an integer`); return +s; };
    if (k === '--seed') a.seed = int();
    else if (k === '--night') a.night = int();
    else if (k === '--ticks') a.ticks = int();
    else if (k === '--out') a.out = v();
    else if (k === '--scenario') a.scenario = v();
    else if (k === '--inputs') a.inputs = v();
    else if (k === '--snapshot-every') a.snapshotEvery = int();
    else throw new UsageError(`unknown argument ${k}`);
  }
  if (a.ticks == null || a.out == null) throw new UsageError('--ticks and --out are required');
  if (a.ticks < 0) throw new UsageError('--ticks must be >= 0');
  if (a.snapshotEvery < 1) throw new UsageError('--snapshot-every must be >= 1');
  a.seed ??= 1; a.night ??= 1;
  if (![1, 2, 3].includes(a.night)) throw new UsageError('--night must be 1, 2 or 3');
  return a;
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);

function readJson(file, what) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { throw new UsageError(`cannot read ${what} ${file}: ${e.message}`); }
  try { return JSON.parse(txt); } catch (e) { throw new UsageError(`${what} is not valid JSON: ${e.message}`); }
}

function validateInputs(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.frames)) throw new UsageError('inputs: "frames" array required');
  let last = -1;
  for (const f of d.frames) {
    if (!f || typeof f !== 'object' || !Number.isInteger(f.tick) || f.tick < 0) throw new UsageError('inputs: frame.tick must be a non-negative integer');
    if (f.tick <= last) throw new UsageError('inputs: frame ticks must strictly increase');
    last = f.tick;
    if ('move' in f && !(Array.isArray(f.move) && f.move.length === 2 && f.move.every((x) => isNum(x) && x >= -1 && x <= 1))) throw new UsageError('inputs: move must be [x,z] within [-1,1]');
    if ('cam_yaw_deg' in f && !isNum(f.cam_yaw_deg)) throw new UsageError('inputs: cam_yaw_deg must be a number');
    for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause']) if (b in f && typeof f[b] !== 'boolean') throw new UsageError(`inputs: ${b} must be boolean`);
  }
  return d.frames;
}

function validateScenario(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new UsageError('scenario must be an object');
  const p = s.player;
  if (p !== undefined) {
    if (typeof p !== 'object' || p === null) throw new UsageError('scenario.player must be an object');
    if ('pos' in p && !isVec3(p.pos)) throw new UsageError('scenario.player.pos must be [x,y,z]');
    for (const k of ['carried', 'flames', 'invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks']) if (k in p && !Number.isInteger(p[k])) throw new UsageError(`scenario.player.${k} must be an integer`);
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) if (k in s && typeof s[k] !== 'boolean') throw new UsageError(`scenario.${k} must be boolean`);
  if ('time_left_s' in s && !(isNum(s.time_left_s) && s.time_left_s >= 0)) throw new UsageError('scenario.time_left_s must be a number >= 0');
  if ('motes' in s && !(Array.isArray(s.motes) && s.motes.every((m) => isVec3(m) || (m && isVec3(m.pos))))) throw new UsageError('scenario.motes must be an array of [x,y,z] or {pos,kind?,ttl_ticks?}');
  if ('shades' in s) {
    if (!(Array.isArray(s.shades) && s.shades.every((x) => x && isVec3(x.pos) && (x.id === undefined || typeof x.id === 'string')))) throw new UsageError('scenario.shades must be [{pos:[x,y,z], id?}]');
    for (const x of s.shades) {
      if ('state' in x && !SHADE_STATES.includes(x.state)) throw new UsageError(`scenario.shades[].state must be one of ${SHADE_STATES.join(',')}`);
      if ('state_ticks_left' in x && !(Number.isInteger(x.state_ticks_left) && x.state_ticks_left >= 0)) throw new UsageError('scenario.shades[].state_ticks_left must be a non-negative integer');
    }
  }
  if ('drifters' in s) {
    if (!(Array.isArray(s.drifters) && s.drifters.every((x) => x && isVec3(x.pos)))) throw new UsageError('scenario.drifters must be [{pos:[x,y,z], id?, state?, stolen?}]');
    for (const x of s.drifters) {
      if ('state' in x && !['idle', 'chase', 'flee'].includes(x.state)) throw new UsageError('scenario.drifters[].state must be idle, chase or flee');
      if ('stolen' in x && !(Number.isInteger(x.stolen) && x.stolen >= 0)) throw new UsageError('scenario.drifters[].stolen must be a non-negative integer');
    }
  }
  if ('charms' in s) {
    if (!(Array.isArray(s.charms) && s.charms.every((x) => x && typeof x === 'object' && (!('pos' in x) || isVec3(x.pos))))) throw new UsageError('scenario.charms must be [{id?, pos?, available?, respawn_ticks?}]');
  }
  if ('lanterns' in s) {
    if (!Array.isArray(s.lanterns)) throw new UsageError('scenario.lanterns must be an array');
    for (const l of s.lanterns) {
      if (!l || typeof l.id !== 'string') throw new UsageError('scenario.lanterns[].id required');
      if ('pos' in l && !isVec3(l.pos)) throw new UsageError('scenario.lanterns[].pos must be [x,y,z]');
      if ('deposited' in l && !Number.isInteger(l.deposited)) throw new UsageError('scenario.lanterns[].deposited must be an integer');
      if ('lit' in l && typeof l.lit !== 'boolean') throw new UsageError('scenario.lanterns[].lit must be boolean');
    }
  }
  return s;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenario = args.scenario ? validateScenario(readJson(args.scenario, 'scenario')) : {};
  const frames = args.inputs ? validateInputs(readJson(args.inputs, 'inputs')) : [];

  const sim = new Sim({ seed: args.seed, night: args.night, scenario });
  const lines = [JSON.stringify(sim.snapshot()), JSON.stringify({ type: 'event', tick: 0, name: 'night_start', data: { night: args.night } })];
  const cur = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  let fi = 0;
  let lastSnap = 0;
  for (let k = 0; k < args.ticks && (sim.state === 'playing' || sim.state === 'paused'); k++) {
    while (fi < frames.length && frames[fi].tick <= k) {
      const { tick, ...rest } = frames[fi++];
      Object.assign(cur, rest);
    }
    for (const e of sim.step(cur)) lines.push(JSON.stringify(e));
    if (sim.tick % args.snapshotEvery === 0) { lines.push(JSON.stringify(sim.snapshot())); lastSnap = sim.tick; }
  }
  if (lastSnap !== sim.tick) lines.push(JSON.stringify(sim.snapshot()));
  lines.push(JSON.stringify(sim.endLine()));
  fs.writeFileSync(args.out, lines.join('\n') + '\n');
}

try { main(); } catch (e) {
  if (e instanceof UsageError) fail(2, e.message);
  fail(1, e && e.stack ? e.stack : String(e));
}
