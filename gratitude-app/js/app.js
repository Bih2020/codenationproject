// App bootstrap: store, theme, router, reminder engine, service worker.
import { createStore } from './store.js';
import { ReminderEngine, notificationSupport } from './notifications.js';
import { icons, esc, toast } from './ui.js';
import * as home from './views/home.js';
import * as journal from './views/journal.js';
import * as insights from './views/insights.js';
import * as week from './views/week.js';
import * as favourites from './views/favourites.js';
import * as settings from './views/settings.js';
import * as onboarding from './views/onboarding.js';
import * as reflection from './views/reflection.js';

const ROUTES = { home, journal, insights, week, favourites, settings, onboarding, reflection };
const TABS = [
  { id: 'home', label: 'Home', icon: icons.home },
  { id: 'journal', label: 'Journal', icon: icons.book },
  { id: 'insights', label: 'Insights', icon: icons.chart },
  { id: 'favourites', label: 'Favourites', icon: icons.heart },
  { id: 'settings', label: 'Settings', icon: icons.settings },
];
const TAB_FOR = { week: 'insights', reflection: 'home' };

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
  nav.innerHTML = `<ul>${TABS.map(
    (t) => `<li><a href="#/${t.id}" class="tab ${t.id === active ? 'is-active' : ''}" ${t.id === active ? 'aria-current="page"' : ''}>
        ${t.id === 'favourites' && active === 'favourites' ? icons.heartFilled : t.icon}<span>${t.label}</span></a></li>`
  ).join('')}</ul>`;
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
    ? 'Your browser is not allowing this app to save data (for example in a private window). Entries will be lost when you close the app.'
    : store.warning;
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
      <p id="rb-title" class="rb-title">${quiet ? 'A quiet gratitude moment 📳' : 'A little gratitude moment 💛'}</p>
      <p id="rb-body" class="rb-body">${quiet
        ? 'No need to type. Pause, think of one thing you’re grateful for, and say thank you silently in your heart.'
        : 'Take a few seconds. What is one thing you’re grateful for right now?'}</p>
      <div class="rb-actions">
        ${quiet ? '<button type="button" class="btn btn-primary" data-rb="heart">🤍 I said it in my heart</button>' : ''}
        <button type="button" class="btn ${quiet ? 'btn-ghost-light' : 'btn-primary'}" data-rb="write">Write it now</button>
        <button type="button" class="btn btn-ghost-light" data-rb="dismiss">Not now</button>
      </div>
    </div>`;
  banner.hidden = false;
  banner.querySelector('.btn').focus();
}
banner.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-rb]');
  if (!b) return;
  banner.hidden = true;
  banner.innerHTML = '';
  if (b.dataset.rb === 'write') navigate('#/home?focus=1');
  if (b.dataset.rb === 'heart') {
    store.addEntry({ text: 'Gave thanks silently in my heart', source: 'heart', inferTheme: false });
    toast('A quiet thank-you, counted. 🤍');
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
  const rs = JSON.stringify(store.state.reminderSettings);
  if (rs !== lastSnapshot) {
    lastSnapshot = rs;
    engine.resync();
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
lastSnapshot = JSON.stringify(store.state.reminderSettings);
engine.start();
render({ routeChange: true });

if (store.warning) toast(store.warning, { duration: 9000 });

export { store, engine, esc };
