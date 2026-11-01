// Insights: gentle habit tracking, milestones, themes and mood patterns.
import { esc, pageHeader } from '../ui.js';
import { summary, milestoneStatus, countThemes, countMoods, moodTimeline, MOODS, moodById, weeklyStats, entriesInRange } from '../stats.js';
import { CATEGORIES } from '../prompts.js';
import { addDays, startOfDay, weekdayName } from '../dates.js';
import { t, tn, getLocale } from '../i18n.js';
import { BRAND } from '../config.js';
import { icons } from '../ui.js';

export function title() {
  return `${t('Insights')} · Gladmoment`;
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

  return `${pageHeader(t('Insights'), t('Gentle patterns from your gratitude practice'))}
  <div class="page">
    <section class="card streak-card" aria-labelledby="streak-title">
      <h2 id="streak-title" class="sr-only">${t('Your streak')}</h2>
      <p class="streak-big"><span aria-hidden="true">🔥</span> ${tn(s.streak, '{n}-day gratitude streak', '{n}-day gratitude streak')}</p>
      <p class="muted">${s.streak === 0 ? t('Today is another opportunity to begin.') : s.today === 0 ? t('Add a gratitude today to continue your streak — no pressure.') : t('Lovely consistency. Keep noticing.')}</p>
      <div class="stat-row">
        <div class="stat"><span class="stat-num">${s.thisWeek}</span><span class="stat-label">${t('this week')}</span></div>
        <div class="stat"><span class="stat-num">${s.total}</span><span class="stat-label">${t('all time')}</span></div>
        <div class="stat"><span class="stat-num">${s.longest}</span><span class="stat-label">${t('longest streak')}</span></div>
        <div class="stat"><span class="stat-num">${s.daysPractised}</span><span class="stat-label">${t('days practised')}</span></div>
      </div>
    </section>

    <a class="card week-link challenge-link" href="#/challenges">
      <div>
        <h2>${t('Gratitude challenges')}</h2>
        <p class="muted">${ctx.store.state.challenge ? t('See your challenge progress') : t('7, 21 and 30-day challenges with a new theme each day')}</p>
      </div>
      <span class="week-link-arrow" aria-hidden="true">→</span>
    </a>

    <a class="card week-link" href="#/week">
      <div>
        <h2>${t('Your Gratitude Week')}</h2>
        <p class="muted">${tn(wk.count, 'This week: {n} gratitude moment', 'This week: {n} gratitude moments')}${wk.mostActiveDayIndex !== null ? ` · ${t('most active on {day}', { day: weekdayName(wk.mostActiveDayIndex) })}` : ''}</p>
      </div>
      <span class="week-link-arrow" aria-hidden="true">→</span>
    </a>

    <section class="card" aria-labelledby="ms-title">
      <h2 id="ms-title">${t('Milestones')}</h2>
      <ul class="milestones">
        ${milestones
          .map(
            (m) => `<li class="milestone ${m.achieved ? 'is-done' : ''}">
              <span class="ms-emoji" aria-hidden="true">${m.emoji}</span>
              <span class="ms-label">${esc(t(m.label))}</span>
              <span class="ms-state">${m.achieved ? t('Reached') : `${Math.round(m.progress * 100)}%`}</span>
              ${m.achieved ? '' : `<span class="ms-bar" aria-hidden="true"><span style="width:${Math.round(m.progress * 100)}%"></span></span>`}
            </li>`
          )
          .join('')}
      </ul>
    </section>

    <section class="card" aria-labelledby="themes-title">
      <h2 id="themes-title">${t('What you notice most')}</h2>
      ${themes.length
        ? `<ul class="bars">${themes
            .map((th) => {
              const c = CATEGORIES[th.category];
              return `<li><span class="bar-label"><span aria-hidden="true">${c.emoji}</span> ${esc(t(c.label))}</span>
                <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${(th.count / maxTheme) * 100}%"></span></span>
                <span class="bar-value">${th.count}</span></li>`;
            })
            .join('')}</ul>
           <p class="muted small">${t('Themes come from the theme you choose, or are gently guessed from your words.')}</p>`
        : `<p class="muted">${t('Themes will appear here as you save gratitude.')}</p>`}
    </section>

    <section class="card" aria-labelledby="mood-title">
      <h2 id="mood-title">${t('Mood check-ins')}</h2>
      ${moodTotal
        ? `<p class="muted small">${t('Last 30 days')} · ${tn(moodTotal, '{n} check-in', '{n} check-ins')}</p>
          <ul class="bars">${MOODS.map(
            (m) => `<li><span class="bar-label"><span aria-hidden="true">${m.emoji}</span> ${esc(t(m.label))}</span>
              <span class="bar-track" aria-hidden="true"><span class="bar-fill mood-${m.id}" style="width:${(moods[m.id] / moodTotal) * 100}%"></span></span>
              <span class="bar-value">${moods[m.id]}</span></li>`
          ).join('')}</ul>
          <h3 class="sub-title">${t('Last 14 days')}</h3>
          <ol class="mood-strip">
            ${timeline
              .map((d) => {
                const m = d.mood ? moodById(d.mood) : null;
                const label = `${d.date.toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'short' })}: ${m ? t(m.label) : t('no check-in')}`;
                return `<li title="${esc(label)}"><span class="sr-only">${esc(label)}</span><span aria-hidden="true" class="ms-face">${m ? m.emoji : '·'}</span><span aria-hidden="true" class="ms-day">${esc(weekdayName(d.date.getDay(), 'narrow'))}</span></li>`;
              })
              .join('')}
          </ol>`
        : `<p class="muted">${t('Mood check-ins are optional. If you choose a mood when saving gratitude, simple patterns will appear here.')}</p>`}
      <p class="disclaimer">${t('These patterns are a personal reflection aid only. They are not a medical or psychological assessment. If you are struggling, please consider speaking to someone you trust or a health professional.')}</p>
    </section>

    <section class="card from-brand" aria-labelledby="brand-title">
      <div class="from-brand-icon" aria-hidden="true">${icons.music}</div>
      <div class="from-brand-text">
        <p class="eyebrow">${t('From {site}', { site: BRAND.siteName })}</p>
        <h2 id="brand-title">${t('Relaxation playlists')}</h2>
        <p class="muted small">${t('Calming music to help you unwind, rest and keep a grateful heart.')}</p>
      </div>
      <a class="btn btn-soft" href="${BRAND.musicUrl}" target="_blank" rel="noopener">${t('Listen now')}</a>
    </section>
  </div>`;
}
