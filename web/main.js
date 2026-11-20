import * as THREE from 'three';
import { Sim } from '/src/sim.js';
import { TUNING as T, WORLD as W } from '/src/config.js';
import { NIGHTS } from '/src/levels.js';
import * as audio from '/web/audio.js';
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
const settings = { volume: 0.7, sens: 0.4, cb: false, shadows: true };
// Colour-blind palette (Ticket-03): shade outline/eyes #7A3CFF -> #00B3FF, UI warning #FF5A5F -> #FFFFFF (+ warning icon)
const pal = { danger: '#FF5A5F', outline: 0x7a3cff, eye: 0xf5f1e6, icon: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('ddl.settings') || '{}')); } catch { /* ignore */ }
const saveSettings = () => { try { localStorage.setItem('ddl.settings', JSON.stringify(settings)); } catch { /* ignore */ } };
audio.setVolume(settings.volume);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1.5); // lowered automatically if FPS < 30
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
function buildLevel(n) {
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
  particleSets = th.particles.map((k) => { const pt = makeParticles(k); g.add(pt); return pt; });
  decor = buildDecor(n, L);
  g.add(decor.group);
  scene.add(g);
  levelGroup = g;
}

// ---------- dynamic entities ----------
const lanternLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb347, 0, 18, 1.6); scene.add(l); return l; });
const ents = { player: null, lanterns: new Map(), shades: new Map(), drifters: new Map(), charms: new Map(), motes: null, halos: null, pulses: [], leaves: null };

function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.7, 4, 10), mat(C.shirt)); body.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), mat(0xe9c9a0)); head.position.y = 1.55;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 18), mat(C.sand)); hat.position.y = 1.95;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.09, 8, 16), mat(C.scarf)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.3;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), mat(C.wood)); pole.position.set(0.5, 1.3, 0.25);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), basic(C.lamp)); lamp.position.set(0.5, 2.1, 0.25);
  const light = new THREE.PointLight(C.lamp, 1.6, 14, 1.5); light.position.copy(lamp.position);
  g.add(body, head, hat, scarf, pole, lamp, light);
  g.userData = { light, lamp };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return g;
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
function makeShade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), mat(C.shade));
  const outline = new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 1), new THREE.MeshBasicMaterial({ color: pal.outline, side: THREE.BackSide }));
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), basic(pal.eye)); e1.position.set(0.3, 0.2, 0.7);
  const e2 = e1.clone(); e2.position.x = -0.3;
  g.add(outline, body, e1, e2);
  g.userData = { body, outline, eyes: [e1, e2] };
  scene.add(g);
  return g;
}
function applyPalette() {
  pal.danger = settings.cb ? '#FFFFFF' : '#FF5A5F';
  pal.outline = settings.cb ? 0x00b3ff : 0x7a3cff;
  pal.eye = settings.cb ? 0x00b3ff : 0xf5f1e6;
  pal.icon = settings.cb ? '⚠ ' : '';
  document.documentElement.style.setProperty('--danger', pal.danger);
  document.body.classList.toggle('cb', !!settings.cb);
  for (const g of ents.shades.values()) { g.userData.outline.material.color.setHex(pal.outline); for (const e of g.userData.eyes) e.material.color.setHex(pal.eye); }
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
const MAXM = 48;
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
  show(`<h1>Đảo Đèn Lồng</h1><p class="quote">Đêm nay sương đen đã nuốt hết ánh sáng của đảo.</p><div class="btns">${btn('b-play', 'Chơi')}${btn('b-set', 'Cài đặt')}</div>`);
  on('b-play', () => { totalScore = 0; showIntro(1); });
  on('b-set', () => showSettings(showMenu));
  focusFirst();
}
function showSettings(back) {
  show(`<h2>Cài đặt</h2>
    <label class="row">Âm lượng <input id="s-vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
    <label class="row">Độ nhạy chuột <input id="s-sens" type="range" min="0.1" max="1" step="0.05" value="${settings.sens}"></label>
    <label class="row">Bảng màu dễ phân biệt <input id="s-cb" type="checkbox" ${settings.cb ? 'checked' : ''}></label>
    <label class="row">Đổ bóng (tắt nếu máy yếu) <input id="s-sh" type="checkbox" ${settings.shadows ? 'checked' : ''}></label>
    <div class="btns">${btn('b-back', 'Quay lại')}</div>`);
  $('s-sh').onchange = (e) => { settings.shadows = e.target.checked; saveSettings(); };
  $('s-cb').onchange = (e) => { settings.cb = e.target.checked; saveSettings(); applyPalette(); };
  $('s-vol').oninput = (e) => { settings.volume = +e.target.value; audio.setVolume(settings.volume); saveSettings(); };
  $('s-sens').oninput = (e) => { settings.sens = +e.target.value; saveSettings(); };
  on('b-back', back);
  focusFirst();
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
  sim = new Sim({ seed: (Math.random() * 1e9) | 0, night: n });
  buildLevel(n);
  clearEntities();
  for (const l of sim.lanterns) ents.lanterns.set(l.id, makeLantern(l));
  for (const c of sim.charms) ents.charms.set(c.id, makeCharm(c));
  yaw = 0; timeAcc = 0; uiPaused = false; lastSecBeep = -1;
  hideScreen(); screen = 'play';
  $('hud').classList.remove('hidden'); $('help').classList.remove('hidden');
  buildMoteBar();
}
function stopPlayHud() { $('hud').classList.add('hidden'); $('help').classList.add('hidden'); }

