// End-to-end tests in a real Chromium via Playwright.
// Run: npm run test:e2e   (needs `playwright` resolvable; screenshots go to tests/e2e/screenshots)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../..', import.meta.url));
const shots = fileURLToPath(new URL('./screenshots/', import.meta.url));
mkdirSync(shots, { recursive: true });
const PORT = 8765;
const URL_ = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

// 'chromium' channel = new headless mode, which supports granting notification permission.
const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
let passed = 0;
let failed = 0;
const results = [];

async function newPage({ permissions = [], speech = null, dark = false, viewport = { width: 390, height: 844 }, clock = null } = {}) {
  const context = await browser.newContext({ viewport, permissions, colorScheme: dark ? 'dark' : 'light', locale: 'en-GB', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  if (permissions.length) await context.grantPermissions(permissions, { origin: URL_.slice(0, -1) });
  if (clock) await page.clock.install({ time: clock });
  if (speech) {
    // Fake Web Speech API: either transcribes a phrase or fails with a permission error.
    await page.addInitScript((mode) => {
      class FakeRec {
        start() {
          setTimeout(() => this.onstart?.(), 10);
          if (mode === 'denied') {
            setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 30);
            setTimeout(() => this.onend?.(), 40);
            return;
          }
          const res = (t, final) => { const r = [{ transcript: t }]; r.isFinal = final; return r; };
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [res('my morning', false)] }), 40);
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [res("I'm grateful for my morning coffee", true)] }), 80);
        }
        stop() { setTimeout(() => this.onend?.(), 10); }
      }
      window.webkitSpeechRecognition = FakeRec;
      window.SpeechRecognition = FakeRec;
    }, speech);
  }
  return page;
}

async function onboard(page, name = 'Sarah') {
  await page.goto(URL_);
  await page.click('#ob-next'); // welcome
  await page.click('#ob-next'); // frequency (default 2h)
  await page.click('#ob-next'); // hours
  await page.click('#ob-next'); // notifications ("maybe later" or continue)
  await page.fill('#ob-name', name);
  await page.click('#ob-next');
  await page.click('#ob-next'); // journey begins
  await page.waitForSelector('#gratitude-text');
}

async function saveEntry(page, text) {
  await page.fill('#gratitude-text', text);
  await page.click('#save-btn');
  await page.waitForFunction(() => document.querySelector('#save-ack')?.textContent.includes('Saved') || document.querySelector('#save-ack')?.textContent.includes('saved'));
}

async function t(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    results.push(`  ✘ ${name}\n      ${String(err.message).split('\n').slice(0, 4).join('\n      ')}`);
  }
}

await t('onboarding defaults → home with greeting, focus on entry field', async () => {
  const page = await newPage();
  await page.goto(URL_);
  assert.match(await page.textContent('.ob-title'), /Welcome/);
  await page.click('#ob-next');
  assert.ok(await page.isChecked('#ob-f-120'), '2 hours is default');
  await page.click('#ob-next');
  assert.equal(await page.inputValue('#ob-start'), '08:00');
  assert.equal(await page.inputValue('#ob-end'), '22:00');
  await page.click('#ob-next');
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}onboarding-permission.png` });
  await page.click('#ob-next');
  await page.fill('#ob-name', 'Sarah');
  await page.click('#ob-next');
  assert.match(await page.textContent('.ob-title'), /journey begins, Sarah/);
  await page.click('#ob-next');
  await page.waitForSelector('#gratitude-text');
  assert.match(await page.textContent('.greeting'), /Sarah/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'gratitude-text');
  assert.match(await page.textContent('#next-chip'), /Next gratitude moment/);
  assert.deepEqual(page.errors, []);
});

await t('save gratitude, acknowledgement, persists after reload', async () => {
  const page = await newPage();
  await onboard(page);
  await page.click('#save-btn');
  assert.match(await page.textContent('#save-ack'), /Write or say/); // empty is gently blocked
  await page.fill('#gratitude-text', "I'm grateful that I woke up feeling rested");
  await page.check('input[name="entry-mood"][value="great"]');
  await page.click('#save-btn');
  assert.match(await page.textContent('#save-ack'), /Gratitude saved\. A beautiful moment worth remembering\./);
  assert.equal(await page.inputValue('#gratitude-text'), '');
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}home-mobile.png`, fullPage: true });
  await page.reload();
  await page.waitForSelector('#latest-list');
  assert.match(await page.textContent('#latest-list'), /woke up feeling rested/);
  assert.match(await page.textContent('.today .stat-row'), /1\s*moment/);
  assert.match(await page.textContent('.today .stat-row'), /🔥 1/);
  assert.deepEqual(page.errors, []);
});

