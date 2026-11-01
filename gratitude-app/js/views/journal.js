// My Gratitude Journal: chronological entries grouped by day, with search,
// category/date/favourite filters and month-calendar navigation.
import { esc, icons, entryCard, bindEntryActions, categoryOptions, pageHeader } from '../ui.js';
import { dayKey, parseDayKey, relativeDayLabel, startOfDay, addDays, WEEKDAYS_SHORT } from '../dates.js';
import { MOODS } from '../stats.js';

const filters = { q: '', category: '', mood: '', favouritesOnly: false, day: '', showCalendar: false, month: null };

export function title() {
  return 'My Gratitude Journal · Gratitude Moments';
}

export function enter(_ctx, params) {
  if (params.day) {
    filters.day = params.day;
    filters.month = parseDayKey(params.day);
  }
  if (!filters.month) filters.month = startOfDay(new Date());
}

export function filterEntries(entries, f) {
  const q = f.q.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (!q || e.text.toLowerCase().includes(q) || (e.promptUsed || '').toLowerCase().includes(q)) &&
      (!f.category || e.category === f.category) &&
      (!f.mood || e.mood === f.mood) &&
      (!f.favouritesOnly || e.favourite) &&
      (!f.day || dayKey(e.createdAt) === f.day)
  );
}

