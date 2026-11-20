// Deterministic game logic (Contract v1.1). No DOM / GPU / wall-clock. 60 fixed ticks per second.
// Per-tick order is mandatory (Ticket-02): see step().
import { TUNING as T, WORLD as W } from './config.js';
import { NIGHTS } from './levels.js';

const DT = 1 / 60;
const r3 = (n) => Math.round(n * 1000) / 1000 + 0; // +0 turns -0 into 0
const r3v = (a) => a.map(r3);
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const sec = (ticks) => r3(ticks / 60);

export const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain'];
// Fuel is stored as an integer in 1/60 units so decay (1/60 per tick) and drain (5/60 per tick) never accumulate float error.
const FUEL_SCALE = 60;
const FUEL_MAX = T.fuel_max * FUEL_SCALE;
const FUEL_LOW = T.low_fuel_threshold * FUEL_SCALE;
const fuelOut = (u) => Math.round((u / FUEL_SCALE) * 10) / 10;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sim {
  /** @param {{seed?:number, night?:number, scenario?:object}} opts */
  constructor({ seed = 1, night = 1, scenario = {} } = {}) {
    this.L = NIGHTS[night];
    if (!this.L) throw new Error(`unknown night ${night}`);
    this.night = night;
    this.rng = mulberry32(seed);
    this.tick = 0; // all steps, including paused ones
    this.simTick = 0; // gameplay steps only
    this.state = 'playing'; // playing | paused | won | lost
    this.score = 0;
    this.events = [];
    this.timeLeft = Math.round((scenario.time_left_s ?? T[this.L.duration_key]) * 60);
    this.prev = { jump: false, interact: false, pulse: false, dash: false, pause: false };

    // ---- player
    const p = scenario.player || {};
    const pos = p.pos ? [...p.pos] : [...this.L.start];
    const s0 = this.L.surface(pos[0], pos[2]);
    if (s0 !== null && pos[1] < s0) pos[1] = s0;
    this.player = {
      pos, vel: [0, 0, 0], vy: 0,
      grounded: s0 !== null && pos[1] <= s0 + 1e-9,
      launched: false, launchV: [0, 0],
      face: [0, 1],
      carried: p.carried ?? 0, flames: p.flames ?? T.flames,
      invuln: p.invuln_ticks ?? 0, dashCd: p.dash_cd_ticks ?? 0, dashLeft: 0, dashDir: [0, 1],
      pulseCd: p.pulse_cd_ticks ?? 0, charm: p.charm_ticks ?? 0, fall: 0,
      lights: p.successful_lights ?? 0, // successful_lights: grows the carry capacity
    };

    // ---- lanterns
    this.lanterns = this.L.lanterns.map((lp, i) => ({ id: `L${i + 1}`, pos: [...lp], lit: false, deposited: 0, fuel: 0, ever: false, relit: 0 }));
    for (const sl of scenario.lanterns || []) {
      const l = this.lanterns.find((x) => x.id === sl.id);
      if (!l) continue;
      if (sl.pos) l.pos = [...sl.pos];
      if (sl.deposited != null) l.deposited = sl.deposited;
      if (sl.lit) { l.lit = true; l.deposited = Math.max(l.deposited, T.lantern_cost); l.fuel = Math.round((sl.fuel ?? T.fuel_max) * FUEL_SCALE); l.ever = true; }
      if (sl.ever_lit != null) l.ever = sl.ever_lit || l.lit;
      if (sl.relit_count != null) l.relit = sl.relit_count;
      if (l.lit && l.fuel <= 0) { l.lit = false; l.deposited = 0; }
    }

    // ---- motes
    this.moteSeq = 0;
    this.motes = [];
    this.randomMotes = scenario.random_motes !== false;
    if (scenario.motes) {
      for (const m of scenario.motes) {
        const o = Array.isArray(m) ? { pos: m } : m;
        this._addMote(o.pos, o.kind || 'random', o.ttl_ticks ?? 0, -1);
      }
    } else if (this.randomMotes) {
      const idx = this.L.moteSpawns.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (const i of idx.slice(0, W.initial_motes)) {
        const [x, z] = this.L.moteSpawns[i];
        this._addMote([x, this.L.surface(x, z) ?? 0, z], 'random', 0, i);
      }
    }

    // ---- shades
    this.shadeSeq = 0;
    this.shades = [];
    this.randomShades = scenario.random_shades !== false;
    for (const s of scenario.shades || []) this._addShade(s.pos, s.id, s.state, s.state_ticks_left, s.target_lantern_id);

    // ---- drifters
    this.drifterSeq = 0;
    this.drifters = [];
    this.randomDrifters = scenario.random_drifters ?? this.L.drifters;
    for (const d of scenario.drifters || []) this._addDrifter(d.pos, d.id, d.state, d.stolen, d.ticks_left);

    // ---- charms
    this.charms = (scenario.charms
      ? scenario.charms.map((c, i) => ({ id: c.id ?? `C${i + 1}`, pos: [...(c.pos ?? this.L.charms[i] ?? [0, 0, 0])], respawn: c.respawn_ticks ?? Math.round((c.respawn_s ?? 0) * 60) }))
      : this.L.charms.map((cp, i) => ({ id: `C${i + 1}`, pos: [...cp], respawn: 0 })));
    for (const c of this.charms) { const a = scenario.charms?.find?.((x) => x.id === c.id); if (a && a.available === false && c.respawn === 0) c.respawn = W.charm_respawn_ticks; }

    // ---- wind
    this.windEnabled = scenario.wind_enabled ?? this.L.wind;
    this.wind = { active: false, warn: false, dir: 0 };
  }

  // ======== entity helpers ========
  _addMote(pos, kind, ttl, spawnIdx) {
    this.motes.push({ id: `M${++this.moteSeq}`, pos: [pos[0], pos[1] ?? 0, pos[2]], kind, ttl, spawnIdx });
  }
  _addShade(pos, id, state = 'wander', ticksLeft, target = null) {
    if (!id) id = `S${++this.shadeSeq}`;
    else { const n = /^S(\d+)$/.exec(id); if (n) this.shadeSeq = Math.max(this.shadeSeq, +n[1]); }
    const g = this.L.surface(pos[0], pos[2]) ?? (pos[1] > 0 ? pos[1] - W.shade_center_y : 0);
    const s = {
      id, pos: [pos[0], g + W.shade_center_y, pos[2]], state,
      spawnLeft: 0, stun: 0, pushLeft: 0, pushDir: [1, 0], recoilLeft: 0, recoilDir: [1, 0],
      expel: 0, expelFrom: null, heading: this.rng() * Math.PI * 2, wanderT: 0, target, drainT: 0,
    };
    if (state === 'spawning') s.spawnLeft = ticksLeft ?? 1;
    if (state === 'stunned') s.stun = ticksLeft ?? W.stun_ticks;
    if (state === 'recoil') s.recoilLeft = ticksLeft ?? W.recoil_ticks;
    this.shades.push(s);
    return s;
  }
  _addDrifter(pos, id, state = 'idle', stolen = 0, ticksLeft) {
    if (!id) id = `D${++this.drifterSeq}`;
    else { const n = /^D(\d+)$/.exec(id); if (n) this.drifterSeq = Math.max(this.drifterSeq, +n[1]); }
    const g = this.L.surface(pos[0], pos[2]) ?? 0;
    const d = { id, pos: [pos[0], g + W.drifter_y, pos[2]], state, stolen, stoleOnce: stolen > 0 || state === 'flee', fleeLeft: ticksLeft ?? (state === 'flee' ? W.drifter_flee_ticks : 0), heading: this.rng() * Math.PI * 2, wanderT: 0 };
    this.drifters.push(d);
    return d;
  }
  _emit(name, data) { this.events.push({ type: 'event', tick: this.tick, name, data }); }

  // ======== world queries ========
  _blockedByObstacle(nx, nz, cx, cz, footY) {
    for (const o of this.L.obstacles) {
      if (footY >= o.top) continue;
      const nd = Math.hypot(nx - o.x, nz - o.z);
      if (nd < o.r && nd <= Math.hypot(cx - o.x, cz - o.z) + 1e-9) return true;
    }
    return false;
  }
  /** Player horizontal move with wall + slide. Void is walkable (you fall). */
  _movePlayerXZ(dx, dz) {
    const P = this.player;
    const [x, , z] = P.pos;
    const y = P.pos[1];
    const ok = (nx, nz) => {
      const s = this.L.surface(nx, nz);
      if (s !== null && s > y + W.step_height) return false;
      return !this._blockedByObstacle(nx, nz, x, z, y);
    };
    if (ok(x + dx, z + dz)) { P.pos[0] = x + dx; P.pos[2] = z + dz; }
    else if (dx && ok(x + dx, z)) P.pos[0] = x + dx;
    else if (dz && ok(x, z + dz)) P.pos[2] = z + dz;
  }
  /** Ground-bound enemy move: stays on the surface, can use ramps, cannot climb cliffs. */
  _walk(pos, dx, dz) {
    const [x, , z] = pos;
    const gy = pos[1] - W.shade_center_y;
    const ok = (nx, nz) => {
      const s = this.L.surface(nx, nz);
      if (s === null || Math.abs(s - gy) > W.step_height) return false;
      return !this._blockedByObstacle(nx, nz, x, z, gy);
    };
    let nx = x, nz = z;
    if (ok(x + dx, z + dz)) { nx = x + dx; nz = z + dz; }
    else if (dx && ok(x + dx, z)) nx = x + dx;
    else if (dz && ok(x, z + dz)) nz = z + dz;
    pos[0] = nx; pos[2] = nz;
    pos[1] = (this.L.surface(nx, nz) ?? gy) + W.shade_center_y;
    return Math.hypot(nx - x, nz - z);
  }
  /** A lantern protects its 6 m only while lit and fuel >= 30 (exactly 30 still protects). */
  _zone(l) { return l.lit && l.fuel >= FUEL_LOW; }
  get capacity() { return Math.min(T.capacity_max, T.carry_capacity + T.capacity_per_light * this.player.lights); }

  _litZoneProject(pos) {
    for (const l of this.lanterns) {
      if (!this._zone(l)) continue;
      let dx = pos[0] - l.pos[0], dz = pos[2] - l.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < T.safe_radius) {
        if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        pos[0] = l.pos[0] + dx * T.safe_radius;
        pos[2] = l.pos[2] + dz * T.safe_radius;
      }
    }
  }

  // ======== the tick ========
  /** Advance exactly one tick. input: {move:[x,z], cam_yaw_deg, jump, interact, pulse, dash, pause}. */
  step(input = {}) {
    this.events = [];
    if (this.state === 'won' || this.state === 'lost') return this.events;
    this.tick += 1;
    const pr = this.prev;
    const e = {
      jump: !!input.jump && !pr.jump, interact: !!input.interact && !pr.interact,
      pulse: !!input.pulse && !pr.pulse, dash: !!input.dash && !pr.dash, pause: !!input.pause && !pr.pause,
    };
    pr.jump = !!input.jump; pr.interact = !!input.interact; pr.pulse = !!input.pulse; pr.dash = !!input.dash; pr.pause = !!input.pause;

    // 1. input / pause
    if (this.state === 'paused') {
      if (!e.pause) return this.events;
      this.state = 'playing';
      this._emit('resumed', {});
    } else if (e.pause) {
      this.state = 'paused';
      this._emit('paused', {});
      return this.events;
    }
    this.simTick += 1;
    const P = this.player;
    const t = this.simTick;

    // 2. counters
    this.timeLeft -= 1;
    if (P.dashCd > 0) P.dashCd -= 1;
    if (P.pulseCd > 0) P.pulseCd -= 1;
    if (P.invuln > 0) P.invuln -= 1;
    if (P.charm > 0) P.charm -= 1;
    for (const c of this.charms) if (c.respawn > 0) c.respawn -= 1;
    for (const m of this.motes) if (m.kind === 'dropped' && m.ttl > 0) m.ttl -= 1;
    this.motes = this.motes.filter((m) => !(m.kind === 'dropped' && m.ttl <= 0));
    for (const s of this.shades) {
      if (s.state === 'spawning' && --s.spawnLeft <= 0) s.state = 'wander';
      else if (s.state === 'stunned' && --s.stun <= 0) { s.state = 'wander'; s.pushLeft = 0; s.wanderT = 0; }
    }
    this._fuelStep();
    if (P.fall > 0 && --P.fall === 0) this._respawn();
    if (this.windEnabled) {
      const m = t % W.wind_every_ticks;
      if (m === W.wind_every_ticks - W.wind_warn_ticks) this.wind.dir = r3(this.rng() * 360);
      this.wind.warn = m >= W.wind_every_ticks - W.wind_warn_ticks;
      this.wind.active = t >= W.wind_every_ticks && m < W.wind_ticks;
    }

    // 3. player movement (+ fall check)
    if (P.fall === 0) this._playerMove(input, e);

    // 4. pickups
    if (P.fall === 0) this._pickups();

    // 5. lantern interaction
    const litNow = [];
    if (P.fall === 0 && e.interact) this._interact(litNow);

    // 6. safe zones
    this._safeZones(litNow);

    // 7. pulse
    if (P.fall === 0 && e.pulse && P.pulseCd === 0 && P.carried >= T.pulse_cost) this._pulse();

    // 8. enemies move
    this._moveShades();
    this._moveDrifters();

    // 9. touches
    if (P.fall === 0) { this._drifterTouch(); this._shadeTouch(); }

    // 10. scheduled spawns
    this._spawns(t);

    // 11. win / lose (Ticket-03): no early win; flames out always loses first; at dawn count the lit lanterns
    if (P.flames <= 0) this._finish('lost', 'no_flames');
    else if (this.timeLeft <= 0) {
      const lit = this.lanterns.filter((l) => l.lit);
      const need = Math.ceil(T.win_ratio * this.lanterns.length - 1e-9);
      if (lit.length >= need) {
        for (const l of lit) this.score += T.score.per_lit_lantern_dawn + Math.floor(l.fuel / FUEL_SCALE);
        this.score += T.score.per_flame_left * P.flames;
        this._finish('won', 'dawn_survived');
      } else this._finish('lost', 'dawn');
    }
    return this.events;
  }

  _finish(result, reason) {
    this.state = result;
    this._emit('game_over', { result, reason });
  }

  _respawn() {
    const P = this.player;
    P.pos = [...this.L.start];
    P.pos[1] = this.L.surface(P.pos[0], P.pos[2]) ?? 0;
    P.vel = [0, 0, 0]; P.vy = 0; P.grounded = true; P.launched = false; P.dashLeft = 0;
    P.invuln = W.invuln_ticks;
  }

  _playerMove(input, e) {
    const P = this.player;
    let [mx, mz] = input.move || [0, 0];
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const th = ((input.cam_yaw_deg || 0) * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-9) P.face = [wx / wl, wz / wl];

    if (e.jump && P.grounded) { P.vy = W.jump_speed; P.grounded = false; }
    if (e.dash && P.dashCd === 0 && P.dashLeft === 0) {
      P.dashLeft = Math.round(T.dash_duration_s * 60);
      P.dashDir = wl > 1e-9 ? [wx / wl, wz / wl] : [...P.face];
      P.dashCd = P.charm > 0 ? 0 : Math.round(T.dash_cooldown_s * 60);
      this._emit('dash', {});
    }

    // horizontal velocity
    let vx, vz;
    const dashing = P.dashLeft > 0;
    if (dashing) { vx = P.dashDir[0] * T.dash_speed; vz = P.dashDir[1] * T.dash_speed; P.dashLeft -= 1; }
    else if (P.launched) { vx = P.launchV[0]; vz = P.launchV[1]; }
    else { const sp = P.charm > 0 ? W.charm_speed : T.player_speed; vx = wx * sp; vz = wz * sp; }
    let ex = 0, ez = 0;
    if (this.wind.active) {
      const a = (this.wind.dir * Math.PI) / 180;
      ex = Math.cos(a) * W.wind_speed; ez = Math.sin(a) * W.wind_speed;
    }
    this._movePlayerXZ((vx + ex) * DT, (vz + ez) * DT);

    // vertical
    const s = this.L.surface(P.pos[0], P.pos[2]);
    if (dashing) {
      P.vy = 0;
      if (P.grounded) { if (s !== null && P.pos[1] - s <= W.step_height) P.pos[1] = s; else P.grounded = false; }
    } else if (P.grounded) {
      if (s !== null && P.pos[1] - s <= W.step_height && P.vy <= 0) P.pos[1] = s;
      else if (P.vy <= 0) { P.grounded = false; P.vy -= W.gravity * DT; P.pos[1] += P.vy * DT; }
      else { P.grounded = false; P.vy -= W.gravity * DT; P.pos[1] += P.vy * DT; }
    } else {
      const prevY = P.pos[1];
      P.vy -= W.gravity * DT;
      P.pos[1] += P.vy * DT;
      if (P.vy <= 0 && s !== null && P.pos[1] <= s && prevY >= s - W.step_height) {
        P.pos[1] = s; P.vy = 0; P.grounded = true; P.launched = false;
      }
    }
    P.vel = [vx, P.vy, vz];

    // jump pads
    if (!P.launched) {
      for (const pd of this.L.pads) {
        if (Math.hypot(P.pos[0] - pd.pos[0], P.pos[2] - pd.pos[2]) <= pd.r && Math.abs(P.pos[1] - pd.pos[1]) <= 0.5) {
          P.vy = pd.vy; P.launchV = [pd.dir[0] * pd.vh, pd.dir[1] * pd.vh]; P.launched = true; P.grounded = false;
          break;
        }
      }
    }

    // falling off the world
    if (P.pos[1] < W.fall_y && P.fall === 0) {
      const lost = P.carried;
      P.carried = 0; P.flames -= 1;
      P.fall = W.fall_wait_ticks;
      P.vy = 0; P.vel = [0, 0, 0]; P.launched = false; P.dashLeft = 0;
      this._emit('player_hit', { by: 'fall', flames: P.flames, dropped: 0, lost });
    }
  }

  _pickups() {
    const P = this.player;
    const cap = this.capacity;
    for (let i = 0; i < this.motes.length && P.carried < cap; ) {
      const m = this.motes[i];
      if (d2(P.pos, m.pos) <= T.pickup_radius && Math.abs(P.pos[1] - m.pos[1]) <= W.mote_hit_height) {
        this.motes.splice(i, 1);
        P.carried += 1;
        this._emit('mote_picked', { carried: P.carried });
      } else i++;
    }
    for (const c of this.charms) {
      if (c.respawn > 0) continue;
      if (d2(P.pos, c.pos) <= T.pickup_radius && Math.abs(P.pos[1] - c.pos[1]) <= W.mote_hit_height) {
        c.respawn = W.charm_respawn_ticks;
        P.charm = W.charm_ticks;
        this._emit('charm_picked', { charm_id: c.id, charm_ticks: P.charm });
      }
    }
  }

  /** Light an unlit lantern (10 motes, 5 if it was lit before) or refuel a lit one that is not full. */
  _interact(protectedNow) {
    const P = this.player;
    if (P.carried <= 0) return;
    let best = null, bd = Infinity;
    for (const l of this.lanterns) {
      if (l.lit && l.fuel >= FUEL_MAX) continue; // full lanterns cannot receive anything
      const d = d2(P.pos, l.pos);
      if (d <= T.interact_radius && d < bd - 1e-9) { best = l; bd = d; }
    }
    if (!best) return;
    if (!best.lit) {
      const cost = best.ever ? T.relight_cost : T.lantern_cost;
      const amount = Math.min(P.carried, cost - best.deposited);
      P.carried -= amount;
      best.deposited += amount;
      this.score += T.score.per_mote * amount;
      this._emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= cost) {
        const relight = best.ever;
        best.lit = true; best.fuel = FUEL_MAX; best.ever = true;
        if (relight) best.relit += 1;
        this.score += relight ? T.score.per_relight : T.score.per_lantern;
        P.lights += 1;
        protectedNow.push(best);
        this._emit('lantern_lit', { lantern_id: best.id, relight });
      }
    } else {
      const per = T.fuel_per_mote * FUEL_SCALE;
      const used = Math.min(P.carried, Math.ceil((FUEL_MAX - best.fuel) / per));
      const before = best.fuel;
      best.fuel = Math.min(FUEL_MAX, best.fuel + per * used);
      P.carried -= used;
      this.score += T.score.per_mote * used;
      this._emit('refuel', { lantern_id: best.id, amount: used, fuel: fuelOut(best.fuel) });
      if (before < FUEL_LOW && best.fuel >= FUEL_LOW) protectedNow.push(best); // zone is back: shades inside are expelled
    }
  }

  /** Step 2: lit lanterns burn 1/s, draining shades take 5/s each; a lantern at fuel <= 0 goes out right after. */
  _fuelStep() {
    const decay = Math.round((T.fuel_decay_per_s * FUEL_SCALE) / 60);
    const drain = Math.round((T.drain_per_s * FUEL_SCALE) / 60);
    for (const l of this.lanterns) if (l.lit) l.fuel -= decay;
    for (const s of this.shades) {
      if (s.state !== 'drain') continue;
      const l = this.lanterns.find((x) => x.id === s.target);
      if (!l || !l.lit) continue;
      l.fuel -= drain;
      if (++s.drainT >= 60) { s.drainT = 0; this._emit('fuel_drain', { lantern_id: l.id, shade_id: s.id, fuel: fuelOut(Math.max(0, l.fuel)) }); }
    }
    for (const l of this.lanterns) {
      if (l.lit && l.fuel <= 0) { l.lit = false; l.fuel = 0; l.deposited = 0; this._emit('lantern_out', { lantern_id: l.id }); }
    }
  }

  _safeZones(protectedNow) {
    for (const l of protectedNow) {
      for (const s of this.shades) {
        if (s.expel === 0 && Math.hypot(s.pos[0] - l.pos[0], s.pos[2] - l.pos[2]) < T.safe_radius) { s.expel = W.expel_ticks; s.expelFrom = l; }
      }
    }
    const rate = T.safe_radius / W.expel_ticks;
    for (const s of this.shades) {
      if (s.expel <= 0) continue;
      const l = s.expelFrom;
      let dx = s.pos[0] - l.pos[0], dz = s.pos[2] - l.pos[2];
      const d = Math.hypot(dx, dz);
      if (d >= T.safe_radius) { s.expel = 0; continue; }
      if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      const step = Math.min(rate, T.safe_radius - d);
      this._walk(s.pos, dx * step, dz * step);
      s.expel -= 1;
      if (Math.hypot(s.pos[0] - l.pos[0], s.pos[2] - l.pos[2]) >= T.safe_radius - 1e-9) s.expel = 0;
    }
  }

  _pulse() {
    const P = this.player;
    P.carried -= T.pulse_cost;
    P.pulseCd = Math.round(T.pulse_cooldown_s * 60);
    const c = [P.pos[0], P.pos[1] + W.pulse_center_y, P.pos[2]];
    const ids = [];
    const hitShades = [];
    for (const s of this.shades) {
      if (Math.hypot(s.pos[0] - c[0], s.pos[1] - c[1], s.pos[2] - c[2]) <= T.pulse_radius) { ids.push(s.id); hitShades.push(s); }
    }
    this._emit('pulse', { stunned_ids: ids });
    for (const s of hitShades) {
      this.score += s.state === 'drain' ? T.score.per_stun_drain : T.score.per_stun;
      let dx = s.pos[0] - P.pos[0], dz = s.pos[2] - P.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      s.state = 'stunned'; s.stun = Math.round(T.pulse_stun_s * 60);
      s.pushLeft = W.stun_push_ticks; s.pushDir = [dx, dz];
      s.recoilLeft = 0;
    }
    for (const d of this.drifters) {
      if (Math.hypot(d.pos[0] - c[0], d.pos[1] - c[1], d.pos[2] - c[2]) > T.pulse_radius) continue;
      if (d.state === 'chase') { d.state = 'flee'; d.fleeLeft = W.drifter_flee_ticks; d.stoleOnce = true; }
      else if (d.state === 'flee' && d.stolen > 0) {
        const amount = d.stolen;
        d.stolen = 0;
        d.fleeLeft = Math.min(d.fleeLeft, W.drifter_drop_flee_ticks);
        this._dropMotes(d.pos, amount);
        this._emit('drifter_drop', { drifter_id: d.id, amount });
      }
    }
  }

  _dropMotes(at, n) {
    const P = this.player;
    for (let k = 0; k < n; k++) {
      let placed = false;
      for (let tries = 0; tries < 8 && !placed; tries++) {
        const a = this.rng() * Math.PI * 2;
        const r = W.drop_ring[0] + this.rng() * (W.drop_ring[1] - W.drop_ring[0]);
        const x = at[0] + r * Math.cos(a), z = at[2] + r * Math.sin(a);
        const s = this.L.surface(x, z);
        if (s !== null && Math.abs(s - P.pos[1]) <= 3) { this._addMote([x, s, z], 'dropped', W.drop_ttl_ticks); placed = true; }
      }
      if (!placed) this._addMote([P.pos[0], this.L.surface(P.pos[0], P.pos[2]) ?? P.pos[1], P.pos[2]], 'dropped', W.drop_ttl_ticks);
    }
  }

  _moveShades() {
    const P = this.player;
    for (const s of this.shades) {
      const dxp = P.pos[0] - s.pos[0], dzp = P.pos[2] - s.pos[2];
      const dp = Math.hypot(dxp, dzp);
      if (s.state === 'drain') {
        const l = this.lanterns.find((x) => x.id === s.target);
        if (dp <= W.drain_chase_radius) s.state = 'chase'; // Mây came close: stop draining, go for her
        else if (!l || !l.lit || l.fuel >= FUEL_LOW || d2(s.pos, l.pos) > W.drain_radius) { s.state = 'wander'; s.wanderT = 0; }
        if (s.state !== 'drain') s.drainT = 0;
      }
      if (s.state === 'wander' && dp <= W.shade_detect) s.state = 'chase';
      else if (s.state === 'chase' && dp > W.shade_lose) { s.state = 'wander'; s.wanderT = 0; }
      if (s.expel > 0 || s.state === 'spawning' || s.state === 'drain') continue;
      const speed = this.L.shadeSpeed; // 4.0 (Night 3: 4.5)
      if (s.state === 'chase') {
        if (dp > 1e-9) {
          const step = Math.min(dp, (speed * DT));
          this._walk(s.pos, (dxp / dp) * step, (dzp / dp) * step);
        }
      } else if (s.state === 'wander') {
        // only wandering shades pick a lantern: nearest weak lit one (fuel < 30), else nearest unlit one, else roam
        let weak = null, wd = Infinity, dark = null, dd = Infinity;
        for (const l of this.lanterns) {
          const d = d2(s.pos, l.pos);
          if (l.lit && l.fuel < FUEL_LOW && d < wd - 1e-9) { weak = l; wd = d; }
          if (!l.lit && d < dd - 1e-9) { dark = l; dd = d; }
        }
        const tgt = weak || dark;
        if (weak && wd <= W.drain_radius) { s.state = 'drain'; s.target = weak.id; s.drainT = 0; }
        else if (tgt) {
          s.target = tgt.id;
          const d = d2(s.pos, tgt.pos);
          if (d > W.drain_radius) {
            const step = Math.min(d - W.drain_radius, speed * DT);
            this._walk(s.pos, ((tgt.pos[0] - s.pos[0]) / d) * step, ((tgt.pos[2] - s.pos[2]) / d) * step);
          }
        } else {
          s.target = null;
          if (s.wanderT-- <= 0) { s.heading = this.rng() * Math.PI * 2; s.wanderT = 120; }
          const st = W.shade_wander_speed * DT;
          const moved = this._walk(s.pos, Math.cos(s.heading) * st, Math.sin(s.heading) * st);
          if (moved < st * 0.1) s.wanderT = 0;
        }
      } else if (s.state === 'recoil') {
        const st = W.recoil_m / W.recoil_ticks;
        this._walk(s.pos, s.recoilDir[0] * st, s.recoilDir[1] * st);
        if (--s.recoilLeft <= 0) s.state = 'chase';
      } else if (s.state === 'stunned' && s.pushLeft > 0) {
        const st = T.pulse_push_m / W.stun_push_ticks;
        this._walk(s.pos, s.pushDir[0] * st, s.pushDir[1] * st);
        s.pushLeft -= 1;
      }
      this._litZoneProject(s.pos);
    }
  }

  _moveDrifters() {
    const P = this.player;
    const keep = [];
    for (const d of this.drifters) {
      const dp = d2(d.pos, P.pos);
      const cond = P.fall === 0 && P.carried >= W.drifter_carry_min && dp <= W.drifter_detect;
      if (d.state === 'idle' && cond) d.state = 'chase';
      else if (d.state === 'chase' && !cond) d.state = 'idle';
      let dx = 0, dz = 0;
      if (d.state === 'chase') { if (dp > 1e-9) { const st = Math.min(dp, W.drifter_speed * DT); dx = ((P.pos[0] - d.pos[0]) / dp) * st; dz = ((P.pos[2] - d.pos[2]) / dp) * st; } }
      else if (d.state === 'flee') {
        let ax = d.pos[0] - P.pos[0], az = d.pos[2] - P.pos[2];
        const l = Math.hypot(ax, az);
        if (l < 1e-9) { ax = 1; az = 0; } else { ax /= l; az /= l; }
        dx = ax * W.drifter_speed * DT; dz = az * W.drifter_speed * DT;
        d.fleeLeft -= 1;
      } else {
        if (d.wanderT-- <= 0) { d.heading = this.rng() * Math.PI * 2; d.wanderT = 90; }
        dx = Math.cos(d.heading) * W.drifter_idle_speed * DT; dz = Math.sin(d.heading) * W.drifter_idle_speed * DT;
        // stay near an island: if too far from every centre, steer back toward the nearest one
        let best = null, bd = Infinity;
        for (const c of this.L.centers) { const k = Math.hypot(d.pos[0] - c[0], d.pos[2] - c[1]); if (k < bd) { bd = k; best = c; } }
        if (bd > 45) { const a = Math.atan2(best[1] - d.pos[2], best[0] - d.pos[0]); d.heading = a; }
      }
      d.pos[0] += dx; d.pos[2] += dz;
      d.pos[1] = (this.L.surface(d.pos[0], d.pos[2]) ?? 0) + W.drifter_y;
      if (d.state === 'flee' && d.fleeLeft <= 0) continue; // vanishes with whatever it stole
      keep.push(d);
    }
    this.drifters = keep;
  }

  _drifterTouch() {
    const P = this.player;
    for (const d of this.drifters) {
      if (d.state !== 'chase' || d.stoleOnce) continue;
      if (d2(d.pos, P.pos) <= W.drifter_hit) {
        const amount = Math.min(W.drifter_steal, P.carried);
        P.carried -= amount;
        d.stolen = amount; d.stoleOnce = true; d.state = 'flee'; d.fleeLeft = W.drifter_flee_ticks;
        this._emit('drifter_steal', { drifter_id: d.id, amount, carried: P.carried });
      }
    }
  }

  _shadeTouch() {
    const P = this.player;
    for (const s of this.shades) {
      if (P.invuln > 0) return; // one flame per tick; invulnerable Mây ignores touches
      if (s.state !== 'wander' && s.state !== 'chase') continue;
      if (s.expel > 0) continue;
      if (d2(s.pos, P.pos) > T.shade_hit_radius) continue;
      if (Math.abs(P.pos[1] - (s.pos[1] - W.shade_center_y)) > W.mote_hit_height) continue;
      P.flames -= 1;
      const dropped = Math.floor(P.carried * T.hit_drop_ratio);
      P.carried -= dropped;
      this._dropMotes(P.pos, dropped);
      P.invuln = W.invuln_ticks;
      let ax = s.pos[0] - P.pos[0], az = s.pos[2] - P.pos[2];
      const l = Math.hypot(ax, az);
      if (l < 1e-9) { ax = 1; az = 0; } else { ax /= l; az /= l; }
      s.state = 'recoil'; s.recoilLeft = W.recoil_ticks; s.recoilDir = [ax, az];
      this._emit('player_hit', { by: 'shade', flames: P.flames, dropped });
    }
  }

  _spawns(t) {
    // motes
    if (this.randomMotes && t % W.mote_respawn_ticks === 0 && this.motes.length < W.mote_cap) {
      const used = new Set(this.motes.filter((m) => m.kind === 'random').map((m) => m.spawnIdx));
      const free = this.L.moteSpawns.map((_, i) => i).filter((i) => !used.has(i));
      if (free.length) {
        const i = free[Math.floor(this.rng() * free.length)];
        const [x, z] = this.L.moteSpawns[i];
        this._addMote([x, this.L.surface(x, z) ?? 0, z], 'random', 0, i);
      }
    }
    // shades
    if (this.randomShades) {
      const first = W.shade_first_spawn_tick;
      let n = 0;
      if (t === first) n = 2;
      else if (t > first && (t - first) % this.L.shadeEvery === 0) n = 1;
      for (let k = 0; k < n; k++) {
        if (this.shades.length >= this.L.shadeMax) break;
        const valid = this.L.shadeSpawns.filter(([x, z]) =>
          Math.hypot(x - this.player.pos[0], z - this.player.pos[2]) >= W.shade_min_player_dist &&
          !this.lanterns.some((l) => this._zone(l) && Math.hypot(x - l.pos[0], z - l.pos[2]) < T.safe_radius) &&
          !this.shades.some((s) => Math.hypot(x - s.pos[0], z - s.pos[2]) < 1));
        if (!valid.length) break;
        const [x, z] = valid[Math.floor(this.rng() * valid.length)];
        const s = this._addShade([x, 0, z], null, 'spawning', 1);
        this._emit('shade_spawned', { id: s.id });
      }
    }
    // drifters
    if (this.randomDrifters && t % W.drifter_every_ticks === 0 && this.drifters.length < W.drifter_max) {
      const pts = this.L.shadeSpawns;
      const [x, z] = pts[Math.floor(this.rng() * pts.length)];
      this._addDrifter([x, 0, z]);
    }
  }

  // ======== output ========
  snapshot() {
    const P = this.player;
    return {
      type: 'snapshot', tick: this.tick, sim_tick: this.simTick,
      state: this.state, night: this.night,
      time_left_s: r3(Math.max(0, this.timeLeft) / 60), score: this.score,
      wind: { active: this.wind.active, dir_deg: r3(this.wind.dir) },
      player: {
        pos: r3v(P.pos), vel: r3v(P.vel), grounded: P.grounded, invuln: P.invuln > 0,
        dash_cd_s: sec(P.dashCd), pulse_cd_s: sec(P.pulseCd), charm_s: sec(P.charm),
        flames: P.flames, carried: P.carried, capacity: this.capacity,
      },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited, fuel: fuelOut(l.fuel), ever_lit: l.ever, relit_count: l.relit })),
      shades: this.shades.map((s) => ({
        id: s.id, pos: r3v(s.pos), state: s.state, ...(s.state === 'drain' ? { target_lantern_id: s.target } : {}),
        state_ticks_left: s.state === 'stunned' ? s.stun : s.state === 'recoil' ? s.recoilLeft : s.state === 'spawning' ? s.spawnLeft : 0,
      })),
      motes: this.motes.map((m) => ({ id: m.id, pos: r3v(m.pos), kind: m.kind, ttl_s: m.kind === 'dropped' ? sec(m.ttl) : null })),
      drifters: this.drifters.map((d) => ({ id: d.id, pos: r3v(d.pos), state: d.state, stolen: d.stolen })),
      charms: this.charms.map((c) => ({ id: c.id, available: c.respawn === 0, respawn_s: sec(c.respawn) })),
      motes_active: this.motes.length,
    };
  }
  endLine() {
    return { type: 'end', ticks: this.tick, state: this.state === 'paused' ? 'playing' : this.state, score: this.score };
  }
}
