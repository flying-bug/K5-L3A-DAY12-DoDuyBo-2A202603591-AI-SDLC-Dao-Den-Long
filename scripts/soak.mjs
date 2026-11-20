// Soak test (Ticket-04):  node scripts/soak.mjs --seed 7 --nights 10 --out soak.json
// Headless, one process, nights cycle 1 -> 2 -> 3; night i (0-based) uses seed (seed + i). Random inputs from that seed:
// new move direction every 30 ticks; per tick: 5% jump, 3% dash, 2% pulse, 10% interact.
import fs from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Sim, mulberry32 } from '../src/sim.js';
import { T_NIGHT_TICKS } from './soak-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const seed = Number(arg('seed', 7)), nights = Number(arg('nights', 10)), out = arg('out');
if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1 || !out) { process.stderr.write('usage: soak.mjs --seed <int> --nights <int> --out <file>\n'); process.exit(2); }

// force a collection before each RSS reading so garbage that is merely not yet collected is not counted as a leak
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const rssMb = () => { gc(); gc(); return Math.round(process.memoryUsage().rss / 1048576); };
const t0 = process.hrtime.bigint();
const results = [];
let crashes = 0, memStart = null, memEnd = null;

for (let i = 0; i < nights; i++) {
  const night = (i % 3) + 1;
  let sim = null;
  try {
    sim = new Sim({ seed: seed + i, night });
    if (i === 0) {
      // "loaded" = the first night is built and has run its first second (code paths compiled, spawns made),
      // so JIT warm-up of the engine is not mistaken for growth later on
      for (let w = 0; w < 60; w++) sim.step({});
      sim = new Sim({ seed: seed + i, night });
      memStart = rssMb();
    }
    const rng = mulberry32(seed + i);
    let move = [0, 0];
    const maxTicks = T_NIGHT_TICKS[night];
    for (let tk = 0; tk < maxTicks && (sim.state === 'playing' || sim.state === 'paused'); tk++) {
      if (tk % 30 === 0) { const a = rng() * Math.PI * 2; move = [Math.cos(a), Math.sin(a)]; }
      sim.step({ move, cam_yaw_deg: 0, jump: rng() < 0.05, dash: rng() < 0.03, pulse: rng() < 0.02, interact: rng() < 0.1 });
    }
    results.push(sim.state === 'won' ? 'won' : 'lost');
  } catch (e) {
    crashes += 1;
    results.push('crash');
    process.stderr.write(`night ${i + 1} crashed: ${e.stack}\n`);
  }
  sim = null; // reset: nothing keeps the finished night alive
  if (i === nights - 1) memEnd = rssMb();
}

const report = {
  nights, crashes, results,
  mem_start_mb: memStart, mem_end_mb: memEnd,
  duration_s: Math.round((Number(process.hrtime.bigint() - t0) / 1e9) * 10) / 10,
};
fs.writeFileSync(out, JSON.stringify(report));
console.log(JSON.stringify(report));
process.exit(crashes === 0 && memEnd <= 1.2 * memStart ? 0 : 1);
