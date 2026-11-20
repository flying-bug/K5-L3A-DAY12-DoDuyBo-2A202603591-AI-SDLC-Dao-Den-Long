import * as THREE from 'three';
import { Sim } from '/src/sim.js';
import { TUNING as T, WORLD as W } from '/src/config.js';
import { NIGHTS } from '/src/levels.js';
import * as audio from '/web/audio.js';
import { ACTIONS, DEFAULT_KEYS, keyLabel, rebind, loadKeys } from '/src/keybinds.js';
import { validName, loadEntries, addEntry } from '/src/leaderboard.js';
import { benchScenario, benchCamera, benchStats, BENCH_WARMUP_S } from '/src/bench.js';
import { buildDecor } from '/web/decor.js';
import { THEMES, makeIsland, makeSky, makeSea, makeBeam, makeParticles, groundMaterial, sideMaterial, paperTex } from '/web/themes.js';
const FUEL_SCALE = 60; // sim stores fuel in 1/60 units

// ---------- palette (Ticket-02) ----------
const C = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lamp: 0xffb347, core: 0xffe9b0, off: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shade: 0x120a1a, outline: 0x7a3cff, stun: 0x3a3450, shirt: 0xe8e2d0, scarf: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8,
};
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------- settings (persisted) ----------
const BENCH = params.has('bench'); // Ticket-04 benchmark scene (see scripts/bench.mjs)
const settings = { volume: 0.7, sens: 0.4, cb: false, shadows: true, reduceMotion: false, bigText: false, keys: null };
// Colour-blind palette (Ticket-03): shade outline/eyes #7A3CFF -> #00B3FF, UI warning #FF5A5F -> #FFFFFF (+ warning icon)
const pal = { danger: '#FF5A5F', outline: 0x7a3cff, eye: 0xf5f1e6, icon: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('ddl.settings') || '{}')); } catch { /* ignore */ }
let binds = loadKeys(settings.keys);
if (BENCH) Object.assign(settings, { shadows: true, reduceMotion: true, volume: 0 });
if (BENCH && params.has('noshadow')) settings.shadows = false; // experiment switch (not used for the official numbers)
const saveSettings = () => { settings.keys = binds; try { localStorage.setItem('ddl.settings', JSON.stringify(settings)); } catch { /* ignore */ } };
const applyUiScale = () => document.documentElement.style.setProperty('--u', settings.bigText ? '1.25' : '1');
applyUiScale();
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
audio.setVolume(settings.volume);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let pixelRatio = BENCH ? 1 : Math.min(devicePixelRatio, 1.5); // lowered automatically if FPS < 30 (never in the benchmark)
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // refreshed in render() only when needed
let shadowFrame = 0; const shadowLast = [1e9, 1e9, 1e9];
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.Fog(C.fog, 30, 120);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
const moon = new THREE.DirectionalLight(0x9fb2e8, 1.0);
moon.position.set(-30, 60, 20);
moon.castShadow = settings.shadows;
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 160 });
moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.04;
const hemi = new THREE.HemisphereLight(0x6f80c8, 0x2f5d50, 0.55); // soft night fill, keeps the ticket's ambient formula intact
scene.add(ambient, moon, moon.target, hemi);
let skyDome = null, seaGroup = null, beams = [], particleSets = [];
function applyTheme(n) {
  const th = THEMES[n];
  scene.background = new THREE.Color(th.horizon);
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  moon.color.setHex(th.moonCol); moon.intensity = th.moonI;
  hemi.color.setHex(th.hemiSky); hemi.groundColor.setHex(th.hemiGround); hemi.intensity = th.hemiI;
  return th;
}

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

function radialTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [t, col] of stops) g.addColorStop(t, col);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const glowTex = radialTex([[0, 'rgba(255,190,100,0.75)'], [0.35, 'rgba(255,170,70,0.35)'], [1, 'rgba(255,170,70,0)']]);
const shadowTex = radialTex([[0, 'rgba(0,0,0,0.45)'], [0.6, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]);

// ---------- level geometry ----------
let levelGroup = null, decor = null, themeNow = THEMES[1];
function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  scene.remove(g);
}
const cyl = (r, h, color, x, y, z, seg = 48) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color)); m.position.set(x, y, z); return m; };
function padMesh(p) {
  const g = new THREE.Group();
  g.add(cyl(p.r, 0.2, C.scarf, 0, 0, 0, 24), cyl(p.r * 0.7, 0.25, C.gold, 0, 0.02, 0, 24));
  g.position.set(p.pos[0], p.pos[1] + 0.1, p.pos[2]);
  return g;
}
function buildLevel(n, opts = {}) {
  if (levelGroup) disposeGroup(levelGroup);
  const L = NIGHTS[n];
  const th = applyTheme(n);
  themeNow = th;
  const g = new THREE.Group();
  skyDome = makeSky(th); g.add(skyDome);
  seaGroup = makeSea(th, n === 2 ? 35 : 0); g.add(seaGroup);
  const AREAS = { 1: [[0, 0, 40]], 2: [[0, 0, 28], [70, 0, 28]], 3: [[0, 0, 45]] }[n];
  AREAS.forEach(([cx, cz, r], i) => g.add(makeIsland(th.styles[i], cx, cz, r)));
  if (n === 2) {
    // wooden walkway of the Hội An covered bridge (the roof is decor.js)
    const br = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 4), new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.9 })); br.position.set(35, -0.2, 0); br.receiveShadow = true; g.add(br);
    for (let x = 27; x <= 43; x += 1) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 4.1), mat(0x4a3220)); pl.position.set(x, 0.02, 0); g.add(pl); }
  }
  if (n === 3) {
    const topM = groundMaterial('temple', 6), sideM = new THREE.MeshStandardMaterial({ color: 0xa8a69a, roughness: 0.9, emissive: 0x1c1a16, flatShading: true }); // lighter terrace walls
    // tier 1: half annulus r 12..24 on z>0, height 3 (extruded along +Y)
    const sh = new THREE.Shape();
    const pts = 24;
    for (let i = 0; i <= pts; i++) { const a = (i / pts) * Math.PI; const x = 24 * Math.cos(a), y = -24 * Math.sin(a); if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); }
    for (let i = pts; i >= 0; i--) { const a = (i / pts) * Math.PI; sh.lineTo(12 * Math.cos(a), -12 * Math.sin(a)); }
    const t1 = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }), [topM, sideM]);
    t1.rotation.x = -Math.PI / 2; t1.castShadow = t1.receiveShadow = true;
    g.add(t1);
    { const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 36), [sideM, groundMaterial('temple', 3), sideM]); t2.position.set(0, 3, 0); t2.castShadow = t2.receiveShadow = true; g.add(t2); }
    // stone ramps (visual guide: gold rails + lanterns mark the way up)
    for (const a of [30, 150]) {
      const ph = (a * Math.PI) / 180;
      const holder = new THREE.Group();
      holder.rotation.y = -ph;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.3, 3), new THREE.MeshStandardMaterial({ color: 0x9a9a90, roughness: 0.9 }));
      slab.rotation.z = -Math.atan(0.5);
      slab.position.set(27, 1.5 - 0.17, 0); slab.castShadow = slab.receiveShadow = true;
      holder.add(slab);
      for (const z of [-1.6, 1.6]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.12, 0.12), basic(C.gold)); rail.rotation.z = -Math.atan(0.5); rail.position.set(27, 1.5 + 0.55, z); holder.add(rail); }
      g.add(holder);
    }
    // pagoda (tháp chùa Thiên Mụ style): 7 octagonal tiers on tier 2, height 8 like the solid tower
    for (let i = 0; i < 7; i++) {
      const rb = 2 - 0.14 * i, y = 6 + i * 1.14;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, 0.72, 8), new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 })); body.position.y = y + 0.36;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(rb + 0.55, 0.42, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8a4a32 : 0x7a3a2a, roughness: 0.85, flatShading: true })); roof.position.y = y + 0.93;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rb + 0.45, 0.05, 5, 8), basic(C.gold)); rim.rotation.x = Math.PI / 2; rim.position.y = y + 0.76;
      for (const m of [body, roof]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(body, roof, rim);
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.4, 8), basic(C.gold)); spire.position.y = 14.4; g.add(spire);
  }
  beams = L.pads.map((pd) => { const b = makeBeam(pd.pos); g.add(b); return b; });
  for (const pd of L.pads) g.add(padMesh(pd));
  particleSets = opts.bench ? [] : th.particles.map((k) => { const pt = makeParticles(k); g.add(pt); return pt; });
  decor = buildDecor(n, L, opts);
  g.add(decor.group);
  scene.add(g);
  levelGroup = g;
}

// ---------- dynamic entities ----------
const lanternLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb347, 0, 18, 1.6); scene.add(l); return l; });
const ents = { player: null, lanterns: new Map(), shades: new Map(), drifters: new Map(), charms: new Map(), motes: null, halos: null, pulses: [], leaves: null };

