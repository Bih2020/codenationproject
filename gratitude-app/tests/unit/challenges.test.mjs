import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, DAY_PLAN, startChallenge, challengeProgress, recordChallengeDay } from '../../js/challenges.js';
import { CATEGORIES } from '../../js/prompts.js';
import { wrapLines } from '../../js/sharecard.js';
import { createStore } from '../../js/store.js';

const day = (d, h = 10) => new Date(2026, 10, d, h);

test('challenge plans are complete and use real themes', () => {
  assert.deepEqual(CHALLENGES.map((c) => c.days), [7, 21, 30]);
  for (const c of CHALLENGES) assert.equal(c.plan.length, c.days);
  for (const d of DAY_PLAN) assert.ok(CATEGORIES[d.category], d.category);
});

test('one day counts per calendar day; missed days never break it', () => {
  let c = startChallenge('seven', day(1));
  c = recordChallengeDay(c, { id: 'a' }, day(1, 9));
  c = recordChallengeDay(c, { id: 'b' }, day(1, 20)); // same day: no extra credit
  assert.equal(c.completed.length, 1);
  let p = challengeProgress(c, day(1, 21));
  assert.equal(p.doneToday, true);
  assert.equal(p.dayNumber, 1);
  // skip 2nd and 3rd, come back on the 4th: day 2 continues
  p = challengeProgress(c, day(4));
  assert.equal(p.doneToday, false);
  assert.equal(p.dayNumber, 2);
  c = recordChallengeDay(c, { id: 'c' }, day(4));
  assert.equal(c.completed.length, 2);
});

test('challenge finishes after N days', () => {
  let c = startChallenge('seven', day(1));
  for (let i = 1; i <= 9; i++) c = recordChallengeDay(c, { id: String(i) }, day(i));
  const p = challengeProgress(c, day(9));
  assert.equal(p.finished, true);
  assert.equal(c.completed.length, 7);
  assert.equal(p.percent, 100);
});

test('store records challenge days and history', () => {
  let t = day(1);
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const s = createStore({ storage, now: () => t });
  s.startChallenge('seven');
  for (let i = 1; i <= 7; i++) {
    t = day(i);
    s.addEntry({ text: `thing ${i}` });
  }
  assert.equal(s.state.challenge.completed.length, 7);
  assert.equal(s.state.challengeHistory.length, 1);
  assert.equal(createStore({ storage, now: () => t }).state.challengeHistory[0].id, 'seven');
});

test('share card text wraps within width', () => {
  const measure = (str) => str.length * 10;
  const lines = wrapLines(measure, 'one two three four five six seven eight', 100);
  assert.ok(lines.every((l) => measure(l) <= 100));
  assert.equal(lines.join(' '), 'one two three four five six seven eight');
});
