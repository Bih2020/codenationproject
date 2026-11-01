import { test } from 'node:test';
import assert from 'node:assert/strict';
import FR from '../../js/i18n/fr.js';
import { allKeys } from '../../tools/i18n-keys.mjs';
import { t, tn, setLanguage, detectLanguage, getLocale } from '../../js/i18n.js';
import { addIdea, inferCategory } from '../../js/prompts.js';
import { agoLabel, relativeDayLabel, dayKey } from '../../js/dates.js';
import { pickMemory } from '../../js/stats.js';

test('every piece of text in the app has a French translation', async () => {
  const { keys, plurals } = await allKeys();
  const missing = keys.filter((k) => !(k in FR));
  assert.deepEqual(missing, [], `Missing French: ${missing.join(' | ')}`);
  for (const k of plurals) assert.ok(`${k}#other` in FR, `missing plural ${k}`);
  assert.ok(keys.length > 800);
});

test('placeholders survive translation', () => {
  for (const [en, fr] of Object.entries(FR)) {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
    assert.equal(ph(fr), ph(en.replace(/#other$/, '')), `placeholders differ for "${en}"`);
  }
});

test('language detection and switching', () => {
  assert.equal(detectLanguage('auto', { languages: ['fr-CM'] }), 'fr');
  assert.equal(detectLanguage('auto', { languages: ['en-GB'] }), 'en');
  assert.equal(detectLanguage('fr', { languages: ['en-GB'] }), 'fr');
  setLanguage('fr');
  try {
    assert.equal(t('Save Gratitude'), 'Enregistrer ma gratitude');
    assert.equal(t('Next gratitude moment: {when}', { when: '14:00' }), 'Prochain moment de gratitude : 14:00');
    assert.equal(getLocale(), 'fr-FR');
    // French plural rule: 0 and 1 are singular
    assert.equal(tn(0, '{n} moment', '{n} moments'), '0 moment');
    assert.equal(tn(2, '{n} moment', '{n} moments'), '2 moments');
    assert.equal(tn(5, '{n}-day gratitude streak', '{n}-day gratitude streak'), 'Série de gratitude : 5 jours');
    assert.equal(tn(1, '{n}-day gratitude streak', '{n}-day gratitude streak'), 'Série de gratitude : 1 jour');
    assert.equal(addIdea('', 'Ma mère'), 'Merci pour ma mère');
    const now = new Date(2026, 10, 5);
    assert.equal(agoLabel(new Date(2026, 4, 5), now), '6 mois');
    assert.equal(relativeDayLabel(dayKey(now), now), 'Aujourd’hui');
    const mem = pickMemory([{ id: 'a', text: 'x', createdAt: new Date(2026, 4, 5).toISOString() }], now);
    assert.equal(mem.label, 'Une gratitude d’il y a 6 mois');
  } finally {
    setLanguage('en');
  }
  assert.equal(t('Save Gratitude'), 'Save Gratitude');
});

test('French entries are given the right theme', () => {
  assert.equal(inferCategory('Merci pour le soleil ce matin'), 'nature');
  assert.equal(inferCategory("J'ai pu payer mon loyer"), 'money');
  assert.equal(inferCategory('Ma sœur m’a appelée'), 'family');
  assert.equal(inferCategory('Un bon repas avec du pain chaud'), 'food');
});