// checkered "khăn rằn" scarf texture, drawn in code
function scarfTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#c8102e'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = 'rgba(255,240,220,0.85)';
  for (let i = 0; i < 32; i += 8) { x.fillRect(i, 0, 2, 32); x.fillRect(0, i, 32, 2); }
  x.fillStyle = 'rgba(60,0,10,0.35)';
  for (let i = 4; i < 32; i += 8) { x.fillRect(i, 0, 1, 32); x.fillRect(0, i, 32, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Mây: legs, arms and scarf tails hang from pivots so render() can animate a walk cycle (display only, no rules)
function makePlayer() {
  const g = new THREE.Group();
  const inner = new THREE.Group(); // lean / bob happen here so the outer group stays on the sim position
  g.add(inner);
  const skin = mat(0xe9c9a0), pants = mat(0x3b3f6b), sandal = mat(C.wood), shirt = mat(C.shirt);
  const scarfMat = mat(0xffffff, { map: scarfTexture() });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.42, 4, 10), shirt); body.position.y = 0.98;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), skin); head.position.y = 1.55;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 18), mat(C.sand)); hat.position.y = 1.95;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.09, 8, 16), scarfMat); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.3;
  inner.add(body, head, hat, scarf);
  // legs: pivot at the hip, sole touches y = 0 when straight
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.26, 3, 8), footGeo = new THREE.BoxGeometry(0.18, 0.09, 0.3);
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group(); hip.position.set(0.16 * s, 0.5, 0);
    const leg = new THREE.Mesh(legGeo, pants); leg.position.y = -0.22;
    const foot = new THREE.Mesh(footGeo, sandal); foot.position.set(0, -0.455, 0.05);
    hip.add(leg, foot); inner.add(hip); return hip;
  });
  // arms: pivot at the shoulder; the right hand holds the lantern pole
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.28, 3, 8);
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(0.4 * s, 1.28, 0);
    const arm = new THREE.Mesh(armGeo, shirt); arm.position.y = -0.2;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skin); hand.position.y = -0.4;
    sh.add(arm, hand); inner.add(sh); return sh;
  });
  arms[1].rotation.set(-0.7, 0, 0.25);
  // two scarf tails flutter behind the neck
  const tailGeo = new THREE.BoxGeometry(0.14, 0.5, 0.03); tailGeo.translate(0, -0.25, 0);
  const tails = [-1, 1].map((s) => {
    const p = new THREE.Group(); p.position.set(0.09 * s, 1.32, -0.3);
    p.add(new THREE.Mesh(tailGeo, scarfMat)); inner.add(p); return p;
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), mat(C.wood)); pole.position.set(0.5, 1.3, 0.25);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), basic(C.lamp)); lamp.position.set(0.5, 2.1, 0.25);
  const light = new THREE.PointLight(C.lamp, 1.6, 14, 1.5); light.position.copy(lamp.position);
  inner.add(pole, lamp, light);
  g.userData = { light, lamp, inner, legs, arms, tails, phase: 0, spd: 0, last: null, ghostT: 0 };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return g;
}

// ---- dash effect: golden after-images, a dust ring at the feet and sparks streaming backwards (display only)
const dashFx = { ghosts: [], rings: [], sparks: null, sparkData: [] };
const GHOST_LIFE = 0.4;
function makeDashFx() {
  const ghostGeo = [new THREE.CapsuleGeometry(0.36, 0.8, 3, 8).translate(0, 0.85, 0), new THREE.ConeGeometry(0.85, 0.55, 12).translate(0, 1.95, 0)];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const gh = new THREE.Group(); ghostGeo.forEach((geo) => gh.add(new THREE.Mesh(geo, m)));
    gh.visible = false; gh.userData = { m, life: 0 }; scene.add(gh); dashFx.ghosts.push(gh);
  }
  for (let i = 0; i < 2; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const r = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), m); r.rotation.x = -Math.PI / 2;
    r.visible = false; r.userData = { m, life: 0 }; scene.add(r); dashFx.rings.push(r);
  }
  const N = 48, pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dashFx.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd36b, size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  dashFx.sparks.frustumCulled = false; scene.add(dashFx.sparks);
  for (let i = 0; i < N; i++) { dashFx.sparkData.push({ life: 0, v: [0, 0, 0] }); pos[i * 3 + 1] = -999; }
}
function dashBurst() {
  if (!dashFx.sparks || !sim) return;
  const P = sim.player;
  const r = dashFx.rings.find((x) => x.userData.life <= 0) || dashFx.rings[0];
  r.position.set(P.pos[0], P.pos[1] + 0.05, P.pos[2]); r.userData.life = 0.35; r.visible = true;
}
function updateDashFx(dt, P, pg) {
  const u = pg.userData, dashing = P.dashLeft > 0 && P.fall === 0;
  // after-images every ~30 ms while dashing
  u.ghostT -= dt;
  if (dashing && u.ghostT <= 0) {
    u.ghostT = 0.045;
    const gh = dashFx.ghosts.find((x) => x.userData.life <= 0);
    if (gh) { gh.position.copy(pg.position); gh.rotation.copy(pg.rotation); gh.userData.life = GHOST_LIFE; gh.visible = true; }
  }
  for (const gh of dashFx.ghosts) {
    if (gh.userData.life <= 0) continue;
    gh.userData.life -= dt;
    gh.userData.m.opacity = Math.max(0, gh.userData.life / GHOST_LIFE) * 0.3;
    if (gh.userData.life <= 0) gh.visible = false;
  }
  for (const r of dashFx.rings) {
    if (r.userData.life <= 0) continue;
    r.userData.life -= dt;
    const k = 1 - Math.max(0, r.userData.life) / 0.35;
    r.scale.setScalar(0.6 + k * 1.8); r.userData.m.opacity = (1 - k) * 0.7;
    if (r.userData.life <= 0) r.visible = false;
  }
  // sparks: emitted behind Mây while dashing, drift back and fade
  const pos = dashFx.sparks.geometry.attributes.position.array;
  let emit = dashing ? 3 : 0;
  for (let i = 0; i < dashFx.sparkData.length; i++) {
    const s = dashFx.sparkData[i];
    if (s.life <= 0 && emit > 0) {
      emit--; s.life = 0.35 + Math.random() * 0.2;
      const bx = -P.dashDir[0], bz = -P.dashDir[1];
      pos[i * 3] = P.pos[0] + (Math.random() - 0.5) * 0.6; pos[i * 3 + 1] = P.pos[1] + 0.3 + Math.random() * 1.4; pos[i * 3 + 2] = P.pos[2] + (Math.random() - 0.5) * 0.6;
      s.v = [bx * (3 + Math.random() * 3) + (Math.random() - 0.5), 0.6 + Math.random(), bz * (3 + Math.random() * 3) + (Math.random() - 0.5)];
    }
    if (s.life > 0) {
      s.life -= dt;
      pos[i * 3] += s.v[0] * dt; pos[i * 3 + 1] += s.v[1] * dt; pos[i * 3 + 2] += s.v[2] * dt;
      if (s.life <= 0) pos[i * 3 + 1] = -999;
    }
  }
  dashFx.sparks.geometry.attributes.position.needsUpdate = true;
}

