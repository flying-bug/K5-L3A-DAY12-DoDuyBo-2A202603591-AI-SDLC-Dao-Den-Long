// All sound is synthesised with WebAudio: no audio files, nothing to license. Disabled in headless (never imported there).
let ctx = null, master = null, musicTimer = null, musicOn = false;
let volume = 0.7;

export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
}

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol = 0.15, cutoff = 1500, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  pick: () => tone(880, 0.09, 'sine', 0.14, 1320),
  deposit: () => tone(520, 0.12, 'triangle', 0.15, 700),
  light: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, 'sine', 0.14, null, i * 0.08)),
  pulse: () => { tone(260, 0.45, 'sawtooth', 0.12, 1100); noise(0.3, 0.1, 3000); },
  hit: () => { tone(140, 0.35, 'square', 0.22, 50); noise(0.2, 0.15, 800); },
  jump: () => tone(300, 0.14, 'triangle', 0.12, 620),
  dash: () => noise(0.18, 0.16, 2600),
  charm: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, null, i * 0.06)),
  steal: () => tone(700, 0.25, 'sawtooth', 0.1, 200),
  spawn: () => tone(90, 0.6, 'sawtooth', 0.08, 55),
  tick: () => tone(1100, 0.06, 'square', 0.09),
  wind: () => noise(1.6, 0.1, 700),
  fall: () => tone(500, 0.9, 'sine', 0.15, 60),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 'sine', 0.16, null, i * 0.12)),
  lose: () => [440, 370, 311, 247].forEach((f, i) => tone(f, 0.55, 'triangle', 0.15, null, i * 0.18)),
  click: () => tone(700, 0.05, 'triangle', 0.1),
  rustle: () => noise(0.18, 0.07, 3500),
  out: () => { tone(330, 0.5, 'triangle', 0.14, 110); noise(0.25, 0.06, 900); },
};

// Night music: a soft drone plus sparse pentatonic bells.
export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  const drone = [110, 164.8, 220].map((f) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.035;
    o.connect(g); g.connect(master); o.start();
    return { o, g };
  });
  startMusic.drone = drone;
  const scale = [392, 440, 523.25, 587.33, 659.25, 784];
  musicTimer = setInterval(() => {
    if (Math.random() < 0.7) tone(scale[Math.floor(Math.random() * scale.length)], 1.6, 'sine', 0.05);
  }, 1400);
}
export function stopMusic() {
  if (!musicOn) return;
  musicOn = false;
  clearInterval(musicTimer);
  for (const { o } of startMusic.drone || []) { try { o.stop(); } catch { /* already stopped */ } }
}
