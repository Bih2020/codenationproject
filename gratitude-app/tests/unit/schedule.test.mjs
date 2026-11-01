import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultReminderSettings, nextReminder, slotsForDay, remindersBetween, upcomingReminders, validateReminderSettings, isPaused, reminderRecords } from '../../js/schedule.js';

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

test('default: every 2 hours, 8am–10pm', () => {
  const s = defaultReminderSettings();
  assert.equal(s.intervalMinutes, 120);
  assert.deepEqual(slotsForDay(s, at(2026, 11, 2)).map(hm), ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']);
});

test('next reminder is the next slot after now', () => {
  const s = defaultReminderSettings();
  assert.equal(hm(nextReminder(s, at(2026, 11, 2, 13, 5))), '14:00');
  assert.equal(hm(nextReminder(s, at(2026, 11, 2, 14, 0))), '16:00'); // strictly after
});

test('after active hours, next is tomorrow morning', () => {
  const n = nextReminder(defaultReminderSettings(), at(2026, 11, 2, 22, 30));
  assert.equal(n.getDate(), 3);
  assert.equal(hm(n), '08:00');
});

test('changing frequency changes slots', () => {
  const s = { ...defaultReminderSettings(), intervalMinutes: 30, activeStart: '09:00', activeEnd: '10:00' };
  assert.deepEqual(slotsForDay(s, at(2026, 11, 2)).map(hm), ['09:00', '09:30', '10:00']);
});

test('custom times are used exactly and sorted', () => {
  const s = { ...defaultReminderSettings(), mode: 'custom', customTimes: ['20:00', '08:00', '12:00', '16:00'] };
  assert.deepEqual(slotsForDay(s, at(2026, 11, 2)).map(hm), ['08:00', '12:00', '16:00', '20:00']);
  assert.equal(hm(nextReminder(s, at(2026, 11, 2, 12, 1))), '16:00');
});

test('disabled (bell off) means no next reminder', () => {
  assert.equal(nextReminder({ ...defaultReminderSettings(), enabled: false }, at(2026, 11, 2, 9)), null);
});

test('pause until a time, and pause forever', () => {
  const now = at(2026, 11, 2, 9, 0);
  const s = { ...defaultReminderSettings(), pausedUntil: at(2026, 11, 2, 13, 0).toISOString() };
  assert.ok(isPaused(s, now));
  assert.equal(hm(nextReminder(s, now)), '14:00');
  assert.equal(nextReminder({ ...s, pausedUntil: 'forever' }, now), null);
  assert.ok(!isPaused(s, at(2026, 11, 2, 13, 1)));
});

test('weekday selection skips unselected days', () => {
  // weekdays only; 2026-11-07 is a Saturday
  const s = { ...defaultReminderSettings(), days: [false, true, true, true, true, true, false] };
  assert.equal(slotsForDay(s, at(2026, 11, 7)).length, 0);
  const n = nextReminder(s, at(2026, 11, 6, 23, 0));
  assert.equal(n.getDay(), 1);
});

test('weekend hours can differ', () => {
  const s = { ...defaultReminderSettings(), weekendDifferent: true, weekendStart: '10:00', weekendEnd: '12:00' };
  assert.deepEqual(slotsForDay(s, at(2026, 11, 7)).map(hm), ['10:00', '12:00']);
  assert.equal(slotsForDay(s, at(2026, 11, 9))[0].getHours(), 8);
});

test('remindersBetween finds due slots and ignores paused ones', () => {
  const s = defaultReminderSettings();
  assert.equal(remindersBetween(s, at(2026, 11, 2, 9, 59), at(2026, 11, 2, 10, 0)).length, 1);
  assert.equal(remindersBetween(s, at(2026, 11, 2, 10, 0), at(2026, 11, 2, 10, 1)).length, 0);
  assert.equal(remindersBetween({ ...s, enabled: false }, at(2026, 11, 2, 9), at(2026, 11, 2, 11)).length, 0);
});

test('upcomingReminders returns ordered list', () => {
  const list = upcomingReminders(defaultReminderSettings(), at(2026, 11, 2, 21, 0), 3);
  assert.deepEqual(list.map(hm), ['22:00', '08:00', '10:00']);
});

test('validation catches bad settings', () => {
  const s = defaultReminderSettings();
  assert.deepEqual(validateReminderSettings(s), []);
  assert.ok(validateReminderSettings({ ...s, activeEnd: '07:00' }).length);
  assert.ok(validateReminderSettings({ ...s, days: Array(7).fill(false) }).length);
  assert.ok(validateReminderSettings({ ...s, mode: 'custom', customTimes: [] }).length);
});

test('reminder records follow the data model', () => {
  const r = reminderRecords(defaultReminderSettings(), 'u1', at(2026, 11, 2));
  assert.equal(r.length, 8);
  assert.deepEqual(Object.keys(r[0]).sort(), ['active', 'frequency', 'id', 'scheduledTime', 'selectedDays', 'userId']);
  assert.equal(r[0].frequency, 'every-120-minutes');
});

import { bellMode, bellModePatch } from '../../js/schedule.js';

test('bell modes: sound, vibrate only, off', () => {
  const s = defaultReminderSettings();
  assert.equal(bellMode(s), 'ring');
  const quiet = { ...s, ...bellModePatch('quiet') };
  assert.equal(bellMode(quiet), 'quiet');
  assert.equal(quiet.vibration, true);
  assert.ok(nextReminder(quiet, at(2026, 11, 2, 9)), 'quiet mode still reminds');
  const off = { ...quiet, ...bellModePatch('off') };
  assert.equal(bellMode(off), 'off');
  assert.equal(nextReminder(off, at(2026, 11, 2, 9)), null);
  assert.equal(bellMode({ ...off, ...bellModePatch('ring') }), 'ring');
});
