// Per-night visual themes (view only; nothing here touches the sim). Vietnamese settings:
//   Night 1 = Làng quê Bắc Bộ (keeps the ticket's standard palette: grass #2F5D50, sky #0E1430, fog #1B2350)
//   Night 2 = Phố cổ Hội An (two river banks joined by a covered bridge), Night 3 = Cố đô Huế (imperial terraces + pagoda).
// Nights 2 and 3 deliberately depart from the standard ground/sky colours on request.
import * as THREE from 'three';

const hash = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const speckle = (x, n, size, colors, minS, maxS, alpha = 0.5) => {
  x.globalAlpha = alpha;
  for (let i = 0; i < n; i++) { x.fillStyle = colors[Math.floor(rnd() * colors.length)]; x.fillRect(rnd() * size, rnd() * size, minS + rnd() * (maxS - minS), minS + rnd() * (maxS - minS)); }
  x.globalAlpha = 1;
};

// ---------- ground textures ----------
const TEX = {};
function groundTex(style) {
  if (TEX[style]) return TEX[style];
  let map;
  if (style === 'grass') map = canvasTex(256, (x, s) => { // Bắc Bộ: grass and rice-field earth
    x.fillStyle = '#2F5D50'; x.fillRect(0, 0, s, s);
    speckle(x, 1500, s, ['#27503f', '#3d7a58', '#4f8a5c', '#244a3a'], 2, 6, 0.55);
    x.strokeStyle = '#5b9a64'; x.globalAlpha = 0.4;
    for (let i = 0; i < 500; i++) { const px = rnd() * s, py = rnd() * s; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 3, py - 3 - rnd() * 4); x.stroke(); }
    x.globalAlpha = 1; speckle(x, 90, s, ['#C9B48A', '#d8c8a0'], 2, 4, 0.7);
  });
  if (style === 'cobble') map = canvasTex(256, (x, s) => { // Hội An: old brick / cobble street
    x.fillStyle = '#7a6244'; x.fillRect(0, 0, s, s);
    const n = 8, w = s / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const off = (r % 2) * w / 2, shade = 0.85 + rnd() * 0.3;
      x.fillStyle = `rgb(${Math.round(150 * shade)},${Math.round(118 * shade)},${Math.round(80 * shade)})`;
      x.fillRect(c * w + off + 1.5, r * w + 1.5, w - 3, w - 3);
    }
    speckle(x, 500, s, ['#a88a5a', '#5a4630', '#8a7048'], 1, 4, 0.4);
    speckle(x, 60, s, ['#5b7a4a'], 2, 6, 0.5);
  });
  if (style === 'temple') map = canvasTex(256, (x, s) => { // Huế: imperial stone slabs with moss
    x.fillStyle = '#6a6a66'; x.fillRect(0, 0, s, s);
    speckle(x, 900, s, ['#7a7a74', '#5a5a56', '#86867e'], 3, 10, 0.4);
    x.strokeStyle = 'rgba(30,30,28,0.7)'; x.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 64); x.lineTo(s, i * 64); x.stroke(); x.beginPath(); x.moveTo(i * 64 + ((i % 2) * 32), 0); x.lineTo(i * 64 + ((i % 2) * 32), s); x.stroke(); }
    speckle(x, 90, s, ['#5b7a4a', '#6a8a54'], 3, 9, 0.5); speckle(x, 30, s, ['#f2c14e'], 1, 2, 0.8);
  });
  TEX[style] = map;
  return map;
}
const SIDE = { grass: 0x6b4a3a, cobble: 0x6a4a30, temple: 0x57564f };
export function groundMaterial(style, repeat = 8) {
  const map = groundTex(style).clone(); map.needsUpdate = true; map.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
}
export const sideMaterial = (style) => new THREE.MeshStandardMaterial({ color: SIDE[style], roughness: 0.95, flatShading: true });

