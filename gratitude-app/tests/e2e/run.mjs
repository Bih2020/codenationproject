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

async function newPage({ permissions = [], speech = null, dark = false, viewport = { width: 390, height: 844 }, clock = null, locale = 'en-GB', userAgent } = {}) {
  const context = await browser.newContext({ viewport, permissions, colorScheme: dark ? 'dark' : 'light', locale, deviceScaleFactor: 1, ...(userAgent ? { userAgent } : {}) });
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
  await page.waitForFunction(() => /saved|enregistr/i.test(document.querySelector('#save-ack')?.textContent || ''));
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

await t('bell menu: sound, vibrate only (quiet) and off', async () => {
  const page = await newPage({ clock: new Date(2026, 10, 2, 13, 59, 0) });
  await onboard(page);
  const pick = async (mode) => {
    await page.click('#bell-toggle');
    await page.click(`label[for="bell-${mode}"]`);
    await page.waitForFunction((m) => {
      const r = window.__gratitude.store.state.reminderSettings;
      return m === 'off' ? !r.enabled : r.enabled && Boolean(r.quiet) === (m === 'quiet');
    }, mode, { timeout: 5000 });
    await page.waitForSelector('#dialog:not([open])', { state: 'attached' });
  };
  await pick('quiet');
  assert.match(await page.textContent('#next-chip'), /Vibrate only · Next gratitude moment/);
  assert.match(await page.getAttribute('#bell-toggle', 'aria-label'), /vibrate only/);
  // a quiet reminder invites a silent thank-you
  await page.clock.fastForward('02:00');
  await page.waitForSelector('.reminder-banner-card');
  assert.match(await page.textContent('.reminder-banner-card'), /silently in your heart/);
  await page.click('[data-rb="heart"]');
  const e = await page.evaluate(() => window.__gratitude.store.state.entries[0]);
  assert.equal(e.source, 'heart');
  await pick('off');
  assert.match(await page.textContent('#next-chip'), /Reminders are off/);
  await page.reload();
  await page.waitForSelector('#bell-toggle');
  assert.match(await page.getAttribute('#bell-toggle', 'aria-label'), /: off/);
  await pick('ring');
  assert.match(await page.textContent('#next-chip'), /^\s*🔔\s*Next gratitude moment/);
  assert.deepEqual(page.errors, []);
});

await t('tap-to-add words follow theme and question; money theme; heart button', async () => {
  const page = await newPage();
  await onboard(page);
  await page.click('#word-ideas [data-word]');
  assert.match(await page.inputValue('#gratitude-text'), /^I'm grateful for /);
  await page.selectOption('#entry-theme', 'money');
  assert.match(await page.textContent('#word-ideas'), /Money & provision/);
  await page.click('[data-word="Payday"]');
  assert.match(await page.inputValue('#gratitude-text'), /, payday$/);
  // money is the last theme option and last quick idea
  assert.equal(await page.$eval('#entry-theme option:last-child', (o) => o.value), 'money');
  assert.equal(await page.$eval('.chips [data-chip]:last-child', (b) => b.dataset.chip), 'money');
  // choosing a quick idea / question changes the words too
  await page.selectOption('#entry-theme', '');
  await page.click('[data-chip="nature"]');
  assert.match(await page.textContent('#word-ideas'), /Nature/);
  await page.click('#save-btn');
  await page.click('#heart-btn');
  assert.match(await page.textContent('#save-ack'), /quiet thank-you/);
  const s = await page.evaluate(() => window.__gratitude.store.state.entries.map((e) => e.source));
  assert.deepEqual(s, ['heart', 'typed']);
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}home-words.png`, fullPage: true });
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
  assert.equal(await page.getAttribute('.from-brand a', 'href'), 'https://gemrhythm.com/playlist-category/relaxation/');
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}insights.png`, fullPage: true });
  await page.click('a.week-link[href="#/week"]');
  await page.waitForSelector('.week-grid');
  assert.match(await page.textContent('.tile-big'), /6/);
  assert.match(await page.textContent('.tile-peach'), /Tuesday/);
  await page.waitForTimeout(700); await page.screenshot({ path: `${shots}week.png`, fullPage: true });
  await page.goto(`${URL_}#/home`);
  await page.waitForSelector('.memory');
  assert.match(await page.textContent('.memory'), /6 months ago/);
});