// walk cycle driven by the distance actually travelled, so feet do not slide
function animatePlayer(dt, t, P, pg) {
  const u = pg.userData;
  const here = [P.pos[0], P.pos[2]];
  let d = u.last ? Math.hypot(here[0] - u.last[0], here[1] - u.last[1]) : 0;
  if (d > 2) d = 0; // respawn / teleport
  u.last = here;
  const spd = dt > 0 ? d / dt : 0;
  u.spd += (spd - u.spd) * Math.min(1, dt * 12);
  const dashing = P.dashLeft > 0;
  const amp = Math.min(1, u.spd / 4) * 0.75;
  if (P.grounded && !dashing) u.phase += d * 3.4;
  const s = Math.sin(u.phase);
  const [legL, legR] = u.legs, [armL, armR] = u.arms;
  let lean = 0, bob = 0;
  const lerp = (o, v, k = Math.min(1, dt * 18)) => { o.rotation.x += (v - o.rotation.x) * k; };
  if (dashing) {
    lean = 0.38;
    lerp(legL, 0.95); lerp(legR, 0.45); lerp(armL, 1.1);
  } else if (!P.grounded) {
    lerp(legL, -0.55); lerp(legR, 0.25); lerp(armL, -1.2);
  } else {
    lerp(legL, s * amp, 1); lerp(legR, -s * amp, 1); lerp(armL, -s * amp * 0.9, 1);
    bob = Math.abs(Math.sin(u.phase)) * 0.07 * Math.min(1, u.spd / 3);
    lean = Math.min(1, u.spd / 6) * 0.12;
  }
  armR.rotation.x = -0.7 + (P.grounded && !dashing ? s * amp * 0.15 : 0);
  u.inner.rotation.x += (lean - u.inner.rotation.x) * Math.min(1, dt * 14);
  u.inner.position.y = bob;
  // scarf tails stream back with speed and flutter
  const flow = Math.min(1.35, 0.2 + u.spd * 0.09 + (dashing ? 0.5 : 0));
  u.tails.forEach((tl, i) => { tl.rotation.x = flow + Math.sin(t * (10 + u.spd) + i * 1.7) * (0.08 + u.spd * 0.012); tl.rotation.z = (i ? 1 : -1) * 0.12; });
}
function makeLantern(l) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 3, 8), new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.9 })); pole.position.y = 1.5; pole.castShadow = true;
  // glowing body differs per region: Bắc Bộ đèn đình (cylinder), Hội An silk lantern (round), Huế palace lantern (hexagonal)
  const kind = themeNow.lamp, paper = paperTex();
  let geo;
  if (kind === 'oil') geo = new THREE.CylinderGeometry(0.62, 0.62, 1.3, 14);
  else if (kind === 'palace') geo = new THREE.CylinderGeometry(0.68, 0.68, 1.4, 6);
  else { geo = new THREE.SphereGeometry(0.7, 16, 16); geo.scale(1, 0.9, 1); }
  const lamp = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.off, map: paper })); lamp.position.y = 3.4;
  const frame = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.4, metalness: 0.6 });
  const capR = kind === 'silk' ? 0.34 : 0.7;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR + 0.05, 0.14, 12), gold); top.position.y = 3.4 + (kind === 'silk' ? 0.66 : 0.75);
  const bot = top.clone(); bot.position.y = 3.4 - (kind === 'silk' ? 0.66 : 0.75);
  frame.add(top, bot);
  if (kind === 'oil') { const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.55, 14), new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.8, flatShading: true })); roof.position.y = 3.4 + 1.05; frame.add(roof); }
  if (kind === 'palace') { const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.5, metalness: 0.4, flatShading: true })); roof.position.y = 3.4 + 1.1; frame.add(roof); }
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 0.55, 6), basic(C.scarf)); tassel.position.y = 3.4 - 1.05;
  frame.add(tassel);
  frame.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); halo.scale.setScalar(7); halo.position.y = 3.4;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(T.safe_radius, 40), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, fog: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04;
  // fuel bar (only visible while lit) and the torn-paper marks that tell a dark lantern apart without colour
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x120a1a, transparent: true, opacity: 0.8, depthWrite: false })); barBg.scale.set(2.3, 0.3, 1); barBg.position.y = 5.0;
  const barFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: C.gold, depthWrite: false })); barFill.position.y = 5.0;
  const tear = new THREE.Group();
  for (const [x, y, rot, len] of [[-0.2, 0.15, 0.5, 0.6], [0.25, -0.1, -0.7, 0.5], [0.0, 0.35, 0.1, 0.35]]) {
    const cr = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.02), basic(0x1a1420)); cr.position.set(x, 3.4 + y, 0.69); cr.rotation.z = rot; tear.add(cr);
  }
  const tear2 = tear.clone(); tear2.rotation.y = Math.PI;
  g.add(pole, lamp, frame, halo, pool, shadow, barBg, barFill, tear, tear2);
  g.position.set(l.pos[0], l.pos[1], l.pos[2]);
  g.userData = { lamp, halo, pool, barBg, barFill, tears: [tear, tear2] };
  scene.add(g);
  return g;
}
const MAXSH = 256;
let shadeInst = null;
// Bóng Mực drawn as ink wolves. Local frame: origin = shade centre (1 m above ground, ground at y = -1), +Z = forward.
// The static parts are merged into one geometry so the whole pack costs 4 draw calls (body, outline, legs, eyes).
function mergeGeos(parts) {
  const pos = [], nor = [];
  for (const { geo, at, rot = [0, 0, 0], scale = [1, 1, 1] } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
function wolfParts(k) { // k > 1 inflates every part around its own centre (for the outline shell)
  const s = (x, y, z) => [x * k, y * k, z * k];
  return [
    // low segment counts on purpose: 200 of them are drawn in the benchmark scene (~1/3 of the triangles of a smooth build)
    { geo: new THREE.CapsuleGeometry(0.3, 0.85, 2, 7), at: [0, -0.3, -0.05], rot: [Math.PI / 2, 0, 0], scale: s(0.95, 1, 1) }, // body
    { geo: new THREE.IcosahedronGeometry(0.38, 0), at: [0, -0.2, 0.38], scale: s(0.9, 1, 1.05) }, // chest ruff
    { geo: new THREE.IcosahedronGeometry(0.27, 0), at: [0, 0.1, 0.78], scale: s(1, 0.9, 1.1) }, // head
    { geo: new THREE.CylinderGeometry(0.07, 0.14, 0.42, 5, 1, true), at: [0, 0.02, 1.1], rot: [Math.PI / 2, 0, 0], scale: s(1, 1, 1) }, // snout
    { geo: new THREE.ConeGeometry(0.09, 0.26, 4, 1, true), at: [0.13, 0.37, 0.72], rot: [-0.15, 0, -0.25], scale: s(1, 1, 1) }, // ears
    { geo: new THREE.ConeGeometry(0.09, 0.26, 4, 1, true), at: [-0.13, 0.37, 0.72], rot: [-0.15, 0, 0.25], scale: s(1, 1, 1) },
    { geo: new THREE.ConeGeometry(0.14, 0.78, 5, 1, true), at: [0, -0.32, -0.92], rot: [-1.87, 0, 0], scale: s(1, 1, 1) }, // drooping tail
  ];
}
const WOLF_HIPS = [[0.17, -0.4, 0.42], [-0.17, -0.4, 0.42], [0.17, -0.4, -0.42], [-0.17, -0.4, -0.42]].map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));
const WOLF_EYES = [[0.11, 0.15, 0.98], [-0.11, 0.15, 0.98]].map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));
function makeShadeInst() {
  const mk = (geo, material, n = MAXSH) => { const m = new THREE.InstancedMesh(geo, material, n); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
  const outMat = new THREE.MeshBasicMaterial({ color: pal.outline, side: THREE.BackSide });
  const eyeMat = new THREE.MeshBasicMaterial({ color: pal.eye });
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const legGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.62, 4, 1, true).translate(0, -0.31, 0); // hangs from the hip, paw on the ground
  shadeInst = {
    body: mk(mergeGeos(wolfParts(1)), bodyMat),
    outline: mk(mergeGeos(wolfParts(1.13)), outMat),
    legs: mk(legGeo, bodyMat, MAXSH * 4),
    eyes: mk(new THREE.IcosahedronGeometry(0.065, 0), eyeMat, MAXSH * 2),
    outMat, eyeMat,
    gait: new Map(), // shade id -> { x, z, yaw, phase } for facing and the trot cycle (display only)
  };
}
function applyPalette() {
  pal.danger = settings.cb ? '#FFFFFF' : '#FF5A5F';
  pal.outline = settings.cb ? 0x00b3ff : 0x7a3cff;
  pal.eye = settings.cb ? 0x00b3ff : 0xf5f1e6;
  pal.icon = settings.cb ? '⚠ ' : '';
  document.documentElement.style.setProperty('--danger', pal.danger);
  document.body.classList.toggle('cb', !!settings.cb);
  if (shadeInst) { shadeInst.outMat.color.setHex(pal.outline); shadeInst.eyeMat.color.setHex(pal.eye); }
}
function makeDrifter() {
  // a wavy silk ribbon (grey-blue) with a trailing tail and a pale knot, animated in render()
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(3.6, 0.9, 16, 1);
  const rib = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.drifter, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), basic(0xdfe8f2));
  knot.position.x = 1.8;
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8fa3b8, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  aura.scale.setScalar(5);
  g.add(rib, knot, aura);
  g.userData = { rib, base: Float32Array.from(geo.attributes.position.array) };
  scene.add(g);
  return g;
}
function makeCharm(c) {
  const g = new THREE.Group();
  const gold = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.92, 0.05), basic(C.gold));
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.07), basic(C.scarf));
  g.add(gold, red);
  g.position.set(c.pos[0], c.pos[1] + 1.1, c.pos[2]);
  scene.add(g);
  return g;
}
const MAXM = 128; // the benchmark scene has 100 motes (gameplay never exceeds 30)
function makeMotes() {
  ents.motes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 8), basic(C.moteCore, { fog: false }), MAXM);
  ents.halos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat(C.moteHalo, 0.28), MAXM);
  ents.motes.frustumCulled = ents.halos.frustumCulled = false;
  scene.add(ents.motes, ents.halos);
}
function makeLeaves() {
  const n = 80, arr = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  ents.leaves = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8fb36a, size: 0.35, fog: true }));
  ents.leaves.visible = false; ents.leaves.frustumCulled = false;
  scene.add(ents.leaves);
}
function clearEntities() {
  for (const k of ['lanterns', 'shades', 'drifters', 'charms']) { for (const m of ents[k].values()) { disposeGroup(m); } ents[k].clear(); }
  for (const p of ents.pulses) scene.remove(p.mesh);
  ents.pulses = [];
}

// ---------- game flow ----------
let sim = null, nightNo = 1, totalScore = 0, screen = 'menu', yaw = 0, timeAcc = 0, uiPaused = false, lastSecBeep = -1;
let runSeed = 1, nightsWon = 0, shakeT = 0, capturing = null, controlsBack = null;
const benchState = { elapsed: 0 };
const keys = new Set();
const edge = { jump: false, interact: false, pulse: false, dash: false };
const overlay = $('screen');

function show(html, clear = false) { overlay.className = 'overlay' + (clear ? ' clear' : ''); overlay.innerHTML = html; }
function hideScreen() { overlay.className = 'overlay'; overlay.innerHTML = ''; }
function btn(id, label) { return `<button id="${id}">${label}</button>`; }
function on(id, fn) { const e = $(id); if (e) e.onclick = () => { audio.unlock(); audio.sfx.click(); fn(); }; }
function focusFirst() { const b = overlay.querySelector('button'); if (b) b.focus(); }

const INTRO = {
  1: 'Ông Đăng, người giữ đèn già của làng: "Đêm nay sương đen phủ kín làng rồi, Mây ạ. Nhặt đom đóm, thắp lại đèn đình và đèn dầu quanh làng, giữ cho ít nhất 3 trong 5 ngọn còn sáng tới bình minh. Dầu đèn cạn dần, nhớ châm thêm. Bóng Mực thích hút dầu những ngọn đèn yếu."',
  2: 'Phố cổ Hội An: "Hai bờ sông Hoài nối nhau bằng chiếc cầu mái che không lan can, bước hụt là rơi xuống sông. Thấy bục đỏ viền vàng thì cứ đạp lên. Giữ sáng ít nhất 4 trong 6 chiếc đèn lồng tới bình minh, và coi chừng Gió Lạc, chúng thích đom đóm lắm."',
  3: 'Cố đô Huế: "Ba thềm điện và một tháp chùa ở giữa. Vách đứng thì không leo được: lên thềm thứ nhất bằng hai lối dốc có tay vịn vàng, rồi bước vào bục sáng để được tung lên thềm cao nhất. Gió trên cao rất mạnh. Giữ sáng ít nhất 5 trong 7 đèn cung đình tới bình minh."',
};

