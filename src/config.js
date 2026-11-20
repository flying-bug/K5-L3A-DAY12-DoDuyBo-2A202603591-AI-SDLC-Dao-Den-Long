// Single source of truth for tuning. game.contract.json "tuning" must match this (tests/contract.test.js checks).
export const TUNING = {
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 5,
  lantern_count_night1: 5,
  pickup_radius: 1.5,
  interact_radius: 3,
  pulse_cost: 2,
  pulse_radius: 8,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 3,
  pulse_push_m: 3,
  pulse_cooldown_s: 1,
  safe_radius: 6,
  shade_speed: 3.5,
  shade_hit_radius: 1.2,
  fall_enabled: false,
  score: { per_mote: 10, per_lantern: 100, per_stun: 20, per_second_left: 1, per_flame_left: 50 },
};

// Non-contract constants (documented in README assumptions)
export const WORLD = {
  island_radius: 40,
  lantern_ring_radius: 25,
  gravity: 20,
  jump_speed: 7,
  shade_y: 1.0,
  random_mote_count: 24,
  mote_respawn_s: 4,
  shade_first_spawn_s: 5,
  shade_spawn_every_s: 12,
  shade_max: 5,
  drop_ring_radius: 2.5,
};
