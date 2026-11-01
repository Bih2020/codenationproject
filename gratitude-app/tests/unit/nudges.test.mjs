import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPlatform, shouldShowInstall, backupDue } from '../../js/nudges.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

test('detects the phone type, and hides the guide once installed', () => {
  assert.equal(installPlatform({ userAgent: IPHONE }), 'ios');
  assert.equal(installPlatform({ userAgent: ANDROID }), 'android');
  assert.equal(installPlatform({ userAgent: MAC }), 'desktop');
  assert.equal(installPlatform({ userAgent: MAC, maxTouchPoints: 5 }), 'ios'); // iPad
  assert.equal(installPlatform({ userAgent: ANDROID, standalone: true }), null);
});

test('install guide appears after the first gratitude and stays away once dismissed', () => {
  assert.equal(shouldShowInstall({ platform: 'ios', entriesCount: 0, dismissed: false }), false);
  assert.equal(shouldShowInstall({ platform: 'ios', entriesCount: 1, dismissed: false }), true);
  assert.equal(shouldShowInstall({ platform: 'ios', entriesCount: 9, dismissed: true }), false);
  assert.equal(shouldShowInstall({ platform: null, entriesCount: 9, dismissed: false }), false);
});

test('backup reminder: monthly, only with a few entries, snoozes for a week', () => {
  const now = new Date(2026, 10, 30);
  const old = Array.from({ length: 6 }, (_, i) => ({ createdAt: new Date(2026, 9, 1 + i).toISOString() }));
  const fresh = Array.from({ length: 6 }, (_, i) => ({ createdAt: new Date(2026, 10, 20 + i).toISOString() }));
  assert.equal(backupDue({ entries: old.slice(0, 3) }, now), false); // too few entries
  assert.equal(backupDue({ entries: fresh }, now), false); // journal is new
  assert.equal(backupDue({ entries: old }, now), true);
  assert.equal(backupDue({ entries: old, lastBackupAt: new Date(2026, 10, 10).toISOString() }, now), false);
  assert.equal(backupDue({ entries: old, lastBackupAt: new Date(2026, 9, 20).toISOString() }, now), true);
  assert.equal(backupDue({ entries: old, snoozedAt: new Date(2026, 10, 27).toISOString() }, now), false);
  assert.equal(backupDue({ entries: old, snoozedAt: new Date(2026, 10, 20).toISOString() }, now), true);
});
