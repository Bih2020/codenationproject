// Date & time helpers. All "day keys" are local calendar dates (YYYY-MM-DD).

export const pad = (n) => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday-based start of week. */
export function startOfWeek(d) {
  const x = startOfDay(d);
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return x;
}

export function daysBetween(a, b) {
  // whole calendar days from a to b (b - a), DST safe
  const ms = startOfDay(b) - startOfDay(a);
  return Math.round(ms / 86400000);
}

/** "HH:MM" -> minutes since midnight. */
export function parseTime(t) {
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins) {
  return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
}

export function atTime(day, mins) {
  const x = startOfDay(day);
  x.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return x;
}

export function formatTime(value, locale) {
  const d = typeof value === 'string' ? atTime(new Date(), parseTime(value)) : new Date(value);
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

export function formatLongDate(d, locale) {
  return new Date(d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatShortDate(d, locale) {
  return new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDayLabel(key, now = new Date(), locale) {
  const diff = daysBetween(parseDayKey(key), now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = parseDayKey(key);
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date(now).getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(locale, opts);
}

/** Gentle "x ago" wording for memories. */
export function agoLabel(date, now = new Date()) {
  const days = daysBetween(date, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'a week ago';
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) {
    const months = Math.max(1, Math.round(days / 30.44));
    return months === 1 ? 'a month ago' : `${months} months ago`;
  }
  const years = Math.round(days / 365.25);
  return years <= 1 ? 'a year ago' : `${years} years ago`;
}

export function greetingFor(d = new Date()) {
  const h = new Date(d).getHours();
  if (h < 5) return { text: 'Good evening', emoji: '🌙' };
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  return { text: 'Good evening', emoji: '🌙' };
}

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