await t('prompts, another prompt and quick chips', async () => {
  const page = await newPage();
  await onboard(page);
  const first = await page.textContent('#prompt-text');
  let changed = false;
  for (let i = 0; i < 3 && !changed; i++) {
    await page.click('#another-prompt');
    changed = (await page.textContent('#prompt-text')) !== first;
  }
  assert.ok(changed, 'prompt changes');
  await page.click('[data-chip="family"]');
  assert.match(await page.textContent('.prompt-context'), /\?/);
  assert.equal(await page.inputValue('#entry-theme'), 'family');
  await saveEntry(page, 'my brother helped me move');
  const entry = await page.evaluate(() => window.__gratitude.store.state.entries[0]);
  assert.equal(entry.category, 'family');
  assert.ok(entry.promptUsed);
});

await t('journal: search, filter, edit, favourite, delete + undo, calendar', async () => {
  const page = await newPage();
  await onboard(page);
  await saveEntry(page, 'the conversation I had with my friend');
  await saveEntry(page, 'a beautiful sunset over the sea');
  await page.goto(`${URL_}#/journal`);
  await page.waitForSelector('.entry-card');
  assert.equal(await page.locator('.entry-card').count(), 2);
  await page.fill('#journal-search', 'sunset');
  assert.equal(await page.locator('#journal-list .entry-card').count(), 1);
  await page.fill('#journal-search', '');
  await page.selectOption('#filter-cat', 'friendship');
  assert.equal(await page.locator('#journal-list .entry-card').count(), 1);
  await page.selectOption('#filter-cat', '');
  // edit
  await page.locator('.entry-card', { hasText: 'sunset' }).locator('[data-action="edit"]').click();
  await page.fill('#edit-text', 'a beautiful sunset over the calm sea');
  await page.click('button[value="save"]');
  await page.waitForSelector('text=calm sea');
  // favourite
  await page.locator('.entry-card', { hasText: 'calm sea' }).locator('[data-action="fav"]').click();
  await page.click('#filter-fav');
  assert.equal(await page.locator('#journal-list .entry-card').count(), 1);
  await page.click('#filter-fav');
  // favourites page
  await page.goto(`${URL_}#/favourites`);
  await page.waitForSelector('#fav-list .entry-card');
  assert.match(await page.textContent('#fav-list'), /calm sea/);
  // delete + undo
  await page.goto(`${URL_}#/journal`);
  await page.locator('.entry-card', { hasText: 'friend' }).locator('[data-action="delete"]').click();
  await page.click('button[value="confirm"]');
  await page.waitForFunction(() => document.querySelectorAll('#journal-list .entry-card').length === 1);
  await page.click('.toast-action');
  await page.waitForFunction(() => document.querySelectorAll('#journal-list .entry-card').length === 2);
  // calendar
  await page.click('#toggle-cal');
  await page.locator('.cal-cell.is-today').click();
  assert.equal(await page.locator('#journal-list .entry-card').count(), 2);
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}journal.png`, fullPage: true });
  assert.deepEqual(page.errors, []);
});

await t('bell toggles reminders on/off from the header', async () => {
  const page = await newPage();
  await onboard(page);
  assert.equal(await page.getAttribute('#bell-toggle', 'aria-pressed'), 'true');
  await page.click('#bell-toggle');
  assert.equal(await page.getAttribute('#bell-toggle', 'aria-pressed'), 'false');
  assert.match(await page.textContent('#next-chip'), /Reminders are off/);
  await page.reload();
  await page.waitForSelector('#bell-toggle');
  assert.equal(await page.getAttribute('#bell-toggle', 'aria-pressed'), 'false');
  await page.click('#bell-toggle');
  assert.match(await page.textContent('#next-chip'), /Next gratitude moment/);
});

await t('reminder settings: frequency, custom times, active hours, days, pause/resume', async () => {
  const page = await newPage({ clock: new Date(2026, 10, 2, 13, 5) }); // Monday 13:05
  await onboard(page);
  assert.match(await page.textContent('#next-chip'), /14:00/);
  await page.goto(`${URL_}#/settings`);
  await page.click('label[for="freq-60"]');
  assert.match(await page.textContent('#reminder-preview'), /14:00/);
  await page.click('label[for="freq-30"]');
  assert.match(await page.textContent('#reminder-preview'), /13:30/);
  // invalid active hours are rejected with a message
  await page.fill('#rs-end', '07:00');
  await page.dispatchEvent('#rs-end', 'change');
  assert.match(await page.textContent('#rs-error'), /end later/);
  assert.equal(await page.evaluate(() => window.__gratitude.store.state.reminderSettings.activeEnd), '22:00');
  // custom times
  await page.click('label[for="freq-custom"]');
  await page.waitForSelector('#ct-0');
  assert.match(await page.textContent('#reminder-preview'), /16:00/);
  await page.fill('#ct-2', '15:15');
  await page.dispatchEvent('#ct-2', 'change');
  assert.match(await page.textContent('#reminder-preview'), /Next gratitude moment: 15:15/);
  await page.click('#ct-add');
  assert.equal(await page.locator('[data-ct]').count(), 5);
  // days: switch Monday off → next is tomorrow
  await page.click('.day-btn[data-day="1"]');
  assert.match(await page.textContent('#reminder-preview'), /tomorrow/);
  await page.click('[data-days="all"]');
  // pause & resume
  await page.click('[data-pause="forever"]');
  assert.match(await page.textContent('#reminder-preview'), /paused/i);
  await page.click('#rs-resume');
  assert.match(await page.textContent('#reminder-preview'), /Next gratitude moment/);
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}settings.png`, fullPage: true });
  assert.deepEqual(page.errors, []);
});

await t('notification permission denied → graceful in-app fallback', async () => {
  const page = await newPage(); // headless Chromium denies by default
  await page.goto(URL_);
  for (let i = 0; i < 3; i++) await page.click('#ob-next');
  if (await page.$('#ob-allow')) await page.click('#ob-allow');
  await page.waitForFunction(() => /turned off|doesn’t support|allowed/.test(document.querySelector('.perm-result')?.textContent || ''));
  assert.match(await page.textContent('.perm-result'), /inside the app|allowed/);
  for (let i = 0; i < 3; i++) await page.click('#ob-next');
  await page.goto(`${URL_}#/settings`);
  await page.waitForSelector('#perm-box');
  assert.match(await page.textContent('#perm-box'), /blocked|in-app|haven’t/);
  // test reminder still works as an in-app banner
  await page.click('#test-reminder');
  await page.waitForSelector('.reminder-banner-card');
  await page.click('[data-rb="write"]');
  await page.waitForFunction(() => document.activeElement?.id === 'gratitude-text');
});