/** A floating island: textured top at y=0 (the sim's ground), jagged underside, themed rim. */
export function makeIsland(style, cx, cz, r) {
  const g = new THREE.Group();
  const side = sideMaterial(style);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 56), [side, groundMaterial(style, Math.max(4, r / (style === 'cobble' ? 4 : 5))), side]);
  top.position.set(cx, -0.3, cz); top.receiveShadow = true; top.castShadow = true; g.add(top);
  const rimColor = { grass: 0xb89a68, cobble: 0xc9a86a, temple: 0x9a9a92 }[style];
  const beach = new THREE.Mesh(new THREE.RingGeometry(r - 1.0, r - 0.05, 56), new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.9 }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(cx, 0.012, cz); beach.receiveShadow = true; g.add(beach);
  const geo = new THREE.CylinderGeometry(r, r * 0.18, 16, 28, 5, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 7.9) continue;
    const j = (hash(Math.round(x * 2), Math.round(y), Math.round(z * 2)) - 0.5) * 3.4;
    pos.setXYZ(i, x + j * (x / r), y + j * 0.4, z + j * (z / r));
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, side); rock.position.set(cx, -8.6, cz); g.add(rock);
  const fringeColor = { grass: 0xc8102e, cobble: 0xf2c14e, temple: 0xc8102e }[style];
  const fringe = new THREE.Mesh(new THREE.TorusGeometry(r - 0.1, 0.14, 6, 64), new THREE.MeshBasicMaterial({ color: fringeColor, fog: false }));
  fringe.rotation.x = Math.PI / 2; fringe.position.set(cx, -0.55, cz); g.add(fringe);
  return g;
}

// ---------- themes ----------
export const THEMES = {
  1: { name: 'bacbo', styles: ['grass'], lamp: 'oil', top: 0x0e1430, horizon: 0x1b2350, fog: 0x1b2350, fogNear: 30, fogFar: 130, moonCol: 0x9fb2e8, moonI: 1.0, hemiSky: 0x6f80c8, hemiGround: 0x2f5d50, hemiI: 0.55, moonDisc: 0xdfe8ff, sea: 'solid', seaColor: 0x12384a, mist: [0x3a5a78], particles: ['leaf'] },
  2: { name: 'hoian', styles: ['cobble', 'cobble'], lamp: 'silk', top: 0x0a1230, horizon: 0x4a3050, fog: 0x2a2a52, fogNear: 30, fogFar: 140, moonCol: 0xffe2b0, moonI: 0.9, hemiSky: 0x8a88c8, hemiGround: 0x7a6244, hemiI: 0.6, moonDisc: 0xfff0d0, sea: 'river', water: 0x0f3a48, mist: [0xd8a878], particles: ['giay'] },
  3: { name: 'hue', styles: ['temple'], lamp: 'palace', top: 0x1a0d33, horizon: 0x6a2f4a, fog: 0x35204f, fogNear: 30, fogFar: 150, moonCol: 0xffd9b0, moonI: 0.95, hemiSky: 0xb48ad8, hemiGround: 0x6a6a66, hemiI: 0.6, moonDisc: 0xffe9c8, sea: 'solid', seaColor: 0x241a4a, mist: [0xd89ac8], particles: ['phuong'] },
};

export function makeSky(theme) {
  const geo = new THREE.SphereGeometry(420, 32, 18);
  const top = new THREE.Color(theme.top), hor = new THREE.Color(theme.horizon), c = new THREE.Color();
  const cols = [];
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / 420 + 0.08));
    c.copy(hor).lerp(top, Math.pow(t, 0.55)); cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(20, 32), new THREE.MeshBasicMaterial({ color: theme.moonDisc, fog: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,255,255,0.55)'], [0.4, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]), color: theme.moonDisc, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(160);
  const moon = new THREE.Group(); moon.add(disc, halo);
  moon.position.set(-150, 190, 270); moon.lookAt(0, 0, 0);
  sky.add(moon);
  const sp = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) { const a = rnd() * Math.PI * 2, e = 0.12 + rnd() * 1.3, r = 400; sp[i * 3] = r * Math.cos(a) * Math.cos(e); sp[i * 3 + 1] = r * Math.sin(e); sp[i * 3 + 2] = r * Math.sin(a) * Math.cos(e); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xf5f1e6, size: 1.6, fog: false, sizeAttenuation: false })));
  return sky;
}
function radial(stops) {
  return canvasTex(128, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); for (const [t, c] of stops) g.addColorStop(t, c); x.fillStyle = g; x.fillRect(0, 0, s, s); });
}