await t('challenge: start, daily theme, gentle progress, finish and share', async () => {
  const page = await newPage({ clock: new Date(2026, 10, 2, 10, 0) });
  await onboard(page);
  await page.click('a[href="#/challenges"]');
  await page.click('[data-start="seven"]');
  await page.goto(`${URL_}#/home`);
  await page.waitForSelector('.challenge-home');
  assert.match(await page.textContent('.challenge-home'), /Day 1 of 7/);
  await page.click('#use-challenge');
  assert.ok((await page.textContent('.prompt-context')).length > 5);
  await saveEntry(page, 'my sister');
  assert.match(await page.textContent('#save-ack'), /Challenge day 1 of 7 done/);
  assert.match(await page.textContent('.challenge-home'), /Day 1 done/);
  for (let d = 2; d <= 7; d++) {
    await page.evaluate((d) => window.__gratitude.store.addEntry({ text: `day ${d}` }), d);
    await page.clock.fastForward('24:00:00');
  }
  // the last fastForward moved past day 7's save; check state directly
  const ch = await page.evaluate(() => window.__gratitude.store.state.challenge);
  assert.ok(ch.completed.length >= 6);
  await page.evaluate(() => window.__gratitude.store.addEntry({ text: 'final day' }));
  await page.goto(`${URL_}#/challenges`);
  await page.waitForSelector('.challenge-active.finished');
  await page.click('#ch-share');
  await page.waitForFunction(() => document.getElementById('card-preview')?.naturalWidth === 1080);
  await page.waitForTimeout(400); await page.screenshot({ path: `${shots}challenge-share.png` });
  await page.click('#card-cancel');
  assert.deepEqual(page.errors, []);
});

await t('share card from an entry, and the gratitude pause', async () => {
  const page = await newPage({ clock: new Date(2026, 10, 2, 10, 0) });
  await onboard(page);
  await saveEntry(page, "I'm grateful for a warm cup of tea with my mum this morning");
  await page.click('#share-last');
  await page.waitForFunction(() => document.getElementById('card-preview')?.naturalHeight === 1350);
  await page.click('label[for="card-sea"]');
  await page.waitForTimeout(500); await page.screenshot({ path: `${shots}share-card.png` });
  await page.click('#card-cancel');
  await page.click('#latest-list [data-action="share"]');
  await page.waitForSelector('#card-preview');
  await page.click('#card-cancel');
  // pause
  await page.click('#open-pause');
  await page.waitForSelector('.pause-overlay');
  assert.match(await page.textContent('#pause-step'), /Breathe/);
  await page.waitForTimeout(500); await page.screenshot({ path: `${shots}pause.png` });
  await page.clock.runFor('01:01');
  await page.waitForSelector('#pause-done:not([hidden])');
  assert.equal(await page.getAttribute('.pause-music', 'href'), 'https://gemrhythm.com/playlist-category/relaxation/');
  await page.click('#pause-write');
  await page.waitForFunction(() => document.activeElement?.id === 'gratitude-text');
  assert.equal(await page.$('.pause-overlay'), null);
  // bell sound choice
  await page.goto(`${URL_}#/settings`);
  await page.click('label[for="bell-sound-harp"]');
  await page.click('[data-play="windchimes"]');
  assert.equal(await page.evaluate(() => window.__gratitude.store.state.reminderSettings.bellSound), 'harp');
  assert.deepEqual(page.errors, []);
});

