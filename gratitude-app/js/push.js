// Push reminders: so the bell reaches the phone even when Gladmoment is closed.
// The app sends the WordPress site its push address and the next 30 days of
// reminder times (timestamps only). Journal entries never leave the phone.
import { upcomingReminders } from './schedule.js';
import { getLanguage } from './i18n.js';

const STATUS_KEY = 'gratitude-moments:push';
const HORIZON_DAYS = 30;

/** WordPress REST URL. `?rest_route=` works whatever the permalink setting. */
export function apiUrl(route, base = globalThis.location?.href) {
  return new URL(`../?rest_route=/gladmoment/v1/${route}`, base).href;
}

function b64uToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function standalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function readPushStatus() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || 'null');
  } catch {
    return null;
  }
}

function writePushStatus(status) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify({ ...status, at: Date.now() }));
  } catch { /* ignore */ }
  return status;
}

/**
 * What the phone can do:
 * 'on' | 'needs-permission' | 'denied' | 'ios-needs-install' | 'unsupported' | 'server' (site not reachable)
 */
export function pushCapability() {
  if (isIos() && !standalone()) return 'ios-needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in globalThis) || !('Notification' in globalThis)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'needs-permission';
  const s = readPushStatus();
  if (s?.state === 'server') return 'server';
  return s?.state === 'on' ? 'on' : 'needs-sync';
}

/** True when the server will deliver reminders, so the page need not show its own background notification. */
export function pushActive() {
  return readPushStatus()?.state === 'on' && 'Notification' in globalThis && Notification.permission === 'granted';
}

/**
 * Register (or refresh) this phone's reminders on the server.
 * `extraTimes` (Date[]) is used for "test with the app closed".
 */
export async function syncPush(settings, { extraTimes = [] } = {}) {
  const cap = pushCapability();
  if (!['on', 'needs-sync', 'server'].includes(cap)) return writePushStatus({ state: cap });
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    const now = new Date();
    const times = (settings.enabled ? upcomingReminders(settings, now, 1500, HORIZON_DAYS) : [])
      .concat(extraTimes)
      .map((d) => Math.floor(new Date(d).getTime() / 1000));
    if (!sub) {
      if (!times.length) return writePushStatus({ state: 'off' });
      const keyRes = await fetch(apiUrl('push/key'), { cache: 'no-store' });
      if (!keyRes.ok) throw new Error('no key');
      const { publicKey } = await keyRes.json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
    }
    const res = await fetch(apiUrl('push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), times, lang: getLanguage(), quiet: Boolean(settings.quiet) }),
    });
    if (!res.ok) throw new Error(`subscribe ${res.status}`);
    const data = await res.json();
    return writePushStatus({ state: 'on', scheduled: data.scheduled });
  } catch (err) {
    return writePushStatus({ state: 'server', error: String(err?.message || err) });
  }
}

/** Remove this phone from the server (used by "Erase everything"). */
export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      await fetch(apiUrl('push/unsubscribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* ignore */ }
  try {
    localStorage.removeItem(STATUS_KEY);
  } catch { /* ignore */ }
}
