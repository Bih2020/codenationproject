// Gratitude challenges: 7, 21 and 30 days.
// Gentle by design: a day is completed by saving any gratitude on a new calendar
// day, so missing a day never "breaks" the challenge; you simply continue.
import { dayKey } from './dates.js';

/** 30 daily themes; shorter challenges use a curated selection. */
export const DAY_PLAN = [
  { category: 'everyday', prompt: 'What small thing made you smile today?' },
  { category: 'family', prompt: 'Who in your family are you thankful for, and why?' },
  { category: 'nature', prompt: 'What did you notice outside today?' },
  { category: 'health', prompt: 'What is your body doing well for you today?' },
  { category: 'kindness', prompt: 'Who showed you kindness recently?' },
  { category: 'home', prompt: 'Which comfort at home do you appreciate most?' },
  { category: 'food', prompt: 'What meal or drink did you enjoy today?' },
  { category: 'friendship', prompt: 'Which friend would you like to thank today?' },
  { category: 'learning', prompt: 'What have you learned this week?' },
  { category: 'challenges', prompt: 'What difficult moment taught you something good?' },
  { category: 'memories', prompt: 'Which happy memory are you grateful for?' },
  { category: 'work', prompt: 'What went well in your work or daily tasks?' },
  { category: 'money', prompt: 'What need were you able to meet this week?' },
  { category: 'community', prompt: 'Who in your community makes life better?' },
  { category: 'growth', prompt: 'How have you grown in the last year?' },
  { category: 'opportunities', prompt: 'What are you looking forward to?' },
  { category: 'relationships', prompt: 'Who makes you feel understood?' },
  { category: 'everyday', prompt: 'What sound, song or silence did you enjoy today?' },
  { category: 'achievements', prompt: 'What small win can you celebrate today?' },
  { category: 'kindness', prompt: 'What kindness were you able to give today?' },
  { category: 'everyday', prompt: 'What do you normally take for granted?' },
  { category: 'nature', prompt: 'What colour, light or season are you enjoying?' },
  { category: 'family', prompt: 'What family tradition or habit are you thankful for?' },
  { category: 'health', prompt: 'How did you rest or recharge recently?' },
  { category: 'home', prompt: 'What makes your home feel safe?' },
  { category: 'learning', prompt: 'Which teacher or mentor shaped you?' },
  { category: 'money', prompt: 'What are you able to share because of what you have?' },
  { category: 'friendship', prompt: 'What shared joke or moment still makes you laugh?' },
  { category: 'growth', prompt: 'What would your younger self be glad to see in you?' },
  { category: 'everyday', prompt: 'Looking back on this month, what are you most grateful for?' },
];

const SEVEN = [0, 1, 2, 4, 6, 10, 20];

export const CHALLENGES = [
  {
    id: 'seven',
    days: 7,
    emoji: '🌱',
    title: '7-day starter',
    tagline: 'Notice the small things. A gentle week to begin the habit.',
    plan: SEVEN.map((i) => DAY_PLAN[i]),
  },
  {
    id: 'twentyone',
    days: 21,
    emoji: '✨',
    title: '21-day Gladmoment challenge',
    tagline: 'Three weeks, a new theme every day. Long enough to make it a habit.',
    plan: DAY_PLAN.slice(0, 21),
  },
  {
    id: 'thirty',
    days: 30,
    emoji: '🌟',
    title: '30-day gratitude journey',
    tagline: 'A month of noticing: family, nature, work, money, memories and more.',
    plan: DAY_PLAN.slice(0, 30),
  },
];

export const challengeById = (id) => CHALLENGES.find((c) => c.id === id) || null;

/** Start a challenge (state object stored in app state). */
export function startChallenge(id, now = new Date()) {
  if (!challengeById(id)) throw new Error('Unknown challenge');
  return { id, startedOn: dayKey(now), completed: [] };
}

/** Progress summary for the active challenge. */
export function challengeProgress(active, now = new Date()) {
  if (!active) return null;
  const c = challengeById(active.id);
  if (!c) return null;
  const done = active.completed.length;
  const finished = done >= c.days;
  const doneToday = active.completed.some((d) => d.date === dayKey(now));
  // Today's theme: the day you are working on (or the one you just completed today).
  const dayNumber = finished ? c.days : doneToday ? done : done + 1;
  return {
    challenge: c,
    done,
    total: c.days,
    finished,
    doneToday,
    dayNumber,
    today: c.plan[Math.max(0, dayNumber - 1)],
    percent: Math.round((done / c.days) * 100),
  };
}

/**
 * Record a saved gratitude against the active challenge.
 * Returns the updated challenge state (unchanged if today is already counted or it's finished).
 */
export function recordChallengeDay(active, entry, now = new Date()) {
  if (!active) return active;
  const c = challengeById(active.id);
  if (!c || active.completed.length >= c.days) return active;
  const today = dayKey(now);
  if (active.completed.some((d) => d.date === today)) return active;
  return {
    ...active,
    completed: [...active.completed, { day: active.completed.length + 1, date: today, entryId: entry?.id || null }],
  };
}
