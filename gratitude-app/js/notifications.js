// Reminder delivery.
//
// Architecture
//   schedule.js  — pure "when should reminders fire?" logic
//   this file    — "how do we deliver them?" via an adapter:
//     • NativeAdapter  — Capacitor LocalNotifications (true background delivery
//                        when the app is wrapped as an iOS/Android app)
//     • WebAdapter     — Notification API + service worker, delivered while the
//                        app (or an installed PWA window/tab) is open
//   ReminderEngine — ticks every 20s, fires any slot that passed since the last
//                    tick, and keeps native schedules in sync with settings.
import { remindersBetween, upcomingReminders } from './schedule.js';
import { ringBell } from './sounds.js';
import { t } from './i18n.js';

export const REMINDER_TITLE = 'A little gratitude moment 💛';
export const REMINDER_BODY = "Take a few seconds. What is one thing you're grateful for right now?";
export const OPEN_URL = './#/home?focus=1';
export const QUIET_BODY = 'Quiet moment 📳 Pause and give thanks silently in your heart.';

const nativeLN = () => globalThis.Capacitor?.Plugins?.LocalNotifications || null;

export function notificationSupport() {
  if (nativeLN()) return 'native';
  if (!('Notification' in globalThis)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export function vibrationSupported() {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export async function requestNotificationPermission() {
  const ln = nativeLN();
  if (ln) {
    try {
      const r = await ln.requestPermissions();
      return r.display === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  if (!('Notification' in globalThis)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a system notification right now (web). Returns true if shown. */
export async function showWebNotification({ sound = true, vibration = true, quiet = false } = {}) {
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return false;
  if (quiet) {
    sound = false;
    vibration = true;
  }
  const options = {
    body: t(quiet ? QUIET_BODY : REMINDER_BODY),
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'gratitude-reminder',
    renotify: true,
    silent: !sound,
    data: { url: OPEN_URL },
  };
  if (vibration) options.vibrate = [120, 80, 120];
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(t(REMINDER_TITLE), options);
      return true;
    }
  } catch { /* fall through to page notification */ }
  try {
    const n = new Notification(t(REMINDER_TITLE), options);
    n.onclick = () => {
      globalThis.focus?.();
      location.hash = '#/home?focus=1';
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Keep native (Capacitor) notifications scheduled for the next two weeks. */
export async function syncNativeSchedule(settings, now = new Date()) {
  const ln = nativeLN();
  if (!ln) return false;
  try {
    const pending = await ln.getPending();
    if (pending?.notifications?.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const times = upcomingReminders(settings, now, 60, 14);
    if (!times.length) return true;
    await ln.schedule({
      notifications: times.map((at, i) => ({
        id: 1000 + i,
        title: t(REMINDER_TITLE),
        body: t(settings.quiet ? QUIET_BODY : REMINDER_BODY),
        schedule: { at, allowWhileIdle: true },
        sound: settings.sound && !settings.quiet ? undefined : null,
        extra: { url: OPEN_URL },
      })),
    });
    return true;
  } catch (err) {
    console.warn('Native notification scheduling failed', err);
    return false;
  }
}

export class ReminderEngine {
  /**
   * @param {{ getSettings: () => object, onReminder: (at: Date) => void, now?: () => Date, intervalMs?: number }} opts
   */
  constructor({ getSettings, onReminder, now = () => new Date(), intervalMs = 20000 }) {
    this.getSettings = getSettings;
    this.onReminder = onReminder;
    this.now = now;
    this.intervalMs = intervalMs;
    this.lastCheck = now();
    this.timer = null;
  }

  start() {
    this.stop();
    this.lastCheck = this.now();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.resync();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Call whenever reminder settings change. */
  resync() {
    syncNativeSchedule(this.getSettings(), this.now());
  }

  async tick() {
    const now = this.now();
    const due = remindersBetween(this.getSettings(), this.lastCheck, now);
    this.lastCheck = now;
    // If the device slept through several slots, only notify once.
    if (!due.length) return;
    const at = due[due.length - 1];
    // Ignore stale slots (e.g. device was asleep for hours) older than 15 minutes.
    if (now - at > 15 * 60000) return;
    await this.deliver(at);
  }

  async deliver(at = this.now()) {
    const s = this.getSettings();
    const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
    if (!nativeLN()) {
      // When the app is hidden (another tab / minimised PWA) use a system notification.
      // When visible, a calm in-app banner is less intrusive.
      if (!visible) await showWebNotification(s);
    }
    if (visible) this.ring(s);
    this.onReminder(at, { visible });
  }

  /** Ring the bell (and vibrate) the way the person chose; stops when they respond. */
  ring(s = this.getSettings()) {
    this.stopRinging();
    const vibrate = (s.vibration || s.quiet) && vibrationSupported();
    this.ringing = ringBell({
      id: s.bellSound,
      volume: s.bellVolume,
      repeat: s.bellRepeat,
      sound: Boolean(s.sound && !s.quiet),
      onRing: () => vibrate && navigator.vibrate(s.quiet ? [400, 200, 400] : [250, 120, 250]),
    });
    return this.ringing;
  }

  stopRinging() {
    this.ringing?.stop();
    this.ringing = null;
    if (vibrationSupported()) navigator.vibrate(0);
  }
}
