// Gratitude challenges: choose a 7, 21 or 30-day challenge and follow your progress.
import { esc, icons, confirmDialog, toast, shareDialog } from '../ui.js';
import { CHALLENGES, challengeProgress, challengeById } from '../challenges.js';
import { CATEGORIES } from '../prompts.js';
import { parseDayKey } from '../dates.js';

export function title() {
  return 'Challenges · Gladmoment';
}

function dotsHtml(p) {
  return `<ol class="challenge-dots" aria-label="${p.done} of ${p.total} days completed">
    ${Array.from({ length: p.total }, (_, i) => {
      const state = i < p.done ? 'done' : i === p.done && !p.finished ? 'next' : '';
      return `<li class="${state}" aria-hidden="true">${i < p.done ? '✓' : i + 1}</li>`;
    }).join('')}
  </ol>`;
}

function activeHtml(p) {
  const c = p.challenge;
  if (p.finished) {
    return `<section class="card challenge-active finished" aria-labelledby="ch-active">
      <p class="eyebrow">Challenge complete</p>
      <h2 id="ch-active"><span aria-hidden="true">${c.emoji}</span> ${esc(c.title)}</h2>
      <p>You noticed something good on ${c.days} different days. That is a real habit forming. 🎉</p>
      ${dotsHtml(p)}
      <div class="row wrap">
        <button type="button" class="btn btn-primary" id="ch-share">${icons.share} Share my achievement</button>
        <button type="button" class="btn btn-soft" id="ch-clear">Choose a new challenge</button>
      </div>
    </section>`;
  }
  const cat = CATEGORIES[p.today.category];
  return `<section class="card challenge-active" aria-labelledby="ch-active">
    <p class="eyebrow">Your challenge</p>
    <h2 id="ch-active"><span aria-hidden="true">${c.emoji}</span> ${esc(c.title)}</h2>
    <div class="challenge-bar" aria-hidden="true"><span style="width:${p.percent}%"></span></div>
    <p class="muted small">${p.done} of ${p.total} days completed</p>
    <div class="challenge-today">
      <p class="eyebrow">${p.doneToday ? `Day ${p.dayNumber} done ✓` : `Day ${p.dayNumber}`} · <span aria-hidden="true">${cat.emoji}</span> ${esc(cat.label)}</p>
      <p class="challenge-prompt">${esc(p.today.prompt)}</p>
      ${p.doneToday
        ? `<p class="muted small">Lovely. Day ${p.dayNumber + 1} opens tomorrow.</p>`
        : `<a class="btn btn-primary" href="#/home?challenge=1">Write today’s gratitude</a>`}
    </div>
    ${dotsHtml(p)}
    <p class="muted small">Missed a day? No problem. Your challenge simply continues when you come back.</p>
    <button type="button" class="link-btn" id="ch-leave">Stop this challenge</button>
  </section>`;
}

export function render(ctx) {
  const { state } = ctx.store;
  const p = challengeProgress(state.challenge);
  const history = state.challengeHistory || [];
  return `<header class="page-header">
    <div class="page-header-inner">
      <a href="#/insights" class="back-link">${icons.left} Insights</a>
      <h1 class="page-title" tabindex="-1">Gratitude challenges</h1>
      <p class="page-subtitle">A gentle daily theme to build the habit</p>
    </div>
  </header>
  <div class="page">
    ${p ? activeHtml(p) : ''}
    ${!p || p.finished ? `<section aria-labelledby="ch-choose" class="challenge-list">
        <h2 id="ch-choose" class="section-title">${p ? 'Start another challenge' : 'Choose a challenge'}</h2>
        ${CHALLENGES.map(
          (c) => `<article class="card challenge-option">
            <div class="challenge-badge" aria-hidden="true">${c.emoji}<span>${c.days}</span></div>
            <div>
              <h3>${esc(c.title)}</h3>
              <p class="muted">${esc(c.tagline)}</p>
              <button type="button" class="btn btn-soft" data-start="${c.id}">Start ${c.days}-day challenge</button>
            </div>
          </article>`
        ).join('')}
      </section>` : ''}
    ${history.length ? `<section class="card" aria-labelledby="ch-history">
        <h2 id="ch-history">Completed challenges</h2>
        <ul class="plain-list">${history
          .slice()
          .reverse()
          .map((h) => {
            const c = challengeById(h.id);
            return `<li><span aria-hidden="true">${c?.emoji || '✨'}</span> ${esc(c?.title || h.id)} · finished ${esc(parseDayKey(h.finishedOn).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</li>`;
          })
          .join('')}</ul>
      </section>` : ''}
  </div>`;
}

export function mount(root, ctx) {
  const { store } = ctx;
  root.querySelectorAll('[data-start]').forEach((b) =>
    b.addEventListener('click', async () => {
      const c = challengeById(b.dataset.start);
      const active = challengeProgress(store.state.challenge);
      if (active && !active.finished) {
        const ok = await confirmDialog({ title: 'Switch challenge?', body: 'Your current challenge progress will be cleared.', confirmLabel: 'Switch' });
        if (!ok) return;
      }
      store.startChallenge(c.id);
      toast(`${c.title} started. Day 1 is ready on Home.`);
      window.scrollTo({ top: 0 });
    })
  );
  root.querySelector('#ch-leave')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Stop this challenge?', body: 'Your gratitude entries stay in your journal. Only the challenge progress is cleared.', confirmLabel: 'Stop challenge', danger: true });
    if (ok) {
      store.leaveChallenge();
      toast('Challenge stopped. You can start again anytime.');
    }
  });
  root.querySelector('#ch-clear')?.addEventListener('click', () => store.leaveChallenge());
  root.querySelector('#ch-share')?.addEventListener('click', () => {
    const c = challengeById(store.state.challenge.id);
    shareDialog({ heading: 'Challenge complete', text: `I completed the ${c.title}: ${c.days} days of noticing the good things in my life.` });
  });
}
