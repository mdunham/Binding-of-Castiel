// audio.js — synthesized SFX + a looping chiptune soundtrack via Web Audio.
// Zero audio files. Safe to import in Node (no AudioContext) — everything no-ops.

let ctx = null;
let master = null;   // mute bus (0 or 1)
let sfxBus = null;   // sound effects volume
let musicBus = null; // soundtrack volume
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.28; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
  return ctx;
}

export function resume() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  startMusic();
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 1; }
export function isMuted() { return muted; }
export function toggleMute() { setMuted(!muted); return muted; }

function tone({ freq = 440, to, dur = 0.1, type = 'square', gain = 0.3, delay = 0, bus }) {
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
  o.connect(g); g.connect(bus || sfxBus);
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
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
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
  spawn: () => { tone({ freq: 180, to: 90, dur: 0.14, type: 'sawtooth', gain: 0.16 }); noise({ dur: 0.1, gain: 0.08, freq: 600 }); },
};

export function play(name) {
  const fn = SOUNDS[name];
  if (fn) { try { fn(); } catch { /* never let audio break the game */ } }
}

// ---- soundtrack ----------------------------------------------------------
// A looping i–VI–III–VII progression in A minor (a "castle/epic" feel):
// Am – F – C – G. Bass roots + an up/down arpeggio of each chord's triad.
const CHORDS = [
  { root: 110.00, triad: [440.00, 523.25, 659.25] }, // Am: A C E
  { root: 87.31, triad: [349.23, 440.00, 523.25] },  // F:  F A C
  { root: 130.81, triad: [523.25, 659.25, 783.99] }, // C:  C E G
  { root: 98.00, triad: [392.00, 493.88, 587.33] },  // G:  G B D
];
const ARP = [0, 1, 2, 1, 0, 1, 2, 1]; // 8 eighth-notes per bar
const STEP_DUR = 0.25;                // 120bpm eighth note
let musicTimer = null;
let musicStep = 0;
let nextNoteTime = 0;

function bassNote(freq, t) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.5);
}
function leadNote(freq, t) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.26);
}

function scheduleStep(globalStep, t) {
  const chord = CHORDS[Math.floor(globalStep / 8) % CHORDS.length];
  const s = globalStep % 8;
  if (s % 4 === 0) bassNote(chord.root, t);
  leadNote(chord.triad[ARP[s]], t);
}

export function startMusic() {
  const c = ensure();
  if (!c || musicTimer) return;          // already running / headless
  nextNoteTime = c.currentTime + 0.1;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.2) {
      scheduleStep(musicStep, nextNoteTime);
      nextNoteTime += STEP_DUR;
      musicStep = (musicStep + 1) % (CHORDS.length * 8);
    }
  }, 30);
}
export function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