function showResult() {
  const won = sim.state === 'won';
  screen = 'result';
  if (won) { totalScore += sim.score; audio.sfx.win(); } else audio.sfx.lose();
  if (won && nightNo === 3) {
    show(`<h1>Bình Minh</h1><p>Mây đã giữ cho ba hòn đảo sáng đèn tới tận lúc mặt trời lên.</p><p>Tổng điểm: <span class="score">${totalScore}</span></p><div class="btns">${btn('b-menu', 'Về menu')}</div>`);
    on('b-menu', showMenu);
  } else if (won) {
    show(`<h1>Bình minh Đêm ${nightNo}!</h1><p>Đảo vẫn sáng khi trời hửng. Điểm đêm này: <span class="score">${sim.score}</span> · Tổng: <span class="score">${totalScore}</span></p><div class="btns">${btn('b-next', 'Đêm kế tiếp')}${btn('b-menu', 'Về menu')}</div>`);
    on('b-next', () => showIntro(nightNo + 1)); on('b-menu', showMenu);
  } else {
    const litN = sim.lanterns.filter((l) => l.lit).length, needN = Math.ceil(T.win_ratio * sim.lanterns.length - 1e-9);
    const why = sim.events.find((e) => e.name === 'game_over')?.data.reason === 'dawn' ? `Trời sáng mà chỉ còn ${litN}/${sim.lanterns.length} đèn sáng, cần ít nhất ${needN}…` : 'Ngọn Lửa của Mây đã tắt…';
    show(`<h1>Thất bại</h1><p>${why}</p><div class="btns">${btn('b-retry', 'Chơi lại Đêm ' + nightNo)}${btn('b-menu', 'Về menu')}</div>`);
    on('b-retry', () => startNight(nightNo)); on('b-menu', showMenu);
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

// ---------- input ----------
addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'play') pauseGame(); else if (screen === 'pause') resumeGame();
    return;
  }
  if (screen !== 'play') return;
  keys.add(e.code);
  if (e.code === 'Space') { edge.jump = true; e.preventDefault(); }
  if (e.code === 'KeyE') edge.interact = true;
  if (e.code === 'KeyF') edge.pulse = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') edge.dash = true;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (screen === 'play') pauseGame(); });
let drag = false;
addEventListener('mousedown', () => { drag = true; });
addEventListener('mouseup', () => { drag = false; });
addEventListener('mousemove', (e) => { if (drag && screen === 'play') yaw -= e.movementX * settings.sens; });

function readInput() {
  if (keys.has('KeyQ')) yaw += 90 / 60;
  if (keys.has('KeyR')) yaw -= 90 / 60;
  const x = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: yaw, jump: edge.jump, interact: edge.interact, pulse: edge.pulse, dash: edge.dash, pause: false };
}

// ---------- sounds from sim events ----------
function handleEvents(evs) {
  for (const e of evs) {
    switch (e.name) {
      case 'mote_picked': audio.sfx.pick(); break;
      case 'deposit': case 'refuel': audio.sfx.deposit(); break;
      case 'lantern_out': audio.sfx.out(); break;
      case 'lantern_lit': audio.sfx.light(); break;
      case 'pulse': audio.sfx.pulse(); spawnPulse(); break;
      case 'player_hit': (e.data.by === 'fall' ? audio.sfx.fall : audio.sfx.hit)(); break;
      case 'dash': audio.sfx.dash(); break;
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
  if (!ents.player) { ents.player = makePlayer(); makeMotes(); makeLeaves(); }
}
const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const cache = {};
const setTxt = (el, v) => { if (cache[el.id] !== v) { cache[el.id] = v; el.innerHTML = v; } };

function render(dt, t) {
  ensureEntities();
  const P = sim.player;
  const pg = ents.player;
  pg.position.set(P.pos[0], P.pos[1], P.pos[2]);
  pg.rotation.y = Math.atan2(P.face[0], P.face[1]);
  pg.visible = !(P.invuln > 0 && Math.floor(t * 10) % 2 === 0) && P.fall === 0;
  pg.userData.light.intensity = 1.2 + P.carried * 0.12;

  // camera
  const th = (yaw * Math.PI) / 180, fx = Math.sin(th), fz = Math.cos(th);
  const cy = P.fall > 0 ? 0 : P.pos[1];
  camera.position.set(P.pos[0] - fx * 9, cy + 6, P.pos[2] - fz * 9);
  camera.lookAt(P.pos[0] + fx * 3, cy + 1, P.pos[2] + fz * 3);

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
  syncMap(ents.shades, sim.shades, makeShade, (g, s) => {
    g.position.set(s.pos[0], s.pos[1] + Math.sin(t * 4 + s.pos[0]) * 0.1, s.pos[2]);
    const stunned = s.state === 'stunned';
    g.userData.body.material.color.setHex(stunned ? C.stun : C.shade);
    g.rotation.y = Math.atan2(P.pos[0] - s.pos[0], P.pos[2] - s.pos[2]);
    const sc = s.state === 'spawning' ? 0.4 : 1;
    g.scale.setScalar(sc);
  });
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
  if (near) setTxt(pr, near.lit ? `E — Châm dầu (${Math.ceil(near.fuel / FUEL_SCALE)}/${T.fuel_max})` : `E — ${near.ever ? 'Thắp lại' : 'Thắp đèn'} (${near.deposited}/${near.ever ? T.relight_cost : T.lantern_cost})`);

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
        if (sim.wind.warn && !wasWarn) audio.sfx.wind();
        const sLeft = Math.ceil(sim.timeLeft / 60);
        if (sLeft <= 10 && sLeft > 0 && sLeft !== lastSecBeep) { lastSecBeep = sLeft; audio.sfx.tick(); }
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

buildLevel(1);
applyPalette();
const auto = Number(params.get('night'));
if (auto >= 1 && auto <= 3) startNight(auto);
else showMenu();
requestAnimationFrame(frame);
