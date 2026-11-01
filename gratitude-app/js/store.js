// Persistent application state. Everything lives on this device (localStorage);
// nothing is sent to a server. The store is created with an injectable storage
// backend so it can be unit-tested in Node.
import { defaultReminderSettings, reminderRecords } from './schedule.js';
import { inferCategory } from './prompts.js';
import { dayKey, parseDayKey } from './dates.js';

export const STORAGE_KEY = 'gratitude-moments:v1';
export const SCHEMA_VERSION = 1;

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultState(now = new Date()) {
  const userId = uid();
  return {
    schemaVersion: SCHEMA_VERSION,
    user: {
      id: userId,
      displayName: '',
      createdAt: new Date(now).toISOString(),
      onboarded: false,
      preferences: {
        theme: 'system', // 'system' | 'light' | 'dark'
        textSize: 'normal', // 'normal' | 'large' | 'larger'
        reduceMotion: false,
        preferredCategories: [],
        promptPreference: 'all', // 'all' | 'preferred' | 'everyday'
        askMood: true,
        showMemories: true,
        eveningReflection: true,
        reflectionTime: '19:00',
        voiceNoticeAccepted: false,
      },
      notificationSettings: {
        permission: 'default', // last known browser permission
      },
    },
    reminderSettings: defaultReminderSettings(),
    reminders: [],
    entries: [],
    reflections: [],
    ui: { memoryHiddenOn: null, reflectionDismissedOn: null },
  };
}

