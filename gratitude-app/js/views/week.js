// Your Gratitude Week: a visual weekly summary with week-by-week navigation.
import { esc, icons, entryCard, bindEntryActions } from '../ui.js';
import { weeklyStats, MOODS } from '../stats.js';
import { CATEGORIES } from '../prompts.js';
import { addDays, startOfWeek, weekdayName } from '../dates.js';
import { t, tn, getLocale } from '../i18n.js';

let weekStart = null;

export function title() {
  return `${t('Your Gratitude Week')} · Gladmoment`;
}

export function enter() {
  weekStart = startOfWeek(new Date());
}

function rangeLabel(start) {
  const end = addDays(start, 6);
  const o = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString(getLocale(), o)} – ${end.toLocaleDateString(getLocale(), { ...o, year: 'numeric' })}`;
}

export function render(ctx) {
  const w = weeklyStats(ctx.store.state.entries, weekStart);
  const isThisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
  const max = Math.max(1, ...w.byDay.map((d) => d.count));
  const moodTotal = Object.values(w.moods).reduce((a, b) => a + b, 0);
  const topMood = moodTotal ? MOODS.find((m) => w.moods[m.id] === Math.max(...Object.values(w.moods))) : null;

  return `<header class="page-header week-hero">
    <div class="page-header-inner">
      <a href="#/insights" class="back-link">${icons.left} ${t('Insights')}</a>
      <h1 class="page-title" tabindex="-1">${t('Your Gratitude Week')}</h1>
      <div class="week-nav">
        <button type="button" class="icon-btn light" id="wk-prev" aria-label="${t('Previous week')}">${icons.left}</button>
        <p class="week-range" aria-live="polite">${isThisWeek ? `${t('This week')} · ` : ''}${esc(rangeLabel(weekStart))}</p>
        <button type="button" class="icon-btn light" id="wk-next" aria-label="${t('Next week')}" ${isThisWeek ? 'disabled' : ''}>${icons.right}</button>
      </div>
    </div>
  </header>
  <div class="page">
    <section class="week-grid">
      <div class="card week-tile tile-purple">
        <p class="tile-label">${t('You recorded')}</p>
        <p class="tile-big">${w.count}</p>
        <p class="tile-label">${tn(w.count, 'gratitude moment', 'gratitude moments')} ${tn(w.daysPractised, 'on {n} day', 'on {n} days')}</p>
      </div>
      <div class="card week-tile tile-peach">
        <p class="tile-label">${t('Most active day')}</p>
        <p class="tile-mid">${esc(w.mostActiveDayIndex !== null ? weekdayName(w.mostActiveDayIndex) : '—')}</p>
        ${topMood ? `<p class="tile-label">${t('Most common mood:')} <span aria-hidden="true">${topMood.emoji}</span> ${esc(t(topMood.label))}</p>` : ''}
      </div>
      <div class="card week-tile tile-teal">
        <p class="tile-label">${t('Most common themes')}</p>
        ${w.themes.length
          ? `<ol class="theme-list">${w.themes.map((th) => `<li><span aria-hidden="true">${CATEGORIES[th.category].emoji}</span> ${esc(t(CATEGORIES[th.category].label))}</li>`).join('')}</ol>`
          : '<p class="tile-mid">—</p>'}
      </div>
    </section>

    <section class="card" aria-labelledby="days-title">
      <h2 id="days-title">${t('Day by day')}</h2>
      <ol class="day-bars">
        ${w.byDay
          .map(
            (d) => `<li>
            <span class="day-bar" aria-hidden="true"><span style="height:${(d.count / max) * 100}%"></span></span>
            <span class="day-bar-count">${d.count}</span>
            <span class="day-bar-label"><span aria-hidden="true">${esc(weekdayName(d.date.getDay(), 'short'))}</span><span class="sr-only">${esc(weekdayName(d.date.getDay()))}: ${tn(d.count, '{n} moment', '{n} moments')}</span></span>
          </li>`
          )
          .join('')}
      </ol>
    </section>

    <section class="card" aria-labelledby="hl-title">
      <h2 id="hl-title">${w.highlightsAreFavourites ? t('Favourite gratitudes this week') : t('Moments from this week')}</h2>
      ${w.highlights.length
        ? `<div class="entry-list" id="week-list">${w.highlights.map((e) => entryCard(e, { showDate: true, compact: true })).join('')}</div>
           ${w.highlightsAreFavourites ? '' : `<p class="muted small">${t('Tap the heart on a moment to make it a favourite.')}</p>`}`
        : `<p class="muted">${isThisWeek ? t('Today is another opportunity to begin.') : t('No gratitude was saved this week — and that’s okay.')}</p>`}
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
