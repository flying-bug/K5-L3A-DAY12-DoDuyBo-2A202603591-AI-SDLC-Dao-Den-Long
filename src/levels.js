// Standard maps (Ticket-02 Part 2). Angles are measured from +X toward +Z: (x,z) = (r cos a, r sin a).
// surface(x,z) -> ground height or null (void / cloud sea).
const rad = (a) => (a * Math.PI) / 180;
const ring = (cx, cz, r, start, step, n) =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rad(start + i * step)), cz + r * Math.sin(rad(start + i * step))]);

function pad(pos, vy, vh, dir) {
  return { pos, r: 1, vy, vh, dir };
}
function toward(from, to) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const d = Math.hypot(dx, dz);
  return [dx / d, dz / d];
}

// ---------- Night 1: Dao Ben ----------
const night1 = {
  id: 1,
  name: 'Đảo Bến',
  duration_key: 'night1_duration_s',
  start: [0, 0, 0],
  lanterns: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
  moteSpawns: [...ring(0, 0, 12, 0, 45, 8), ...ring(0, 0, 33, 0, 22.5, 16)],
  shadeSpawns: ring(0, 0, 37, 15, 30, 12),
  shadeEvery: 480,
  shadeMax: 6,
  shadeSpeed: 4.0,
  charms: [],
  drifters: false,
  wind: false,
  pads: [],
  obstacles: [],
  centers: [[0, 0]],
  surface: (x, z) => (Math.hypot(x, z) <= 40 ? 0 : null),
};

// ---------- Night 2: Dao Cau ----------
const A = [0, 0], B = [70, 0];
const night2 = {
  id: 2,
  name: 'Đảo Cau',
  duration_key: 'night2_duration_s',
  start: [0, 0, 0],
  lanterns: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
  moteSpawns: [
    ...ring(A[0], A[1], 10, 0, 90, 4), ...ring(A[0], A[1], 22, 0, 45, 8),
    ...ring(B[0], B[1], 10, 0, 90, 4), ...ring(B[0], B[1], 22, 0, 45, 8),
  ],
  shadeSpawns: [...ring(A[0], A[1], 26, 22.5, 45, 8), ...ring(B[0], B[1], 26, 22.5, 45, 8)],
  shadeEvery: 420,
  shadeMax: 8,
  shadeSpeed: 4.0,
  charms: [[35, 0, 0]],
  drifters: true,
  wind: false,
  pads: [pad([20, 0, 18], 14, 24, toward([20, 18], B)), pad([50, 0, -18], 14, 24, toward([50, -18], A))],
  obstacles: [],
  centers: [A, B],
  surface: (x, z) => {
    if (Math.hypot(x, z) <= 28) return 0;
    if (Math.hypot(x - 70, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && Math.abs(z) <= 2) return 0;
    return null;
  },
};

// ---------- Night 3: Dao Chuong ----------
const RAMP_ANGLES = [30, 150];
function surface3(x, z) {
  const r = Math.hypot(x, z);
  if (r > 45) return null;
  if (r <= 8) return 6;
  let h = 0;
  if (r >= 12 && r <= 24 && z > 0) h = 3;
  for (const a of RAMP_ANGLES) {
    const c = Math.cos(rad(a)), s = Math.sin(rad(a));
    const u = x * c + z * s; // along the radius
    const w = -x * s + z * c; // lateral
    if (Math.abs(w) <= 1.5 && u >= 24 && u <= 30) h = Math.max(h, (3 * (30 - u)) / 6);
  }
  return h;
}
const night3 = {
  id: 3,
  name: 'Đảo Chuông',
  duration_key: 'night3_duration_s',
  start: [0, 0, -20], // [assumption] the centre is the bell tower, so the spawn is on the low floor
  lanterns: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
  moteSpawns: [...ring(0, 0, 34, 0, 20, 18), ...ring(0, 0, 18, 20, 20, 8), ...ring(0, 0, 5, 45, 90, 4)],
  shadeSpawns: ring(0, 0, 43, 0, 22.5, 16),
  shadeEvery: 360,
  shadeMax: 10,
  shadeSpeed: 4.5,
  charms: [[30, 0, 25], [-30, 0, 25]],
  drifters: true,
  wind: true,
  pads: [pad([0, 3, 13], 12, 8, [0, -1])],
  obstacles: [{ x: 0, z: 0, r: 2, base: 6, top: 14 }],
  centers: [[0, 0]],
  surface: surface3,
};

export const NIGHTS = { 1: night1, 2: night2, 3: night3 };
