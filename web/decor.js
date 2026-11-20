// Purely visual scenery: grass, bushes, flowers, rocks, trees, festival lantern strings, gates, animals, sky lanterns.
// Seeded and independent from Sim: nothing here collides or changes gameplay / headless output.
// Red + gold festival accents use the ticket palette (scarf red #C8102E, gold #F2C14E).
import * as THREE from 'three';
import { mulberry32 } from '/src/sim.js';

const RED = 0xc8102e, GOLD = 0xf2c14e, WOOD = 0x6b4a2f;
const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

const AREAS = {
  1: [{ cx: 0, cz: 0, r: 40 }],
  2: [{ cx: 0, cz: 0, r: 28 }, { cx: 70, cz: 0, r: 28 }],
  3: [{ cx: 0, cz: 0, r: 45 }],
};

export function buildDecor(night, L) {
  const rng = mulberry32(1000 + night * 7919);
  const R = (a, b) => a + rng() * (b - a);
  const g = new THREE.Group();
  const areas = AREAS[night];

  // ---------- placement helpers ----------
  const flat = (x, z, rad = 1) => {
    const s = L.surface(x, z);
    if (s === null) return false;
    return [[rad, 0], [-rad, 0], [0, rad], [0, -rad]].every(([dx, dz]) => L.surface(x + dx, z + dz) === s);
  };
  const clear = (x, z, lan = 3.5) => {
    if (L.lanterns.some((l) => Math.hypot(x - l[0], z - l[2]) < lan)) return false;
    if (L.moteSpawns.some((m) => Math.hypot(x - m[0], z - m[1]) < 1.5)) return false;
    if (L.pads.some((p) => Math.hypot(x - p.pos[0], z - p.pos[2]) < 3.5)) return false;
    if (L.charms.some((c) => Math.hypot(x - c[0], z - c[2]) < 2)) return false;
    if (L.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 2.5)) return false;
    if (Math.hypot(x - L.start[0], z - L.start[2]) < 3) return false;
    if (night === 2 && x > 23 && x < 47 && Math.abs(z) < 4.5) return false;
    return true;
  };
  const pick = (area, rmin, rmax, lan) => {
    for (let k = 0; k < 30; k++) {
      const a = R(0, Math.PI * 2), r = Math.sqrt(R(rmin * rmin, rmax * rmax));
      const x = area.cx + Math.cos(a) * r, z = area.cz + Math.sin(a) * r;
      if (flat(x, z) && clear(x, z, lan)) return [x, L.surface(x, z), z];
    }
    return null;
  };
  const tmp = new THREE.Object3D();
  const inst = (geo, material, items, place) => {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
    items.forEach((it, i) => { place(tmp, it); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); if (it.color != null) m.setColorAt(i, new THREE.Color(it.color)); });
    m.count = items.length; m.frustumCulled = false;
    g.add(m);
    return m;
  };

  // ---------- grass tufts ----------
  const tufts = [];
  for (const a of areas) for (let i = 0; i < a.r * a.r * 0.28; i++) {
    const p = pick(a, 0, a.r - 1.5, 0);
    if (p) tufts.push({ p, s: R(0.6, 1.5), rot: R(0, 6.28), tilt: R(-0.3, 0.3), color: [0x2f5d50, 0x3d7a58, 0x4f8a5c, 0x27503f][Math.floor(R(0, 4))] });
  }
  inst(new THREE.ConeGeometry(0.07, 0.55, 3), mat(0xffffff), tufts, (o, t) => { o.position.set(t.p[0], t.p[1] + 0.25 * t.s, t.p[2]); o.rotation.set(t.tilt, t.rot, t.tilt * 0.6); o.scale.set(1, t.s, 1); });

  // ---------- bushes (the player can walk through them; they rustle) ----------
  const bushes = [];
  for (const a of areas) for (let i = 0; i < a.r * a.r / 30; i++) {
    const p = pick(a, 3, a.r - 2, 3.5);
    if (p) bushes.push({ p, s: R(0.55, 1.15), color: [0x3a7a5a, 0x428a5e, 0x2f6d50, 0x4a8f5c][Math.floor(R(0, 4))], scale: 1, ph: R(0, 6) });
  }
  const bushMesh = inst(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff, { flatShading: true }), bushes, () => {});
  // berries / festival flowers on the bushes (red + gold)
  const blooms = [];
  for (const b of bushes) for (let k = 0; k < 3; k++) {
    const a = R(0, 6.28), rr = R(0.6, 1.0) * b.s * 1.2;
    blooms.push({ x: b.p[0] + Math.cos(a) * rr, y: b.p[1] + R(0.25, 0.7) * b.s, z: b.p[2] + Math.sin(a) * rr, color: rng() < 0.55 ? RED : GOLD });
  }
  inst(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), blooms, (o, f) => { o.position.set(f.x, f.y, f.z); o.rotation.set(0, 0, 0); o.scale.setScalar(1); });
  const writeBush = (b, i, near) => {
    const sq = near ? 0.55 + 0.1 * Math.sin(b.ph) : 1;
    tmp.position.set(b.p[0], b.p[1] + 0.35 * b.s * sq, b.p[2]);
    tmp.rotation.set(0, b.ph, near ? 0.12 * Math.sin(b.ph * 3) : 0);
    tmp.scale.set(1.25 * b.s * (near ? 1.1 : 1), 0.8 * b.s * sq, 1.25 * b.s * (near ? 1.1 : 1));
    tmp.updateMatrix(); bushMesh.setMatrixAt(i, tmp.matrix);
  };
  bushes.forEach((b, i) => writeBush(b, i, false));

  // ---------- rocks ----------
  const rocks = [];
  for (const a of areas) for (let i = 0; i < a.r * 0.45; i++) { const p = pick(a, a.r * 0.35, a.r - 1.5, 3); if (p) rocks.push({ p, s: R(0.25, 0.75), rot: R(0, 6), color: [0x6b5a50, 0x7a6a60, 0x5a4a44][Math.floor(R(0, 3))] }); }
  inst(new THREE.DodecahedronGeometry(1, 0), mat(0xffffff, { flatShading: true }), rocks, (o, r) => { o.position.set(r.p[0], r.p[1] + 0.15 * r.s, r.p[2]); o.rotation.set(r.rot, r.rot * 2, 0); o.scale.set(r.s * 1.3, r.s * 0.8, r.s); });

  // ---------- trees: gold ginkgo and red maple on the rim ----------
  const trees = [];
  for (const a of areas) for (let i = 0; i < a.r * 0.45; i++) { const p = pick(a, a.r - 7, a.r - 2.5, 4); if (p) trees.push({ p, s: R(0.8, 1.3), color: rng() < 0.5 ? 0xd9a441 : 0xb3202a }); }
  inst(new THREE.CylinderGeometry(0.22, 0.34, 3, 7), mat(WOOD), trees, (o, t) => { o.position.set(t.p[0], t.p[1] + 1.5 * t.s, t.p[2]); o.rotation.set(0, 0, 0); o.scale.setScalar(t.s); });
  inst(new THREE.IcosahedronGeometry(1.7, 1), mat(0xffffff, { flatShading: true }), trees, (o, t) => { o.position.set(t.p[0], t.p[1] + 3.8 * t.s, t.p[2]); o.rotation.set(0, 0, 0); o.scale.set(1.2 * t.s, 0.85 * t.s, 1.2 * t.s); });

  // ---------- festival lantern strings ----------
  const posts = [], bulbs = [];
  const lanternString = (p1, p2) => {
    const pts = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3(p1[0] + (p2[0] - p1[0]) * t, p1[1] + 4.2 - Math.sin(Math.PI * t) * 0.9, p1[2] + (p2[2] - p1[2]) * t)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: GOLD })));
    const n = Math.max(3, Math.round(Math.hypot(p2[0] - p1[0], p2[2] - p1[2]) / 1.3));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      bulbs.push({ x: p1[0] + (p2[0] - p1[0]) * t, y: p1[1] + 4.2 - Math.sin(Math.PI * t) * 0.9 - 0.45, z: p1[2] + (p2[2] - p1[2]) * t, color: k % 3 === 0 ? GOLD : RED });
    }
    for (const p of [p1, p2]) posts.push({ p });
  };
  const rimPoint = (area, deg, inset) => { const a = (deg * Math.PI) / 180, r = area.r - inset; const x = area.cx + Math.cos(a) * r, z = area.cz + Math.sin(a) * r; return [x, L.surface(x, z) ?? 0, z]; };
  if (night === 1) for (const d of [20, 110, 200, 290]) lanternString(rimPoint(areas[0], d, 3), rimPoint(areas[0], d + 16, 3));
  if (night === 2) {
    for (const [a, ds] of [[areas[0], [100, 200, 300]], [areas[1], [60, 160, 260]]]) for (const d of ds) lanternString(rimPoint(a, d, 3), rimPoint(a, d + 22, 3));
    for (const z of [-3.4, 3.4]) lanternString([27, 0, z], [43, 0, z]);
  }
  if (night === 3) for (const d of [200, 250, 300, 340, 100, 80]) lanternString(rimPoint(areas[0], d, 3), rimPoint(areas[0], d + 12, 3));
  inst(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 6), mat(WOOD), posts, (o, q) => { o.position.set(q.p[0], q.p[1] + 2.1, q.p[2]); o.rotation.set(0, 0, 0); o.scale.setScalar(1); });
  inst(new THREE.SphereGeometry(0.38, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a0508 }), bulbs, (o, b) => { o.position.set(b.x, b.y, b.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1.2, 1); });

  // ---------- red-gold gates (torii style) ----------
  const gate = (x, y, z, rotY, width = 5) => {
    const q = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.28, 0.32, 4.6, 10);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(post, mat(RED)); p.position.set(s * width / 2, 2.3, 0); q.add(p); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.3, 10), mat(0x4a3b36)); base.position.set(s * width / 2, 0.15, 0); q.add(base); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6, 0.4, 0.55), mat(RED)); beam.position.y = 4.5; q.add(beam);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 2.2, 0.22, 0.75), mat(GOLD)); cap.position.y = 4.85; q.add(cap);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 0.3), mat(GOLD)); tie.position.y = 3.8; q.add(tie);
    q.position.set(x, y, z); q.rotation.y = rotY; g.add(q);
  };
  if (night === 1) gate(0, 0, 11, 0);
  if (night === 2) { gate(25, 0, 0, Math.PI / 2, 5); gate(45, 0, 0, Math.PI / 2, 5); }
  if (night === 3) for (const a of [30, 150]) { const r = (a * Math.PI) / 180; gate(Math.cos(r) * 32.5, 0, Math.sin(r) * 32.5, -r + Math.PI / 2, 5); }

  // ---------- rabbits ----------
  const rabbits = [];
  const rabbitCount = night === 2 ? 8 : 7;
  for (let i = 0; i < rabbitCount; i++) {
    const a = areas[i % areas.length];
    const p = pick(a, 4, a.r - 4, 3);
    if (!p) continue;
    const q = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0xe8e2d0)); body.scale.set(1, 0.85, 1.35); body.position.y = 0.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), mat(0xe8e2d0)); head.position.set(0, 0.45, 0.32);
    const ear = new THREE.BoxGeometry(0.06, 0.3, 0.05);
    const e1 = new THREE.Mesh(ear, mat(0xe8e2d0)); e1.position.set(0.07, 0.72, 0.3); e1.rotation.z = -0.15;
    const e2 = e1.clone(); e2.position.x = -0.07; e2.rotation.z = 0.15;
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat(0xffffff)); tail.position.set(0, 0.35, -0.38);
    q.add(body, head, e1, e2, tail);
    g.add(q);
    rabbits.push({ q, x: p[0], z: p[2], tx: p[0], tz: p[2], area: a, wait: R(0, 3), ph: R(0, 6), speed: 1.6 });
  }

  // ---------- cranes circling the sky ----------
  const birds = [];
  for (let i = 0; i < 4; i++) {
    const q = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), mat(0xf5f1e6)); body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat(RED)); head.position.z = 0.6;
    const wing = new THREE.BoxGeometry(1.3, 0.04, 0.5);
    const w1 = new THREE.Mesh(wing, mat(0xf5f1e6)), w2 = new THREE.Mesh(wing, mat(0xf5f1e6));
    w1.position.x = 0.7; w2.position.x = -0.7;
    q.add(body, head, w1, w2); g.add(q);
    const a = areas[i % areas.length];
    birds.push({ q, w1, w2, cx: a.cx, cz: a.cz, r: R(a.r * 0.6, a.r * 1.1), h: R(14, 24), sp: R(0.12, 0.2) * (i % 2 ? 1 : -1), ph: R(0, 6) });
  }

  // ---------- floating sky lanterns (background festival) ----------
  const sky = [];
  for (let i = 0; i < 50; i++) { const a = R(0, 6.28), r = R(55, 170); sky.push({ x: areas[0].cx + (night === 2 ? 35 : 0) + Math.cos(a) * r, y: R(8, 90), z: Math.sin(a) * r, sp: R(0.5, 1.2), ph: R(0, 6), color: [0xff9a2e, 0xc8102e, 0xf2c14e, 0xff6a2a][Math.floor(R(0, 4))], s: R(1.2, 2.6) }); }
  const skyMesh = inst(new THREE.BoxGeometry(0.7, 1, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), sky, () => {});

  // ---------- animation ----------
  const nearBush = new Set();
  const spots = new Map();
  let rustleTimer = 0;
  function update(t, dt, player) {
    let rustle = false;
    // bushes: squash + sway when the character is inside
    for (let i = 0; i < bushes.length; i++) {
      const b = bushes[i];
      const near = Math.hypot(player[0] - b.p[0], player[2] - b.p[2]) < 1.1 * b.s + 0.5 && Math.abs(player[1] - b.p[1]) < 1.5;
      if (near) { b.ph += dt * 6; if (!nearBush.has(i)) { nearBush.add(i); rustle = true; } writeBush(b, i, true); }
      else if (nearBush.has(i)) { nearBush.delete(i); writeBush(b, i, false); }
    }
    bushMesh.instanceMatrix.needsUpdate = true;
    // rabbits wander, flee from the player
    for (const r of rabbits) {
      const dp = Math.hypot(player[0] - r.x, player[2] - r.z);
      r.wait -= dt;
      if (dp < 4) { const ax = r.x - player[0], az = r.z - player[2], l = Math.hypot(ax, az) || 1; r.tx = r.x + (ax / l) * 6; r.tz = r.z + (az / l) * 6; r.wait = 0; }
      else if (r.wait <= 0 && Math.hypot(r.tx - r.x, r.tz - r.z) < 0.3) { const p = pick(r.area, 2, r.area.r - 3, 2); if (p) { r.tx = p[0] + R(-3, 3); r.tz = p[2] + R(-3, 3); } r.wait = R(2, 5); }
      const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
      let moving = false;
      if (d > 0.2 && r.wait <= 0 || (dp < 4 && d > 0.2)) {
        const sp = (dp < 4 ? 4 : r.speed) * dt;
        const nx = r.x + (dx / d) * sp, nz = r.z + (dz / d) * sp;
        const s0 = L.surface(r.x, r.z), s1 = L.surface(nx, nz);
        if (s1 !== null && s0 !== null && Math.abs(s1 - s0) < 0.2 && flat(nx, nz, 0.4)) { r.x = nx; r.z = nz; moving = true; r.q.rotation.y = Math.atan2(dx, dz); }
        else { r.tx = r.x; r.tz = r.z; }
      }
      if (moving) r.ph += dt * 10;
      r.q.position.set(r.x, (L.surface(r.x, r.z) ?? 0) + (moving ? Math.abs(Math.sin(r.ph)) * 0.22 : 0), r.z);
    }
    // cranes
    for (const b of birds) {
      b.ph += dt * b.sp;
      const a = b.ph;
      b.q.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t + b.cx) * 0.8, b.cz + Math.sin(a) * b.r);
      b.q.rotation.y = -a + (b.sp > 0 ? 0 : Math.PI) + Math.PI / 2 * (b.sp > 0 ? -1 : 1);
      const f = Math.sin(t * 5 + b.cx) * 0.5;
      b.w1.rotation.z = f; b.w2.rotation.z = -f;
    }
    // sky lanterns rise and drift
    sky.forEach((s, i) => {
      s.y += s.sp * dt;
      if (s.y > 95) s.y = 8;
      tmp.position.set(s.x + Math.sin(t * 0.2 + s.ph) * 3, s.y, s.z + Math.cos(t * 0.2 + s.ph) * 3);
      tmp.rotation.set(0, s.ph, 0); tmp.scale.setScalar(s.s);
      tmp.updateMatrix(); skyMesh.setMatrixAt(i, tmp.matrix);
    });
    skyMesh.instanceMatrix.needsUpdate = true;
    rustleTimer = rustle ? 0.3 : Math.max(0, rustleTimer - dt);
    return { rustle };
  }
  return { group: g, update };
}
