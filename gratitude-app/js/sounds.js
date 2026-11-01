// Bell sounds and the calm soundscape for the gratitude pause, made with the
// Web Audio API (no audio files needed). Each sound is short and soft.

let ctx = null;
function audio() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx || ctx.state === 'closed') ctx = new Ctx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac, { freq, start = 0, dur = 1.5, peak = 0.12, type = 'sine', attack = 0.01, out = ac.destination }) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = ac.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const BELL_SOUNDS = [
  { id: 'bowl', label: 'Singing bowl', desc: 'Deep and calming' },
  { id: 'chime', label: 'Soft chime', desc: 'Two light notes' },
  { id: 'windchimes', label: 'Wind chimes', desc: 'Gentle and airy' },
  { id: 'piano', label: 'Piano note', desc: 'Warm and simple' },
  { id: 'harp', label: 'Harp ripple', desc: 'A rising glissando' },
];

const PLAYERS = {
  bowl(ac) {
    // A struck bowl: low fundamental with inharmonic partials and slow beating.
    const base = 196;
    [
      [1, 0.14, 5.5],
      [1.006, 0.06, 5],
      [2.76, 0.05, 3.5],
      [5.4, 0.025, 2.2],
      [8.9, 0.012, 1.4],
    ].forEach(([m, peak, dur]) => tone(ac, { freq: base * m, peak, dur, attack: 0.02 }));
  },
  chime(ac) {
    [659.25, 880].forEach((f, i) => tone(ac, { freq: f, start: i * 0.18, dur: 1.4, peak: 0.09, attack: 0.03 }));
  },
  windchimes(ac) {
    const notes = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
    for (let i = 0; i < 6; i++) {
      const f = notes[(i * 7 + 3) % notes.length];
      tone(ac, { freq: f, start: i * 0.16 + (i % 2) * 0.05, dur: 2.2, peak: 0.05, attack: 0.005 });
      tone(ac, { freq: f * 2.76, start: i * 0.16, dur: 0.8, peak: 0.012, attack: 0.005 });
    }
  },
  piano(ac) {
    const f = 523.25;
    [[1, 0.12], [2, 0.05], [3, 0.025], [4, 0.012]].forEach(([m, peak]) =>
      tone(ac, { freq: f * m, peak, dur: 2.4 / m + 0.6, attack: 0.004, type: 'triangle' })
    );
  },
  harp(ac) {
    [392, 440, 523.25, 587.33, 659.25, 783.99].forEach((f, i) =>
      tone(ac, { freq: f, start: i * 0.09, dur: 1.8, peak: 0.07, attack: 0.004, type: 'triangle' })
    );
  },
};

/** Play a bell sound by id. Safe to call anywhere; silently does nothing without audio support. */
export function playBell(id = 'bowl') {
  try {
    const ac = audio();
    if (!ac) return false;
    (PLAYERS[id] || PLAYERS.bowl)(ac);
    return true;
  } catch {
    return false;
  }
}

/**
 * A slowly breathing, warm pad for the 1-minute pause.
 * Returns { stop() }. Uses an MP3 instead when `trackUrl` is given.
 */
export function startSoundscape({ trackUrl = '' } = {}) {
  if (trackUrl) {
    const el = new Audio(trackUrl);
    el.loop = true;
    el.volume = 0;
    el.play().catch(() => {});
    let v = 0;
    const fade = setInterval(() => {
      v = Math.min(0.8, v + 0.05);
      el.volume = v;
      if (v >= 0.8) clearInterval(fade);
    }, 120);
    return {
      stop() {
        clearInterval(fade);
        el.pause();
      },
    };
  }
  const ac = audio();
  if (!ac) return { stop() {} };
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, ac.currentTime);
  master.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 3);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(master).connect(ac.destination);
  // A soft major-seventh chord (C, E, G, B) plus a low root, gently detuned.
  const freqs = [130.81, 261.63, 329.63, 392, 493.88];
  const oscs = [];
  freqs.forEach((f, i) => {
    [-3, 3].forEach((cents) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = cents;
      g.gain.value = i === 0 ? 0.35 : 0.12;
      o.connect(g).connect(filter);
      o.start();
      oscs.push(o);
    });
  });
  // Slow "breathing" swell, 10 seconds per breath.
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 0.1;
  lfoGain.gain.value = 350;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  oscs.push(lfo);
  // An occasional soft bowl to mark time.
  const bowlTimer = setInterval(() => PLAYERS.bowl(ac), 20000);
  return {
    stop() {
      clearInterval(bowlTimer);
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      setTimeout(() => oscs.forEach((o) => {
        try {
          o.stop();
        } catch { /* already stopped */ }
      }), 1700);
    },
  };
}