await t('French: automatic on a French phone, every screen translated, switch language', async () => {
  const { allKeys } = await import('../../tools/i18n-keys.mjs');
  const FR = (await import('../../js/i18n/fr.js')).default;
  // English phrases that differ in French: none of these should appear on French screens.
  const english = (await allKeys()).keys.filter((k) => k.length >= 14 && !/[{}]/.test(k) && FR[k] && FR[k].replace(/\u00a0/g, ' ') !== k);
  const page = await newPage({ locale: 'fr-FR', clock: new Date(2026, 10, 2, 10, 0) });
  await page.goto(URL_);
  assert.equal(await page.getAttribute('html', 'lang'), 'fr');
  assert.match(await page.textContent('.ob-title'), /Bienvenue/);
  for (let i = 0; i < 4; i++) await page.click('#ob-next');
  await page.fill('#ob-name', 'Mireille');
  await page.click('#ob-next');
  assert.match(await page.textContent('.ob-title'), /Votre chemin de gratitude commence, Mireille/);
  await page.click('#ob-next');
  await page.waitForSelector('#gratitude-text');
  assert.match(await page.textContent('.greeting'), /Bonjour, Mireille/);
  assert.match(await page.textContent('#compose-title'), /Qu’est-ce qui vous remplit de gratitude/);
  await page.selectOption('#entry-theme', 'money');
  await page.click('[data-word="Le jour de paie"]');
  assert.equal(await page.inputValue('#gratitude-text'), 'Merci pour le jour de paie');
  await page.click('#save-btn');
  await page.waitForFunction(() => /enregistr/i.test(document.getElementById('save-ack')?.textContent || ''));
  await page.click('#heart-btn');
  await page.evaluate(() => window.__gratitude.store.startChallenge('seven'));
  await page.evaluate(() => window.__gratitude.store.saveReflection({ items: ['ma famille', 'le soleil', ''], reflection: 'Une belle journée' }));
  await page.waitForTimeout(400); await page.screenshot({ path: `${shots}home-fr.png`, fullPage: true });
  const leaks = [];
  for (const r of ['home', 'journal', 'insights', 'week', 'favourites', 'settings', 'reflection', 'challenges']) {
    await page.goto(`${URL_}#/${r}`);
    await page.waitForTimeout(150);
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\u00a0/g, ' ');
    for (const e of english) if (text.includes(e)) leaks.push(`${r}: ${e}`);
  }
  assert.deepEqual(leaks, []);
  // Dialogs and the pause screen
  await page.goto(`${URL_}#/home`);
  await page.click('#bell-toggle');
  assert.match(await page.textContent('#dialog'), /Vibreur seulement/);
  await page.keyboard.press('Escape');
  await page.click('#open-pause');
  assert.match(await page.textContent('.pause-overlay'), /Une pause gratitude d’une minute/);
  await page.click('#pause-close');
  // Switch to English in Settings, then back to French
  await page.goto(`${URL_}#/settings`);
  await page.click('label[for="language-en"]');
  assert.equal(await page.getAttribute('html', 'lang'), 'en-GB');
  assert.match(await page.textContent('#h-reminders'), /Reminder settings/);
  await page.click('label[for="language-fr"]');
  assert.match(await page.textContent('#h-reminders'), /Réglages des rappels/);
  await page.reload();
  await page.waitForSelector('#h-reminders');
  assert.match(await page.textContent('#h-reminders'), /Réglages des rappels/);
  await page.waitForTimeout(400); await page.screenshot({ path: `${shots}settings-fr.png`, fullPage: true });
  assert.deepEqual(page.errors, []);
});

await t('language choice on the English welcome screen', async () => {
  const page = await newPage();
  await page.goto(URL_);
  assert.match(await page.textContent('.ob-title'), /Welcome/);
  await page.click('[data-lang="fr"]');
  assert.match(await page.textContent('.ob-title'), /Bienvenue/);
  await page.click('[data-lang="en"]');
  assert.match(await page.textContent('.ob-title'), /Welcome/);
});