function groupByDay(entries) {
  const groups = new Map();
  for (const e of entries) {
    const k = dayKey(e.createdAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  // Entries are newest-first overall; show each day's moments in the order they happened.
  for (const list of groups.values()) list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return groups;
}

function calendarHtml(entries) {
  const m = filters.month;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const counts = {};
  for (const e of entries) {
    const k = dayKey(e.createdAt);
    counts[k] = (counts[k] || 0) + 1;
  }
  const today = dayKey(new Date());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell empty" aria-hidden="true"></span>');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(m.getFullYear(), m.getMonth(), d);
    const k = dayKey(date);
    const n = counts[k] || 0;
    const label = `${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${n ? `${n} gratitude ${n === 1 ? 'moment' : 'moments'}` : 'no entries'}`;
    cells.push(`<button type="button" class="cal-cell ${n ? 'has' : ''} ${k === today ? 'is-today' : ''} ${k === filters.day ? 'is-selected' : ''}"
      data-day="${k}" aria-label="${esc(label)}" aria-pressed="${k === filters.day}" ${n ? '' : 'data-empty="true"'}>
      <span>${d}</span>${n ? `<span class="cal-dot" aria-hidden="true">${n > 1 ? n : ''}</span>` : ''}</button>`);
  }
  const monthLabel = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const isCurrentMonth = m.getFullYear() === new Date().getFullYear() && m.getMonth() === new Date().getMonth();
  return `<div class="calendar card" id="calendar">
    <div class="cal-head">
      <button type="button" class="icon-btn" id="cal-prev" aria-label="Previous month">${icons.left}</button>
      <h2 class="cal-title" aria-live="polite">${esc(monthLabel)}</h2>
      <button type="button" class="icon-btn" id="cal-next" aria-label="Next month" ${isCurrentMonth ? 'disabled' : ''}>${icons.right}</button>
    </div>
    <div class="cal-grid" role="group" aria-label="Days in ${esc(monthLabel)}">
      ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="cal-dow" aria-hidden="true">${WEEKDAYS_SHORT[d].slice(0, 2)}</span>`).join('')}
      ${cells.join('')}
    </div>
  </div>`;
}

function reflectionHtml(r) {
  if (!r || (!r.reflection && !r.items?.some(Boolean))) return '';
  return `<div class="reflection-card">
    <p class="reflection-label"><span aria-hidden="true">🌙</span> Daily reflection</p>
    ${r.reflection ? `<p class="reflection-text"><span class="muted">What made today meaningful:</span> ${esc(r.reflection)}</p>` : ''}
    <a class="link small" href="#/reflection?date=${esc(r.date)}">Edit reflection</a>
  </div>`;
}

function listHtml(ctx) {
  const { state } = ctx.store;
  const results = filterEntries(state.entries, filters);
  const anyFilter = filters.q || filters.category || filters.mood || filters.favouritesOnly || filters.day;
  if (!state.entries.length) {
    return `<div class="empty card"><p class="empty-emoji" aria-hidden="true">📔</p>
      <p>Your journal is waiting for its first gratitude.</p><a href="#/home?focus=1" class="btn btn-primary">Write one now</a></div>`;
  }
  if (!results.length) {
    return `<div class="empty card"><p class="empty-emoji" aria-hidden="true">🔍</p>
      <p>No gratitude moments match ${filters.day ? 'this day and ' : ''}these filters.</p>
      <button type="button" class="btn btn-soft" data-clear-filters>Clear filters</button></div>`;
  }
  const groups = groupByDay(results);
  const now = new Date();
  return `<p class="result-count" role="status">${results.length} ${results.length === 1 ? 'moment' : 'moments'}${anyFilter ? ' found' : ''}</p>
    ${[...groups.entries()]
      .map(([k, list]) => {
        const r = ctx.store.reflectionFor(k);
        return `<section class="day-group" aria-labelledby="day-${k}">
          <h2 class="day-title" id="day-${k}">${esc(relativeDayLabel(k, now))}</h2>
          <div class="entry-list">${list.map((e) => entryCard(e)).join('')}</div>
          ${!filters.q && !filters.category && !filters.mood && !filters.favouritesOnly ? reflectionHtml(r) : ''}
        </section>`;
      })
      .join('')}`;
}

export function render(ctx) {
  const total = ctx.store.state.entries.length;
  return `${pageHeader('My Gratitude Journal', total ? `${total} gratitude ${total === 1 ? 'moment' : 'moments'} saved` : 'Every moment you save lives here')}
  <div class="page">
    <div class="journal-tools card">
      <div class="search-wrap">
        <label for="journal-search" class="sr-only">Search your journal</label>
        <span class="search-icon" aria-hidden="true">${icons.search}</span>
        <input type="search" id="journal-search" class="input" placeholder="Search your gratitude…" value="${esc(filters.q)}" autocomplete="off">
      </div>
      <div class="filter-row">
        <div class="filter">
          <label for="filter-cat" class="field-label small">Theme</label>
          <select id="filter-cat" class="select">${categoryOptions(filters.category, { includeAuto: false }).replace(/^/, '<option value="">All themes</option>')}</select>
        </div>
        <div class="filter">
          <label for="filter-mood" class="field-label small">Mood</label>
          <select id="filter-mood" class="select"><option value="">Any mood</option>${MOODS.map((m) => `<option value="${m.id}" ${filters.mood === m.id ? 'selected' : ''}>${m.emoji} ${m.label}</option>`).join('')}</select>
        </div>
        <div class="filter">
          <label for="filter-day" class="field-label small">Date</label>
          <input type="date" id="filter-day" class="input" value="${esc(filters.day)}" max="${dayKey(new Date())}">
        </div>
      </div>
      <div class="row wrap">
        <button type="button" class="toggle-pill" id="filter-fav" aria-pressed="${filters.favouritesOnly}">${filters.favouritesOnly ? icons.heartFilled : icons.heart} Favourites only</button>
        <button type="button" class="toggle-pill" id="toggle-cal" aria-pressed="${filters.showCalendar}" aria-controls="calendar">${icons.calendar} Calendar</button>
        <a class="toggle-pill" href="#/reflection">🌙 Daily reflection</a>
        <button type="button" class="link-btn" data-clear-filters ${filters.q || filters.category || filters.mood || filters.favouritesOnly || filters.day ? '' : 'hidden'}>Clear filters</button>
      </div>
      ${filters.day ? `<div class="day-nav">
          <button type="button" class="icon-btn" id="day-prev" aria-label="Previous day">${icons.left}</button>
          <span>${esc(relativeDayLabel(filters.day))}</span>
          <button type="button" class="icon-btn" id="day-next" aria-label="Next day" ${filters.day >= dayKey(new Date()) ? 'disabled' : ''}>${icons.right}</button>
        </div>` : ''}
    </div>
    ${filters.showCalendar ? calendarHtml(ctx.store.state.entries) : ''}
    <div id="journal-list">${listHtml(ctx)}</div>
  </div>`;
}

export function mount(root, ctx) {
  const list = root.querySelector('#journal-list');
  bindEntryActions(list, ctx.store);
  const refreshList = () => {
    list.innerHTML = listHtml(ctx);
    root.querySelector('.journal-tools [data-clear-filters]').hidden = !(filters.q || filters.category || filters.mood || filters.favouritesOnly || filters.day);
  };
  root.querySelector('#journal-search').addEventListener('input', (ev) => {
    filters.q = ev.target.value;
    refreshList();
  });
  root.querySelector('#filter-cat').addEventListener('change', (ev) => {
    filters.category = ev.target.value;
    refreshList();
  });
  root.querySelector('#filter-mood').addEventListener('change', (ev) => {
    filters.mood = ev.target.value;
    refreshList();
  });
  root.querySelector('#filter-day').addEventListener('change', (ev) => {
    filters.day = ev.target.value;
    if (filters.day) filters.month = parseDayKey(filters.day);
    ctx.rerender();
  });
  root.querySelector('#filter-fav').addEventListener('click', () => {
    filters.favouritesOnly = !filters.favouritesOnly;
    ctx.rerender();
  });
  root.querySelector('#toggle-cal').addEventListener('click', () => {
    filters.showCalendar = !filters.showCalendar;
    ctx.rerender();
  });
  const shiftDay = (n) => {
    filters.day = dayKey(addDays(parseDayKey(filters.day), n));
    filters.month = parseDayKey(filters.day);
    ctx.rerender();
  };
  root.querySelector('#day-prev')?.addEventListener('click', () => shiftDay(-1));
  root.querySelector('#day-next')?.addEventListener('click', () => shiftDay(1));
  root.querySelector('.page').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-clear-filters]')) {
      Object.assign(filters, { q: '', category: '', mood: '', favouritesOnly: false, day: '' });
      ctx.rerender();
      document.getElementById('journal-search')?.focus();
    }
    const cell = ev.target.closest('.cal-cell[data-day]');
    if (cell) {
      filters.day = filters.day === cell.dataset.day ? '' : cell.dataset.day;
      ctx.rerender();
      document.getElementById('journal-list')?.scrollIntoView({ block: 'start' });
    }
  });
  const moveMonth = (n) => {
    const m = filters.month;
    filters.month = new Date(m.getFullYear(), m.getMonth() + n, 1);
    ctx.rerender();
  };
  root.querySelector('#cal-prev')?.addEventListener('click', () => moveMonth(-1));
  root.querySelector('#cal-next')?.addEventListener('click', () => moveMonth(1));
}

