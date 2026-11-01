import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY, entriesToCsv } from '../../js/store.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('entries persist across "restarts"', () => {
  const storage = fakeStorage();
  const a = createStore({ storage });
  a.addEntry({ text: "I'm grateful for my mum's soup", mood: 'good' });
  const b = createStore({ storage });
  assert.equal(b.state.entries.length, 1);
  assert.equal(b.state.entries[0].mood, 'good');
  assert.equal(b.state.entries[0].category, 'family'); // inferred
  assert.equal(b.state.entries[0].categorySource, 'auto');
});

test('add requires text', () => {
  const s = createStore({ storage: fakeStorage() });
  assert.throws(() => s.addEntry({ text: '   ' }));
});

test('edit, favourite, delete and undo', () => {
  const s = createStore({ storage: fakeStorage() });
  const e = s.addEntry({ text: 'sunshine', category: 'nature', source: 'voice' });
  s.updateEntry(e.id, { text: 'warm sunshine', mood: 'great' });
  assert.equal(s.state.entries[0].text, 'warm sunshine');
  assert.equal(s.state.entries[0].source, 'voice');
  assert.ok(s.state.entries[0].updatedAt);
  s.toggleFavourite(e.id);
  assert.equal(s.state.entries[0].favourite, true);
  const removed = s.deleteEntry(e.id);
  assert.equal(s.state.entries.length, 0);
  s.restoreEntry(removed);
  assert.equal(s.state.entries.length, 1);
});

test('entries are sorted newest first', () => {
  const s = createStore({ storage: fakeStorage() });
  s.addEntry({ text: 'old', createdAt: '2026-01-01T10:00:00Z' });
  s.addEntry({ text: 'new', createdAt: '2026-06-01T10:00:00Z' });
  assert.equal(s.state.entries[0].text, 'new');
});

test('daily reflection creates and updates its entries', () => {
  const s = createStore({ storage: fakeStorage() });
  s.saveReflection({ items: ['a', 'b', ''], reflection: 'calm day', mood: 'okay' });
  assert.equal(s.state.entries.length, 2);
  const r = s.state.reflections[0];
  assert.equal(r.entryIds.length, 2);
  s.saveReflection({ date: r.date, items: ['a2', '', 'c'], reflection: 'calm' });
  assert.equal(s.state.reflections.length, 1);
  assert.deepEqual(s.state.entries.map((e) => e.text).sort(), ['a2', 'c']);
  s.deleteReflection(r.id);
  assert.equal(s.state.entries.length, 0);
});

test('past-day reflection is dated that day', () => {
  const s = createStore({ storage: fakeStorage() });
  s.saveReflection({ date: '2026-01-15', items: ['x'] });
  const d = new Date(s.state.entries[0].createdAt);
  assert.equal(d.getDate(), 15);
});

test('reminder settings persist; delete all keeps settings; reset clears', () => {
  const storage = fakeStorage();
  const s = createStore({ storage });
  s.updateReminders({ intervalMinutes: 60, enabled: false });
  s.addEntry({ text: 'x' });
  s.deleteAllHistory();
  const b = createStore({ storage });
  assert.equal(b.state.reminderSettings.intervalMinutes, 60);
  assert.equal(b.state.reminderSettings.enabled, false);
  assert.equal(b.state.entries.length, 0);
  b.resetApp();
  assert.equal(b.state.reminderSettings.intervalMinutes, 120);
  assert.equal(b.state.user.onboarded, false);
});

test('corrupt storage starts fresh and keeps a backup', () => {
  const storage = fakeStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const s = createStore({ storage });
  assert.ok(s.warning);
  assert.equal(s.state.entries.length, 0);
  assert.ok([...storage.m.keys()].some((k) => k.includes('corrupt')));
});

test('unavailable storage falls back to memory', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() {} };
  const s = createStore({ storage: broken });
  assert.equal(s.persistent, false);
  s.addEntry({ text: 'still works' });
  assert.equal(s.state.entries.length, 1);
});

test('export / import round trip and CSV escaping', () => {
  const a = createStore({ storage: fakeStorage() });
  a.addEntry({ text: 'He said "thanks", kindly' });
  const data = JSON.parse(JSON.stringify(a.exportData()));
  const b = createStore({ storage: fakeStorage() });
  assert.equal(b.importData(data), 1);
  assert.equal(b.importData(data), 0); // no duplicates
  assert.match(entriesToCsv(b.state.entries), /"He said ""thanks"", kindly"/);
  assert.throws(() => b.importData({ foo: 1 }));
});
