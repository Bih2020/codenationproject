// Service worker: offline app shell + notification click handling.
const CACHE = 'gladmoment-v6';
const SHELL = [
  './', './index.html', './privacy.html', './privacy-fr.html', './js/i18n.js', './js/i18n/fr.js', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/store.js', './js/schedule.js', './js/stats.js', './js/prompts.js', './js/dates.js',
  './js/notifications.js', './js/voice.js', './js/ui.js', './js/config.js', './js/sounds.js',
  './js/challenges.js', './js/nudges.js', './js/sharecard.js', './js/pause.js', './js/views/challenges.js',
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
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
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
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './#/home?focus=1', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
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
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'A little gratitude moment 💛', {
      body: data.body || "Take a few seconds. What is one thing you're grateful for right now?",
      icon: './icons/icon-192.png',
      tag: 'gratitude-reminder',
      data: { url: './#/home?focus=1' },
    })
  );
});