/** Merge persisted data onto defaults so new fields appear after upgrades. */
export function migrate(raw, now = new Date()) {
  const base = defaultState(now);
  if (!raw || typeof raw !== 'object') return base;
  const s = {
    ...base,
    ...raw,
    user: {
      ...base.user,
      ...(raw.user || {}),
      preferences: { ...base.user.preferences, ...(raw.user?.preferences || {}) },
      notificationSettings: { ...base.user.notificationSettings, ...(raw.user?.notificationSettings || {}) },
    },
    reminderSettings: { ...base.reminderSettings, ...(raw.reminderSettings || {}) },
    entries: Array.isArray(raw.entries) ? raw.entries.filter((e) => e && e.id && typeof e.text === 'string') : [],
    reflections: Array.isArray(raw.reflections) ? raw.reflections : [],
    ui: { ...base.ui, ...(raw.ui || {}) },
    schemaVersion: SCHEMA_VERSION,
  };
  if (!Array.isArray(s.reminderSettings.days) || s.reminderSettings.days.length !== 7) {
    s.reminderSettings.days = base.reminderSettings.days;
  }
  return s;
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

export function createStore({ storage, now = () => new Date() } = {}) {
  let persistent = true;
  let backend = storage;
  try {
    backend = backend || globalThis.localStorage;
    const probe = '__gm_probe__';
    backend.setItem(probe, '1');
    backend.removeItem(probe);
  } catch {
    persistent = false;
    backend = memoryStorage();
  }

  let state;
  let loadWarning = null;
  try {
    const text = backend.getItem(STORAGE_KEY);
    state = migrate(text ? JSON.parse(text) : null, now());
  } catch {
    // Corrupt data: keep a copy so nothing is silently lost, then start fresh.
    try {
      backend.setItem(`${STORAGE_KEY}:corrupt-${Date.now()}`, backend.getItem(STORAGE_KEY));
    } catch { /* ignore */ }
    loadWarning = 'Your saved data could not be read, so a fresh journal was started. A backup copy was kept on this device.';
    state = defaultState(now());
  }

  const listeners = new Set();

  function persist() {
    state.reminders = reminderRecords(state.reminderSettings, state.user.id, now());
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      persistent = false;
      loadWarning = 'Your device storage is full or unavailable, so the latest changes may not be kept.';
    }
  }

  function commit(change) {
    change(state);
    persist();
    for (const fn of listeners) fn(state);
  }

  const sortEntries = () => state.entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const api = {
    get state() {
      return state;
    },
    get persistent() {
      return persistent;
    },
    get warning() {
      return loadWarning;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    completeOnboarding({ displayName = '', reminderSettings = {}, permission } = {}) {
      commit((s) => {
        s.user.displayName = displayName.trim().slice(0, 40);
        s.reminderSettings = { ...s.reminderSettings, ...reminderSettings };
        if (permission) s.user.notificationSettings.permission = permission;
        s.user.onboarded = true;
      });
    },

    addEntry({ text, category = null, mood = null, source = 'typed', promptUsed = null, createdAt, reflectionId = null, inferTheme = true }) {
      const clean = String(text || '').trim();
      if (!clean) throw new Error('Entry text is required');
      const chosen = category || null;
      const entry = {
        id: uid(),
        userId: state.user.id,
        text: clean,
        createdAt: new Date(createdAt || now()).toISOString(),
        updatedAt: null,
        category: chosen || (inferTheme ? inferCategory(clean) : null),
        categorySource: chosen ? 'user' : 'auto',
        mood: mood || null,
        favourite: false,
        source, // 'typed' | 'voice' | 'reflection'
        promptUsed: promptUsed || null,
        reflectionId,
      };
      commit((s) => {
        s.entries.push(entry);
        sortEntries();
      });
      return entry;
    },

    updateEntry(id, patch) {
      commit((s) => {
        const e = s.entries.find((x) => x.id === id);
        if (!e) return;
        if ('text' in patch) {
          const clean = String(patch.text).trim();
          if (clean) e.text = clean;
        }
        if ('category' in patch) {
          e.category = patch.category || inferCategory(e.text);
          e.categorySource = patch.category ? 'user' : 'auto';
        }
        if ('mood' in patch) e.mood = patch.mood || null;
        if ('favourite' in patch) e.favourite = Boolean(patch.favourite);
        e.updatedAt = new Date(now()).toISOString();
      });
    },

    toggleFavourite(id) {
      const e = state.entries.find((x) => x.id === id);
      if (e) api.updateEntry(id, { favourite: !e.favourite });
      return e?.favourite;
    },

    deleteEntry(id) {
      let removed = null;
      commit((s) => {
        const i = s.entries.findIndex((x) => x.id === id);
        if (i >= 0) [removed] = s.entries.splice(i, 1);
        for (const r of s.reflections) r.entryIds = (r.entryIds || []).filter((x) => x !== id);
      });
      return removed;
    },

    restoreEntry(entry) {
      if (!entry) return;
      commit((s) => {
        if (!s.entries.some((e) => e.id === entry.id)) s.entries.push(entry);
        sortEntries();
      });
    },

    reflectionFor(key) {
      return state.reflections.find((r) => r.date === key) || null;
    },

    /** Save (or update) the end-of-day reflection for a date. */
    saveReflection({ date = dayKey(now()), items = [], reflection = '', mood = null }) {
      const texts = items.map((t) => String(t || '').trim());
      const existing = api.reflectionFor(date);
      const id = existing?.id || uid();
      // Reflections for a past day are dated that evening so they appear on the right day.
      const isToday = date === dayKey(now());
      const stamp = () => {
        if (isToday) return new Date(now()).toISOString();
        const d = parseDayKey(date);
        d.setHours(21, 0, 0, 0);
        return d.toISOString();
      };
      commit((s) => {
        const old = s.reflections.find((r) => r.id === id);
        const oldIds = old?.entryIds || [];
        const entryIds = [];
        texts.forEach((text, i) => {
          const prevId = oldIds[i];
          const prev = prevId && s.entries.find((e) => e.id === prevId);
          if (!text) {
            if (prev) s.entries.splice(s.entries.indexOf(prev), 1);
            return;
          }
          if (prev) {
            if (prev.text !== text) {
              prev.text = text;
              prev.updatedAt = new Date(now()).toISOString();
              if (prev.categorySource !== 'user') prev.category = inferCategory(text);
            }
            prev.mood = mood || prev.mood;
            entryIds.push(prev.id);
          } else {
            const created = {
              id: uid(),
              userId: s.user.id,
              text,
              createdAt: stamp(),
              updatedAt: null,
              category: inferCategory(text),
              categorySource: 'auto',
              mood: mood || null,
              favourite: false,
              source: 'reflection',
              promptUsed: "What are the three things you're most grateful for today?",
              reflectionId: id,
            };
            s.entries.push(created);
            entryIds.push(created.id);
          }
        });
        const record = {
          id,
          date,
          entryIds,
          items: texts,
          reflection: String(reflection || '').trim(),
          mood: mood || null,
          createdAt: old?.createdAt || new Date(now()).toISOString(),
          updatedAt: old ? new Date(now()).toISOString() : null,
        };
        if (old) Object.assign(old, record);
        else s.reflections.push(record);
        sortEntries();
      });
      return api.reflectionFor(date);
    },

    deleteReflection(id) {
      commit((s) => {
        const r = s.reflections.find((x) => x.id === id);
        if (!r) return;
        s.entries = s.entries.filter((e) => !(r.entryIds || []).includes(e.id));
        s.reflections = s.reflections.filter((x) => x.id !== id);
      });
    },

    updateReminders(patch) {
      commit((s) => {
        s.reminderSettings = { ...s.reminderSettings, ...patch };
      });
    },

    updateUser(patch) {
      commit((s) => {
        if ('displayName' in patch) s.user.displayName = String(patch.displayName).trim().slice(0, 40);
      });
    },

    updatePreferences(patch) {
      commit((s) => {
        s.user.preferences = { ...s.user.preferences, ...patch };
      });
    },

    setNotificationPermission(permission) {
      if (state.user.notificationSettings.permission === permission) return;
      commit((s) => {
        s.user.notificationSettings.permission = permission;
      });
    },

    updateUi(patch) {
      commit((s) => {
        s.ui = { ...s.ui, ...patch };
      });
    },

    deleteAllHistory() {
      commit((s) => {
        s.entries = [];
        s.reflections = [];
      });
    },

    /** Remove everything, including settings, and return to onboarding. */
    resetApp() {
      state = defaultState(now());
      try {
        backend.removeItem(STORAGE_KEY);
      } catch { /* ignore */ }
      persist();
      for (const fn of listeners) fn(state);
    },

    exportData() {
      return {
        app: 'Gladmoment',
        exportedAt: new Date(now()).toISOString(),
        schemaVersion: SCHEMA_VERSION,
        user: { id: state.user.id, displayName: state.user.displayName, createdAt: state.user.createdAt, preferences: state.user.preferences },
        reminderSettings: state.reminderSettings,
        reminders: state.reminders,
        entries: state.entries,
        reflections: state.reflections,
      };
    },

    /** Merge entries/reflections from an export file. Returns number of new entries. */
    importData(data) {
      if (!data || !Array.isArray(data.entries)) throw new Error('This file does not look like a Gladmoment export.');
      let added = 0;
      commit((s) => {
        const ids = new Set(s.entries.map((e) => e.id));
        for (const e of data.entries) {
          if (!e || !e.id || typeof e.text !== 'string' || ids.has(e.id) || Number.isNaN(new Date(e.createdAt).getTime())) continue;
          s.entries.push({ ...e, userId: s.user.id });
          ids.add(e.id);
          added++;
        }
        const rids = new Set(s.reflections.map((r) => r.id));
        for (const r of data.reflections || []) if (r?.id && !rids.has(r.id)) s.reflections.push(r);
        sortEntries();
      });
      return added;
    },
  };

  if (!state.reminders?.length) state.reminders = reminderRecords(state.reminderSettings, state.user.id, now());
  return api;
}

export function entriesToCsv(entries) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['id', 'createdAt', 'text', 'category', 'mood', 'favourite', 'source', 'promptUsed'];
  const rows = entries.map((e) => header.map((h) => q(e[h])).join(','));
  return [header.join(','), ...rows].join('\r\n');
}
