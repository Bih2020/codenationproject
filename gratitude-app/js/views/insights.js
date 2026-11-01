// Insights: gentle habit tracking, milestones, themes and mood patterns.
import { esc, pageHeader } from '../ui.js';
import { summary, milestoneStatus, countThemes, countMoods, moodTimeline, MOODS, moodById, weeklyStats, entriesInRange } from '../stats.js';
import { CATEGORIES } from '../prompts.js';
import { addDays, startOfDay, WEEKDAYS_SHORT } from '../dates.js';

export function title() {
  return 'Insights · Gladmoment';
}

export function render(ctx) {
  const { entries } = ctx.store.state;
  const now = new Date();
  const s = summary(entries, now);
  const milestones = milestoneStatus(entries);
  const themes = countThemes(entries).slice(0, 6);
  const maxTheme = Math.max(1, ...themes.map((t) => t.count));
  const last30 = entriesInRange(entries, addDays(startOfDay(now), -29), addDays(startOfDay(now), 1));
  const moods = countMoods(last30);
  const moodTotal = Object.values(moods).reduce((a, b) => a + b, 0);
  const timeline = moodTimeline(entries, 14, now);
  const wk = weeklyStats(entries, now);

  return `${pageHeader('Insights', 'Gentle patterns from your gratitude practice')}
  <div class="page">
    <section class="card streak-card" aria-labelledby="streak-title">
      <h2 id="streak-title" class="sr-only">Your streak</h2>
      <p class="streak-big"><span aria-hidden="true">🔥</span> ${s.streak}-day gratitude streak</p>
      <p class="muted">${s.streak === 0 ? 'Today is another opportunity to begin.' : s.today === 0 ? 'Add a gratitude today to continue your streak — no pressure.' : 'Lovely consistency. Keep noticing.'}</p>
      <div class="stat-row">
        <div class="stat"><span class="stat-num">${s.thisWeek}</span><span class="stat-label">this week</span></div>
        <div class="stat"><span class="stat-num">${s.total}</span><span class="stat-label">all time</span></div>
        <div class="stat"><span class="stat-num">${s.longest}</span><span class="stat-label">longest streak</span></div>
        <div class="stat"><span class="stat-num">${s.daysPractised}</span><span class="stat-label">days practised</span></div>
      </div>
    </section>

    <a class="card week-link challenge-link" href="#/challenges">
      <div>
        <h2>Gratitude challenges</h2>
        <p class="muted">${ctx.store.state.challenge ? 'See your challenge progress' : '7, 21 and 30-day challenges with a new theme each day'}</p>
      </div>
      <span class="week-link-arrow" aria-hidden="true">→</span>
    </a>

    <a class="card week-link" href="#/week">
      <div>
        <h2>Your Gratitude Week</h2>
        <p class="muted">This week: ${wk.count} gratitude ${wk.count === 1 ? 'moment' : 'moments'}${wk.mostActiveDay ? ` · most active on ${wk.mostActiveDay}` : ''}</p>
      </div>
      <span class="week-link-arrow" aria-hidden="true">→</span>
    </a>

    <section class="card" aria-labelledby="ms-title">
      <h2 id="ms-title">Milestones</h2>
      <ul class="milestones">
        ${milestones
          .map(
            (m) => `<li class="milestone ${m.achieved ? 'is-done' : ''}">
              <span class="ms-emoji" aria-hidden="true">${m.emoji}</span>
              <span class="ms-label">${esc(m.label)}</span>
              <span class="ms-state">${m.achieved ? 'Reached' : `${Math.round(m.progress * 100)}%`}</span>
              ${m.achieved ? '' : `<span class="ms-bar" aria-hidden="true"><span style="width:${Math.round(m.progress * 100)}%"></span></span>`}
            </li>`
          )
          .join('')}
      </ul>
    </section>

    <section class="card" aria-labelledby="themes-title">
      <h2 id="themes-title">What you notice most</h2>
      ${themes.length
        ? `<ul class="bars">${themes
            .map((t) => {
              const c = CATEGORIES[t.category];
              return `<li><span class="bar-label"><span aria-hidden="true">${c.emoji}</span> ${esc(c.label)}</span>
                <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${(t.count / maxTheme) * 100}%"></span></span>
                <span class="bar-value">${t.count}</span></li>`;
            })
            .join('')}</ul>
           <p class="muted small">Themes come from the theme you choose, or are gently guessed from your words.</p>`
        : '<p class="muted">Themes will appear here as you save gratitude.</p>'}
    </section>

    <section class="card" aria-labelledby="mood-title">
      <h2 id="mood-title">Mood check-ins</h2>
      ${moodTotal
        ? `<p class="muted small">Last 30 days · ${moodTotal} check-${moodTotal === 1 ? 'in' : 'ins'}</p>
          <ul class="bars">${MOODS.map(
            (m) => `<li><span class="bar-label"><span aria-hidden="true">${m.emoji}</span> ${esc(m.label)}</span>
              <span class="bar-track" aria-hidden="true"><span class="bar-fill mood-${m.id}" style="width:${(moods[m.id] / moodTotal) * 100}%"></span></span>
              <span class="bar-value">${moods[m.id]}</span></li>`
          ).join('')}</ul>
          <h3 class="sub-title">Last 14 days</h3>
          <ol class="mood-strip">
            ${timeline
              .map((d) => {
                const m = d.mood ? moodById(d.mood) : null;
                const label = `${d.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}: ${m ? m.label : 'no check-in'}`;
                return `<li title="${esc(label)}"><span class="sr-only">${esc(label)}</span><span aria-hidden="true" class="ms-face">${m ? m.emoji : '·'}</span><span aria-hidden="true" class="ms-day">${WEEKDAYS_SHORT[d.date.getDay()].charAt(0)}</span></li>`;
              })
              .join('')}
          </ol>`
        : '<p class="muted">Mood check-ins are optional. If you choose a mood when saving gratitude, simple patterns will appear here.</p>'}
      <p class="disclaimer">These patterns are a personal reflection aid only. They are not a medical or psychological assessment. If you are struggling, please consider speaking to someone you trust or a health professional.</p>
    </section>
  </div>`;
}
