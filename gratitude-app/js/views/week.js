// Your Gratitude Week: a visual weekly summary with week-by-week navigation.
import { esc, icons, entryCard, bindEntryActions } from '../ui.js';
import { weeklyStats, MOODS } from '../stats.js';
import { CATEGORIES } from '../prompts.js';
import { addDays, startOfWeek, WEEKDAYS_SHORT } from '../dates.js';

let weekStart = null;

export function title() {
  return 'Your Gratitude Week · Gladmoment';
}

export function enter() {
  weekStart = startOfWeek(new Date());
}

function rangeLabel(start) {
  const end = addDays(start, 6);
  const o = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString(undefined, o)} – ${end.toLocaleDateString(undefined, { ...o, year: 'numeric' })}`;
}

export function render(ctx) {
  const w = weeklyStats(ctx.store.state.entries, weekStart);
  const isThisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
  const max = Math.max(1, ...w.byDay.map((d) => d.count));
  const moodTotal = Object.values(w.moods).reduce((a, b) => a + b, 0);
  const topMood = moodTotal ? MOODS.find((m) => w.moods[m.id] === Math.max(...Object.values(w.moods))) : null;

  return `<header class="page-header week-hero">
    <div class="page-header-inner">
      <a href="#/insights" class="back-link">${icons.left} Insights</a>
      <h1 class="page-title" tabindex="-1">Your Gratitude Week</h1>
      <div class="week-nav">
        <button type="button" class="icon-btn light" id="wk-prev" aria-label="Previous week">${icons.left}</button>
        <p class="week-range" aria-live="polite">${isThisWeek ? 'This week · ' : ''}${esc(rangeLabel(weekStart))}</p>
        <button type="button" class="icon-btn light" id="wk-next" aria-label="Next week" ${isThisWeek ? 'disabled' : ''}>${icons.right}</button>
      </div>
    </div>
  </header>
  <div class="page">
    <section class="week-grid">
      <div class="card week-tile tile-purple">
        <p class="tile-label">You recorded</p>
        <p class="tile-big">${w.count}</p>
        <p class="tile-label">gratitude ${w.count === 1 ? 'moment' : 'moments'} on ${w.daysPractised} ${w.daysPractised === 1 ? 'day' : 'days'}</p>
      </div>
      <div class="card week-tile tile-peach">
        <p class="tile-label">Most active day</p>
        <p class="tile-mid">${esc(w.mostActiveDay || '—')}</p>
        ${topMood ? `<p class="tile-label">Most common mood: <span aria-hidden="true">${topMood.emoji}</span> ${esc(topMood.label)}</p>` : ''}
      </div>
      <div class="card week-tile tile-teal">
        <p class="tile-label">Most common themes</p>
        ${w.themes.length
          ? `<ol class="theme-list">${w.themes.map((t) => `<li><span aria-hidden="true">${CATEGORIES[t.category].emoji}</span> ${esc(CATEGORIES[t.category].label)}</li>`).join('')}</ol>`
          : '<p class="tile-mid">—</p>'}
      </div>
    </section>

    <section class="card" aria-labelledby="days-title">
      <h2 id="days-title">Day by day</h2>
      <ol class="day-bars">
        ${w.byDay
          .map(
            (d) => `<li>
            <span class="day-bar" aria-hidden="true"><span style="height:${(d.count / max) * 100}%"></span></span>
            <span class="day-bar-count">${d.count}</span>
            <span class="day-bar-label"><span aria-hidden="true">${WEEKDAYS_SHORT[d.date.getDay()]}</span><span class="sr-only">${d.date.toLocaleDateString(undefined, { weekday: 'long' })}: ${d.count} ${d.count === 1 ? 'moment' : 'moments'}</span></span>
          </li>`
          )
          .join('')}
      </ol>
    </section>

    <section class="card" aria-labelledby="hl-title">
      <h2 id="hl-title">${w.highlightsAreFavourites ? 'Favourite gratitudes this week' : 'Moments from this week'}</h2>
      ${w.highlights.length
        ? `<div class="entry-list" id="week-list">${w.highlights.map((e) => entryCard(e, { showDate: true, compact: true })).join('')}</div>
           ${w.highlightsAreFavourites ? '' : '<p class="muted small">Tap the heart on a moment to make it a favourite.</p>'}`
        : `<p class="muted">${isThisWeek ? 'Today is another opportunity to begin.' : 'No gratitude was saved this week — and that’s okay.'}</p>`}
    </section>
  </div>`;
}

export function mount(root, ctx) {
  root.querySelector('#wk-prev').addEventListener('click', () => {
    weekStart = addDays(weekStart, -7);
    ctx.rerender();
  });
  root.querySelector('#wk-next').addEventListener('click', () => {
    weekStart = addDays(weekStart, 7);
    ctx.rerender();
  });
  const list = root.querySelector('#week-list');
  if (list) bindEntryActions(list, ctx.store);
}