/** Sea under the islands: coloured floor, drifting mist, and for Hội An a river with floating lotus lanterns (hoa đăng). */
export function makeSea(theme, centerX) {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: theme.sea === 'river' ? 0x07202a : theme.seaColor, fog: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(centerX, -20, 0); g.add(floor);
  const upd = [];
  if (theme.sea === 'river') {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: theme.water, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.93 }));
    water.rotation.x = -Math.PI / 2; water.position.set(centerX, -2.4, 0); water.receiveShadow = true; g.add(water);
    // hoa đăng: little lotus lanterns drifting down the river
    const n = 70, geo = new THREE.ConeGeometry(0.38, 0.35, 8, 1, true);
    const glow = new THREE.MeshBasicMaterial({ color: 0xffa23a, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, glow, n); mesh.frustumCulled = false;
    const halo = new THREE.InstancedMesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,170,70,0.8)'], [1, 'rgba(255,170,70,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), n); halo.frustumCulled = false;
    const items = Array.from({ length: n }, () => ({ x: centerX + (rnd() - 0.5) * 300, z: (rnd() - 0.5) * 300, sp: 0.6 + rnd() * 0.8, ph: rnd() * 6 }));
    const o = new THREE.Object3D();
    g.add(mesh, halo);
    upd.push((t) => {
      items.forEach((it, i) => {
        const x = centerX + ((it.x - centerX + it.sp * t * 0.9 + 150) % 300) - 150;
        o.position.set(x, -2.25 + Math.sin(t * 2 + it.ph) * 0.04, it.z + Math.sin(t * 0.3 + it.ph) * 2); o.rotation.set(0, it.ph, 0); o.scale.setScalar(1); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
        o.rotation.set(-Math.PI / 2, 0, 0); o.position.y = -2.3; o.updateMatrix(); halo.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = halo.instanceMatrix.needsUpdate = true;
    });
  }
  const cloud = canvasTex(256, (x, s) => {
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) { const px = rnd() * s, py = rnd() * s, r = 14 + rnd() * 34; const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(px - r, py - r, r * 2, r * 2); }
  });
  const layers = [];
  for (let k = 0; k < 3; k++) {
    const t = cloud.clone(); t.needsUpdate = true; t.repeat.set(5, 5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshBasicMaterial({ map: t, color: theme.mist[0], transparent: true, opacity: theme.sea === 'river' ? 0.1 + 0.03 * k : 0.2 + 0.05 * k, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(centerX, (theme.sea === 'river' ? -1.5 : -6) - k * 3.5, 0); g.add(m); layers.push({ t, sp: 0.004 + k * 0.003, dir: k % 2 ? 1 : -1 });
  }
  g.userData.update = (time) => { for (const l of layers) { l.t.offset.x = time * l.sp * l.dir; l.t.offset.y = time * l.sp * 0.5; } for (const u of upd) u(time); };
  return g;
}

/** Light shaft marking a jump pad (the only way up in Night 3). */
export function makeBeam(pos) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 9, 20, 1, true), m); beam.position.y = 4.5;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: false })); ring.rotation.x = Math.PI / 2;
  g.add(beam, ring); g.position.set(pos[0], pos[1], pos[2]);
  g.userData.update = (t) => { m.opacity = 0.16 + 0.1 * Math.sin(t * 3); const k = (t * 1.2) % 3.5; ring.position.y = 0.25 + k; ring.scale.setScalar(1 - k / 5); };
  return g;
}

/** Ambient particles around the player: bamboo leaves (Bắc Bộ), bougainvillea petals (Hội An), flame-tree petals (Huế). */
export function makeParticles(kind, n = 220) {
  const arr = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { arr[i * 3] = (rnd() - 0.5) * 70; arr[i * 3 + 1] = rnd() * 20; arr[i * 3 + 2] = (rnd() - 0.5) * 70; ph[i] = rnd() * 6.28; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const cfg = { leaf: [0xa8c060, 0.26], giay: [0xe0408a, 0.28], phuong: [0xe8452a, 0.28] }[kind];
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: cfg[0], size: cfg[1], transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  pts.frustumCulled = false;
  const local = new Float32Array(arr);
  pts.userData.update = (t, dt, p) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      local[j + 1] -= 0.9 * dt;
      if (local[j + 1] < 0) local[j + 1] += 20;
      const sw = Math.sin(t * 0.8 + ph[i]) * 1.2;
      a[j] = p[0] + ((local[j] + sw + 35 + 7000) % 70) - 35;
      a[j + 1] = p[1] - 2 + local[j + 1];
      a[j + 2] = p[2] + ((local[j + 2] + Math.cos(t * 0.7 + ph[i]) * sw + 35 + 7000) % 70) - 35;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

/** Paper/silk lantern body texture: ribs. */
export const paperTex = () => canvasTex(128, (x, s) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(60,40,20,0.55)'; x.lineWidth = 3;
  for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 16 + 8, 0); x.lineTo(i * 16 + 8, s); x.stroke(); }
  x.lineWidth = 2; for (const y of [24, 64, 104]) { x.beginPath(); x.moveTo(0, y); x.lineTo(s, y); x.stroke(); }
});
