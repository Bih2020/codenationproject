// App bootstrap: store, theme, router, reminder engine, service worker.
import { createStore } from './store.js';
import { ReminderEngine, notificationSupport } from './notifications.js';
import { icons, esc, toast } from './ui.js';
import { t, setLanguage, detectLanguage } from './i18n.js';
import { unlockAudio, prepareBell } from './sounds.js';
import { loadSiteConfig } from './config.js';
import { syncPush, readPushStatus, ackPush } from './push.js';
import * as home from './views/home.js';
import * as journal from './views/journal.js';
import * as insights from './views/insights.js';
import * as week from './views/week.js';
import * as favourites from './views/favourites.js';
import * as settings from './views/settings.js';
import * as onboarding from './views/onboarding.js';
import * as reflection from './views/reflection.js';
import * as challenges from './views/challenges.js';

const ROUTES = { home, journal, insights, week, favourites, settings, onboarding, reflection, challenges };
const TABS = [
  { id: 'home', label: 'Home', icon: icons.home },
  { id: 'journal', label: 'Journal', icon: icons.book },
  { id: 'insights', label: 'Insights', icon: icons.chart },
  { id: 'favourites', label: 'Favourites', icon: icons.heart },
  { id: 'settings', label: 'Settings', icon: icons.settings },
];
const TAB_FOR = { week: 'insights', reflection: 'home', challenges: 'insights' };

const store = createStore();
// Expose for debugging/tests only.
globalThis.__gratitude = { store };

const main = document.getElementById('main');
const nav = document.getElementById('tabbar');
let current = { name: null, unmount: null };

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { name: path || 'home', params: Object.fromEntries(new URLSearchParams(query)) };
}

export function navigate(to) {
  if (location.hash === to) render({ scrollTop: true });
  else location.hash = to;
}

// ---------- theme / appearance ----------
const media = matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
  setLanguage(detectLanguage(store.state.user.preferences.language));
  const p = store.state.user.preferences;
  const root = document.documentElement;
  const dark = p.theme === 'dark' || (p.theme === 'system' && media.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.textSize = p.textSize || 'normal';
  root.dataset.reduceMotion = p.reduceMotion ? 'true' : 'false';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1528' : '#5b34c4');
}
media.addEventListener?.('change', applyAppearance);

// ---------- rendering ----------
function renderNav(active) {
  nav.hidden = active === 'onboarding';
  nav.setAttribute('aria-label', t('Main'));
  nav.innerHTML = `<ul>${TABS.map(
    (tab) => `<li><a href="#/${tab.id}" class="tab ${tab.id === active ? 'is-active' : ''}" ${tab.id === active ? 'aria-current="page"' : ''}>
        ${tab.id === 'favourites' && active === 'favourites' ? icons.heartFilled : tab.icon}<span>${t(tab.label)}</span></a></li>`
  ).join('')}</ul>`;
  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = t('Skip to main content');
}

function captureFocus() {
  const a = document.activeElement;
  if (!a || a === document.body || !main.contains(a)) return null;
  const key = a.id || a.dataset?.focusKey;
  if (!key) return null;
  return { key, start: a.selectionStart, end: a.selectionEnd };
}