function showMenu() {
  screen = 'menu'; stopPlayHud();
  audio.stopMusic();
  show(`<h1>Đảo Đèn Lồng</h1><p class="quote">Đêm nay sương đen đã nuốt hết ánh sáng của đảo.</p><div class="btns">${btn('b-play', 'Chơi')}${btn('b-lb', 'Bảng xếp hạng')}${btn('b-set', 'Cài đặt')}</div>`);
  on('b-play', () => { totalScore = 0; nightsWon = 0; runSeed = (Math.random() * 1e9) | 0; showIntro(1); });
  on('b-lb', () => showLeaderboard(showMenu));
  on('b-set', () => showSettings(showMenu));
  focusFirst();
}
function showSettings(back) {
  show(`<h2>Cài đặt</h2>
    <label class="row">Âm lượng <input id="s-vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
    <label class="row">Độ nhạy chuột <input id="s-sens" type="range" min="0.1" max="1" step="0.05" value="${settings.sens}"></label>
    <label class="row">Bảng màu dễ phân biệt <input id="s-cb" type="checkbox" ${settings.cb ? 'checked' : ''}></label>
    <label class="row">Giảm chuyển động (tắt rung, chớp màn hình) <input id="s-rm" type="checkbox" ${settings.reduceMotion ? 'checked' : ''}></label>
    <label class="row">Chữ lớn (×1.25) <input id="s-big" type="checkbox" ${settings.bigText ? 'checked' : ''}></label>
    <label class="row">Đổ bóng (tắt nếu máy yếu) <input id="s-sh" type="checkbox" ${settings.shadows ? 'checked' : ''}></label>
    <div class="btns">${btn('b-keys', 'Phím điều khiển')}${btn('b-back', 'Quay lại')}</div>`);
  $('s-sh').onchange = (e) => { settings.shadows = e.target.checked; saveSettings(); };
  $('s-cb').onchange = (e) => { settings.cb = e.target.checked; saveSettings(); applyPalette(); };
  $('s-rm').onchange = (e) => { settings.reduceMotion = e.target.checked; saveSettings(); };
  $('s-big').onchange = (e) => { settings.bigText = e.target.checked; saveSettings(); applyUiScale(); };
  $('s-vol').oninput = (e) => { settings.volume = +e.target.value; audio.setVolume(settings.volume); saveSettings(); };
  $('s-sens').oninput = (e) => { settings.sens = +e.target.value; saveSettings(); };
  on('b-keys', () => showControls(() => showSettings(back)));
  on('b-back', back);
  focusFirst();
}
function updateHelp() {
  $('help').textContent = `${keyLabel(binds.up)}${keyLabel(binds.left)}${keyLabel(binds.down)}${keyLabel(binds.right)}: đi · ${keyLabel(binds.jump)}: nhảy · ${keyLabel(binds.dash)}: lướt · ${keyLabel(binds.interact)}: thắp / châm dầu · ${keyLabel(binds.pulse)}: tỏa sáng · kéo chuột / ${keyLabel(binds.camL)},${keyLabel(binds.camR)}: xoay · ${keyLabel(binds.pause)}: tạm dừng`;
  $('cd-dash').querySelector('b').textContent = keyLabel(binds.dash);
  $('cd-pulse').querySelector('b').textContent = keyLabel(binds.pulse);
}
function showControls(back, msg = '') {
  capturing = null; controlsBack = back;
  const rows = ACTIONS.map(([a, label]) => `<div class="row"><span>${label}</span><button class="key" data-a="${a}">${keyLabel(binds[a])}</button></div>`).join('');
  show(`<h2>Phím điều khiển</h2><p id="kb-msg" class="${msg.startsWith('Phím') ? 'warn' : ''}">${msg || 'Bấm vào một phím rồi nhấn phím mới.'}</p><div class="keys">${rows}</div><div class="btns">${btn('b-reset', 'Khôi phục mặc định')}${btn('b-back', 'Quay lại')}</div>`);
  overlay.querySelectorAll('button.key').forEach((bt) => { bt.onclick = () => { capturing = bt.dataset.a; bt.textContent = 'Nhấn phím…'; $('kb-msg').textContent = 'Nhấn phím mới (Esc để hủy).'; bt.blur(); }; });
  on('b-reset', () => { binds = { ...DEFAULT_KEYS }; saveSettings(); updateHelp(); showControls(back, 'Đã khôi phục mặc định.'); });
  on('b-back', () => { capturing = null; back(); });
}
function captureKey(e) {
  e.preventDefault();
  const action = capturing;
  capturing = null;
  if (e.code === 'Escape' && action !== 'pause') return showControls(controlsBack);
  const r = rebind(binds, action, e.code);
  if (!r.ok) {
    const other = ACTIONS.find(([a]) => a === r.conflict)[1];
    return showControls(controlsBack, `Phím ${keyLabel(e.code)} đã dùng cho “${other}”. Hãy chọn phím khác.`);
  }
  binds = r.keys; saveSettings(); updateHelp();
  return showControls(controlsBack, 'Đã lưu.');
}

