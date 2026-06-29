// audio.js — synthesized sound FX via the Web Audio API. Zero audio files.
// Safe to import in Node (no AudioContext) — every play() becomes a no-op there.

let ctx = null;
let master = null;
let muted = false;
const VOL = 0.25;

function ensure() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;            // headless / unsupported -> silent
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : VOL;
  master.connect(ctx.destination);
  return ctx;
}

/** Resume the context after a user gesture (browsers block autoplay). */
export function resume() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : VOL; }
export function isMuted() { return muted; }
export function toggleMute() { setMuted(!muted); return muted; }

function tone({ freq = 440, to, dur = 0.1, type = 'square', gain = 0.3, delay = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.3, type = 'lowpass', freq = 1000, delay = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

const SOUNDS = {
  shoot: () => tone({ freq: 520, to: 200, dur: 0.09, type: 'triangle', gain: 0.16 }),
  hit: () => tone({ freq: 300, to: 160, dur: 0.06, type: 'square', gain: 0.13 }),
  enemyDie: () => { tone({ freq: 240, to: 80, dur: 0.18, type: 'sawtooth', gain: 0.2 }); noise({ dur: 0.12, gain: 0.09, freq: 800 }); },
  hurt: () => tone({ freq: 150, to: 60, dur: 0.25, type: 'sawtooth', gain: 0.28 }),
  bomb: () => tone({ freq: 120, to: 60, dur: 0.1, type: 'square', gain: 0.2 }),
  explosion: () => { noise({ dur: 0.35, gain: 0.32, freq: 500 }); tone({ freq: 90, to: 40, dur: 0.3, type: 'sawtooth', gain: 0.2 }); },
  item: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.12, type: 'square', gain: 0.15, delay: i * 0.07 })),
  pickup: () => { tone({ freq: 880, dur: 0.06, type: 'square', gain: 0.15 }); tone({ freq: 1320, dur: 0.08, type: 'square', gain: 0.13, delay: 0.06 }); },
  chest: () => tone({ freq: 200, to: 380, dur: 0.2, type: 'sawtooth', gain: 0.17 }),
  key: () => tone({ freq: 1200, to: 1500, dur: 0.1, type: 'square', gain: 0.13 }),
  locked: () => tone({ freq: 160, to: 120, dur: 0.12, type: 'square', gain: 0.16 }),
  clear: () => [659, 988].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.15, delay: i * 0.08 })),
  boss: () => { tone({ freq: 110, to: 70, dur: 0.5, type: 'sawtooth', gain: 0.3 }); tone({ freq: 220, to: 140, dur: 0.5, type: 'square', gain: 0.14, delay: 0.05 }); },
  descend: () => tone({ freq: 600, to: 120, dur: 0.4, type: 'sine', gain: 0.22 }),
};

export function play(name) {
  const fn = SOUNDS[name];
  if (fn) { try { fn(); } catch { /* never let audio break the game */ } }
}
