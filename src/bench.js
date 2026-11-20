// Benchmark scene (Ticket-04): Night 1, 200 wandering shades spread over the island, 100 motes, L1-L3 lit with fuel 100.
// Spawns, damage, pickups, fuel burn and night end are disabled by the Sim's `bench` flag; shades keep their normal wander rules.
import { mulberry32 } from './sim.js';

export const BENCH_RADIUS = 30, BENCH_HEIGHT = 15, BENCH_PERIOD_S = 15, BENCH_WARMUP_S = 3;

export function benchScenario(seed = 42) {
  const rng = mulberry32(seed);
  const disk = (rmax) => { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * rmax; return [r * Math.cos(a), r * Math.sin(a)]; };
  const shades = Array.from({ length: 200 }, (_, i) => { const [x, z] = disk(38); return { id: `S${i + 1}`, pos: [x, 0, z], state: 'wander' }; });
  const motes = Array.from({ length: 100 }, () => { const [x, z] = disk(36); return [x, 0, z]; });
  return {
    player: { pos: [0, 0, 0] },
    random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
    motes, shades, drifters: [], charms: [],
    lanterns: [{ id: 'L1', lit: true, fuel: 100 }, { id: 'L2', lit: true, fuel: 100 }, { id: 'L3', lit: true, fuel: 100 }],
    time_left_s: 3600,
  };
}

/** Camera on a circle of radius 30 at height 15, starting at angle 0 ((30,15,0)), turning anticlockwise
 *  (angle grows from +X toward +Z, the same convention as the maps), one lap per 15 s, always looking at the origin. */
export function benchCamera(tSeconds) {
  const a = (2 * Math.PI * tSeconds) / BENCH_PERIOD_S;
  return { pos: [BENCH_RADIUS * Math.cos(a), BENCH_HEIGHT, BENCH_RADIUS * Math.sin(a)], look: [0, 0, 0] };
}

/** Statistics exactly as defined by the ticket, from a list of frame times in ms. */
export function benchStats(dts) {
  const n = dts.length;
  if (!n) return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  const sum = dts.reduce((a, b) => a + b, 0);
  const sorted = [...dts].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * n));
  const worst = sorted.slice(-k);
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)]; // nearest-rank percentile
  const r1 = (x) => Math.round(x * 10) / 10;
  return { frames: n, avg_fps: r1((1000 * n) / sum), p1_low_fps: r1(1000 / (worst.reduce((a, b) => a + b, 0) / k)), frame_ms_p95: r1(p95) };
}
