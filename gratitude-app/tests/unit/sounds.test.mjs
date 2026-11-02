import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, normalise, BELL_SOUNDS } from '../../js/sounds.js';
import { createStore } from '../../js/store.js';
import { defaultReminderSettings } from '../../js/schedule.js';

test('bells are normalised to just below full volume', () => {
  const s = normalise(new Float32Array([0.1, -0.25, 0.05]));
  assert.ok(Math.abs(Math.max(...s.map(Math.abs)) - 0.97) < 1e-6);
});

test('WAV encoding produces a valid 16-bit mono file', () => {
  const buf = encodeWav(new Float32Array([0, 1, -1]), 44100);
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(...new Uint8Array(buf, o, 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getInt16(46, true), 32767);
  assert.equal(v.getInt16(48, true), -32768);
});

test('bright clear bell is the default; old default bowl is upgraded unless chosen', () => {
  assert.equal(BELL_SOUNDS[0].id, 'clear');
  assert.equal(defaultReminderSettings().bellSound, 'clear');
  const mk = (rs) => {
    const m = new Map([['gratitude-moments:v1', JSON.stringify({ user: { onboarded: true }, reminderSettings: rs })]]);
    return createStore({ storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) } });
  };
  assert.equal(mk({ bellSound: 'bowl' }).state.reminderSettings.bellSound, 'clear');
  assert.equal(mk({ bellSound: 'bowl', bellSoundChosen: true }).state.reminderSettings.bellSound, 'bowl');
  assert.equal(mk({ bellSound: 'harp' }).state.reminderSettings.bellSound, 'harp');
});