await t('home-screen guide (iPhone steps), backup reminder, link-preview tags', async () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  const page = await newPage({ userAgent: IPHONE, clock: new Date(2026, 10, 30, 10, 0) });
  // link previews
  await page.goto(URL_);
  assert.equal(await page.getAttribute('meta[property="og:image"]', 'content'), 'https://gemrhythm.com/gladmoment/icons/og-image.png');
  assert.match(await page.getAttribute('meta[property="og:title"]', 'content'), /Gladmoment/);
  const img = await page.request.get(`${URL_}icons/og-image.png`);
  assert.equal(img.status(), 200);
  await onboard(page);
  assert.equal(await page.$('.install-nudge'), null, 'not before the first gratitude');
  await saveEntry(page, 'my morning walk');
  await page.waitForSelector('.install-nudge');
  assert.match(await page.textContent('.install-nudge'), /Add to Home Screen/);
  await page.click('#install-dismiss');
  await page.waitForFunction(() => !document.querySelector('.install-nudge'));
  await page.reload();
  await page.waitForSelector('#gratitude-text');
  assert.equal(await page.$('.install-nudge'), null, 'stays dismissed');
  // backup reminder appears for an older journal
  assert.equal(await page.$('.backup-nudge'), null);
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) window.__gratitude.store.addEntry({ text: `old ${i}`, createdAt: new Date(2026, 9, 1 + i).toISOString() });
  });
  await page.waitForSelector('.backup-nudge');
  await page.click('#backup-later');
  await page.waitForFunction(() => !document.querySelector('.backup-nudge'));
  await page.clock.fastForward(8 * 24 * 3600 * 1000); // 8 days later
  await page.goto(`${URL_}#/journal`);
  await page.goto(`${URL_}#/home`);
  await page.waitForSelector('.backup-nudge');
  const dl = page.waitForEvent('download');
  await page.click('#backup-now');
  assert.match((await dl).suggestedFilename(), /^gladmoment-.*\.json$/);
  await page.waitForFunction(() => !document.querySelector('.backup-nudge'));
  assert.deepEqual(page.errors, []);
});

await t('home-screen guide in French on Android', async () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
  const page = await newPage({ userAgent: ANDROID, locale: 'fr-FR' });
  await onboard(page);
  await saveEntry(page, 'le soleil');
  await page.waitForSelector('.install-nudge');
  assert.match(await page.textContent('.install-nudge'), /Ajoutez Gladmoment à votre écran d’accueil/);
  assert.match(await page.textContent('.install-nudge'), /Installer l’application/);
});

await t('bell: rings 3 times by default, "until I respond" stops when tapped, volume setting', async () => {
  const page = await newPage({ clock: new Date(2026, 10, 2, 13, 59, 0) });
  await onboard(page);
  assert.equal(await page.evaluate(() => window.__gratitude.store.state.reminderSettings.bellRepeat), 'three');
  assert.equal(await page.evaluate(() => window.__gratitude.store.state.reminderSettings.bellVolume), 'loud');
  await page.evaluate(() => { window.__gmBellPlays = 0; });
  await page.clock.runFor('01:15'); // reminder at 14:00, then two more rings 4 seconds apart
  await page.waitForSelector('.reminder-banner-card');
  await page.clock.runFor(20000);
  assert.equal(await page.evaluate(() => window.__gmBellPlays), 3);
  await page.click('[data-rb="dismiss"]');
  // "Until I respond" keeps ringing until the reminder is tapped
  await page.goto(`${URL_}#/settings`);
  await page.click('label[for="bell-repeat-until"]');
  await page.click('label[for="bell-volume-medium"]');
  assert.equal(await page.evaluate(() => window.__gratitude.store.state.reminderSettings.bellVolume), 'medium');
  await page.evaluate(() => { window.__gmBellPlays = 0; });
  await page.click('#test-reminder');
  await page.waitForSelector('.reminder-banner-card');
  await page.clock.runFor(16500);
  const before = await page.evaluate(() => window.__gmBellPlays);
  assert.ok(before >= 5, `rang ${before} times`);
  await page.click('[data-rb="dismiss"]');
  await page.clock.runFor(20000);
  assert.equal(await page.evaluate(() => window.__gmBellPlays), before, 'stopped after tapping');
  assert.deepEqual(page.errors, []);
});

