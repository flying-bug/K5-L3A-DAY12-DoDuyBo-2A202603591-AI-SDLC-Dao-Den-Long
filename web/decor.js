// Purely visual scenery with Vietnamese settings: Làng quê Bắc Bộ (Night 1), Phố cổ Hội An (Night 2), Cố đô Huế (Night 3).
// Seeded and independent from Sim: nothing here collides or changes gameplay / headless output (the character walks through scenery).
import * as THREE from 'three';
import { mulberry32 } from '/src/sim.js';

const RED = 0xc8102e, GOLD = 0xf2c14e, WOOD = 0x6b4a2f, TILE = 0x7a3a2a;
const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...extra });
const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

const AREAS = {
  1: [{ cx: 0, cz: 0, r: 40 }],
  2: [{ cx: 0, cz: 0, r: 28 }, { cx: 70, cz: 0, r: 28 }],
  3: [{ cx: 0, cz: 0, r: 45 }],
};

// per-theme palettes
const ST = {
  bacbo: { tuft: [0x8aa84a, 0x6f9440, 0x9cb85a, 0x5a8038], bush: [0x3a7a4a, 0x4a8a52, 0x2f6d40, 0x56924a], bloom: [GOLD, 0xffffff], rock: [0x7a6a5a, 0x6a5a4a, 0x8a7a68],
    trees: [0x2f6d40, 0x3a7a48, 0x275a36], lantern: [RED, GOLD, 0xd9692a], animals: ['buffalo', 'duck'], sky: [0xff9a2e, 0xc8102e, 0xf2c14e] },
  hoian: { tuft: [0x8a7a5a, 0x9a8a64, 0x6f8a4a], bush: [0xe0408a, 0xc2307a, 0xf06aa8, 0x3a7a4a], bloom: [0xff8ab4, 0xffd36a], rock: [0x8a7458, 0x9a8466, 0x6a5a44],
    trees: [0x3a8a4a, 0x2f6d40, 0x4a9a52], lantern: [RED, 0xffb02e, 0xff7a2a, 0x7bb35a, 0xc040a0], animals: ['cat'], sky: [0xffb02e, 0xe0408a, 0xff7a2a] },
  hue: { tuft: [0x6b7a6a, 0x8a9a78, 0x4f5f55], bush: [0x3a6a50, 0x4a7a5a, 0x5a8a62], bloom: [GOLD, RED], rock: [0x6a6a66, 0x7a7a74, 0x58584f],
    trees: [0xd8452a, 0xe8642a, 0xf08a3a], lantern: [RED, GOLD, 0xd9692a], animals: ['rabbit'], sky: [0xff8a2e, 0xc8102e, 0xf2c14e] },
};
const STYLE_OF = { 1: ['bacbo'], 2: ['hoian', 'hoian'], 3: ['hue'] };

