import { TUNING as T } from '../src/config.js';
// standard night lengths in ticks (Contract v1.2: 240 / 270 / 300 s)
export const T_NIGHT_TICKS = { 1: T.night1_duration_s * 60, 2: T.night2_duration_s * 60, 3: T.night3_duration_s * 60 };
