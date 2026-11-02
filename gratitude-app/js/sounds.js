// Bell sounds and the calm soundscape for the gratitude pause, made with the
// Web Audio API (no audio files needed). Each sound is short and soft.

let ctx = null;
let bus = null; // where bell tones go while a bell is playing (volume + limiter)
function audio() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx || ctx.state === 'closed') ctx = new Ctx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac, { freq, start = 0, dur = 1.5, peak = 0.12, type = 'sine', attack = 0.01, out = bus || ac.destination }) {
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
  { id: 'clear', label: 'Clear bell', desc: 'Bright and easy to hear' },
  { id: 'doorchime', label: 'Door chime', desc: 'A friendly ding-dong' },
  { id: 'bowl', label: 'Singing bowl', desc: 'Deep and calming (quieter on phone speakers)' },
  { id: 'chime', label: 'Soft chime', desc: 'Two light notes' },
  { id: 'windchimes', label: 'Wind chimes', desc: 'Gentle and airy' },
  { id: 'piano', label: 'Piano note', desc: 'Warm and simple' },
  { id: 'harp', label: 'Harp ripple', desc: 'A rising glissando' },
];

const PLAYERS = {
  clear(ac) {
    // A struck hand bell: bright partials in the range phone speakers play loudest.
    const base = 1046.5;
    [
      [1, 0.32, 2.6],
      [2.0, 0.16, 1.8],
      [2.76, 0.12, 1.3],
      [3.5, 0.06, 0.9],
      [0.5, 0.1, 2.2],
    ].forEach(([m, peak, dur]) => tone(ac, { freq: base * m, peak, dur, attack: 0.003 }));
    [[1, 0.2, 1.8], [2.76, 0.06, 0.9]].forEach(([m, peak, dur]) => tone(ac, { freq: base * 1.25 * m, peak, dur, attack: 0.003, start: 0.32 }));
  },
  doorchime(ac) {
    [[1318.5, 0], [1046.5, 0.55]].forEach(([f, start]) => {
      tone(ac, { freq: f, start, dur: 1.8, peak: 0.34, attack: 0.004, type: 'triangle' });
      tone(ac, { freq: f * 2, start, dur: 0.9, peak: 0.08, attack: 0.004 });
    });
  },
  bowl(ac) {
    // A struck bowl: low fundamental with inharmonic partials and slow beating.
    const base = 293.66;
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

export const BELL_VOLUMES = [
  { id: 'soft', label: 'Soft', gain: 1.2, element: 0.35 },
  { id: 'medium', label: 'Medium', gain: 2.6, element: 0.65 },
  { id: 'loud', label: 'Loud', gain: 5, element: 1 },
];

export const BELL_REPEATS = [
  { id: 'once', label: 'Once', times: 1 },
  { id: 'three', label: '3 times', times: 3 },
  { id: 'until', label: 'Until I respond', times: 15 }, // about one minute
];

/** Volume stage with a limiter, so loud bells stay clear instead of distorting. */
function output(ac, volume) {
  const gain = ac.createGain();
  gain.gain.value = (BELL_VOLUMES.find((v) => v.id === volume) || BELL_VOLUMES[2]).gain;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  gain.connect(limiter).connect(ac.destination);
  return gain;
}

// ---------- bells as real audio files (louder and more reliable on phones) ----------
let player = null; // one shared <audio> element, "unlocked" by the first tap
const rendered = new Map(); // bell id -> object URL of a WAV file

function audioElement() {
  if (!player && typeof Audio !== 'undefined') {
    player = new Audio();
    player.preload = 'auto';
  }
  return player;
}

/** Encode mono float samples as a 16-bit WAV file. */
export function encodeWav(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, x) => [...x].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return buf;
}

/** Scale samples so the loudest point is just below full volume. */
export function normalise(samples, target = 0.97) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] / peak) * target;
  return samples;
}

