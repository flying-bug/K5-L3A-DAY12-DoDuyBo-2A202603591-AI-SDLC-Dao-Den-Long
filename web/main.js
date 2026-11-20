import * as THREE from 'three';
import { Sim } from '/src/sim.js';
import { TUNING as T, WORLD as W } from '/src/config.js';

const hud = document.getElementById('hud');
const msg = document.getElementById('msg');

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120a24);
scene.fog = new THREE.FogExp2(0x1a0f33, 0.018);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const ambient = new THREE.AmbientLight(0x5a3d8a, 0.5);
scene.add(ambient);

const island = new THREE.Mesh(new THREE.CylinderGeometry(W.island_radius, W.island_radius - 2, 2, 48), new THREE.MeshStandardMaterial({ color: 0x3a2a55, flatShading: true }));
island.position.y = -1;
scene.add(island);

// player: body + straw-hat cone + hanging lantern
const player = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: 0xd9a066 }));
body.position.y = 0.8;
const hat = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xe8c872 }));
hat.position.y = 1.7;
const handLantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
handLantern.position.set(0.6, 1.1, 0.2);
const playerLight = new THREE.PointLight(0xffb347, 1.2, 12);
playerLight.position.set(0.6, 1.1, 0.2);
player.add(body, hat, handLantern, playerLight);
scene.add(player);

const lanternMeshes = new Map();
const moteMeshes = new Map();
const shadeMeshes = new Map();
const moteGeo = new THREE.SphereGeometry(0.2, 8, 8);
const moteMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
const shadeGeo = new THREE.IcosahedronGeometry(0.9, 1);
const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2b0f4d, emissive: 0x3a0f66, flatShading: true });
const stunMat = new THREE.MeshStandardMaterial({ color: 0x8888ff, emissive: 0x5555cc, flatShading: true });

function makeLantern(l) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3, 8), new THREE.MeshStandardMaterial({ color: 0x5a3a2a }));
  pole.position.y = 1.5;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x000000 }));
  lamp.position.y = 3.4;
  const light = new THREE.PointLight(0xffa640, 0, 30);
  light.position.y = 3.4;
  g.add(pole, lamp, light);
  g.position.set(l.pos[0], 0, l.pos[2]);
  g.userData = { lamp, light };
  scene.add(g);
  return g;
}

// ---------- game state ----------
let sim, mode, timeAcc = 0, yaw = 0;
function newGame() {
  sim = new Sim({ seed: (Math.random() * 1e9) | 0 });
  mode = 'play';
  msg.style.display = 'none';
  for (const m of [...lanternMeshes.values(), ...moteMeshes.values(), ...shadeMeshes.values()]) scene.remove(m);
  lanternMeshes.clear(); moteMeshes.clear(); shadeMeshes.clear();
  for (const l of sim.lanterns) lanternMeshes.set(l.id, makeLantern(l));
}
newGame();

// ---------- input ----------
const keys = new Set();
const edge = { jump: false, interact: false, pulse: false };
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { edge.jump = true; e.preventDefault(); }
  if (e.code === 'KeyE') edge.interact = true;
  if (e.code === 'KeyF') edge.pulse = true;
  if (e.code === 'Enter' && sim.state !== 'playing') newGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));
let drag = false;
addEventListener('mousedown', () => { drag = true; });
addEventListener('mouseup', () => { drag = false; });
addEventListener('mousemove', (e) => { if (drag) yaw -= e.movementX * 0.4; });

// Camera sits behind the player looking toward world direction (sin yaw, cos yaw); that is "forward" (move z=+1).
function readInput(dt) {
  if (keys.has('KeyQ')) yaw += 90 * dt;
  if (keys.has('KeyR')) yaw -= 90 * dt;
  const x = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: yaw, jump: edge.jump, interact: edge.interact, pulse: edge.pulse };
}

