// Gentle, dismissible nudges: "add to home screen" and "save a backup".
// Pure functions so the rules are easy to test.
import { daysBetween } from './dates.js';

/** Which install instructions to show: 'ios' | 'android' | 'desktop' | null (already installed). */
export function installPlatform({ userAgent = '', standalone = false, maxTouchPoints = 0 } = {}) {
  if (standalone) return null;
  const ua = userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

/** Show the install card once someone has saved a gratitude, unless they dismissed it. */
export function shouldShowInstall({ platform, entriesCount, dismissed }) {
  return Boolean(platform) && !dismissed && entriesCount >= 1;
}

/**
 * A backup reminder is due when there are a few entries, the last backup (or the first entry)
 * was 30+ days ago, and the reminder wasn't put off in the last 7 days.
 */
export function backupDue({ entries, lastBackupAt, snoozedAt }, now = new Date()) {
  if (!entries || entries.length < 5) return false;
  if (snoozedAt && daysBetween(snoozedAt, now) < 7) return false;
  const oldest = entries.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), entries[0].createdAt);
  const since = lastBackupAt || oldest;
  return daysBetween(since, now) >= 30;
}