await t('notification granted + scheduled reminder fires and opens entry screen', async () => {
  const page = await newPage({ permissions: ['notifications'], clock: new Date(2026, 10, 2, 13, 59, 0) });
  await onboard(page);
  assert.equal(await page.evaluate(() => Notification.permission), 'granted');
  await page.goto(`${URL_}#/journal`);
  await page.clock.fastForward('02:00'); // past 14:00
  await page.waitForSelector('.reminder-banner-card', { timeout: 5000 });
  assert.match(await page.textContent('.reminder-banner-card'), /A little gratitude moment/);
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}reminder-banner.png` });
  await page.click('[data-rb="write"]');
  await page.waitForFunction(() => document.activeElement?.id === 'gratitude-text');
  assert.match(await page.textContent('#next-chip'), /16:00/);
  // A real system notification is shown through the service worker.
  await page.goto(`${URL_}#/settings`);
  await page.click('#test-reminder');
  await page.waitForSelector('text=Test notification sent.');
  const shown = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title));
  assert.ok(shown.includes('A little gratitude moment 💛'), JSON.stringify(shown));
});

await t('voice input transcribes into the editable field and saves as voice', async () => {
  const page = await newPage({ speech: 'ok' });
  await onboard(page);
  await page.click('#say-btn');
  await page.click('button[value="confirm"]'); // privacy notice
  await page.waitForSelector('#voice-status:not([hidden])');
  assert.match(await page.textContent('#voice-status'), /Listening/);
  await page.waitForFunction(() => document.getElementById('gratitude-text').value.includes('coffee'));
  await page.click('#say-btn'); // stop
  await page.waitForSelector('#voice-status', { state: 'hidden' });
  await page.fill('#gratitude-text', (await page.inputValue('#gratitude-text')) + ' with my partner');
  await page.click('#save-btn');
  const e = await page.evaluate(() => window.__gratitude.store.state.entries[0]);
  assert.equal(e.source, 'voice');
  assert.match(e.text, /coffee with my partner/);
});