await t('loud bright bell as an audio file; pause plays your music; playlist link on Home', async () => {
  const { writeFileSync, unlinkSync, readFileSync } = await import('node:fs');
  const appDir = new URL('../../', import.meta.url);
  const originalConfig = readFileSync(new URL('config.json', appDir));
  // a short test "relaxation track" and site settings, as WordPress would provide them
  const { encodeWav } = await import('../../js/sounds.js');
  const tone = new Float32Array(44100).map((_, i) => 0.3 * Math.sin(i / 10));
  writeFileSync(new URL('test-track.wav', appDir), Buffer.from(encodeWav(tone, 44100)));
  writeFileSync(new URL('config.json', appDir), JSON.stringify({ musicUrl: 'https://gemrhythm.com/playlist-category/relaxation/', pauseTracks: [`${URL_}test-track.wav`] }));
  try {
    const page = await newPage({ clock: new Date(2026, 10, 2, 10, 0) });
    await onboard(page);
    // the bell is rendered to a WAV file at near full volume
    const peak = await page.evaluate(async () => {
      const m = await import('./js/sounds.js');
      const url = await m.prepareBell('clear');
      const buf = await (await fetch(url)).arrayBuffer();
      const audio = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(buf);
      const d = audio.getChannelData(0);
      let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
      return p;
    });
    assert.ok(peak > 0.9, `bell peak ${peak}`);
    assert.equal(await page.evaluate(() => window.__gratitude.store.state.reminderSettings.bellSound), 'clear');
    // playlist link on the Home pause card
    await page.waitForSelector('.pause-card-link');
    assert.equal(await page.getAttribute('.pause-card-link', 'href'), 'https://gemrhythm.com/playlist-category/relaxation/');
    // the pause plays the site's track
    await page.evaluate(() => {
      window.__played = [];
      const orig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { window.__played.push(this.src); return orig.call(this); };
    });
    await page.click('#open-pause');
    await page.waitForSelector('.pause-overlay');
    await page.waitForFunction(() => window.__played.some((s) => s.endsWith('test-track.wav')));
    await page.click('#pause-close');
    assert.deepEqual(page.errors, []);
  } finally {
    unlinkSync(new URL('test-track.wav', appDir));
    writeFileSync(new URL('config.json', appDir), originalConfig);
  }
});

