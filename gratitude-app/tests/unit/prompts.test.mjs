import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS, CATEGORIES, QUICK_CHIPS, pickPrompt, inferCategory } from '../../js/prompts.js';

test('library is substantial and covers every category', () => {
  assert.ok(PROMPTS.length >= 150);
  for (const c of Object.keys(CATEGORIES)) assert.ok(PROMPTS.filter((p) => p.category === c).length >= 8, c);
  for (const c of QUICK_CHIPS) assert.ok(CATEGORIES[c]);
  assert.equal(new Set(PROMPTS.map((p) => p.id)).size, PROMPTS.length);
});

test('category prompts stay in category', () => {
  for (let i = 0; i < 20; i++) assert.equal(pickPrompt({ category: 'family' }).category, 'family');
});

test('recent prompts are avoided', () => {
  const fam = PROMPTS.filter((p) => p.category === 'food');
  const recent = fam.slice(0, -1).map((p) => p.id);
  assert.equal(pickPrompt({ category: 'food', recent }).id, fam.at(-1).id);
});

test('preferred categories preference', () => {
  for (let i = 0; i < 20; i++) assert.ok(['nature', 'food'].includes(pickPrompt({ preference: 'preferred', preferred: ['nature', 'food'] }).category));
});

test('inferCategory', () => {
  assert.equal(inferCategory('My sister called me'), 'family');
  assert.equal(inferCategory('a lovely walk in the park under the trees'), 'nature');
  assert.equal(inferCategory('finished my course assignment'), 'learning');
  assert.equal(inferCategory('zzz'), null);
});
