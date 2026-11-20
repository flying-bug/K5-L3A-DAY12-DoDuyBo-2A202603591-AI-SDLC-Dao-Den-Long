import * as THREE from 'three';
import { Sim } from '/src/sim.js';
import { TUNING as T, WORLD as W } from '/src/config.js';
import { NIGHTS } from '/src/levels.js';
import * as audio from '/web/audio.js';

// ---------- palette (Ticket-02) ----------
const C = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lamp: 0xffb347, core: 0xffe9b0, off: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shade: 0x120a1a, outline: 0x7a3cff, stun: 0x3a3450, shirt: 0xe8e2d0, scarf: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8,
};
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------- settings (persisted) ----------
const settings = { volume: 0.7, sens: 0.4 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('ddl.settings') || '{}')); } catch { /* ignore */ }
const saveSettings = () => { try { localStorage.setItem('ddl.settings', JSON.stringify(settings)); } catch { /* ignore */ } };
audio.setVolume(settings.volume);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1.5); // lowered automatically if FPS < 30
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.Fog(C.fog, 30, 120);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
const moon = new THREE.DirectionalLight(0x9fb2e8, 1.0);
moon.position.set(-30, 60, 20);
const sky = new THREE.HemisphereLight(0x6f80c8, 0x2f5d50, 0.55); // soft night fill, keeps the ticket's ambient formula intact
scene.add(ambient, moon, sky);

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
let levelGroup = null;
function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  scene.remove(g);
}
const cyl = (r, h, color, x, y, z, seg = 48) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color)); m.position.set(x, y, z); return m; };
function island(g, cx, cz, r) {
  g.add(cyl(r, 2, C.grass, cx, -1, cz), cyl(r + 0.8, 1.6, C.sand, cx, -1.3, cz), cyl(r - 4, 0.05, 0x356b5c, cx, 0.02, cz));
}
function padMesh(p) {
  const g = new THREE.Group();
  g.add(cyl(p.r, 0.2, C.scarf, 0, 0, 0, 24), cyl(p.r * 0.7, 0.25, C.gold, 0, 0.02, 0, 24));
  g.position.set(p.pos[0], p.pos[1] + 0.1, p.pos[2]);
  return g;
}
function buildLevel(n) {
  if (levelGroup) disposeGroup(levelGroup);
  const L = NIGHTS[n];
  const g = new THREE.Group();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mat(C.sea));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -14;
  g.add(sea);
  if (n === 1) island(g, 0, 0, 40);
  if (n === 2) {
    island(g, 0, 0, 28); island(g, 70, 0, 28);
    const br = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 4), mat(C.wood)); br.position.set(35, -0.2, 0); g.add(br);
    for (let x = 27; x <= 43; x += 2) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 4.1), mat(0x4a3220)); pl.position.set(x, 0.02, 0); g.add(pl); }
  }
  if (n === 3) {
    g.add(cyl(45, 2, C.grass, 0, -1, 0), cyl(46, 1.6, C.sand, 0, -1.3, 0));
    // tier 1: half annulus r 12..24 on z>0, height 3 (extruded along +Y)
    const sh = new THREE.Shape();
    const pts = 24;
    for (let i = 0; i <= pts; i++) { const a = (i / pts) * Math.PI; const x = 24 * Math.cos(a), y = -24 * Math.sin(a); if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); }
    for (let i = pts; i >= 0; i--) { const a = (i / pts) * Math.PI; sh.lineTo(12 * Math.cos(a), -12 * Math.sin(a)); }
    const t1 = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }), mat(0x3a6d5d));
    t1.rotation.x = -Math.PI / 2;
    g.add(t1);
    g.add(cyl(8, 6, 0x42786a, 0, 3, 0));
    // ramps
    for (const a of [30, 150]) {
      const ph = (a * Math.PI) / 180;
      const holder = new THREE.Group();
      holder.rotation.y = -ph;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.3, 3), mat(C.wood));
      slab.rotation.z = -Math.atan(0.5);
      slab.position.set(27, 1.5 - 0.17, 0);
      holder.add(slab);
      g.add(holder);
    }
    // bell tower
    const tower = cyl(2, 8, C.sand, 0, 10, 0, 20);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 20), mat(C.wood)); roof.position.set(0, 15.2, 0);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), basic(C.gold)); bell.position.set(0, 12.5, 0);
    g.add(tower, roof, bell);
  }
  for (const p of L.pads) g.add(padMesh(p));
  // stars
  const sp = new Float32Array(300 * 3);
  for (let i = 0; i < 300; i++) { const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.2, r = 220; sp[i * 3] = r * Math.cos(a) * Math.cos(e); sp[i * 3 + 1] = r * Math.sin(e); sp[i * 3 + 2] = r * Math.sin(a) * Math.cos(e); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xf5f1e6, size: 1.2, fog: false })));
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
  scene.add(g);
  return g;
}
function makeLantern(l) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 3, 8), mat(C.wood)); pole.position.y = 1.5;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16), new THREE.MeshBasicMaterial({ color: C.off })); lamp.position.y = 3.4;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); halo.scale.setScalar(7); halo.position.y = 3.4;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(T.safe_radius, 40), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, fog: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04;
  g.add(pole, lamp, halo, pool, shadow);
  g.position.set(l.pos[0], l.pos[1], l.pos[2]);
  g.userData = { lamp, halo, pool };
  scene.add(g);
  return g;
}
function makeShade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), mat(C.shade));
  const outline = new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 1), new THREE.MeshBasicMaterial({ color: C.outline, side: THREE.BackSide }));
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), basic(0xf5f1e6)); e1.position.set(0.3, 0.2, 0.7);
  const e2 = e1.clone(); e2.position.x = -0.3;
  g.add(outline, body, e1, e2);
  g.userData = { body, outline };
  scene.add(g);
  return g;
}
function makeDrifter() {
  const g = new THREE.Group();
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 2.6, 1, 1, 8), mat(C.drifter, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  g.add(rib);
  g.userData = { rib };
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
  1: 'Ông Đăng, người giữ đèn già: "Sương đen nuốt hết ánh sáng của đảo rồi, Mây ạ. Nhặt đom đóm, thắp lại năm Đèn Lồng Lớn. Bóng Mực sợ ánh đèn, nhưng đừng để chúng chạm vào cháu."',
  2: 'Ông Đăng: "Đảo Cau có hai bờ, nối nhau bằng chiếc cầu tre không lan can. Bước hụt là rơi xuống biển mây đấy. Thấy bục đỏ viền vàng thì cứ đạp lên. Và coi chừng Gió Lạc, chúng thích đom đóm lắm."',
  3: 'Ông Đăng: "Đảo Chuông cao ba tầng, quả chuông trên đỉnh phải được thắp sáng. Gió trên đó mạnh lắm, thấy lá bay thì nắm chặt nón nhé, Mây."',
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
    <div class="btns">${btn('b-back', 'Quay lại')}</div>`);
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
    show(`<h1>Bình Minh</h1><p>Ánh sáng đã trở lại khắp ba hòn đảo. Mây ngoái nhìn: mặt trời đang lên.</p><p>Tổng điểm: <span class="score">${totalScore}</span></p><div class="btns">${btn('b-menu', 'Về menu')}</div>`);
    on('b-menu', showMenu);
  } else if (won) {
    show(`<h1>Đêm ${nightNo} hoàn thành!</h1><p>Điểm đêm này: <span class="score">${sim.score}</span> · Tổng: <span class="score">${totalScore}</span></p><div class="btns">${btn('b-next', 'Đêm kế tiếp')}${btn('b-menu', 'Về menu')}</div>`);
    on('b-next', () => showIntro(nightNo + 1)); on('b-menu', showMenu);
  } else {
    const why = sim.events.find((e) => e.name === 'game_over')?.data.reason === 'dawn' ? 'Trời sáng mà đèn vẫn chưa đủ…' : 'Ngọn Lửa của Mây đã tắt…';
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
      case 'deposit': audio.sfx.deposit(); break;
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
    // only activated lanterns emit light; progress of a half-filled lantern is shown in the HUD, never as light
    u.lamp.material.color.setHex(l.lit ? C.core : C.off);
    u.halo.material.opacity = l.lit ? 0.6 * (0.92 + 0.08 * Math.sin(t * 3 + l.pos[0])) : 0;
    u.pool.material.opacity = l.lit ? 0.5 : 0;
    u.lamp.scale.setScalar(l.lit ? 1.1 : 0.85);
  }
  const litNear = sim.lanterns.filter((l) => l.lit)
    .sort((a, b) => Math.hypot(a.pos[0] - P.pos[0], a.pos[2] - P.pos[2]) - Math.hypot(b.pos[0] - P.pos[0], b.pos[2] - P.pos[2]));
  lanternLights.forEach((pl, i) => {
    const l = litNear[i];
    pl.intensity = l ? 2.4 : 0;
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
    g.rotation.y = t * 2; g.rotation.z = Math.sin(t * 6) * 0.4;
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

  updateHud(lit, t);
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
function buildMoteBar() {
  const bar = $('motebar'); bar.innerHTML = '';
  moteCells = Array.from({ length: T.carry_capacity }, () => { const i = document.createElement('i'); bar.appendChild(i); return i; });
  for (const k of Object.keys(cache)) delete cache[k];
}
const arrowEl = $('arrow');
function updateHud(lit, t) {
  const P = sim.player;
  setTxt($('flames'), Array.from({ length: T.flames }, (_, i) => `<span class="${i < P.flames ? '' : 'off'}">🔥</span>`).join(''));
  const tl = Math.max(0, Math.ceil(sim.timeLeft / 60));
  setTxt($('clock'), `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`);
  $('clock').classList.toggle('low', sim.timeLeft <= 30 * 60);
  setTxt($('lamps'), `🏮 ${lit}/${sim.lanterns.length}`);
  setTxt($('score'), String(sim.score));
  moteCells.forEach((c, i) => c.classList.toggle('on', i < P.carried));
  $('cd-dash').querySelector('.fill').style.height = `${Math.min(100, (P.dashCd / Math.round(T.dash_cooldown_s * 60)) * 100)}%`;
  $('cd-pulse').querySelector('.fill').style.height = `${Math.min(100, (P.pulseCd / Math.round(T.pulse_cooldown_s * 60)) * 100)}%`;
  $('cd-dash').classList.toggle('ready', P.dashCd === 0);
  $('cd-pulse').classList.toggle('ready', P.pulseCd === 0 && P.carried >= T.pulse_cost);
  $('charmtag').classList.toggle('hidden', P.charm === 0);
  if (P.charm) setTxt($('charmtag'), `Bùa Gió ${Math.ceil(P.charm / 60)}s`);
  $('windwarn').classList.toggle('hidden', !sim.wind.warn);

  // interaction prompt: nearest unlit lantern within interact radius
  let near = null, nd = Infinity, target = null, td = Infinity;
  for (const l of sim.lanterns) {
    if (l.lit) continue;
    const d = Math.hypot(P.pos[0] - l.pos[0], P.pos[2] - l.pos[2]);
    if (d <= T.interact_radius && d < nd) { near = l; nd = d; }
    if (d < td) { target = l; td = d; }
  }
  const pr = $('prompt');
  pr.classList.toggle('hidden', !near);
  if (near) setTxt(pr, `E — Nạp ánh sáng (${near.deposited}/${T.lantern_cost})`);

  // arrow toward nearest unlit lantern when it is off-screen
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

// ---------- main loop ----------
let last = performance.now(), fpsN = 0, fpsT = 0;
window.__ddl = { fps: 0, get sim() { return sim; }, get screen() { return screen; }, startNight };
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
  if (lowSecs >= 2 && pixelRatio > 0.55) {
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
const auto = Number(params.get('night'));
if (auto >= 1 && auto <= 3) startNight(auto);
else showMenu();
requestAnimationFrame(frame);