// ---- leaderboard (stored by the local server on disk; browser storage only as a fallback)
async function fetchBoard() {
  try { const r = await fetch('/api/leaderboard'); if (r.ok) return (await r.json()).entries; } catch { /* no server */ }
  try { return loadEntries(localStorage.getItem('ddl.leaderboard') || '[]'); } catch { return []; }
}
async function postEntry(entry) {
  try {
    const r = await fetch('/api/leaderboard', { method: 'POST', body: JSON.stringify(entry) });
    if (r.ok) return { ok: true };
    if (r.status === 400) return { ok: false, error: (await r.json().catch(() => ({}))).error || 'dữ liệu không hợp lệ' };
  } catch { /* server unreachable: fall back to this browser */ }
  try { localStorage.setItem('ddl.leaderboard', JSON.stringify(addEntry(loadEntries(localStorage.getItem('ddl.leaderboard') || '[]'), entry))); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}
async function showLeaderboard(back) {
  show('<h2>Bảng xếp hạng</h2><p>Đang tải…</p>');
  const entries = await fetchBoard();
  const rows = entries.length
    ? entries.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td class="score">${e.score}</td><td>${e.nights_won}/3</td><td>${esc(e.achieved_at.slice(0, 10))}</td></tr>`).join('')
    : '<tr><td colspan="5">Chưa có ai. Hãy là người đầu tiên!</td></tr>';
  show(`<h2>Bảng xếp hạng</h2><table class="lb"><tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Ngày</th></tr>${rows}</table><div class="btns">${btn('b-back', 'Quay lại')}</div>`);
  on('b-back', back); focusFirst();
}
// ISO 8601 with the player's local UTC offset, e.g. 2026-11-20T16:49:50+07:00
function isoLocal(d) {
  const p2 = (n) => String(Math.trunc(Math.abs(n))).padStart(2, '0'), off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${off >= 0 ? '+' : '-'}${p2(off / 60)}:${p2(off % 60)}`;
}
function nameForm() {
  return '<div class="nameform"><label>Tên để lưu điểm (3–12 ký tự: chữ, số, _)<br><input id="lb-name" maxlength="12" autocomplete="off" spellcheck="false"></label><button id="lb-save">Lưu điểm</button><div id="lb-msg" class="warn"></div></div>';
}
function wireNameForm() {
  const inp = $('lb-name'), msg = $('lb-msg');
  $('lb-save').onclick = async () => {
    audio.unlock();
    const name = inp.value.trim();
    if (!validName(name)) { msg.className = 'warn'; msg.textContent = 'Tên phải dài 3–12 ký tự, chỉ gồm chữ, số hoặc dấu _.'; return; }
    const res = await postEntry({ name, score: totalScore, nights_won: nightsWon, achieved_at: isoLocal(new Date()), seed: runSeed });
    if (!res.ok) { msg.className = 'warn'; msg.textContent = `Không lưu được: ${res.error}`; return; }
    msg.className = 'ok'; msg.textContent = 'Đã lưu vào bảng xếp hạng!'; $('lb-save').disabled = true; inp.disabled = true;
  };
}
function showIntro(n) {
  nightNo = n; screen = 'intro'; stopPlayHud();
  show(`<h2>Đêm ${n}</h2><h1>${NIGHTS[n].name}</h1><p class="quote">${INTRO[n]}</p><div class="btns">${btn('b-go', 'Bắt đầu')}</div>`);
  on('b-go', () => startNight(n));
  focusFirst();
}
function startNight(n) {
  audio.unlock(); audio.startMusic();
  nightNo = n;
  sim = new Sim({ seed: runSeed + n, night: n });
  buildLevel(n);
  clearEntities();
  for (const l of sim.lanterns) ents.lanterns.set(l.id, makeLantern(l));
  for (const c of sim.charms) ents.charms.set(c.id, makeCharm(c));
  yaw = 0; timeAcc = 0; uiPaused = false; lastSecBeep = -1;
  hideScreen(); screen = 'play';
  $('hud').classList.remove('hidden'); $('help').classList.remove('hidden');
  buildMoteBar();
  updateHelp();
  for (const k of Object.keys(cache)) delete cache[k];
  capEl.replaceChildren(); alertsEl.replaceChildren(); alerts.clear(); lowSeen.clear(); $('countdown').classList.add('hidden');
}
function stopPlayHud() { $('hud').classList.add('hidden'); $('help').classList.add('hidden'); }

function showResult() {
  const won = sim.state === 'won';
  screen = 'result';
  if (won) { totalScore += sim.score; nightsWon += 1; audio.sfx.win(); } else audio.sfx.lose();
  renderResult();
}
function renderResult() {
  const won = sim.state === 'won';
  screen = 'result';
  if (won && nightNo === 3) {
    show(`<h1>Bình Minh</h1><p>Mây đã giữ cho ba hòn đảo sáng đèn tới tận lúc mặt trời lên.</p><p>Tổng điểm: <span class="score">${totalScore}</span></p>${nameForm()}<div class="btns">${btn('b-lb', 'Bảng xếp hạng')}${btn('b-menu', 'Về menu')}</div>`);
    wireNameForm(); on('b-lb', () => showLeaderboard(renderResult)); on('b-menu', showMenu);
  } else if (won) {
    show(`<h1>Bình minh Đêm ${nightNo}!</h1><p>Đảo vẫn sáng khi trời hửng. Điểm đêm này: <span class="score">${sim.score}</span> · Tổng: <span class="score">${totalScore}</span></p><div class="btns">${btn('b-next', 'Đêm kế tiếp')}${btn('b-menu', 'Về menu')}</div>`);
    on('b-next', () => showIntro(nightNo + 1)); on('b-menu', showMenu);
  } else {
    const litN = sim.lanterns.filter((l) => l.lit).length, needN = Math.ceil(T.win_ratio * sim.lanterns.length - 1e-9);
    const why = sim.events.find((e) => e.name === 'game_over')?.data.reason === 'dawn' ? `Trời sáng mà chỉ còn ${litN}/${sim.lanterns.length} đèn sáng, cần ít nhất ${needN}…` : 'Ngọn Lửa của Mây đã tắt…';
    show(`<h1>Thất bại</h1><p>${why}</p><p>Tổng điểm các Đêm đã thắng: <span class="score">${totalScore}</span> (${nightsWon}/3 Đêm)</p>${nameForm()}<div class="btns">${btn('b-retry', 'Chơi lại Đêm ' + nightNo)}${btn('b-lb', 'Bảng xếp hạng')}${btn('b-menu', 'Về menu')}</div>`);
    wireNameForm(); on('b-retry', () => startNight(nightNo)); on('b-lb', () => showLeaderboard(renderResult)); on('b-menu', showMenu);
  }
  focusFirst();
}
function pauseGame() {
  if (screen !== 'play' || sim.state !== 'playing') return;
  sim.step({ pause: true }); sim.step({ pause: false }); // enter the sim's paused state
  uiPaused = true; screen = 'pause';
  showPauseMenu();
}
function showPauseMenu() {
  show(`<h2>Tạm dừng</h2><div class="btns">${btn('b-res', 'Tiếp tục')}${btn('b-rst', 'Chơi lại Đêm')}${btn('b-set', 'Cài đặt')}${btn('b-menu', 'Về menu')}</div>`, true);
  on('b-res', resumeGame); on('b-rst', () => startNight(nightNo)); on('b-set', () => showSettings(showPauseMenu)); on('b-menu', showMenu);
  focusFirst();
}
function resumeGame() {
  sim.step({ pause: true }); // resume edge; the sim simulates this tick
  sim.step({ pause: false });
  uiPaused = false; screen = 'play'; hideScreen(); timeAcc = 0;
}

// ---------- input (rebindable, see src/keybinds.js) ----------
addEventListener('keydown', (e) => {
  audio.unlock();
  if (capturing) { captureKey(e); return; }
  if (e.code === binds.pause) {
    if (screen === 'play') pauseGame(); else if (screen === 'pause') resumeGame();
    return;
  }
  if (screen !== 'play') return;
  keys.add(e.code);
  if (e.code === binds.jump) { edge.jump = true; e.preventDefault(); }
  if (e.code === binds.interact) edge.interact = true;
  if (e.code === binds.pulse) edge.pulse = true;
  if (e.code === binds.dash) { edge.dash = true; e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (screen === 'play') pauseGame(); });
let drag = false;
addEventListener('mousedown', () => { drag = true; });
addEventListener('mouseup', () => { drag = false; });
addEventListener('mousemove', (e) => { if (drag && screen === 'play') yaw -= e.movementX * settings.sens; });

function readInput() {
  if (keys.has(binds.camL)) yaw += 90 / 60;
  if (keys.has(binds.camR)) yaw -= 90 / 60;
  const x = (keys.has(binds.left) ? 1 : 0) - (keys.has(binds.right) ? 1 : 0);
  const z = (keys.has(binds.up) ? 1 : 0) - (keys.has(binds.down) ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: yaw, jump: edge.jump, interact: edge.interact, pulse: edge.pulse, dash: edge.dash, pause: false };
}

// ---------- visual cues / captions (accessibility) ----------
const capEl = $('captions'), alertsEl = $('alerts'), flashEl = $('flash');
const alerts = new Map(); // shade id -> {until, el}
const lowSeen = new Set();
function caption(text, cls = '', ms = 4200) {
  const dv = document.createElement('div'); dv.className = `cap ${cls}`; dv.textContent = text; capEl.appendChild(dv);
  while (capEl.children.length > 3) capEl.firstChild.remove();
  setTimeout(() => dv.remove(), ms);
}
function hitFx() {
  if (settings.reduceMotion) return; // reduce motion: no camera shake, no screen flash
  shakeT = 0.35; flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on');
}
function dirWord(x, z) {
  const th = (yaw * Math.PI) / 180, fx = Math.sin(th), fz = Math.cos(th), rx = -Math.cos(th), rz = Math.sin(th);
  const dx = x - sim.player.pos[0], dz = z - sim.player.pos[2];
  const f = dx * fx + dz * fz, r = dx * rx + dz * rz;
  return Math.abs(f) >= Math.abs(r) ? (f > 0 ? 'phía trước' : 'phía sau') : (r > 0 ? 'bên phải' : 'bên trái');
}
function trackCues() {
  const now = performance.now();
  for (const l of sim.lanterns) {
    const low = l.lit && l.fuel < T.low_fuel_threshold * FUEL_SCALE;
    if (low && !lowSeen.has(l.id)) { lowSeen.add(l.id); caption(`${pal.icon}Đèn ${l.id} sắp hết dầu`, 'warn'); }
    else if (!low) lowSeen.delete(l.id);
  }
  for (const [id, a] of alerts) {
    const sh = sim.shades.find((x) => x.id === id);
    if (!sh || now > a.until) { a.el.remove(); alerts.delete(id); continue; }
    tmpV.set(sh.pos[0], sh.pos[1], sh.pos[2]).project(camera);
    const off = tmpV.z > 1 || Math.abs(tmpV.x) > 0.95 || Math.abs(tmpV.y) > 0.95;
    a.el.style.display = off ? 'block' : 'none';
    if (off) {
      let x = tmpV.x, y = tmpV.y;
      if (tmpV.z > 1) { x = -x; y = -y; }
      const m = Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x = (x / m) * 0.9; y = (y / m) * 0.84;
      a.el.style.left = `${(x * 0.5 + 0.5) * 100}%`; a.el.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
      a.el.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(-y, x)}rad)`;
    }
  }
  const sLeft = Math.ceil(sim.timeLeft / 60), cd = $('countdown');
  cd.classList.toggle('hidden', !(sLeft <= 10 && sLeft > 0));
  if (sLeft <= 10 && sLeft > 0) setTxt(cd, `${pal.icon}${sLeft}`);
}
function newShadeCue(id) {
  const sh = sim.shades.find((x) => x.id === id);
  caption(`${pal.icon}Bóng Mực xuất hiện${sh ? ' ' + dirWord(sh.pos[0], sh.pos[2]) : ''}`, 'warn');
  const el = document.createElement('div'); el.className = 'alert'; el.textContent = pal.icon ? '⚠' : '➤'; alertsEl.appendChild(el);
  alerts.set(id, { until: performance.now() + 4500, el });
}

// ---------- sounds from sim events ----------
function handleEvents(evs) {
  for (const e of evs) {
    switch (e.name) {
      case 'mote_picked': audio.sfx.pick(); break;
      case 'deposit': case 'refuel': audio.sfx.deposit(); break;
      case 'lantern_out': audio.sfx.out(); break;
      case 'shade_spawned': newShadeCue(e.data.id); break;
      case 'lantern_lit': audio.sfx.light(); break;
      case 'pulse': audio.sfx.pulse(); spawnPulse(); break;
      case 'player_hit': (e.data.by === 'fall' ? audio.sfx.fall : audio.sfx.hit)(); hitFx(); break;
      case 'dash': audio.sfx.dash(); dashBurst(); break;
      case 'charm_picked': audio.sfx.charm(); break;
      case 'drifter_steal': audio.sfx.steal(); break;
      case 'shade_spawned': audio.sfx.spawn(); break;
    }
  }
}
function spawnPulse() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glowMat(C.core, 0.45));
  m.position.set(sim.player.pos[0], sim.player.pos[1] + W.pulse_center_y, sim.player.pos[2]);
  scene.add(m);
  ents.pulses.push({ mesh: m, t: 0 });
}

// ---------- rendering ----------
function ensureEntities() {
  if (!ents.player) { ents.player = makePlayer(); makeMotes(); makeLeaves(); makeDashFx(); }
}
const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const cache = {};
const setTxt = (el, v) => { if (cache[el.id] !== v) { cache[el.id] = v; el.innerHTML = v; } };

const shTmp = new THREE.Object3D(), shM = new THREE.Matrix4(), shCol = new THREE.Color();
const shRot = new THREE.Matrix4();
function render(dt, t) {
  ensureEntities();
  const P = sim.player;
  const pg = ents.player;
  pg.position.set(P.pos[0], P.pos[1], P.pos[2]);
  pg.rotation.y = Math.atan2(P.face[0], P.face[1]);
  pg.visible = !(P.invuln > 0 && Math.floor(t * 10) % 2 === 0) && P.fall === 0;
  pg.userData.light.intensity = 1.2 + P.carried * 0.12;
  animatePlayer(dt, t, P, pg);
  updateDashFx(dt, P, pg);

  // camera
  if (screen === 'bench') {
    const bc = benchCamera(benchState.elapsed);
    camera.position.set(...bc.pos); camera.lookAt(...bc.look);
  } else {
    const th = (yaw * Math.PI) / 180, fx = Math.sin(th), fz = Math.cos(th);
    const cy = P.fall > 0 ? 0 : P.pos[1];
    camera.position.set(P.pos[0] - fx * 9, cy + 6, P.pos[2] - fz * 9);
    camera.lookAt(P.pos[0] + fx * 3, cy + 1, P.pos[2] + fz * 3);
    if (shakeT > 0 && !settings.reduceMotion) { const k = shakeT / 0.35; camera.position.x += (Math.random() - 0.5) * 0.5 * k; camera.position.y += (Math.random() - 0.5) * 0.5 * k; }
    shakeT = Math.max(0, shakeT - dt);
  }

  // lanterns + environment light
  let lit = 0;
  for (const l of sim.lanterns) {
    const g = ents.lanterns.get(l.id), u = g.userData;
    if (l.lit) lit++;
    // only lit lanterns emit light; it fades with the fuel, and below 30 it flickers at 1 Hz (also readable without colour)
    const frac = l.fuel / FUEL_SCALE / T.fuel_max, low = l.lit && l.fuel < T.low_fuel_threshold * FUEL_SCALE;
    const blink = low ? (Math.sin(t * 2 * Math.PI) > 0 ? 1 : 0.2) : 1;
    u.lamp.material.color.setHex(l.lit ? C.core : C.off).multiplyScalar(blink);
    u.halo.material.opacity = l.lit ? 0.6 * (0.35 + 0.65 * frac) * blink : 0;
    u.pool.material.opacity = l.lit ? (low ? 0.15 : 0.5) : 0; // the 6 m zone only exists at fuel >= 30
    if (l.lit) u.lamp.scale.setScalar(1.1); else u.lamp.scale.set(1, 0.8, 1); // dark lanterns are 20% flatter
    for (const tr of u.tears) tr.visible = !l.lit;
    u.barBg.visible = u.barFill.visible = l.lit;
    if (l.lit) {
      const w = 2.3 * Math.max(frac, 0.02);
      u.barFill.scale.set(w, 0.2, 1);
      u.barFill.center.set(1.15 / w, 0.5);
      u.barFill.material.color.set(low ? pal.danger : '#F2C14E');
      u.barFill.material.opacity = blink; u.barFill.material.transparent = true;
    }
  }
  const litNear = sim.lanterns.filter((l) => l.lit)
    .sort((a, b) => Math.hypot(a.pos[0] - P.pos[0], a.pos[2] - P.pos[2]) - Math.hypot(b.pos[0] - P.pos[0], b.pos[2] - P.pos[2]));
  lanternLights.forEach((pl, i) => {
    const l = litNear[i];
    pl.intensity = l ? 2.4 * (0.4 + 0.6 * (l.fuel / FUEL_SCALE / T.fuel_max)) : 0;
    if (l) pl.position.set(l.pos[0], l.pos[1] + 3.6, l.pos[2]);
  });
  ambient.intensity = 0.15 + 0.55 * (lit / sim.lanterns.length);

  // motes
  const ms = sim.motes.slice(0, MAXM);
  ms.forEach((m, i) => {
    const bob = 0.75 + Math.sin(t * 3 + i) * 0.12;
    tmpV.set(m.pos[0], m.pos[1] + bob, m.pos[2]);
    const fade = m.kind === 'dropped' && m.ttl < 90 && Math.floor(t * 8) % 2 === 0 ? 0.4 : 1;
    tmpM.compose(tmpV, tmpQ, tmpS.set(fade, fade, fade)); ents.motes.setMatrixAt(i, tmpM);
    tmpM.compose(tmpV, tmpQ, tmpS.set(fade, fade, fade)); ents.halos.setMatrixAt(i, tmpM);
  });
  ents.motes.count = ents.halos.count = ms.length;
  ents.motes.instanceMatrix.needsUpdate = ents.halos.instanceMatrix.needsUpdate = true;

  // shades
  if (!shadeInst) makeShadeInst();
  {
    const n = Math.min(sim.shades.length, MAXSH), gait = shadeInst.gait;
    if (gait.size > n * 2 + 32) { const live = new Set(sim.shades.map((s) => s.id)); for (const id of gait.keys()) if (!live.has(id)) gait.delete(id); }
    for (let i = 0; i < n; i++) {
      const sh = sim.shades[i];
      let g = gait.get(sh.id);
      if (!g) { g = { x: sh.pos[0], z: sh.pos[2], yaw: Math.atan2(Math.cos(sh.heading), Math.sin(sh.heading)), phase: Math.random() * 6 }; gait.set(sh.id, g); }
      const dx = sh.pos[0] - g.x, dz = sh.pos[2] - g.z;
      let d = Math.hypot(dx, dz); if (d > 3) d = 0;
      g.x = sh.pos[0]; g.z = sh.pos[2];
      // face the way it runs (chasers and drainers turn toward their target when standing)
      let want = g.yaw;
      if (d > 0.004) want = Math.atan2(dx, dz);
      else if (sh.state === 'chase') want = Math.atan2(P.pos[0] - sh.pos[0], P.pos[2] - sh.pos[2]);
      let dy = want - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.yaw += dy * Math.min(1, dt * 10);
      g.phase += d * 4.2;
      const speed = dt > 0 ? d / dt : 0, amp = Math.min(1, speed / 3) * 0.6;
      const stunned = sh.state === 'stunned', drain = sh.state === 'drain';
      const trot = Math.sin(g.phase);
      shTmp.position.set(sh.pos[0], sh.pos[1] + Math.abs(trot) * 0.06 * amp - (drain ? 0.18 : 0), sh.pos[2]);
      shTmp.rotation.set(drain ? 0.18 : 0, g.yaw, stunned ? Math.sin(t * 9 + i) * 0.3 : 0, 'YXZ');
      shTmp.scale.setScalar(sh.state === 'spawning' ? 0.4 : 1);
      shTmp.updateMatrix();
      shadeInst.body.setMatrixAt(i, shTmp.matrix); shadeInst.outline.setMatrixAt(i, shTmp.matrix);
      shCol.setHex(stunned ? C.stun : C.shade);
      shadeInst.body.setColorAt(i, shCol);
      for (let k = 0; k < 4; k++) {
        // diagonal pairs move together: front-right with back-left
        const sw = (k === 0 || k === 3 ? trot : -trot) * amp + (drain ? (k < 2 ? -0.5 : 0.6) : 0);
        shM.copy(shTmp.matrix).multiply(WOLF_HIPS[k]).multiply(shRot.makeRotationX(sw));
        shadeInst.legs.setMatrixAt(i * 4 + k, shM); shadeInst.legs.setColorAt(i * 4 + k, shCol);
      }
      shadeInst.eyes.setMatrixAt(i * 2, shM.copy(shTmp.matrix).multiply(WOLF_EYES[0]));
      shadeInst.eyes.setMatrixAt(i * 2 + 1, shM.copy(shTmp.matrix).multiply(WOLF_EYES[1]));
    }
    shadeInst.body.count = shadeInst.outline.count = n; shadeInst.legs.count = n * 4; shadeInst.eyes.count = n * 2;
    for (const m of [shadeInst.body, shadeInst.outline, shadeInst.legs, shadeInst.eyes]) m.instanceMatrix.needsUpdate = true;
    for (const m of [shadeInst.body, shadeInst.legs]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  syncMap(ents.drifters, sim.drifters, makeDrifter, (g, d) => {
    g.position.set(d.pos[0], d.pos[1] + Math.sin(t * 3) * 0.2, d.pos[2]);
    const dir = Math.atan2(d.state === 'flee' ? d.pos[0] - P.pos[0] : P.pos[0] - d.pos[0], d.state === 'flee' ? d.pos[2] - P.pos[2] : P.pos[2] - d.pos[2]);
    g.rotation.y = d.state === 'idle' ? t * 0.6 : dir - Math.PI / 2;
    const arr = g.userData.rib.geometry.attributes.position.array, base = g.userData.base;
    for (let i = 0; i < arr.length; i += 3) { const k = 1 - (base[i] + 1.8) / 3.6; arr[i + 1] = base[i + 1] + Math.sin(base[i] * 2.2 - t * 7) * 0.55 * (0.3 + k); arr[i + 2] = Math.cos(base[i] * 2.2 - t * 7) * 0.35 * k; }
    g.userData.rib.geometry.attributes.position.needsUpdate = true;
  });
  for (const c of sim.charms) { const m = ents.charms.get(c.id); m.visible = c.respawn === 0; m.rotation.y = t * 2; m.position.y = c.pos[1] + 1.1 + Math.sin(t * 2) * 0.12; }

  // pulse rings
  for (const p of ents.pulses) { p.t += dt; const k = p.t / 0.45; p.mesh.scale.setScalar(0.5 + k * T.pulse_radius); p.mesh.material.opacity = 0.45 * (1 - k); }
  ents.pulses = ents.pulses.filter((p) => { if (p.t >= 0.45) { scene.remove(p.mesh); return false; } return true; });

  // wind leaves (warning + gust)
  const lv = ents.leaves;
  lv.visible = sim.wind.warn || sim.wind.active;
  if (lv.visible) {
    const a = (sim.wind.dir * Math.PI) / 180, arr = lv.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const ph = i * 0.37, k = (t * (sim.wind.active ? 8 : 3) + ph) % 24;
      arr[i] = P.pos[0] + Math.cos(a) * (k - 12) + Math.sin(ph) * 8;
      arr[i + 1] = P.pos[1] + 1 + ((ph * 7) % 6) + Math.sin(t * 2 + ph);
      arr[i + 2] = P.pos[2] + Math.sin(a) * (k - 12) + Math.cos(ph) * 8;
    }
    lv.geometry.attributes.position.needsUpdate = true;
  }

  if (decor && decor.update(t, dt, P.pos).rustle) audio.sfx.rustle();
  if (skyDome) skyDome.position.copy(camera.position);
  if (seaGroup) seaGroup.userData.update(t);
  for (const b of beams) b.userData.update(t);
  for (const pt of particleSets) pt.userData.update(t, dt, P.pos);
  { const mv = Math.hypot(P.pos[0] - shadowLast[0], P.pos[1] - shadowLast[1], P.pos[2] - shadowLast[2]) > 0.02; shadowLast[0] = P.pos[0]; shadowLast[1] = P.pos[1]; shadowLast[2] = P.pos[2]; renderer.shadowMap.needsUpdate = mv || (++shadowFrame % 4 === 0); }
  moon.castShadow = settings.shadows;
  moon.target.position.set(P.pos[0], P.pos[1], P.pos[2]);
  moon.position.set(P.pos[0] - 28, P.pos[1] + 55, P.pos[2] + 20);
  updateHud(lit, t);
  drawMinimap(t);
  renderer.render(scene, camera);
}

function syncMap(map, items, make, update) {
  const seen = new Set();
  for (const it of items) {
    seen.add(it.id);
    let g = map.get(it.id);
    if (!g) { g = make(it); map.set(it.id, g); }
    update(g, it);
  }
  for (const [id, g] of map) if (!seen.has(id)) { disposeGroup(g); map.delete(id); }
}

let moteCells = [];
let moteCap = 0;
function buildMoteBar(cap = T.carry_capacity) {
  const bar = $('motebar'); bar.innerHTML = '';
  moteCap = cap;
  moteCells = Array.from({ length: cap }, () => { const i = document.createElement('i'); bar.appendChild(i); return i; });
  for (const k of Object.keys(cache)) delete cache[k];
}
const arrowEl = $('arrow');
function updateHud(lit, t) {
  const P = sim.player;
  if (screen !== 'bench') trackCues();
  setTxt($('flames'), Array.from({ length: T.flames }, (_, i) => `<span class="${i < P.flames ? '' : 'off'}">🔥</span>`).join(''));
  const tl = Math.max(0, Math.ceil(sim.timeLeft / 60));
  const lowTime = sim.timeLeft <= 30 * 60;
  setTxt($('clock'), `${lowTime ? pal.icon : ''}${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`);
  $('clock').classList.toggle('low', lowTime);
  const need = Math.ceil(T.win_ratio * sim.lanterns.length - 1e-9);
  setTxt($('lamps'), `🏮 ${lit}/${sim.lanterns.length} <small>(cần ${need})</small>`);
  setTxt($('score'), String(sim.score));
  if (P.carried !== undefined && sim.capacity !== moteCap) buildMoteBar(sim.capacity);
  moteCells.forEach((c, i) => c.classList.toggle('on', i < P.carried));
  setTxt($('motecount'), `${P.carried}/${sim.capacity}`);
  const weak = sim.lanterns.filter((l) => l.lit && l.fuel < T.low_fuel_threshold * FUEL_SCALE);
  $('fuelwarn').classList.toggle('hidden', weak.length === 0);
  if (weak.length) setTxt($('fuelwarn'), weak.map((l) => `${pal.icon}Đèn ${l.id} sắp hết dầu (${Math.ceil(l.fuel / FUEL_SCALE)})`).join('<br>'));
  $('cd-dash').querySelector('.fill').style.height = `${Math.min(100, (P.dashCd / Math.round(T.dash_cooldown_s * 60)) * 100)}%`;
  $('cd-pulse').querySelector('.fill').style.height = `${Math.min(100, (P.pulseCd / Math.round(T.pulse_cooldown_s * 60)) * 100)}%`;
  $('cd-dash').classList.toggle('ready', P.dashCd === 0);
  $('cd-pulse').classList.toggle('ready', P.pulseCd === 0 && P.carried >= T.pulse_cost);
  $('charmtag').classList.toggle('hidden', P.charm === 0);
  if (P.charm) setTxt($('charmtag'), `Bùa Gió ${Math.ceil(P.charm / 60)}s`);
  $('windwarn').classList.toggle('hidden', !sim.wind.warn);

  // interaction prompt: nearest lantern that can receive (dark, or lit but not full) within the interact radius
  let near = null, nd = Infinity, target = null, td = Infinity;
  for (const l of sim.lanterns) {
    const d = Math.hypot(P.pos[0] - l.pos[0], P.pos[2] - l.pos[2]);
    if (!(l.lit && l.fuel >= T.fuel_max * FUEL_SCALE) && d <= T.interact_radius && d < nd) { near = l; nd = d; }
    const needy = !l.lit || l.fuel < T.low_fuel_threshold * FUEL_SCALE; // dark or about to go out
    if (needy && d < td) { target = l; td = d; }
  }
  const pr = $('prompt');
  pr.classList.toggle('hidden', !near);
  if (near) setTxt(pr, near.lit ? `${keyLabel(binds.interact)} — Châm dầu (${Math.ceil(near.fuel / FUEL_SCALE)}/${T.fuel_max})` : `${keyLabel(binds.interact)} — ${near.ever ? 'Thắp lại' : 'Thắp đèn'} (${near.deposited}/${near.ever ? T.relight_cost : T.lantern_cost})`);

  // arrow toward the nearest lantern that needs help when it is off-screen
  if (target) {
    tmpV.set(target.pos[0], target.pos[1] + 3.4, target.pos[2]).project(camera);
    const off = tmpV.z > 1 || Math.abs(tmpV.x) > 0.92 || Math.abs(tmpV.y) > 0.92;
    arrowEl.classList.toggle('hidden', !off);
    if (off) {
      let x = tmpV.x, y = tmpV.y;
      if (tmpV.z > 1) { x = -x; y = -y; }
      const m = Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x = (x / m) * 0.88; y = (y / m) * 0.82;
      arrowEl.style.left = `${(x * 0.5 + 0.5) * 100}%`;
      arrowEl.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
      arrowEl.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(-y, x)}rad)`;
    }
  } else arrowEl.classList.add('hidden');
}

// ---------- minimap (view only; up = camera forward) ----------
const MAP_SHAPES = {
  1: [['c', 0, 0, 40]],
  2: [['c', 0, 0, 28], ['c', 70, 0, 28], ['r', 26, -2, 18, 4]],
  3: [['c', 0, 0, 45], ['c', 0, 0, 8, 'hi']],
};
const mapCv = $('minimap'), mapCtx = mapCv.getContext('2d');
const MAP_RANGE = 42; // metres from the centre to the rim
function drawMinimap(t) {
  const W2 = mapCv.width, cx = W2 / 2, rad = cx - 3, sc = rad / MAP_RANGE;
  const P = sim.player, th = (yaw * Math.PI) / 180;
  const fx = Math.sin(th), fz = Math.cos(th), rx = -Math.cos(th), rz = Math.sin(th);
  const proj = (x, z) => { const dx = x - P.pos[0], dz = z - P.pos[2]; return [cx + sc * (dx * rx + dz * rz), cx - sc * (dx * fx + dz * fz)]; };
  mapCtx.clearRect(0, 0, W2, W2);
  mapCtx.save();
  mapCtx.beginPath(); mapCtx.arc(cx, cx, rad, 0, Math.PI * 2); mapCtx.clip();
  // terrain in world coordinates
  mapCtx.setTransform(sc * rx, -sc * fx, sc * rz, -sc * fz, cx - (sc * rx * P.pos[0] + sc * rz * P.pos[2]), cx - (-sc * fx * P.pos[0] - sc * fz * P.pos[2]));
  for (const [kind, a, b, c, d] of MAP_SHAPES[nightNo]) {
    mapCtx.fillStyle = d === 'hi' ? '#4a8f6a' : '#2f5d50';
    mapCtx.strokeStyle = '#C9B48A'; mapCtx.lineWidth = 1 / sc;
    mapCtx.beginPath();
    if (kind === 'c') mapCtx.arc(a, b, c, 0, Math.PI * 2); else mapCtx.rect(a, b, c, d);
    mapCtx.fill(); if (d !== 'hi') mapCtx.stroke();
  }
  mapCtx.setTransform(1, 0, 0, 1, 0, 0);
  const pulse = 0.6 + 0.4 * Math.sin(t * 5);
  const edge = (x, y) => { const dx = x - cx, dy = y - cx, l = Math.hypot(dx, dy), m = rad - 9; return l > m ? [cx + (dx / l) * m, cx + (dy / l) * m, true] : [x, y, false]; };
  // game objects
  for (const pd of NIGHTS[nightNo].pads) { const [x, y] = proj(pd.pos[0], pd.pos[2]); mapCtx.strokeStyle = '#F2C14E'; mapCtx.lineWidth = 2; mapCtx.beginPath(); mapCtx.arc(x, y, 5, 0, Math.PI * 2); mapCtx.stroke(); mapCtx.fillStyle = '#C8102E'; mapCtx.beginPath(); mapCtx.arc(x, y, 2.5, 0, Math.PI * 2); mapCtx.fill(); }
  for (const c of sim.charms) if (c.respawn === 0) { const [x, y] = proj(c.pos[0], c.pos[2]); mapCtx.fillStyle = '#C8102E'; mapCtx.fillRect(x - 3, y - 3, 6, 6); mapCtx.strokeStyle = '#F2C14E'; mapCtx.strokeRect(x - 3, y - 3, 6, 6); }
  for (const d of sim.drifters) { const [x, y] = proj(d.pos[0], d.pos[2]); mapCtx.fillStyle = '#8FA3B8'; mapCtx.beginPath(); mapCtx.moveTo(x, y - 5); mapCtx.lineTo(x + 4, y); mapCtx.lineTo(x, y + 5); mapCtx.lineTo(x - 4, y); mapCtx.fill(); }
  for (const s of sim.shades) { const [x, y] = proj(s.pos[0], s.pos[2]); mapCtx.fillStyle = s.state === 'stunned' ? '#3A3450' : '#7A3CFF'; mapCtx.beginPath(); mapCtx.arc(x, y, 4, 0, Math.PI * 2); mapCtx.fill(); mapCtx.strokeStyle = '#120A1A'; mapCtx.stroke(); }
  let nearest = null, nd = Infinity;
  for (const l of sim.lanterns) if (!l.lit || l.fuel < T.low_fuel_threshold * FUEL_SCALE) { const d = Math.hypot(l.pos[0] - P.pos[0], l.pos[2] - P.pos[2]); if (d < nd) { nd = d; nearest = l; } }
  for (const l of sim.lanterns) {
    const [px, py] = proj(l.pos[0], l.pos[2]);
    if (l.lit && l.fuel >= T.low_fuel_threshold * FUEL_SCALE) { mapCtx.fillStyle = '#FFB347'; mapCtx.beginPath(); mapCtx.arc(px, py, 4, 0, Math.PI * 2); mapCtx.fill(); continue; }
    if (l.lit) { mapCtx.fillStyle = pal.danger; mapCtx.globalAlpha = pulse; mapCtx.beginPath(); mapCtx.arc(px, py, 5, 0, Math.PI * 2); mapCtx.fill(); mapCtx.globalAlpha = 1; continue; } // low fuel
    const [x, y, clamped] = edge(px, py);
    const target = l === nearest;
    mapCtx.strokeStyle = target ? pal.danger : '#F2C14E'; mapCtx.lineWidth = target ? 3 : 2;
    mapCtx.globalAlpha = target ? pulse : 0.9;
    mapCtx.beginPath(); mapCtx.arc(x, y, (target ? 8 : 6) + (clamped ? 0 : 0), 0, Math.PI * 2); mapCtx.stroke();
    mapCtx.fillStyle = '#5B5F6E'; mapCtx.beginPath(); mapCtx.arc(x, y, 3, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.globalAlpha = 1;
  }
  // player (always centre, pointing up; the map rotates with the camera)
  const ang = Math.atan2(P.face[0] * rx + P.face[1] * rz, P.face[0] * fx + P.face[1] * fz); // facing relative to camera
  mapCtx.save(); mapCtx.translate(cx, cx); mapCtx.rotate(ang);
  mapCtx.fillStyle = '#F5F1E6'; mapCtx.strokeStyle = '#C8102E'; mapCtx.lineWidth = 2;
  mapCtx.beginPath(); mapCtx.moveTo(0, -8); mapCtx.lineTo(6, 7); mapCtx.lineTo(0, 3); mapCtx.lineTo(-6, 7); mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke();
  mapCtx.restore();
  mapCtx.restore();
}

// ---------- main loop ----------
let last = performance.now(), fpsN = 0, fpsT = 0;
window.__ddl = { setCb(v) { settings.cb = v; applyPalette(); }, fps: 0, get sim() { return sim; }, get screen() { return screen; }, startNight };
function frame(now) {
  if (screen === 'bench') { benchFrame(now); return; }
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  fpsN++; fpsT += dt;
  if (fpsT >= 1) { window.__ddl.fps = fpsN / fpsT; adaptResolution(window.__ddl.fps); fpsN = 0; fpsT = 0; if (params.has('debug')) { $('debug').classList.remove('hidden'); $('debug').textContent = `${window.__ddl.fps.toFixed(0)} fps`; } }
  if (sim && (screen === 'play' || screen === 'pause' || screen === 'result')) {
    if (screen === 'play') {
      timeAcc += dt;
      while (timeAcc >= 1 / 60 && sim.state === 'playing') {
        timeAcc -= 1 / 60;
        const wasWarn = sim.wind.warn, wasG = sim.player.grounded;
        const inp = readInput();
        if (inp.jump && wasG) audio.sfx.jump();
        const evs = sim.step(inp);
        handleEvents(evs);
        edge.jump = edge.interact = edge.pulse = edge.dash = false;
        if (sim.wind.warn && !wasWarn) { audio.sfx.wind(); caption(`${pal.icon}Gió sắp thổi! Bám chắc…`, 'warn'); }
        const sLeft = Math.ceil(sim.timeLeft / 60);
        if (sLeft <= 10 && sLeft > 0 && sLeft !== lastSecBeep) { lastSecBeep = sLeft; audio.sfx.tick(); if (sLeft === 10) caption(`${pal.icon}Còn 10 giây tới bình minh!`, 'warn'); }
        if (sim.state === 'playing' && sim.events.some((e) => e.name === 'player_hit')) { /* sfx handled */ }
        for (const e of evs) if (e.name === 'game_over') { screen = 'wait'; setTimeout(showResult, 900); }
      }
    }
    render(dt, now / 1000);
  } else if (ents.player && sim) render(dt, now / 1000);
  else renderIdle(now / 1000);
  requestAnimationFrame(frame);
}
let lowSecs = 0;
function adaptResolution(fps) {
  if (screen !== 'play') { lowSecs = 0; return; }
  lowSecs = fps < 32 ? lowSecs + 1 : 0;
  if (lowSecs >= 3 && pixelRatio <= 0.55 && settings.shadows) { settings.shadows = false; lowSecs = 0; }
  if (lowSecs >= 1 && pixelRatio > 0.55) {
    pixelRatio = Math.max(0.55, pixelRatio - 0.15);
    renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight);
    lowSecs = 0;
  }
}
function renderIdle(t) {
  camera.position.set(Math.sin(t * 0.1) * 60, 25, Math.cos(t * 0.1) * 60);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
}

// ---------- benchmark scene (Ticket-04) ----------
let bs = null;
const p99 = (a) => { const b = [...a].sort((x, y) => x - y); return Math.round((b[Math.min(b.length - 1, Math.ceil(0.99 * b.length) - 1)] || 0) * 100) / 100; };
function startBench() {
  const seed = Number(params.get('seed') || 42), duration = Number(params.get('duration') || 30);
  screen = 'bench'; hideScreen();
  const th = applyTheme(1); themeNow = th;
  sim = new Sim({ seed, night: 1, scenario: benchScenario(seed), bench: true });
  buildLevel(1, { bench: true });
  clearEntities();
  for (const l of sim.lanterns) ents.lanterns.set(l.id, makeLantern(l));
  yaw = 0; timeAcc = 0;
  $('hud').classList.remove('hidden');
  buildMoteBar(); updateHelp();
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
  bs = { seed, duration, t0: null, lastNow: null, dts: [], first: null, heap: 0, lastLog: 0, cpuSim: [], cpuRender: [] };
  requestAnimationFrame(frame);
}
function benchFrame(now) {
  if (bs.t0 === null) bs.t0 = now;
  const dtMs = bs.lastNow === null ? 0 : now - bs.lastNow;
  bs.lastNow = now;
  const elapsed = (now - bs.t0) / 1000;
  benchState.elapsed = elapsed;
  timeAcc += Math.min(dtMs / 1000, 0.1);
  const c0 = performance.now();
  while (timeAcc >= 1 / 60) { timeAcc -= 1 / 60; sim.step({}); } // no player input; Mây stands still
  const c1 = performance.now();
  render(dtMs / 1000, now / 1000);
  const c2 = performance.now();
  if (elapsed >= BENCH_WARMUP_S) { bs.cpuSim.push(c1 - c0); bs.cpuRender.push(c2 - c1); }
  if (bs.first === null) bs.first = performance.timeOrigin + performance.now(); // first rendered frame of the scene
  if (elapsed >= BENCH_WARMUP_S && dtMs > 0) bs.dts.push(dtMs);
  if (performance.memory) bs.heap = Math.max(bs.heap, performance.memory.usedJSHeapSize / 1048576);
  if (elapsed >= BENCH_WARMUP_S + bs.duration) {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const st = benchStats(bs.dts);
    window.__bench = {
      ...st,
      first_frame_epoch_ms: bs.first,
      vsync_off: bs.dts.filter((d) => d < 15).length / Math.max(1, bs.dts.length) > 0.05,
      three_revision: THREE.REVISION,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      js_heap_peak_mb: Math.round(bs.heap),
      draw: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
      cpu_ms_p99: { sim: p99(bs.cpuSim), render_submit: p99(bs.cpuRender) }, // diagnostics: where the slow frames come from
    };
    return; // stop: the benchmark is over
  }
  requestAnimationFrame(frame);
}

buildLevel(1);
applyPalette();
updateHelp();
const auto = Number(params.get('night'));
if (BENCH) startBench();
else {
  if (auto >= 1 && auto <= 3) { runSeed = (Math.random() * 1e9) | 0; startNight(auto); }
  else showMenu();
  requestAnimationFrame(frame);
}