export function buildDecor(night, L) {
  const rng = mulberry32(1000 + night * 7919);
  const R = (a, b) => a + rng() * (b - a);
  const g = new THREE.Group();
  const areas = AREAS[night].map((a, i) => ({ ...a, st: ST[STYLE_OF[night][i]], name: STYLE_OF[night][i] }));
  const st0 = areas[0].st;
  const pick1 = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---------- placement helpers ----------
  const flat = (x, z, rad = 1) => {
    const s = L.surface(x, z);
    if (s === null) return false;
    return [[rad, 0], [-rad, 0], [0, rad], [0, -rad]].every(([dx, dz]) => L.surface(x + dx, z + dz) === s);
  };
  const clear = (x, z, lan = 3.5, mote = 1.5) => {
    if (L.lanterns.some((l) => Math.hypot(x - l[0], z - l[2]) < lan)) return false;
    if (L.moteSpawns.some((m) => Math.hypot(x - m[0], z - m[1]) < mote)) return false;
    if (L.pads.some((p) => Math.hypot(x - p.pos[0], z - p.pos[2]) < 3.5)) return false;
    if (L.charms.some((c) => Math.hypot(x - c[0], z - c[2]) < 2)) return false;
    if (L.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 2.5)) return false;
    if (Math.hypot(x - L.start[0], z - L.start[2]) < 3) return false;
    if (night === 2 && x > 23 && x < 47 && Math.abs(z) < 4.5) return false;
    return true;
  };
  const pick = (area, rmin, rmax, lan, mote) => {
    for (let k = 0; k < 30; k++) {
      const a = R(0, Math.PI * 2), r = Math.sqrt(R(rmin * rmin, rmax * rmax));
      const x = area.cx + Math.cos(a) * r, z = area.cz + Math.sin(a) * r;
      if (flat(x, z) && clear(x, z, lan, mote)) return [x, L.surface(x, z), z];
    }
    return null;
  };
  const rimAt = (area, deg, inset) => { const a = (deg * Math.PI) / 180, r = area.r - inset; const x = area.cx + Math.cos(a) * r, z = area.cz + Math.sin(a) * r; return [x, L.surface(x, z) ?? 0, z]; };
  const tmp = new THREE.Object3D();
  const inst = (geo, material, items, place, cast = false) => {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
    items.forEach((it, i) => { place(tmp, it); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); if (it.color != null) m.setColorAt(i, new THREE.Color(it.color)); });
    m.count = items.length; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const shadowAll = (o, cast = true) => o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = true; } });

  // ---------- grass / rice tufts ----------
  const tufts = [];
  for (const a of areas) for (let i = 0; i < a.r * a.r * 0.28; i++) {
    const p = pick(a, 0, a.r - 1.5, 0);
    if (p) tufts.push({ p, s: R(0.6, 1.5), rot: R(0, 6.28), tilt: R(-0.3, 0.3), color: pick1(a.st.tuft) });
  }
  inst(new THREE.ConeGeometry(0.07, 0.55, 3), lam(0xffffff), tufts, (o, t) => { o.position.set(t.p[0], t.p[1] + 0.25 * t.s, t.p[2]); o.rotation.set(t.tilt, t.rot, t.tilt * 0.6); o.scale.set(1, t.s, 1); });

  // ---------- bushes (the player can walk through them; they rustle) ----------
  const bushes = [];
  for (const a of areas) for (let i = 0; i < a.r * a.r / 30; i++) {
    const p = pick(a, 3, a.r - 2, 3.5);
    if (p) bushes.push({ p, s: R(0.55, 1.15), color: pick1(a.st.bush), ph: R(0, 6), area: a });
  }
  const bushMesh = inst(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff, { flatShading: true }), bushes, () => {}, true);
  const blooms = [];
  for (const b of bushes) for (let k = 0; k < 3; k++) {
    const a = R(0, 6.28), rr = R(0.6, 1.0) * b.s * 1.2;
    blooms.push({ x: b.p[0] + Math.cos(a) * rr, y: b.p[1] + R(0.25, 0.7) * b.s, z: b.p[2] + Math.sin(a) * rr, color: pick1(b.area.st.bloom) });
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
  for (const a of areas) for (let i = 0; i < a.r * 0.45; i++) { const p = pick(a, a.r * 0.35, a.r - 1.5, 3); if (p) rocks.push({ p, s: R(0.25, 0.75), rot: R(0, 6), color: pick1(a.st.rock) }); }
  inst(new THREE.DodecahedronGeometry(1, 0), mat(0xffffff, { flatShading: true }), rocks, (o, r) => { o.position.set(r.p[0], r.p[1] + 0.15 * r.s, r.p[2]); o.rotation.set(r.rot, r.rot * 2, 0); o.scale.set(r.s * 1.3, r.s * 0.8, r.s); }, true);

  // ---------- trees ----------
  const trees = [];
  for (const a of areas) for (let i = 0; i < a.r * 0.4; i++) { const p = pick(a, a.r - 7, a.r - 2.5, 4); if (p) trees.push({ p, s: R(0.8, 1.3), color: pick1(a.st.trees), name: a.name }); }
  const round = trees.filter((t) => t.name !== 'bacbo' || trees.indexOf(t) % 3 === 0); // Bắc Bộ: some banyan (cây đa), rest bamboo
  const bambooAt = trees.filter((t) => !round.includes(t));
  inst(new THREE.CylinderGeometry(0.22, 0.38, 3, 7), lam(WOOD), round, (o, t) => { o.position.set(t.p[0], t.p[1] + 1.5 * t.s, t.p[2]); o.rotation.set(0, 0, 0); o.scale.setScalar(t.s * (t.name === 'bacbo' ? 1.4 : 1)); }, true);
  inst(new THREE.IcosahedronGeometry(1.7, 1), mat(0xffffff, { flatShading: true }), round, (o, t) => { const k = t.name === 'bacbo' ? 1.5 : 1; o.position.set(t.p[0], t.p[1] + 3.8 * t.s * (k > 1 ? 1.1 : 1), t.p[2]); o.rotation.set(0, 0, 0); o.scale.set(1.2 * t.s * k, 0.85 * t.s * k, 1.2 * t.s * k); }, true);
  // bamboo clumps
  const stalks = [];
  for (const t of bambooAt) for (let k = 0; k < 8; k++) stalks.push({ x: t.p[0] + R(-0.9, 0.9), z: t.p[2] + R(-0.9, 0.9), y: t.p[1], h: R(5, 8.5), lean: R(-0.08, 0.08), color: [0x6a9a3a, 0x7aa84a, 0x5a8a30][k % 3] });
  inst(new THREE.CylinderGeometry(0.06, 0.08, 1, 5), lam(0xffffff), stalks, (o, s) => { o.position.set(s.x, s.y + s.h / 2, s.z); o.rotation.set(s.lean, 0, s.lean * 0.7); o.scale.set(1, s.h, 1); }, true);
  const leaves = stalks.filter((_, i) => i % 2 === 0);
  inst(new THREE.ConeGeometry(0.5, 1.4, 5), lam(0x6a9a3a), leaves, (o, s) => { o.position.set(s.x, s.y + s.h, s.z); o.rotation.set(Math.PI, 0, 0); o.scale.setScalar(1); }, true);

  // ---------- festival lantern strings ----------
  const posts = [], bulbs = [];
  const bulbColors = st0.lantern;
  const lanternString = (p1, p2, sag = 0.9, hgt = 4.2) => {
    const pts = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3(p1[0] + (p2[0] - p1[0]) * t, p1[1] + hgt - Math.sin(Math.PI * t) * sag, p1[2] + (p2[2] - p1[2]) * t)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: GOLD })));
    const n = Math.max(3, Math.round(Math.hypot(p2[0] - p1[0], p2[2] - p1[2]) / 1.3));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      bulbs.push({ x: p1[0] + (p2[0] - p1[0]) * t, y: p1[1] + hgt - Math.sin(Math.PI * t) * sag - 0.45, z: p1[2] + (p2[2] - p1[2]) * t, color: bulbColors[k % bulbColors.length] });
    }
    for (const p of [p1, p2]) posts.push({ p });
  };
  if (night === 1) for (const d of [20, 110, 200, 290]) lanternString(rimAt(areas[0], d, 3), rimAt(areas[0], d + 16, 3));
  if (night === 2) for (const [a, ds] of [[areas[0], [100, 200, 300]], [areas[1], [60, 160, 260]]]) for (const d of ds) lanternString(rimAt(a, d, 3), rimAt(a, d + 22, 3));
  if (night === 3) for (const d of [200, 250, 300, 340, 100, 80]) lanternString(rimAt(areas[0], d, 3), rimAt(areas[0], d + 12, 3));
  inst(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 6), lam(WOOD), posts, (o, q) => { o.position.set(q.p[0], q.p[1] + 2.1, q.p[2]); o.rotation.set(0, 0, 0); o.scale.setScalar(1); }, true);

  // ---------- buildings ----------
  const roofPyramid = (w, d, h, color) => { const r = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.5, h, 4), mat(color, { flatShading: true })); r.rotation.y = Math.PI / 4; r.scale.set(w / Math.hypot(w, d) * 1.5, 1, d / Math.hypot(w, d) * 1.5); return r; };
  const house = (kind) => {
    const q = new THREE.Group();
    if (kind === 'bacbo') { // nhà ngói: earthen walls, hip tile roof, wooden door
      const w = 4.2, d = 3.2, h = 2.4;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0xb89a68)); body.position.y = h / 2;
      const roof = roofPyramid(w, d, 1.6, 0x8a4a32); roof.position.y = h + 0.8;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.7, 0.1), mat(WOOD)); door.position.set(0, 0.85, d / 2 + 0.03);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: RED })); lamp.position.set(1.4, 2.0, d / 2 + 0.2);
      q.add(body, roof, door, lamp);
    } else if (kind === 'hoian') { // two-storey yellow shophouse with wooden shutters and silk lanterns
      const w = 4.6, d = 3.4;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), mat(0xe0b040)); body.position.y = 2.1;
      const roof = roofPyramid(w, d, 1.5, TILE); roof.position.y = 4.2 + 0.75;
      const floor2 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.2, d + 0.5), mat(WOOD)); floor2.position.y = 2.2;
      q.add(body, roof, floor2);
      for (const x of [-1.5, 0, 1.5]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.08), mat(0x3a7a4a)); sh.position.set(x, 3.2, d / 2 + 0.05); q.add(sh); }
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.9, 0.1), mat(0x5a3a22)); door.position.set(0, 0.95, d / 2 + 0.05); q.add(door);
      [RED, 0xffb02e, 0xff7a2a].forEach((c, i) => { const lp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: c })); lp.scale.y = 1.2; lp.position.set(-1.6 + i * 1.6, 2.0, d / 2 + 0.5); q.add(lp); });
    } else { // Huế: low imperial wall segment, red with gold tile cap
      const w = 5, d = 0.8;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), mat(0x9a2a22)); wall.position.y = 1.1;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.5), mat(0xd9a441)); cap.position.y = 2.35;
      q.add(wall, cap);
    }
    shadowAll(q);
    return q;
  };
  const placeBuilding = (area, deg, inset, kind, clearance = 5) => {
    for (let k = 0; k < 8; k++) {
      const p = rimAt(area, deg + k * 6 * (k % 2 ? 1 : -1), inset);
      if (!flat(p[0], p[2], 2) || !clear(p[0], p[2], clearance, 3.2)) continue;
      const q = house(kind); q.position.set(p[0], p[1], p[2]); q.rotation.y = Math.atan2(-(p[0] - area.cx), -(p[2] - area.cz)); g.add(q); return;
    }
  };
  if (night === 1) for (const d of [60, 150, 235, 330]) placeBuilding(areas[0], d, 6, 'bacbo');
  if (night === 2) for (const a of areas) for (const d of [30, 130, 230, 330]) placeBuilding(a, d, 5, 'hoian');
  if (night === 3) for (let d = 195; d <= 345; d += 18) placeBuilding(areas[0], d, 3, 'hue', 3);

  // ---------- gates ----------
  const gateBase = (width, color, h = 4.6) => {
    const q = new THREE.Group();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), mat(color)); p.position.set(s * width / 2, h / 2, 0); q.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.55, 0.9), mat(color)); beam.position.y = h; q.add(beam);
    return q;
  };
  const roofOver = (q, width, y, color, tiers = 1) => {
    for (let i = 0; i < tiers; i++) for (const s of [-1, 1]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6 - i * 0.8, 0.18, 1.5), mat(color)); sl.position.set(0, y + i * 0.9 + 0.35, s * 0.45); sl.rotation.x = s * -0.5; q.add(sl); }
  };
  const gate = (x, y, z, rotY, kind) => {
    let q;
    if (kind === 'lang') { q = gateBase(5, 0x8a4a3a); roofOver(q, 5, 4.7, 0x6a3a2a); const pl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.1), mat(GOLD)); pl.position.set(0, 3.9, 0.5); q.add(pl); } // cổng làng
    if (kind === 'hoian') { q = gateBase(5, 0xe0b040); roofOver(q, 5, 4.7, TILE); for (const s of [-1, 0, 1]) { const lp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: RED })); lp.scale.y = 1.2; lp.position.set(s * 1.7, 3.6, 0.2); q.add(lp); } } // cổng chào
    if (kind === 'hue') { q = gateBase(5, RED, 4.2); roofOver(q, 5, 4.4, 0xd9a441, 2); const pl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), mat(GOLD)); pl.position.set(0, 3.5, 0.5); q.add(pl); } // Ngọ Môn
    shadowAll(q);
    q.position.set(x, y, z); q.rotation.y = rotY; g.add(q);
  };
  if (night === 1) gate(0, 0, 11, 0, 'lang');
  if (night === 2) { gate(25, 0, 0, Math.PI / 2, 'hoian'); gate(45, 0, 0, Math.PI / 2, 'hoian'); }
  if (night === 3) for (const a of [30, 150]) { const r = (a * Math.PI) / 180; gate(Math.cos(r) * 32.5, 0, Math.sin(r) * 32.5, -r + Math.PI / 2, 'hue'); }

  // ---------- Hội An covered bridge (cầu mái che): purely decorative roof above the walkway ----------
  if (night === 2) {
    const roofY = 3.6, br = new THREE.Group();
    for (const x of [27, 31, 35, 39, 43]) for (const z of [-2.6, 2.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, roofY, 0.3), mat(0x7a2a22)); p.position.set(x, roofY / 2, z); br.add(p); }
    for (const s of [-1, 1]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.18, 3.6), mat(TILE)); sl.position.set(35, roofY + 0.6, s * 1.45); sl.rotation.x = s * -0.38; br.add(sl); }
    for (const z of [-2.6, 2.6]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(17, 0.12, 0.12), mat(0x7a2a22)); rail.position.set(35, 1.0, z); br.add(rail); }
    for (let x = 28; x <= 42; x += 2) { const lp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: bulbColors[(x / 2) % bulbColors.length | 0] })); lp.scale.y = 1.2; lp.position.set(x, roofY - 0.5, 0); br.add(lp); }
    shadowAll(br); g.add(br);
  }
  inst(new THREE.SphereGeometry(0.38, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a0508 }), bulbs, (o, b) => { o.position.set(b.x, b.y, b.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1.2, 1); });

  // ---------- animals ----------
  const animal = (kind) => {
    const q = new THREE.Group();
    const part = (geo, c, x, y, z, s = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.set(...s); q.add(m); return m; };
    if (kind === 'buffalo') {
      part(new THREE.BoxGeometry(0.9, 0.85, 1.7), 0x4a4a4c, 0, 0.95, 0);
      part(new THREE.BoxGeometry(0.55, 0.55, 0.7), 0x3e3e40, 0, 1.15, 1.05);
      part(new THREE.ConeGeometry(0.07, 0.6, 5), 0xd8d2c0, 0.35, 1.5, 1.05, [1, 1, 1]).rotation.z = -1.1;
      part(new THREE.ConeGeometry(0.07, 0.6, 5), 0xd8d2c0, -0.35, 1.5, 1.05, [1, 1, 1]).rotation.z = 1.1;
      for (const [x, z] of [[0.3, 0.6], [-0.3, 0.6], [0.3, -0.6], [-0.3, -0.6]]) part(new THREE.CylinderGeometry(0.11, 0.1, 0.8, 6), 0x3a3a3c, x, 0.4, z);
    } else if (kind === 'duck') {
      part(new THREE.SphereGeometry(0.22, 8, 8), 0xf5f1e6, 0, 0.28, 0, [1, 0.85, 1.4]);
      part(new THREE.SphereGeometry(0.12, 8, 8), 0xf5f1e6, 0, 0.5, 0.26);
      part(new THREE.ConeGeometry(0.05, 0.14, 5), 0xf2a22e, 0, 0.48, 0.4).rotation.x = Math.PI / 2;
    } else if (kind === 'cat') {
      part(new THREE.SphereGeometry(0.2, 8, 8), 0xe0a040, 0, 0.26, 0, [1, 0.9, 1.6]);
      part(new THREE.SphereGeometry(0.14, 8, 8), 0xe0a040, 0, 0.42, 0.3);
      part(new THREE.ConeGeometry(0.05, 0.12, 4), 0xe0a040, 0.07, 0.58, 0.3); part(new THREE.ConeGeometry(0.05, 0.12, 4), 0xe0a040, -0.07, 0.58, 0.3);
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5), 0xe0a040, 0, 0.4, -0.38).rotation.x = -0.9;
    } else { // thỏ ngọc (Mid-Autumn rabbit)
      part(new THREE.SphereGeometry(0.28, 10, 8), 0xe8e2d0, 0, 0.3, 0, [1, 0.85, 1.35]);
      part(new THREE.SphereGeometry(0.17, 8, 8), 0xe8e2d0, 0, 0.45, 0.32);
      part(new THREE.BoxGeometry(0.06, 0.3, 0.05), 0xe8e2d0, 0.07, 0.72, 0.3).rotation.z = -0.15;
      part(new THREE.BoxGeometry(0.06, 0.3, 0.05), 0xe8e2d0, -0.07, 0.72, 0.3).rotation.z = 0.15;
      part(new THREE.SphereGeometry(0.09, 6, 6), 0xffffff, 0, 0.35, -0.38);
    }
    shadowAll(q);
    return q;
  };
  const SPEED = { buffalo: 0.7, duck: 1.0, cat: 1.4, rabbit: 1.6 };
  const HOP = { buffalo: 0.02, duck: 0.05, cat: 0.06, rabbit: 0.22 };
  const critters = [];
  const makeCritters = (kind, count) => {
    for (let i = 0; i < count; i++) {
      const a = areas[i % areas.length];
      const p = pick(a, 4, a.r - 4, 3);
      if (!p) continue;
      const q = animal(kind); g.add(q);
      critters.push({ kind, q, x: p[0], z: p[2], tx: p[0], tz: p[2], area: a, wait: R(0, 3), ph: R(0, 6), speed: SPEED[kind] });
    }
  };
  for (const k of st0.animals) makeCritters(k, k === 'duck' ? 5 : k === 'buffalo' ? 2 : night === 2 ? 6 : 5);

  // ---------- cranes (hạc) circling the sky ----------
  const birds = [];
  for (let i = 0; i < 4; i++) {
    const q = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), lam(0xf5f1e6)); body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), lam(RED)); head.position.z = 0.6;
    const wing = new THREE.BoxGeometry(1.3, 0.04, 0.5);
    const w1 = new THREE.Mesh(wing, lam(0xf5f1e6)), w2 = new THREE.Mesh(wing, lam(0xf5f1e6));
    w1.position.x = 0.7; w2.position.x = -0.7;
    q.add(body, head, w1, w2); g.add(q);
    const a = areas[i % areas.length];
    birds.push({ q, w1, w2, cx: a.cx, cz: a.cz, r: R(a.r * 0.6, a.r * 1.1), h: R(14, 24), sp: R(0.12, 0.2) * (i % 2 ? 1 : -1), ph: R(0, 6) });
  }

  // ---------- floating sky lanterns (background festival) ----------
  const sky = [];
  for (let i = 0; i < 50; i++) { const a = R(0, 6.28), r = R(55, 170); sky.push({ x: areas[0].cx + (night === 2 ? 35 : 0) + Math.cos(a) * r, y: R(8, 90), z: Math.sin(a) * r, sp: R(0.5, 1.2), ph: R(0, 6), color: pick1(st0.sky), s: R(1.2, 2.6) }); }
  const skyMesh = inst(new THREE.BoxGeometry(0.7, 1, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), sky, () => {});

  // ---------- animation ----------
  const nearBush = new Set();
  function update(t, dt, player) {
    let rustle = false;
    for (let i = 0; i < bushes.length; i++) {
      const b = bushes[i];
      const near = Math.hypot(player[0] - b.p[0], player[2] - b.p[2]) < 1.1 * b.s + 0.5 && Math.abs(player[1] - b.p[1]) < 1.5;
      if (near) { b.ph += dt * 6; if (!nearBush.has(i)) { nearBush.add(i); rustle = true; } writeBush(b, i, true); }
      else if (nearBush.has(i)) { nearBush.delete(i); writeBush(b, i, false); }
    }
    bushMesh.instanceMatrix.needsUpdate = true;
    for (const r of critters) {
      const dp = Math.hypot(player[0] - r.x, player[2] - r.z);
      const flee = dp < 4 && r.kind !== 'buffalo';
      r.wait -= dt;
      if (flee) { const ax = r.x - player[0], az = r.z - player[2], l = Math.hypot(ax, az) || 1; r.tx = r.x + (ax / l) * 6; r.tz = r.z + (az / l) * 6; r.wait = 0; }
      else if (r.wait <= 0 && Math.hypot(r.tx - r.x, r.tz - r.z) < 0.3) { const p = pick(r.area, 2, r.area.r - 3, 2); if (p) { r.tx = p[0] + R(-3, 3); r.tz = p[2] + R(-3, 3); } r.wait = R(2, 6); }
      const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
      let moving = false;
      if (d > 0.2 && (r.wait <= 0 || flee)) {
        const sp = (flee ? r.speed * 2.5 : r.speed) * dt;
        const nx = r.x + (dx / d) * sp, nz = r.z + (dz / d) * sp;
        const s0 = L.surface(r.x, r.z), s1 = L.surface(nx, nz);
        if (s1 !== null && s0 !== null && Math.abs(s1 - s0) < 0.2 && flat(nx, nz, 0.4)) { r.x = nx; r.z = nz; moving = true; r.q.rotation.y = Math.atan2(dx, dz); }
        else { r.tx = r.x; r.tz = r.z; }
      }
      if (moving) r.ph += dt * (r.kind === 'rabbit' ? 10 : 6);
      r.q.position.set(r.x, (L.surface(r.x, r.z) ?? 0) + (moving ? Math.abs(Math.sin(r.ph)) * HOP[r.kind] : 0), r.z);
    }
    for (const b of birds) {
      b.ph += dt * b.sp;
      const a = b.ph;
      b.q.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t + b.cx) * 0.8, b.cz + Math.sin(a) * b.r);
      b.q.rotation.y = -a + (b.sp > 0 ? 0 : Math.PI) + Math.PI / 2 * (b.sp > 0 ? -1 : 1);
      const f = Math.sin(t * 5 + b.cx) * 0.5;
      b.w1.rotation.z = f; b.w2.rotation.z = -f;
    }
    sky.forEach((s, i) => {
      s.y += s.sp * dt;
      if (s.y > 95) s.y = 8;
      tmp.position.set(s.x + Math.sin(t * 0.2 + s.ph) * 3, s.y, s.z + Math.cos(t * 0.2 + s.ph) * 3);
      tmp.rotation.set(0, s.ph, 0); tmp.scale.setScalar(s.s);
      tmp.updateMatrix(); skyMesh.setMatrixAt(i, tmp.matrix);
    });
    skyMesh.instanceMatrix.needsUpdate = true;
    return { rustle };
  }
  return { group: g, update };
}
