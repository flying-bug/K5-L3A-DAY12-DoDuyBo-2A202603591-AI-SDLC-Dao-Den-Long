// Deterministic game logic. No DOM / GPU / wall-clock. 60 fixed ticks per second.
import { TUNING as T, WORLD as W } from './config.js';

const DT = 1 / 60;
const r3 = (n) => Math.round(n * 1000) / 1000 + 0; // +0 turns -0 into 0
const r3v = (a) => a.map(r3);

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

const dist2d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export class Sim {
  /** @param {{seed?:number, scenario?:object}} opts */
  constructor({ seed = 1, scenario = {} } = {}) {
    this.rng = mulberry32(seed);
    this.tick = 0; // steps executed
    this.state = 'playing';
    this.score = 0;
    this.events = []; // events produced by the last step()
    this.timeLeftTicks = Math.round((scenario.time_left_s ?? T.night1_duration_s) * 60);
    const p = scenario.player || {};
    this.player = {
      pos: p.pos ? [...p.pos] : [0, 0, 0],
      vy: 0,
      carried: p.carried ?? 0,
      flames: p.flames ?? T.flames,
      invuln: 0,
    };
    this.pulseCd = 0;
    this.prev = { jump: false, interact: false, pulse: false };

    // lanterns
    this.lanterns = [];
    for (let i = 0; i < T.lantern_count_night1; i++) {
      const a = (i * 2 * Math.PI) / T.lantern_count_night1;
      this.lanterns.push({
        id: `L${i + 1}`,
        pos: [r3(W.lantern_ring_radius * Math.sin(a)), 0, r3(W.lantern_ring_radius * Math.cos(a))],
        lit: false,
        deposited: 0,
      });
    }
    for (const sl of scenario.lanterns || []) {
      const l = this.lanterns.find((x) => x.id === sl.id);
      if (!l) continue;
      if (sl.pos) l.pos = [...sl.pos];
      if (sl.deposited != null) l.deposited = sl.deposited;
      if (sl.lit) { l.lit = true; l.deposited = Math.max(l.deposited, T.lantern_cost); }
    }

    // motes
    this.moteSeq = 0;
    this.motes = [];
    this.randomMotes = scenario.random_motes !== false;
    if (scenario.motes) for (const m of scenario.motes) this._addMote(m);
    else if (this.randomMotes) for (let i = 0; i < W.random_mote_count; i++) this._addMote(this._randIslandPoint(4, 36));
    this.moteTimer = 0;

    // shades
    this.shadeSeq = 0;
    this.shades = [];
    this.randomShades = scenario.random_shades !== false;
    if (scenario.shades) {
      for (const s of scenario.shades) this._addShade(s.pos, s.id);
    }
    this.shadeTimer = W.shade_first_spawn_s * 60;
  }

  _addMote(pos) { this.motes.push({ id: `M${++this.moteSeq}`, pos: [pos[0], 0, pos[2]] }); }
  _addShade(pos, id) {
    if (!id) id = `S${++this.shadeSeq}`;
    else { const n = /^S(\d+)$/.exec(id); if (n) this.shadeSeq = Math.max(this.shadeSeq, +n[1]); }
    const s = { id, pos: [pos[0], W.shade_y, pos[2]], state: 'chase', stun: 0 };
    this.shades.push(s);
    return s;
  }
  _randIslandPoint(rmin, rmax) {
    const a = this.rng() * Math.PI * 2;
    const r = Math.sqrt(rmin * rmin + this.rng() * (rmax * rmax - rmin * rmin));
    return [r * Math.sin(a), 0, r * Math.cos(a)];
  }
  _emit(name, data) { this.events.push({ type: 'event', tick: this.tick, name, data }); }

  _clampIsland(pos) {
    const d = Math.hypot(pos[0], pos[2]);
    if (d > W.island_radius) { pos[0] *= W.island_radius / d; pos[2] *= W.island_radius / d; }
  }
  _keepOutOfLight(pos) {
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      let dx = pos[0] - l.pos[0], dz = pos[2] - l.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < T.safe_radius) {
        if (d < 1e-9) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
        pos[0] = l.pos[0] + dx * T.safe_radius;
        pos[2] = l.pos[2] + dz * T.safe_radius;
      }
    }
  }

  /** Advance exactly one tick. input: {move:[x,z], cam_yaw_deg, jump, interact, pulse} (all optional). */
  step(input = {}) {
    this.events = [];
    if (this.state !== 'playing') return this.events;
    this.tick += 1; // events in this step carry tick k+1
    const P = this.player;

    // --- movement
    let [mx, mz] = input.move || [0, 0];
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const th = ((input.cam_yaw_deg || 0) * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    P.pos[0] += wx * T.player_speed * DT;
    P.pos[2] += wz * T.player_speed * DT;
    this._clampIsland(P.pos); // fall_enabled=false: the island edge is a wall

    // --- jump / gravity
    const onGround = P.pos[1] <= 0 && P.vy <= 0;
    if (input.jump && !this.prev.jump && onGround) P.vy = W.jump_speed;
    if (!onGround || P.vy > 0) {
      P.vy -= W.gravity * DT;
      P.pos[1] += P.vy * DT;
      if (P.pos[1] <= 0) { P.pos[1] = 0; P.vy = 0; }
    }

    // --- interact: deposit carried light into nearest unlit lantern in range
    if (input.interact && !this.prev.interact && P.carried > 0) {
      let best = null, bd = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = dist2d(P.pos, l.pos);
        if (d <= T.interact_radius && d < bd) { best = l; bd = d; }
      }
      if (best) {
        const amount = Math.min(P.carried, T.lantern_cost - best.deposited);
        P.carried -= amount;
        best.deposited += amount;
        this._emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        if (best.deposited >= T.lantern_cost) {
          best.lit = true;
          this.score += T.score.per_lantern;
          this._emit('lantern_lit', { lantern_id: best.id });
        }
      }
    }

    // --- pulse
    if (this.pulseCd > 0) this.pulseCd -= 1;
    if (input.pulse && !this.prev.pulse && this.pulseCd === 0 && P.carried >= T.pulse_cost) {
      P.carried -= T.pulse_cost;
      this.pulseCd = Math.round(T.pulse_cooldown_s * 60);
      const ids = [];
      for (const s of this.shades) {
        const d = dist2d(P.pos, s.pos);
        if (d > T.pulse_radius) continue;
        ids.push(s.id);
        if (s.state !== 'stunned') this.score += T.score.per_stun;
        s.state = 'stunned';
        s.stun = Math.round(T.pulse_stun_s * 60);
        let dx = s.pos[0] - P.pos[0], dz = s.pos[2] - P.pos[2];
        if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        s.pos[0] += dx * T.pulse_push_m;
        s.pos[2] += dz * T.pulse_push_m;
        this._clampIsland(s.pos);
        this._keepOutOfLight(s.pos);
      }
      this._emit('pulse', { stunned_ids: ids });
    }
    this.prev.jump = !!input.jump; this.prev.interact = !!input.interact; this.prev.pulse = !!input.pulse;

    // --- pickups (in array order)
    for (let i = 0; i < this.motes.length && P.carried < T.carry_capacity; ) {
      if (dist2d(P.pos, this.motes[i].pos) <= T.pickup_radius) {
        this.motes.splice(i, 1);
        P.carried += 1;
        this.score += T.score.per_mote;
        this._emit('mote_picked', { carried: P.carried });
      } else i++;
    }

    // --- random spawns
    if (this.randomMotes && this.motes.length < W.random_mote_count) {
      if (++this.moteTimer >= W.mote_respawn_s * 60) { this.moteTimer = 0; this._addMote(this._randIslandPoint(4, 36)); }
    }
    if (this.randomShades && this.shades.length < W.shade_max) {
      if (--this.shadeTimer <= 0) {
        this.shadeTimer = W.shade_spawn_every_s * 60;
        const a = this.rng() * Math.PI * 2;
        const s = this._addShade([38 * Math.sin(a), 0, 38 * Math.cos(a)]);
        this._keepOutOfLight(s.pos);
        this._emit('shade_spawned', { id: s.id });
      }
    }

    // --- shades
    if (P.invuln > 0) P.invuln -= 1;
    for (const s of this.shades) {
      if (s.state === 'stunned') {
        if (--s.stun <= 0) { s.state = 'chase'; s.stun = 0; }
        continue;
      }
      const d = dist2d(s.pos, P.pos);
      if (d > 1e-9) {
        const step = Math.min(d, T.shade_speed * DT);
        s.pos[0] += ((P.pos[0] - s.pos[0]) / d) * step;
        s.pos[2] += ((P.pos[2] - s.pos[2]) / d) * step;
      }
      this._keepOutOfLight(s.pos);
      if (P.invuln === 0 && dist2d(s.pos, P.pos) <= T.shade_hit_radius) {
        P.flames -= 1;
        const dropped = Math.floor(P.carried * T.hit_drop_ratio);
        P.carried -= dropped;
        for (let k = 0; k < dropped; k++) {
          const a = (k * 2 * Math.PI) / dropped;
          const q = [P.pos[0] + W.drop_ring_radius * Math.sin(a), 0, P.pos[2] + W.drop_ring_radius * Math.cos(a)];
          this._clampIsland(q);
          this._addMote(q);
        }
        P.invuln = Math.round(T.invuln_s * 60);
        this._emit('player_hit', { by: 'shade', flames: P.flames, dropped });
        if (P.flames <= 0) break;
      }
    }

    // --- time & end conditions
    this.timeLeftTicks -= 1;
    if (this.lanterns.every((l) => l.lit)) {
      this.score += T.score.per_second_left * Math.floor(Math.max(0, this.timeLeftTicks) / 60) + T.score.per_flame_left * P.flames;
      this._finish('won', 'all_lit');
    } else if (P.flames <= 0) this._finish('lost', 'no_flames');
    else if (this.timeLeftTicks <= 0) this._finish('lost', 'dawn');
    return this.events;
  }

  _finish(result, reason) {
    this.state = result;
    this._emit('game_over', { result, reason });
  }

  snapshot(withMotes = true) {
    const o = {
      type: 'snapshot', tick: this.tick, sim_tick: this.tick, state: this.state,
      time_left_s: r3(Math.max(0, this.timeLeftTicks) / 60), score: this.score,
      player: { pos: r3v(this.player.pos), flames: this.player.flames, carried: this.player.carried },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited })),
      shades: this.shades.map((s) => ({ id: s.id, pos: r3v(s.pos), state: s.state })),
      motes_active: this.motes.length,
    };
    if (withMotes) o.motes = this.motes.map((m) => ({ id: m.id, pos: r3v(m.pos) }));
    return o;
  }
  endLine() { return { type: 'end', ticks: this.tick, state: this.state, score: this.score }; }
}