function restoreFocus(f) {
  if (!f) return;
  const el = document.getElementById(f.key) || main.querySelector(`[data-focus-key="${CSS.escape(f.key)}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (typeof f.start === 'number' && el.setSelectionRange) {
    try {
      el.setSelectionRange(f.start, f.end);
    } catch { /* not a text input */ }
  }
}

function render({ scrollTop = false, routeChange = false } = {}) {
  let { name, params } = parseHash();
  if (!store.state.user.onboarded && name !== 'onboarding') {
    history.replaceState(null, '', '#/onboarding');
    name = 'onboarding';
  } else if (store.state.user.onboarded && name === 'onboarding') {
    history.replaceState(null, '', '#/home');
    name = 'home';
  }
  const view = ROUTES[name] || ROUTES.home;
  if (!ROUTES[name]) name = 'home';
  const focus = routeChange ? null : captureFocus();
  current.unmount?.();
  current.unmount = null;
  if (routeChange || current.name !== name) {
    if (current.name) ROUTES[current.name]?.leave?.(ctx);
    view.enter?.(ctx, params);
  }
  current.name = name;
  renderNav(TAB_FOR[name] || name);
  main.innerHTML = view.render(ctx, params);
  const cleanup = view.mount?.(main, ctx, params);
  if (typeof cleanup === 'function') current.unmount = cleanup;
  document.title = `${view.title?.(ctx) || 'Gladmoment'}`;
  renderStorageWarning();
  if (routeChange) {
    main.classList.add('entering');
    clearTimeout(render.enterTimer);
    render.enterTimer = setTimeout(() => main.classList.remove('entering'), 700);
    if (scrollTop) window.scrollTo({ top: 0 });
    // Move focus to the page heading for screen-reader users (but not on Home where we may focus the textarea).
    if (!(name === 'home' && params.focus)) main.querySelector('h1')?.focus({ preventScroll: true });
  } else restoreFocus(focus);
}

function renderStorageWarning() {
  const el = document.getElementById('storage-warning');
  const msg = !store.persistent
    ? t('Your browser is not allowing this app to save data (for example in a private window). Entries will be lost when you close the app.')
    : store.warning && t(store.warning);
  el.hidden = !msg;
  el.textContent = msg || '';
}

const ctx = {
  store,
  navigate,
  rerender: () => render(),
  get engine() {
    return engine;
  },
};

// ---------- reminders ----------
const banner = document.getElementById('reminder-banner');
function showReminderBanner() {
  const quiet = Boolean(store.state.reminderSettings.quiet);
  banner.innerHTML = `<div class="reminder-banner-card" role="alertdialog" aria-labelledby="rb-title" aria-describedby="rb-body">
      <p id="rb-title" class="rb-title">${quiet ? t('A quiet gratitude moment 📳') : t('A little gratitude moment 💛')}</p>
      <p id="rb-body" class="rb-body">${quiet
        ? t('No need to type. Pause, think of one thing you’re grateful for, and say thank you silently in your heart.')
        : t('Take a few seconds. What is one thing you’re grateful for right now?')}</p>
      <div class="rb-actions">
        ${quiet ? `<button type="button" class="btn btn-primary" data-rb="heart">🤍 ${t('I said it in my heart')}</button>` : ''}
        <button type="button" class="btn ${quiet ? 'btn-ghost-light' : 'btn-primary'}" data-rb="write">${t('Write it now')}</button>
        <button type="button" class="btn btn-ghost-light" data-rb="dismiss">${t('Not now')}</button>
      </div>
    </div>`;
  banner.hidden = false;
  banner.querySelector('.btn').focus();
}
banner.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-rb]');
  if (!b) return;
  engine.stopRinging();
  banner.hidden = true;
  banner.innerHTML = '';
  if (b.dataset.rb === 'write') navigate('#/home?focus=1');
  if (b.dataset.rb === 'heart') {
    store.addEntry({ text: t('Gave thanks silently in my heart'), source: 'heart', inferTheme: false });
    toast(t('A quiet thank-you, counted. 🤍'));
  }
});

const engine = new ReminderEngine({
  getSettings: () => store.state.reminderSettings,
  onReminder: (_at, { visible }) => {
    if (visible) showReminderBanner();
    if (current.name === 'home') render(); // refresh "next reminder"
  },
});

// Keep the "next reminder" text fresh while idle on Home.
setInterval(() => {
  if (current.name === 'home' && !document.querySelector('#gratitude-text:focus')) home.refreshHeader?.(main, ctx);
}, 30000);

// Phones keep web audio muted until the page is touched: switch it on at the first tap.
['pointerdown', 'keydown'].forEach((type) => document.addEventListener(type, unlockAudio, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') engine.stopRinging();
});

// ---------- push reminders (so the bell reaches the phone when the app is closed) ----------
let pushTimer = null;
function schedulePushSync(delay = 1500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (!store.state.user.onboarded) return;
    await syncPush(store.state.reminderSettings);
    if (current.name === 'settings') render();
  }, delay);
}
globalThis.__gmSyncPush = (opts) => syncPush(store.state.reminderSettings, opts);
document.addEventListener('visibilitychange', () => {
  // Keep the 30-day schedule topped up: refresh at most every 6 hours.
  const last = readPushStatus()?.at || 0;
  if (document.visibilityState === 'visible' && Date.now() - last > 6 * 3600 * 1000) schedulePushSync(500);
  // Opening Gladmoment answers the reminder: the website stops ringing again.
  if (document.visibilityState === 'visible') ackPush();
});
if (document.visibilityState === 'visible') ackPush();
navigator.serviceWorker?.addEventListener('message', (ev) => {
  if (ev.data?.type !== 'push-reminder' || document.visibilityState !== 'visible') return;
  ackPush(); // the app is on screen and rings its own bell
  if (Date.now() - (engine.lastDelivered || 0) > 2 * 60 * 1000) engine.deliver(new Date());
});

// ---------- install prompt (Android / desktop Chrome) ----------
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  globalThis.__gmInstallPrompt = ev;
  if (current.name === 'home') render();
});
window.addEventListener('appinstalled', () => {
  globalThis.__gmInstallPrompt = null;
  if (store.state.user.onboarded) store.updateUi({ installDismissed: true });
});

// ---------- service worker ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker registration failed', err));
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'open-entry') navigate('#/home?focus=1');
  });
}

// ---------- boot ----------
let lastSnapshot = '';
store.subscribe(() => {
  applyAppearance();
  const rs = JSON.stringify(store.state.reminderSettings) + store.state.user.preferences.language;
  if (rs !== lastSnapshot) {
    lastSnapshot = rs;
    engine.resync();
    prepareBell(store.state.reminderSettings.bellSound);
    schedulePushSync();
  }
  render();
});

window.addEventListener('hashchange', () => render({ routeChange: true, scrollTop: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const perm = notificationSupport();
    if (perm !== store.state.user.notificationSettings.permission && store.state.user.onboarded) store.setNotificationPermission(perm);
    else if (current.name === 'home') render();
  }
});

applyAppearance();
lastSnapshot = JSON.stringify(store.state.reminderSettings) + store.state.user.preferences.language;
engine.start();
render({ routeChange: true });
prepareBell(store.state.reminderSettings.bellSound);
schedulePushSync(2000);
loadSiteConfig().then(() => current.name === 'home' && render());

if (store.warning) toast(t(store.warning), { duration: 9000 });

export { store, engine, esc };
