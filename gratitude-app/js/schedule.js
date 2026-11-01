// Pure reminder-scheduling logic. No DOM, no timers — easy to unit test and
// reusable by any notification backend (web, service worker, native).
import { addDays, atTime, parseTime, startOfDay, minutesToTime } from './dates.js';

export const FREQUENCY_OPTIONS = [
  { minutes: 30, label: 'Every 30 minutes', short: '30 minutes' },
  { minutes: 60, label: 'Every 1 hour', short: '1 hour' },
  { minutes: 120, label: 'Every 2 hours', short: '2 hours' },
  { minutes: 180, label: 'Every 3 hours', short: '3 hours' },
  { minutes: 240, label: 'Every 4 hours', short: '4 hours' },
];

export function defaultReminderSettings() {
  return {
    enabled: true, // the header bell switches this on/off
    pausedUntil: null, // null | ISO string | 'forever'
    mode: 'interval', // 'interval' | 'custom'
    intervalMinutes: 120,
    customTimes: ['08:00', '12:00', '16:00', '20:00'],
    activeStart: '08:00',
    activeEnd: '22:00',
    days: [true, true, true, true, true, true, true], // index 0 = Sunday
    weekendDifferent: false,
    weekendStart: '09:00',
    weekendEnd: '21:00',
    sound: true,
    vibration: true,
    bellSound: 'bowl', // see sounds.js
    quiet: false, // bell mode "vibrate only": no sound, give thanks silently (work, school)
  };
}

export function isWeekend(date) {
  const d = new Date(date).getDay();
  return d === 0 || d === 6;
}

export function activeWindow(settings, date) {
  if (settings.weekendDifferent && isWeekend(date)) {
    return [parseTime(settings.weekendStart), parseTime(settings.weekendEnd)];
  }
  return [parseTime(settings.activeStart), parseTime(settings.activeEnd)];
}

/** Minutes-of-day at which reminders fire on the given date (ignores pause/enabled). */
export function slotMinutesForDay(settings, date) {
  if (!settings.days?.[new Date(date).getDay()]) return [];
  if (settings.mode === 'custom') {
    return [...new Set((settings.customTimes || []).map(parseTime))].sort((a, b) => a - b);
  }
  const [start, end] = activeWindow(settings, date);
  const step = Math.max(15, Number(settings.intervalMinutes) || 120);
  const out = [];
  if (end <= start) return out;
  for (let m = start; m <= end; m += step) out.push(m);
  return out;
}

export function slotsForDay(settings, date) {
  return slotMinutesForDay(settings, date).map((m) => atTime(date, m));
}

export function pauseEnd(settings) {
  const p = settings.pausedUntil;
  if (!p) return null;
  if (p === 'forever') return Infinity;
  const t = new Date(p).getTime();
  return Number.isFinite(t) ? t : null;
}

export function isPaused(settings, now = new Date()) {
  const end = pauseEnd(settings);
  return end !== null && end > new Date(now).getTime();
}

/** Bell modes shown in the header: 'ring' | 'quiet' (vibrate only) | 'off'. */
export function bellMode(settings) {
  if (!settings.enabled) return 'off';
  return settings.quiet ? 'quiet' : 'ring';
}

export function bellModePatch(mode) {
  if (mode === 'off') return { enabled: false, pausedUntil: null };
  return { enabled: true, quiet: mode === 'quiet', pausedUntil: null, ...(mode === 'quiet' ? { vibration: true } : {}) };
}

export function remindersActive(settings, now = new Date()) {
  return Boolean(settings.enabled) && !isPaused(settings, now);
}

/** Next reminder strictly after `now`, honouring enabled/pause. Returns Date | null. */
export function nextReminder(settings, now = new Date()) {
  return upcomingReminders(settings, now, 1)[0] || null;
}

/** Up to `count` upcoming reminder Dates (used to pre-schedule native notifications). */
export function upcomingReminders(settings, now = new Date(), count = 10, horizonDays = 14) {
  if (!settings.enabled) return [];
  const end = pauseEnd(settings);
  if (end === Infinity) return [];
  let from = new Date(now).getTime();
  if (end && end > from) from = end - 1; // allow a slot exactly at the pause end
  const out = [];
  const day0 = startOfDay(from);
  for (let i = 0; i <= horizonDays && out.length < count; i++) {
    for (const slot of slotsForDay(settings, addDays(day0, i))) {
      if (slot.getTime() > from) {
        out.push(slot);
        if (out.length >= count) break;
      }
    }
  }
  return out;
}

/** Slots in the half-open range (from, to] — used by the in-app ticker. */
export function remindersBetween(settings, from, to) {
  const out = [];
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (b <= a) return out;
  for (let d = startOfDay(a); d.getTime() <= b; d = addDays(d, 1)) {
    for (const slot of slotsForDay(settings, d)) {
      const t = slot.getTime();
      if (t > a && t <= b && remindersActive(settings, slot)) out.push(slot);
    }
  }
  return out;
}

/** Validate settings; returns a list of human-readable problems. */
export function validateReminderSettings(s) {
  const errors = [];
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (s.mode === 'interval') {
    if (!timeRe.test(s.activeStart) || !timeRe.test(s.activeEnd)) errors.push('Please choose valid active hours.');
    else if (parseTime(s.activeEnd) <= parseTime(s.activeStart)) errors.push('Reminders must end later in the day than they start.');
    if (s.weekendDifferent && parseTime(s.weekendEnd) <= parseTime(s.weekendStart)) errors.push('Weekend reminders must end later than they start.');
  } else {
    if (!s.customTimes?.length) errors.push('Add at least one reminder time.');
    if (s.customTimes?.some((t) => !timeRe.test(t))) errors.push('One of the custom times is not valid.');
  }
  if (!s.days?.some(Boolean)) errors.push('Choose at least one day for reminders.');
  return errors;
}

/** Reminder records matching the data model (one per daily time). */
export function reminderRecords(settings, userId, sampleDate = new Date()) {
  // pick a representative weekday for interval mode
  let d = startOfDay(sampleDate);
  for (let i = 0; i < 7 && !settings.days[d.getDay()]; i++) d = addDays(d, 1);
  const frequency = settings.mode === 'custom' ? 'custom' : `every-${settings.intervalMinutes}-minutes`;
  return slotMinutesForDay(settings, d).map((m) => ({
    id: `reminder-${minutesToTime(m).replace(':', '')}`,
    userId,
    frequency,
    scheduledTime: minutesToTime(m),
    active: remindersActive(settings),
    selectedDays: settings.days.map((on, i) => (on ? i : null)).filter((x) => x !== null),
  }));
}