/** Render a bell once to a WAV file, ready to play instantly. */
export async function prepareBell(id = 'clear') {
  if (rendered.has(id)) return rendered.get(id);
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Offline || typeof Blob === 'undefined' || !globalThis.URL?.createObjectURL) return null;
  try {
    const rate = 44100;
    const oc = new Offline(1, rate * 3, rate);
    bus = null;
    (PLAYERS[id] || PLAYERS.clear)(oc);
    const out = await oc.startRendering();
    const samples = normalise(new Float32Array(out.getChannelData(0)));
    const url = URL.createObjectURL(new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }));
    rendered.set(id, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Phones keep web audio muted until the person has touched the page.
 * Call this from any tap so the bell can ring later.
 */
export function unlockAudio() {
  try {
    const ac = audio();
    if (ac && ac.state !== 'running') ac.resume().catch(() => {});
  } catch { /* audio is optional */ }
  const el = audioElement();
  if (el && !el.dataset?.unlocked && rendered.size) {
    el.src = [...rendered.values()][0];
    el.muted = true;
    el.play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        if (el.dataset) el.dataset.unlocked = '1';
      })
      .catch(() => {
        el.muted = false;
      });
  }
}

/** Play a bell sound once. Safe to call anywhere; silently does nothing without audio support. */
export function playBell(id = 'clear', { volume = 'loud' } = {}) {
  const level = BELL_VOLUMES.find((v) => v.id === volume) || BELL_VOLUMES[2];
  const url = rendered.get(id);
  const el = audioElement();
  globalThis.__gmBellPlays = (globalThis.__gmBellPlays || 0) + 1;
  if (url && el) {
    try {
      el.pause();
      el.src = url;
      el.currentTime = 0;
      el.muted = false;
      el.volume = level.element;
      const p = el.play();
      if (p && p.catch) p.catch(() => playLive(id, volume));
      return true;
    } catch { /* fall back to live audio below */ }
  }
  prepareBell(id);
  return playLive(id, volume);
}

function playLive(id, volume) {
  try {
    const ac = audio();
    if (!ac) return false;
    bus = output(ac, volume);
    (PLAYERS[id] || PLAYERS.clear)(ac);
    bus = null;
    return true;
  } catch {
    bus = null;
    return false;
  }
}

/**
 * Ring the bell several times (about every 4 seconds) until done or stopped.
 * `onRing` runs with each ring (used for vibration). Returns { stop() }.
 */
export function ringBell({ id = 'clear', volume = 'loud', repeat = 'three', sound = true, onRing } = {}) {
  const times = (BELL_REPEATS.find((r) => r.id === repeat) || BELL_REPEATS[1]).times;
  let count = 0;
  let timer = null;
  const ring = () => {
    count++;
    if (sound) playBell(id, { volume });
    onRing?.(count);
    if (count >= times) stop();
  };
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  ring();
  if (times > 1) timer = setInterval(ring, 4000);
  return { stop, get ringing() { return Boolean(timer); } };
}

/**
 * Music for the 1-minute pause. Plays one of your own tracks when given
 * (for example Gemrhythm relaxation music); otherwise gentle music-box chimes.
 * Returns { stop(), track }.
 */
export function startSoundscape({ tracks = [], trackUrl = '' } = {}) {
  const list = [...(tracks || []), trackUrl].filter(Boolean);
  if (list.length) {
    const src = list[Math.floor(Math.random() * list.length)];
    const el = new Audio(src);
    el.loop = true;
    el.volume = 0;
    el.play().catch(() => {});
    let v = 0;
    const fade = setInterval(() => {
      v = Math.min(1, v + 0.05);
      el.volume = v;
      if (v >= 1) clearInterval(fade);
    }, 120);
    return {
      track: src,
      stop() {
        clearInterval(fade);
        let out = el.volume;
        const fadeOut = setInterval(() => {
          out = Math.max(0, out - 0.1);
          el.volume = out;
          if (out <= 0) {
            clearInterval(fadeOut);
            el.pause();
          }
        }, 80);
      },
    };
  }
  const ac = audio();
  if (!ac) return { stop() {} };
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);
  // A slow, gentle melody on a pentatonic scale (no drone).
  const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7];
  let i = 0;
  const playNote = () => {
    const f = scale[(i * 3 + (i % 2 ? 2 : 0)) % scale.length];
    tone(ac, { freq: f, dur: 2.6, peak: 0.16, attack: 0.01, type: 'triangle', out: master });
    tone(ac, { freq: f * 2, dur: 1.2, peak: 0.03, attack: 0.01, out: master });
    if (i % 4 === 0) tone(ac, { freq: f / 2, dur: 3.5, peak: 0.08, attack: 0.05, out: master });
    i++;
  };
  playNote();
  const timer = setInterval(playNote, 1600);
  return {
    stop() {
      clearInterval(timer);
      try {
        master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.4);
      } catch { /* ignore */ }
    },
  };
}