// ---------- loop ----------
let last = performance.now();
const flash = { t: 0 };
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (sim.state === 'playing') {
    timeAcc += dt;
    while (timeAcc >= 1 / 60 && sim.state === 'playing') {
      timeAcc -= 1 / 60;
      const inp = readInput(1 / 60);
      for (const ev of sim.step(inp)) if (ev.name === 'player_hit' || ev.name === 'pulse') flash.t = 0.25;
      edge.jump = edge.interact = edge.pulse = false; // one-tick pulses; sim does its own edge detection
    }
    if (sim.state !== 'playing') showEnd();
  }
  render(dt, now / 1000);
  requestAnimationFrame(frame);
}

function showEnd() {
  const won = sim.state === 'won';
  msg.style.display = 'flex';
  msg.innerHTML = `<h1>${won ? 'Đảo đã sáng trở lại!' : 'Sương đen đã nuốt hết ánh sáng…'}</h1><p>Điểm: <b>${sim.score}</b></p><p>Nhấn Enter để chơi lại</p>`;
}

function render(dt, t) {
  const P = sim.player;
  player.position.set(P.pos[0], P.pos[1], P.pos[2]);
  player.rotation.y = (yaw * Math.PI) / 180;
  player.visible = !(P.invuln > 0 && Math.floor(t * 10) % 2 === 0);
  playerLight.intensity = 0.8 + P.carried * 0.15 + (flash.t > 0 ? 3 : 0);
  flash.t = Math.max(0, flash.t - dt);

  const th = (yaw * Math.PI) / 180;
  const fx = Math.sin(th), fz = Math.cos(th);
  camera.position.set(P.pos[0] - fx * 9, P.pos[1] + 6, P.pos[2] - fz * 9);
  camera.lookAt(P.pos[0] + fx * 3, P.pos[1] + 1, P.pos[2] + fz * 3);

  let lit = 0;
  for (const l of sim.lanterns) {
    const g = lanternMeshes.get(l.id), { lamp, light } = g.userData;
    const frac = l.lit ? 1 : l.deposited / T.lantern_cost;
    if (l.lit) lit++;
    lamp.material.emissive.setRGB(1 * frac, 0.6 * frac, 0.15 * frac);
    lamp.material.color.setRGB(0.2 + 0.8 * frac, 0.2 + 0.6 * frac, 0.2);
    light.intensity = l.lit ? 3 : frac * 1.2;
  }
  ambient.intensity = 0.4 + 0.5 * (lit / sim.lanterns.length); // the island brightens as lanterns are lit

  sync(moteMeshes, sim.motes, (m) => new THREE.Mesh(moteGeo, moteMat), (mesh, m) => mesh.position.set(m.pos[0], 0.7 + Math.sin(t * 3 + m.pos[0]) * 0.15, m.pos[2]));
  sync(shadeMeshes, sim.shades, () => new THREE.Mesh(shadeGeo, shadeMat), (mesh, s) => {
    mesh.position.set(s.pos[0], s.pos[1] + Math.sin(t * 4) * 0.15, s.pos[2]);
    mesh.material = s.state === 'stunned' ? stunMat : shadeMat;
  });

  const tl = Math.max(0, sim.timeLeftTicks / 60);
  const flames = '🔥'.repeat(Math.max(0, P.flames)) || '–';
  hud.innerHTML = `Máu: ${flames}<br>Ánh sáng mang theo: <b>${P.carried}/${T.carry_capacity}</b> (đèn cần ${T.lantern_cost})<br>Đèn đã thắp: <b>${lit}/${sim.lanterns.length}</b><br>Điểm: <b>${sim.score}</b> · Trời sáng sau: ${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  renderer.render(scene, camera);
}

function sync(map, items, make, update) {
  const seen = new Set();
  for (const it of items) {
    seen.add(it.id);
    let m = map.get(it.id);
    if (!m) { m = make(it); scene.add(m); map.set(it.id, m); }
    update(m, it);
  }
  for (const [id, m] of map) if (!seen.has(id)) { scene.remove(m); map.delete(id); }
}

requestAnimationFrame(frame);
