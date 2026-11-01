// Collects every English string the app shows, so translations can be checked for completeness.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../js/', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'i18n' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

const STR = String.raw`'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|\`((?:\\.|[^\`\\$])*)\``;
const unq = (m) => (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(['"`\\])/g, '$1');

/** Literal keys passed to t('…') and tn(n, '…', '…') in the source. */
export function sourceKeys() {
  const keys = new Set();
  const plurals = [];
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*(?:${STR})\s*[,)]`, 'g'))) keys.add(unq(m));
    const tn = new RegExp(String.raw`\btn\(\s*[^,]+,\s*(?:${STR})\s*,\s*(?:${STR})`, 'g');
    for (const m of src.matchAll(tn)) {
      const one = (m[1] ?? m[2] ?? m[3]).replace(/\\(['"`\\])/g, '$1');
      const other = (m[4] ?? m[5] ?? m[6]).replace(/\\(['"`\\])/g, '$1');
      keys.add(one);
      keys.add(other);
      if (one === other) plurals.push(other);
    }
    // Permission messages in settings.js: ['emoji', 'heading', 'body']
    if (file.endsWith('settings.js')) {
      for (const m of src.matchAll(/\['[^']*', '((?:\\.|[^'\\])*)', '((?:\\.|[^'\\])*)'\]/g)) {
        keys.add(m[1]);
        keys.add(m[2]);
      }
    }
  }
  return { keys, plurals };
}

/** Strings that live in data modules and are translated when displayed. */
export async function contentKeys() {
  const imp = (p) => import(new URL(`../js/${p}`, import.meta.url));
  const prompts = await imp('prompts.js');
  const stats = await imp('stats.js');
  const ch = await imp('challenges.js');
  const sounds = await imp('sounds.js');
  const card = await imp('sharecard.js');
  const sched = await imp('schedule.js');
  const voice = await imp('voice.js');
  const notif = await imp('notifications.js');
  const pause = await imp('pause.js').catch(() => ({ PAUSE_STEPS: [] }));
  const out = new Set();
  const add = (s) => s && out.add(s);
  Object.values(prompts.CATEGORIES).forEach((c) => (add(c.label), add(c.chip)));
  prompts.PROMPTS.forEach((p) => add(p.text));
  Object.values(prompts.WORD_IDEAS).flat().forEach(add);
  prompts.wordIdeasFor(null).forEach(add);
  prompts.POSITIVE_MESSAGES.forEach(add);
  prompts.SAVE_ACKNOWLEDGEMENTS.forEach(add);
  stats.MOODS.forEach((m) => add(m.label));
  stats.MILESTONES.forEach((m) => add(m.label));
  ch.CHALLENGES.forEach((c) => (add(c.title), add(c.tagline)));
  ch.DAY_PLAN.forEach((d) => add(d.prompt));
  sounds.BELL_SOUNDS.forEach((b) => (add(b.label), add(b.desc)));
  sounds.BELL_VOLUMES.forEach((v) => add(v.label));
  sounds.BELL_REPEATS.forEach((r) => add(r.label));
  card.CARD_STYLES.forEach((c) => add(c.label));
  sched.FREQUENCY_OPTIONS.forEach((o) => (add(o.label), add(o.short)));
  const s0 = sched.defaultReminderSettings();
  [
    { ...s0, activeStart: 'x' },
    { ...s0, activeEnd: '07:00' },
    { ...s0, weekendDifferent: true, weekendEnd: '08:00' },
    { ...s0, mode: 'custom', customTimes: [] },
    { ...s0, mode: 'custom', customTimes: ['99:00'] },
    { ...s0, days: Array(7).fill(false) },
  ].forEach((s) => sched.validateReminderSettings(s).forEach(add));
  Object.values(voice.VOICE_ERRORS).forEach(add);
  [notif.REMINDER_TITLE, notif.REMINDER_BODY, notif.QUIET_BODY].forEach(add);
  (pause.PAUSE_STEPS || []).forEach(add);
  // Navigation tabs, store messages
  ['Home', 'Journal', 'Insights', 'Favourites', 'Settings',
    'Your saved data could not be read, so a fresh journal was started. A backup copy was kept on this device.',
    'Your device storage is full or unavailable, so the latest changes may not be kept.',
    'This file isn’t a Gladmoment backup.',
  ].forEach(add);
  return out;
}

export async function allKeys() {
  const { keys, plurals } = sourceKeys();
  for (const k of await contentKeys()) keys.add(k);
  return { keys: [...keys].sort(), plurals };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lang = process.argv[2] || 'fr';
  const dict = (await import(new URL(`../js/i18n/${lang}.js`, import.meta.url))).default;
  const { keys, plurals } = await allKeys();
  const missing = keys.filter((k) => !(k in dict));
  const missingPlural = plurals.filter((k) => !(`${k}#other` in dict));
  console.log(JSON.stringify({ total: keys.length, missing, missingPlural }, null, 1));
}
