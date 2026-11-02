// Service worker: offline app shell + notification click handling.
const CACHE = 'gladmoment-v12';
const SHELL = [
  './', './index.html', './privacy.html', './privacy-fr.html', './js/i18n.js', './js/i18n/fr.js', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/store.js', './js/schedule.js', './js/stats.js', './js/prompts.js', './js/dates.js',
  './js/notifications.js', './js/voice.js', './js/ui.js', './js/config.js', './js/sounds.js',
  './js/challenges.js', './js/nudges.js', './js/push.js', './config.json', './js/sharecard.js', './js/pause.js', './js/views/challenges.js',
  './js/views/home.js', './js/views/journal.js', './js/views/insights.js', './js/views/week.js',
  './js/views/favourites.js', './js/views/settings.js', './js/views/onboarding.js', './js/views/reflection.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive), falling back to the cache when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Never cache WordPress API calls (push reminders) or anything from other sites.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.searchParams.has('rest_route')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});

// Tapping a reminder opens (or focuses) the app on the gratitude-entry screen.
// Tell gemrhythm.com the reminder was answered, so it stops ringing again.
function ackServer() {
  return self.registration.pushManager.getSubscription()
    .then((sub) => sub && fetch(new URL('../?rest_route=/gladmoment/v1/push/ack', self.registration.scope).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }))
    .catch(() => undefined);
}

self.addEventListener('notificationclose', (event) => {
  if (event.notification.tag === 'gratitude-reminder') event.waitUntil(ackServer());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  ackServer();
  const target = new URL(event.notification.data?.url || './#/home?focus=1', self.registration.scope).href;
  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      self.registration.getNotifications({ tag: 'gratitude-reminder' }).catch(() => []),
    ]).then(([clients, shown]) => {
      // The app already rang for this reminder itself (it was running in the background):
      // refresh that notification silently instead of ringing twice.
      const recent = !data.repeat && shown.find((n) => Date.now() - (n.data?.shownAt || 0) < 5 * 60 * 1000);
      if (recent) {
        return self.registration.showNotification(recent.title, {
          body: recent.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
          tag: 'gratitude-reminder', renotify: false, silent: true, data: recent.data,
        });
      }
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope)) {
          client.postMessage({ type: 'open-entry' });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Ready for Web Push (requires a push server — see README "Background notifications").
// Reminders sent by gemrhythm.com while Gladmoment is closed (see includes/push.php in the plugin).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch { /* plain or empty message */ }
  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      self.registration.getNotifications({ tag: 'gratitude-reminder' }).catch(() => []),
    ]).then(([clients, shown]) => {
      // The app already rang for this reminder itself (it was running in the background):
      // refresh that notification silently instead of ringing twice.
      const recent = !data.repeat && shown.find((n) => Date.now() - (n.data?.shownAt || 0) < 5 * 60 * 1000);
      if (recent) {
        return self.registration.showNotification(recent.title, {
          body: recent.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
          tag: 'gratitude-reminder', renotify: false, silent: true, data: recent.data,
        });
      }
      // If Gladmoment is open on screen it rings its own bell, so don't double up.
      const open = clients.find((c) => c.visibilityState === 'visible');
      if (open) {
        open.postMessage({ type: 'push-reminder' });
        return undefined;
      }
      return self.registration.showNotification(data.title || 'A little gratitude moment 💛', {
        body: data.body || "Take a few seconds. What is one thing you're grateful for right now?",
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'gratitude-reminder',
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: data.quiet ? [400, 200, 400, 200, 400] : [300, 150, 300, 150, 300],
        data: { url: data.url || './#/home?focus=1' },
      });
    })
  );
});
