// Pure statistics: streaks, weekly summary, milestones, moods, memories.
import { addDays, dayKey, daysBetween, startOfDay, startOfWeek, WEEKDAYS_LONG, agoLabel } from './dates.js';

export const MOODS = [
  { id: 'great', emoji: '😄', label: 'Great', score: 5 },
  { id: 'good', emoji: '🙂', label: 'Good', score: 4 },
  { id: 'okay', emoji: '😐', label: 'Okay', score: 3 },
  { id: 'low', emoji: '😔', label: 'Low', score: 2 },
  { id: 'difficult', emoji: '😣', label: 'Difficult day', score: 1 },
];
export const moodById = (id) => MOODS.find((m) => m.id === id);

export function practiceDays(entries) {
  return new Set(entries.map((e) => dayKey(e.createdAt)));
}

/**
 * Current streak: consecutive days with at least one gratitude, ending today —
 * or ending yesterday if nothing has been saved yet today (no penalty until the day is over).
 */
export function currentStreak(entries, now = new Date()) {
  const days = practiceDays(entries);
  let d = startOfDay(now);
  if (!days.has(dayKey(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestStreak(entries) {
  const keys = [...practiceDays(entries)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    const d = new Date(`${k}T12:00:00`);
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function entriesOnDay(entries, key) {
  return entries.filter((e) => dayKey(e.createdAt) === key);
}

export function entriesInRange(entries, start, endExclusive) {
  const a = new Date(start).getTime();
  const b = new Date(endExclusive).getTime();
  return entries.filter((e) => {
    const t = new Date(e.createdAt).getTime();
    return t >= a && t < b;
  });
}

export function countThemes(entries) {
  const counts = {};
  for (const e of entries) if (e.category) counts[e.category] = (counts[e.category] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => ({ category, count }));
}

export function countMoods(entries) {
  const counts = Object.fromEntries(MOODS.map((m) => [m.id, 0]));
  for (const e of entries) if (e.mood && e.mood in counts) counts[e.mood]++;
  return counts;
}

export function weeklyStats(entries, date = new Date()) {
  const start = startOfWeek(date);
  const end = addDays(start, 7);
  const week = entriesInRange(entries, start, end);
  const byDay = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(start, i),
    count: 0,
  }));
  for (const e of week) byDay[daysBetween(start, e.createdAt)].count++;
  const max = Math.max(0, ...byDay.map((d) => d.count));
  const mostActive = max > 0 ? byDay.find((d) => d.count === max) : null;
  const favourites = week.filter((e) => e.favourite);
  // If nothing was favourited, gently surface a few of the more detailed entries.
  const highlights = (favourites.length ? favourites : [...week].sort((a, b) => b.text.length - a.text.length))
    .slice(0, 4);
  return {
    start,
    end,
    count: week.length,
    daysPractised: byDay.filter((d) => d.count > 0).length,
    byDay,
    mostActiveDay: mostActive ? WEEKDAYS_LONG[mostActive.date.getDay()] : null,
    themes: countThemes(week).slice(0, 3),
    moods: countMoods(week),
    highlights,
    highlightsAreFavourites: favourites.length > 0,
  };
}

export const MILESTONES = [
  { id: 'first', emoji: '🌱', label: 'First gratitude saved', test: (s) => s.total >= 1, goal: 1, metric: 'total' },
  { id: 'ten', emoji: '✨', label: '10 gratitude moments', test: (s) => s.total >= 10, goal: 10, metric: 'total' },
  { id: 'streak7', emoji: '🔥', label: '7-day streak', test: (s) => s.longest >= 7, goal: 7, metric: 'longest' },
  { id: 'fifty', emoji: '🌸', label: '50 gratitude moments', test: (s) => s.total >= 50, goal: 50, metric: 'total' },
  { id: 'journey30', emoji: '🗺️', label: '30-day journey', test: (s) => s.days >= 30, goal: 30, metric: 'days' },
  { id: 'hundred', emoji: '🌟', label: '100 gratitude moments', test: (s) => s.total >= 100, goal: 100, metric: 'total' },
];

export function milestoneStatus(entries) {
  const s = { total: entries.length, longest: longestStreak(entries), days: practiceDays(entries).size };
  return MILESTONES.map((m) => ({
    id: m.id,
    emoji: m.emoji,
    label: m.label,
    achieved: m.test(s),
    progress: Math.min(1, s[m.metric] / m.goal),
  }));
}

export function summary(entries, now = new Date()) {
  const today = entriesOnDay(entries, dayKey(now)).length;
  return {
    total: entries.length,
    today,
    thisWeek: weeklyStats(entries, now).count,
    streak: currentStreak(entries, now),
    longest: longestStreak(entries),
    daysPractised: practiceDays(entries).size,
  };
}

/** Mood per day for the last `days` days (most common mood that day, or null). */
export function moodTimeline(entries, days = 14, now = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(startOfDay(now), -i);
    const counts = countMoods(entriesOnDay(entries, dayKey(d)));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    out.push({ date: d, mood: top && top[1] > 0 ? top[0] : null });
  }
  return out;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick one of the user's own older entries (≥ 7 days old) to resurface.
 * Stable for a given day; prefers "anniversaries" (1 week, 1/3/6 months, 1 year ago).
 */
export function pickMemory(entries, now = new Date()) {
  const older = entries.filter((e) => daysBetween(e.createdAt, now) >= 7);
  if (!older.length) return null;
  // Prefer the longest-ago anniversary (1 year, 6 months, 3 months, 1 month, 1 week).
  let pool = older;
  for (const t of [365, 182, 91, 30, 7]) {
    const hits = older.filter((e) => Math.abs(daysBetween(e.createdAt, now) - t) <= (t >= 91 ? 3 : 1));
    if (hits.length) {
      pool = hits;
      break;
    }
  }
  const sorted = [...pool].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const entry = sorted[hashString(dayKey(now)) % sorted.length];
  return { entry, label: `A gratitude from ${agoLabel(entry.createdAt, now)}` };
}