await t('push: closed-app reminders sync with the site; service worker rings when a push arrives', async () => {
  const page = await newPage({ permissions: ['notifications'] });
  // A fake push service (headless Chromium has none) and a fake WordPress REST API.
  await page.addInitScript(() => {
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-phone',
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BP' + 'A'.repeat(85), auth: 'AAAAAAAAAAAAAAAAAAAAAA' } }; },
      unsubscribe: async () => true,
    };
    let subscribed = (() => { try { return Boolean(localStorage.getItem('gratitude-moments:push')); } catch { return false; } })();
    PushManager.prototype.getSubscription = async () => (subscribed ? sub : null);
    PushManager.prototype.subscribe = async (opts) => {
      if (!(opts.applicationServerKey instanceof Uint8Array) || opts.applicationServerKey.length !== 65) throw new Error('bad key');
      subscribed = true;
      return sub;
    };
  });
  const posts = [];
  await page.route((u) => u.search.includes('rest_route='), async (route) => {
    const u = new URL(route.request().url());
    const r = u.searchParams.get('rest_route');
    if (r.endsWith('/push/key')) return route.fulfill({ json: { publicKey: 'B' + 'A'.repeat(86) } });
    if (r.endsWith('/push/subscribe')) {
      const body = route.request().postDataJSON();
      posts.push(body);
      return route.fulfill({ json: { ok: true, scheduled: body.times.length } });
    }
    if (r.endsWith('/push/ack')) { posts.push({ ack: route.request().postDataJSON().endpoint }); return route.fulfill({ json: { ok: true } }); }
    if (r.endsWith('/push/unsubscribe')) { posts.push({ unsubscribed: route.request().postDataJSON().endpoint }); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ status: 404, body: '' });
  });
  await onboard(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gratitude-moments:push') || '{}').state === 'on', null, { timeout: 8000 });
  const first = posts.filter((x) => x.subscription).at(-1);
  const now = Date.now() / 1000;
  assert.equal(first.subscription.endpoint, 'https://fcm.googleapis.com/fcm/send/test-phone');
  assert.equal(first.lang, 'en');
  assert.equal(first.repeat, 'three');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#gratitude-text'));
  await page.waitForTimeout(500);
  assert.ok(posts.some((x) => x.ack), 'opening the app tells the website the reminder was answered');
  assert.ok(first.times.length > 50, `only ${first.times.length} times`);
  assert.ok(first.times.every((x) => x > now - 60 && x < now + 31 * 86400));
  assert.ok(!JSON.stringify(first).includes('grateful'), 'no journal content is sent');
  // Settings shows it's working; "Test with the app closed" schedules one a minute from now.
  await page.goto(`${URL_}#/settings`);
  await page.waitForSelector('text=Reminders also arrive when Gladmoment is closed.');
  const before = posts.length;
  await page.click('#test-closed');
  await page.waitForSelector('.toast');
  await page.waitForTimeout(300);
  assert.ok(posts.length > before);
  assert.ok(posts.filter((x) => x.times).at(-1).times.some((x) => Math.abs(x - (Date.now() / 1000 + 60)) < 15));
  // Turning the bell off clears the server's times.
  await page.evaluate(() => window.__gratitude.store.updateReminders({ enabled: false }));
  await page.waitForTimeout(2200);
  assert.equal(posts.filter((x) => x.times).at(-1).times.length, 0);
  await page.evaluate(() => window.__gratitude.store.updateReminders({ enabled: true }));

  // A push arriving while the app is closed shows a system notification.
  const helper = await page.context().newPage();
  await page.close();
  const cdp = await page.context().newCDPSession(helper);
  const regs = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await helper.waitForTimeout(300);
  const reg = regs.find((r) => r.scopeURL.startsWith(URL_) && !r.isDeleted);
  assert.ok(reg, 'service worker registration found');
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: URL_.slice(0, -1), registrationId: reg.registrationId,
    data: JSON.stringify({ title: 'A little gratitude moment 💛', body: 'Take a few seconds.', url: './#/home?focus=1' }),
  });
  await helper.goto(`${URL_}privacy.html`);
  const shown = await helper.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      const n = await (await navigator.serviceWorker.ready).getNotifications();
      if (n.length) return n.map((x) => [x.title, x.tag, x.requireInteraction]);
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  });
  assert.deepEqual(shown[0], ['A little gratitude moment 💛', 'gratitude-reminder', true], JSON.stringify(shown));
  // If the app already rang for this reminder, the website's push doesn't ring a second time.
  await helper.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (const n of await reg.getNotifications()) n.close();
    await reg.showNotification('From the app', { tag: 'gratitude-reminder', body: 'app', data: { shownAt: Date.now() } });
  });
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: URL_.slice(0, -1), registrationId: reg.registrationId,
    data: JSON.stringify({ title: 'From the website', body: 'site' }),
  });
  await helper.waitForTimeout(800);
  const after = await helper.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title));
  assert.deepEqual(after, ['From the app'], JSON.stringify(after));
  // A repeat ring (the person hasn't answered yet) always rings.
  await helper.goto('about:blank');
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: URL_.slice(0, -1), registrationId: reg.registrationId,
    data: JSON.stringify({ title: 'Ring again', body: 'site', repeat: 1 }),
  });
  await helper.waitForTimeout(800);
  await helper.goto(`${URL_}privacy.html`);
  const again = await helper.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title));
  assert.deepEqual(again, ['Ring again'], JSON.stringify(again));
  await helper.context().close();
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
  for (const [viewport, locale] of [[{ width: 320, height: 640 }, 'en-GB'], [{ width: 320, height: 640 }, 'fr-FR'], [{ width: 390, height: 844 }, 'fr-FR'], [{ width: 390, height: 844 }, 'en-GB'], [{ width: 820, height: 1180 }, 'en-GB'], [{ width: 1366, height: 900 }, 'en-GB']]) {
    const page = await newPage({ viewport, locale });
    await onboard(page);
    await saveEntry(page, 'a very long gratitude '.repeat(20));
    for (const r of ['home', 'journal', 'insights', 'week', 'favourites', 'settings', 'reflection', 'challenges']) {
      await page.goto(`${URL_}#/${r}`);
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${r} overflows by ${overflow}px at ${viewport.width}px (${locale})`);
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