await t('microphone permission denied shows a helpful message', async () => {
  const page = await newPage({ speech: 'denied' });
  await onboard(page);
  await page.click('#say-btn');
  await page.click('button[value="confirm"]');
  await page.waitForSelector('#voice-message:not([hidden])');
  assert.match(await page.textContent('#voice-message'), /Microphone access is blocked/);
  assert.equal(await page.getAttribute('#say-btn', 'aria-pressed'), 'false');
});

await t('daily reflection saves three gratitudes to the journal', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${URL_}#/reflection`);
  await page.fill('#r-item-0', 'my health');
  await page.fill('#r-item-1', 'a kind stranger');
  await page.fill('#r-item-2', 'dinner with family');
  await page.fill('#r-meaning', 'Slowing down');
  await page.check('input[name="r-mood"][value="good"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#gratitude-text');
  const s = await page.evaluate(() => window.__gratitude.store.state);
  assert.equal(s.entries.length, 3);
  assert.equal(s.reflections[0].reflection, 'Slowing down');
  await page.goto(`${URL_}#/journal`);
  await page.waitForSelector('.reflection-card');
  assert.match(await page.textContent('.reflection-card'), /Slowing down/);
});

await t('insights, weekly summary and streaks with seeded history', async () => {
  const page = await newPage({ clock: new Date(2026, 10, 5, 15, 0) }); // Thu
  await onboard(page);
  await page.evaluate(() => {
    const st = window.__gratitude.store;
    const mk = (d, h, text, category, mood, fav) => st.addEntry({ text, category, mood, createdAt: new Date(2026, 10, d, h).toISOString() });
    for (let d = 0; d < 8; d++) mk(5 - d, 9, `day ${d} morning`, 'nature', 'good');
    mk(3, 12, 'family lunch', 'family', 'great');
    mk(3, 18, 'evening call with mum', 'family', 'okay');
    st.addEntry({ text: 'An old memory entry', createdAt: new Date(2026, 4, 5, 10).toISOString() });
  });
  await page.goto(`${URL_}#/insights`);
  assert.match(await page.textContent('.streak-big'), /8-day gratitude streak/);
  assert.match(await page.textContent('.milestones'), /7-day streak\s*Reached/);
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}insights.png`, fullPage: true });
  await page.click('.week-link');
  await page.waitForSelector('.week-grid');
  assert.match(await page.textContent('.tile-big'), /6/);
  assert.match(await page.textContent('.tile-peach'), /Tuesday/);
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}week.png`, fullPage: true });
  await page.goto(`${URL_}#/home`);
  await page.waitForSelector('.memory');
  assert.match(await page.textContent('.memory'), /6 months ago/);
});

await t('dark mode and theme switching', async () => {
  const page = await newPage({ dark: true });
  await onboard(page);
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}home-dark.png`, fullPage: true });
  await page.goto(`${URL_}#/settings`);
  await page.click('label[for="theme-light"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
  await page.reload();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
});

await t('no horizontal overflow on phone, tablet and desktop', async () => {
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1366, height: 900 }]) {
    const page = await newPage({ viewport });
    await onboard(page);
    await saveEntry(page, 'a very long gratitude '.repeat(20));
    for (const r of ['home', 'journal', 'insights', 'week', 'favourites', 'settings', 'reflection']) {
      await page.goto(`${URL_}#/${r}`);
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${r} overflows by ${overflow}px at ${viewport.width}px`);
    }
    if (viewport.width === 1366) {
      await page.goto(`${URL_}#/home`);
      await page.waitForTimeout(700); await page.screenshot({ path: `${shots}home-desktop.png` });
    }
    await page.context().close();
  }
});

await t('accessibility basics: labels, touch targets, keyboard save', async () => {
  const page = await newPage();
  await onboard(page);
  const problems = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
      if (el.closest('[hidden]') || el.type === 'file' || el.classList.contains('skip-link')) continue;
      const name = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.getAttribute('aria-labelledby') || el.textContent.trim();
      if (!name) out.push(`unlabelled ${el.outerHTML.slice(0, 80)}`);
      const r = (el.closest('label') || el).getBoundingClientRect();
      if (r.width && (r.height < 36 || r.width < 36) && !el.matches('.mood-option input, .radio-pill input, .link, .link-btn')) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)} ${el.outerHTML.slice(0, 60)}`);
    }
    return out;
  });
  assert.deepEqual(problems, []);
  await page.focus('#gratitude-text');
  await page.keyboard.type('keyboard only gratitude');
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => window.__gratitude.store.state.entries.length === 1);
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
