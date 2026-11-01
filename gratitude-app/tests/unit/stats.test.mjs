import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, longestStreak, weeklyStats, milestoneStatus, pickMemory, summary } from '../../js/stats.js';

const e = (y, m, d, h = 12, extra = {}) => ({ id: `${y}${m}${d}${h}${Math.random()}`, text: 'x', createdAt: new Date(y, m - 1, d, h).toISOString(), ...extra });
const now = new Date(2026, 10, 5, 15); // Thu 5 Nov 2026

test('streak counts consecutive days ending today', () => {
  assert.equal(currentStreak([e(2026, 11, 5), e(2026, 11, 4), e(2026, 11, 3)], now), 3);
});

test('streak is not broken until the day is over', () => {
  assert.equal(currentStreak([e(2026, 11, 4), e(2026, 11, 3)], now), 2);
});

test('missing a day resets gently to 0', () => {
  assert.equal(currentStreak([e(2026, 11, 3)], now), 0);
  assert.equal(currentStreak([], now), 0);
});

test('multiple entries per day count once', () => {
  assert.equal(currentStreak([e(2026, 11, 5, 9), e(2026, 11, 5, 18), e(2026, 11, 4)], now), 2);
});

test('longest streak', () => {
  const list = [e(2026, 10, 1), e(2026, 10, 2), e(2026, 10, 3), e(2026, 10, 4), e(2026, 11, 4), e(2026, 11, 5)];
  assert.equal(longestStreak(list), 4);
});

test('weekly stats: count, most active day, themes, favourites', () => {
  const list = [
    e(2026, 11, 3, 9, { category: 'family' }), e(2026, 11, 3, 12, { category: 'family', favourite: true }), e(2026, 11, 3, 18, { category: 'nature' }),
    e(2026, 11, 2, 9, { category: 'learning' }),
    e(2026, 11, 8, 9, { category: 'family' }), // Sunday, same week
    e(2026, 11, 9, 9, { category: 'food' }), // next week
  ];
  const w = weeklyStats(list, now);
  assert.equal(w.count, 5);
  assert.equal(w.mostActiveDay, 'Tuesday');
  assert.equal(w.themes[0].category, 'family');
  assert.equal(w.themes[0].count, 3);
  assert.equal(w.highlights.length, 1);
  assert.ok(w.highlightsAreFavourites);
  assert.equal(w.byDay[1].count, 3);
});

test('milestones', () => {
  const list = Array.from({ length: 10 }, (_, i) => e(2026, 11, 5, 8 + i));
  const m = Object.fromEntries(milestoneStatus(list).map((x) => [x.id, x.achieved]));
  assert.equal(m.first, true);
  assert.equal(m.ten, true);
  assert.equal(m.fifty, false);
  assert.equal(m.streak7, false);
});

test('memory only uses entries at least a week old and is stable per day', () => {
  assert.equal(pickMemory([e(2026, 11, 3)], now), null);
  const list = [e(2026, 11, 3), e(2026, 5, 5, 12, { id: 'six' }), e(2026, 9, 1)];
  const a = pickMemory(list, now);
  assert.equal(a.entry.id, 'six'); // ~6 month anniversary preferred
  assert.equal(a.label, 'A gratitude from 6 months ago');
  assert.equal(pickMemory(list, now).entry.id, a.entry.id);
});

test('summary today/week', () => {
  const s = summary([e(2026, 11, 5), e(2026, 11, 5), e(2026, 11, 2)], now);
  assert.equal(s.today, 2);
  assert.equal(s.thisWeek, 3);
});
