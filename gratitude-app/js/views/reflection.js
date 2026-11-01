// Daily Reflection: three gratitudes + an optional "what made today meaningful?"
import { esc, icons, moodPicker, makeMoodDeselectable, toast, confirmDialog } from '../ui.js';
import { dayKey, relativeDayLabel } from '../dates.js';

let mood = null;

export function title() {
  return 'Daily Reflection · Gladmoment';
}

function dateFrom(params) {
  const d = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : dayKey(new Date());
  return d > dayKey(new Date()) ? dayKey(new Date()) : d;
}

export function enter(ctx, params) {
  mood = ctx.store.reflectionFor(dateFrom(params))?.mood || null;
}

export function render(ctx, params) {
  const date = dateFrom(params);
  const existing = ctx.store.reflectionFor(date);
  const items = existing
    ? existing.entryIds.map((id) => ctx.store.state.entries.find((e) => e.id === id)?.text || '')
    : [];
  while (items.length < 3) items.push('');
  const label = relativeDayLabel(date);
  return `<header class="page-header reflect-hero">
    <div class="page-header-inner">
      <a href="#/home" class="back-link">${icons.left} Home</a>
      <h1 class="page-title" tabindex="-1"><span aria-hidden="true">🌙</span> Daily Reflection</h1>
      <p class="page-subtitle">${esc(label === 'Today' ? 'A quiet moment to close your day' : label)}</p>
    </div>
  </header>
  <div class="page">
    <form class="card reflect-form" id="reflect-form" novalidate>
      <h2 class="compose-title">What are the three things you're most grateful for ${label === 'Today' ? 'today' : 'that day'}?</h2>
      ${items
        .slice(0, 3)
        .map(
          (t, i) => `<div class="numbered-field">
          <label for="r-item-${i}" class="num" aria-hidden="true">${i + 1}</label>
          <span class="sr-only" id="r-label-${i}">Gratitude ${i + 1}</span>
          <input id="r-item-${i}" class="input" aria-labelledby="r-label-${i}" placeholder="I'm grateful for..." value="${esc(t)}" maxlength="500">
        </div>`
        )
        .join('')}
      <label for="r-meaning" class="field-label">What made today meaningful? <span class="muted">(optional)</span></label>
      <textarea id="r-meaning" class="textarea" rows="3" maxlength="2000" placeholder="A few words are plenty…">${esc(existing?.reflection || '')}</textarea>
      ${moodPicker('r-mood', mood, { legend: 'How was your day overall? (optional)' })}
      <p class="form-error" id="r-error" role="alert" hidden>Add at least one gratitude or a reflection to save.</p>
      <div class="row wrap">
        <button type="submit" class="btn btn-primary btn-xl">Save reflection</button>
        ${existing ? '<button type="button" class="btn btn-ghost" id="r-delete">Delete reflection</button>' : ''}
      </div>
      <p class="muted small">Your three gratitudes are also added to your journal.</p>
    </form>
  </div>`;
}

export function mount(root, ctx, params) {
  const date = dateFrom(params);
  makeMoodDeselectable(root, (m) => {
    mood = m;
  });
  root.querySelector('#reflect-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const items = [0, 1, 2].map((i) => root.querySelector(`#r-item-${i}`).value);
    const reflection = root.querySelector('#r-meaning').value;
    if (!items.some((t) => t.trim()) && !reflection.trim()) {
      root.querySelector('#r-error').hidden = false;
      root.querySelector('#r-item-0').focus();
      return;
    }
    ctx.store.saveReflection({ date, items, reflection, mood });
    toast('Reflection saved. Rest well. 🌙');
    ctx.navigate(date === dayKey(new Date()) ? '#/home' : `#/journal?day=${date}`);
  });
  root.querySelector('#r-delete')?.addEventListener('click', async () => {
    const existing = ctx.store.reflectionFor(date);
    if (!existing) return;
    const ok = await confirmDialog({
      title: 'Delete this reflection?',
      body: 'The reflection and its three gratitudes will be removed from your journal.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) {
      ctx.store.deleteReflection(existing.id);
      toast('Reflection deleted.');
      ctx.navigate('#/home');
    }
  });
}
