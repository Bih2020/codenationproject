// Home: header with greeting + bell, the gratitude composer, inspiration,
// today's progress, a memory from the past and the evening reflection nudge.
import { esc, icons, entryCard, bindEntryActions, moodPicker, makeMoodDeselectable, categoryOptions, toast, announce, bellModeDialog, shareDialog, downloadFile } from '../ui.js';
import { challengeProgress } from '../challenges.js';
import { openPause } from '../pause.js';
import { BRAND } from '../config.js';
import { installPlatform, shouldShowInstall, backupDue } from '../nudges.js';
import { CATEGORIES, QUICK_CHIPS, pickPrompt, POSITIVE_MESSAGES, SAVE_ACKNOWLEDGEMENTS, wordIdeasFor, addIdea, categoryName, chipName } from '../prompts.js';
import { nextReminder, isPaused, pauseEnd, bellMode, bellModePatch } from '../schedule.js';
import { vibrationSupported } from '../notifications.js';
import { summary, pickMemory, milestoneStatus } from '../stats.js';
import { greetingFor, formatLongDate, formatTime, dayKey, daysBetween, parseTime, weekdayName } from '../dates.js';
import { createVoiceInput, voiceSupported } from '../voice.js';
import { t, tn, getLocale } from '../i18n.js';

const DRAFT_KEY = 'gratitude-moments:draft';

// Module state survives re-renders (e.g. toggling the bell while typing).
const draft = loadDraft();
let prompt = null;
let recentPrompts = [];
let activeChip = null;
let voice = null;
let listening = false;
let interim = '';
let voiceMessage = '';
let ack = '';
let lastSaved = null; // { text, date } offered for sharing right after saving
let ackTimer = null;

function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (d && typeof d.text === 'string') return d;
  } catch { /* ignore */ }
  return { text: '', category: '', mood: null, promptUsed: null, promptCategory: null, usedVoice: false };
}
function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* ignore */ }
}
function resetDraft() {
  Object.assign(draft, { text: '', category: '', mood: null, promptUsed: null, promptCategory: null, usedVoice: false });
  saveDraft();
}

function newPrompt(ctx, category) {
  const p = ctx.store.state.user.preferences;
  prompt = pickPrompt({ category, preferred: p.preferredCategories, preference: p.promptPreference, recent: recentPrompts });
  recentPrompts = [prompt.id, ...recentPrompts].slice(0, 25);
}

export function title() {
  return 'Gladmoment';
}

export function enter(ctx) {
  if (!prompt) newPrompt(ctx);
  voice = createVoiceInput({
    onStateChange: (on) => {
      listening = on;
      if (on) voiceMessage = '';
      updateVoiceUi();
      announce(on ? t('Listening. Speak your gratitude, then tap stop.') : t('Stopped listening. You can edit the text before saving.'));
    },
    onInterim: (heard) => {
      interim = heard;
      const el = document.getElementById('voice-interim');
      if (el) el.textContent = heard;
    },
    onFinal: (heard) => {
      if (!heard) return;
      const ta = document.getElementById('gratitude-text');
      const base = (ta ? ta.value : draft.text).trimEnd();
      const text = base ? heard : heard.charAt(0).toUpperCase() + heard.slice(1);
      draft.text = base ? `${base} ${text}` : text;
      draft.usedVoice = true;
      saveDraft();
      if (ta) {
        ta.value = draft.text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    onError: (msg) => {
      voiceMessage = msg;
      updateVoiceUi();
    },
  });
}

export function leave() {
  voice?.destroy();
  voice = null;
  listening = false;
}

function updateVoiceUi() {
  const status = document.getElementById('voice-status');
  const btn = document.getElementById('say-btn');
  const msg = document.getElementById('voice-message');
  if (status) status.hidden = !listening;
  if (btn) {
    btn.setAttribute('aria-pressed', String(listening));
    btn.classList.toggle('is-listening', listening);
    btn.querySelector('.btn-label').textContent = listening ? t('Stop') : t('Say it');
    btn.querySelector('.btn-icon').innerHTML = listening ? icons.stop : icons.mic;
    btn.setAttribute('aria-label', listening ? t('Stop voice input') : t('Say it: speak your gratitude using the microphone'));
  }
  if (msg) {
    msg.textContent = voiceMessage;
    msg.hidden = !voiceMessage;
  }
}

// ---------- tap-to-add words ----------
function ideasCategory() {
  return draft.category || draft.promptCategory || prompt?.category || null;
}

function wordIdeasHtml() {
  const cat = ideasCategory();
  const c = cat && CATEGORIES[cat];
  return `<p class="word-ideas-title" id="word-ideas-title">${t('Tap to add')}${c ? ` · <span aria-hidden="true">${c.emoji}</span> ${esc(categoryName(cat))}` : ''}</p>
    <div class="word-chips" role="group" aria-labelledby="word-ideas-title">
      ${wordIdeasFor(cat).map((w) => `<button type="button" class="word-chip" data-word="${esc(t(w))}">${esc(t(w))}</button>`).join('')}
    </div>`;
}

function refreshWords() {
  const el = document.getElementById('word-ideas');
  if (el) el.innerHTML = wordIdeasHtml();
}

// ---------- header ----------
export function describeNext(settings, now = new Date()) {
  if (!settings.enabled) return { state: 'off', text: t('Reminders are off'), short: t('Reminders off') };
  if (isPaused(settings, now)) {
    const end = pauseEnd(settings);
    if (end === Infinity) return { state: 'paused', text: t('Reminders paused'), short: t('Paused') };
    return { state: 'paused', text: t('Reminders paused until {when}', { when: whenLabel(new Date(end), now) }), short: t('Paused') };
  }
  const next = nextReminder(settings, now);
  if (!next) return { state: 'none', text: t('No upcoming reminders — check your schedule'), short: t('None scheduled') };
  const quiet = settings.quiet ? `${t('Vibrate only')} · ` : '';
  return { state: 'on', quiet: Boolean(settings.quiet), text: `${quiet}${t('Next gratitude moment: {when}', { when: whenLabel(next, now) })}`, short: whenLabel(next, now), at: next };
}

function whenLabel(d, now) {
  const diff = daysBetween(now, d);
  const time = formatTime(d);
  if (diff === 0) return time;
  if (diff === 1) return t('tomorrow, {time}', { time });
  return `${weekdayName(d.getDay())}, ${time}`;
}

function headerHtml(ctx) {
  const { state } = ctx.store;
  const now = new Date();
  const g = greetingFor(now);
  const name = state.user.displayName;
  const msg = t(POSITIVE_MESSAGES[(now.getDate() + now.getMonth()) % POSITIVE_MESSAGES.length]);
  const rs = state.reminderSettings;
  const next = describeNext(rs, now);
  const mode = bellMode(rs);
  const on = mode !== 'off';
  const modeName = { ring: t('sound'), quiet: t('vibrate only'), off: t('off') }[mode];
  const bellLabel = `${t('Gratitude bell: {mode}.', { mode: modeName })}${on ? ` ${next.text}.` : ''} ${t('Change bell mode')}`;
  const bellIcon = mode === 'ring' ? icons.bell : mode === 'quiet' ? icons.vibrate : icons.bellOff;
  return `<header class="hero" id="hero">
    <div class="hero-blobs" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="hero-top">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">✿</span>
        <div>
          <p class="brand-name">Gladmoment</p>
          <p class="brand-date">${esc(formatLongDate(now))}</p>
        </div>
      </div>
      <div class="hero-actions">
        <button type="button" id="bell-toggle" class="hero-icon bell is-${mode}" aria-haspopup="dialog" aria-label="${esc(bellLabel)}" title="${t('Bell: {mode}', { mode: modeName })}">
          ${bellIcon}
          ${on && next.state === 'on' ? '<span class="bell-dot" aria-hidden="true"></span>' : ''}
        </button>
        <a href="#/settings" class="hero-icon" aria-label="${t('Settings')}">${icons.settings}</a>
      </div>
    </div>
    <h1 class="greeting" tabindex="-1">${esc(g.text)}${name ? `, ${esc(name)}` : ''} <span aria-hidden="true">${g.emoji}</span></h1>
    <p class="hero-quote">“${esc(msg)}”</p>
    <div class="next-row">
      <a href="#/settings?section=reminders" class="next-chip state-${next.state}" id="next-chip">
        <span aria-hidden="true">${next.state === 'on' ? (next.quiet ? '📳' : '🔔') : next.state === 'paused' ? '⏸️' : '🔕'}</span>
        <span>${esc(next.text)}</span>
      </a>
      ${next.state === 'paused' ? `<button type="button" class="chip-btn" id="resume-btn">${t('Resume')}</button>` : ''}
      ${next.state === 'off' ? `<button type="button" class="chip-btn" id="bell-on-btn">${t('Turn on')}</button>` : ''}
    </div>
  </header>`;
}

export function refreshHeader(root, ctx) {
  const hero = root.querySelector('#hero');
  if (!hero) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = headerHtml(ctx);
  hero.replaceWith(tmp.firstElementChild);
  bindHeader(root, ctx);
}

function bindHeader(root, ctx) {
  const { store } = ctx;
  root.querySelector('#bell-toggle')?.addEventListener('click', async () => {
    const current = bellMode(store.state.reminderSettings);
    const mode = await bellModeDialog(current, { vibrationSupported: vibrationSupported() });
    if (!mode || mode === current) return;
    store.updateReminders(bellModePatch(mode));
    const next = describeNext(store.state.reminderSettings);
    if (mode === 'quiet' && vibrationSupported()) navigator.vibrate(200);
    toast(
      mode === 'off'
        ? t('Bell off. Tap the bell to turn reminders back on.')
        : mode === 'quiet'
          ? `${t('Vibrate only. Reminders will be silent: give thanks in your heart.')} ${next.text}.`
          : `${t('Bell on with sound.')} ${next.text}.`
    );
    requestAnimationFrame(() => document.getElementById('bell-toggle')?.focus());
  });
  root.querySelector('#resume-btn')?.addEventListener('click', () => {
    store.updateReminders({ pausedUntil: null });
    toast(t('Reminders resumed.'));
  });
  root.querySelector('#bell-on-btn')?.addEventListener('click', () => {
    store.updateReminders({ enabled: true, pausedUntil: null });
    toast(t('Reminders on.'));
  });
}

// ---------- page ----------
export function render(ctx) {
  const { state } = ctx.store;
  const prefs = state.user.preferences;
  const now = new Date();
  const s = summary(state.entries, now);
  const latest = state.entries[0];
  const memory = prefs.showMemories && state.ui.memoryHiddenOn !== dayKey(now) ? pickMemory(state.entries, now) : null;
  const reflectionDue =
    prefs.eveningReflection &&
    now.getHours() * 60 + now.getMinutes() >= parseTime(prefs.reflectionTime || '19:00') &&
    !ctx.store.reflectionFor(dayKey(now)) &&
    state.ui.reflectionDismissedOn !== dayKey(now);
  const canSpeak = voiceSupported();

  return `${headerHtml(ctx)}
  <div class="page home-page">
    <section class="card compose" aria-labelledby="compose-title">
      <h2 id="compose-title" class="compose-title">${t('What are you grateful for right now?')}</h2>
      ${draft.promptUsed ? `<div class="prompt-context">
          <span><span class="sr-only">${t('Using prompt:')} </span>${esc(draft.promptUsed)}</span>
          <button type="button" class="icon-btn small" id="clear-prompt" aria-label="${t('Stop using this prompt')}">${icons.close}</button>
        </div>` : ''}
      <div class="input-modes" role="group" aria-label="${t('Choose how to share your gratitude')}">
        <button type="button" class="mode-btn" id="type-btn">
          <span class="btn-icon">${icons.keyboard}</span><span>${t('Type it')}</span>
        </button>
        <button type="button" class="mode-btn mic ${listening ? 'is-listening' : ''}" id="say-btn" aria-pressed="${listening}"
          aria-label="${listening ? t('Stop voice input') : t('Say it: speak your gratitude using the microphone')}" ${canSpeak ? '' : 'aria-describedby="voice-unsupported"'}>
          <span class="btn-icon">${listening ? icons.stop : icons.mic}</span><span class="btn-label">${listening ? t('Stop') : t('Say it')}</span>
        </button>
      </div>
      <label for="gratitude-text" class="sr-only">${t("What are you grateful for? Start with: I'm grateful for…")}</label>
      <textarea id="gratitude-text" class="textarea big" rows="4" maxlength="2000" placeholder="${esc(t("I'm grateful for..."))}" autocomplete="off">${esc(draft.text)}</textarea>
      <div class="voice-status" id="voice-status" role="status" ${listening ? '' : 'hidden'}>
        <span class="rec-dot" aria-hidden="true"></span>
        <strong>🎙 ${t('Listening...')}</strong>
        <span class="interim" id="voice-interim">${esc(interim)}</span>
      </div>
      <p class="voice-message" id="voice-message" role="alert" ${voiceMessage ? '' : 'hidden'}>${esc(voiceMessage)}</p>
      ${canSpeak ? '' : `<p class="hint" id="voice-unsupported">${t('Voice input isn’t supported in this browser — typing works everywhere.')}</p>`}
      <div class="word-ideas" id="word-ideas">${wordIdeasHtml()}</div>
      <div class="compose-extras">
        <label class="field-label small" for="entry-theme">${t('Theme')} <span class="muted">${t('(optional)')}</span></label>
        <select id="entry-theme" class="select">${categoryOptions(draft.category)}</select>
        ${prefs.askMood ? moodPicker('entry-mood', draft.mood) : ''}
      </div>
      <button type="button" class="btn btn-primary btn-xl ${draft.text.trim() ? '' : 'is-empty'}" id="save-btn">${t('Save Gratitude')}</button>
      <button type="button" class="btn btn-ghost heart-btn" id="heart-btn"><span aria-hidden="true">🤍</span> ${t('I said it in my heart')}</button>
      <p class="save-ack ${ack ? 'show' : ''}" id="save-ack" role="status" aria-live="polite">${esc(ack)}</p>
      ${ack && lastSaved ? `<button type="button" class="btn btn-soft small share-after" id="share-last">${icons.share} ${t('Share as a card')}</button>` : ''}
    </section>

    ${nudgesHtml(ctx)}

    ${challengeHtml(ctx)}

    <section class="card pause-card" aria-labelledby="pause-card-title">
      <div class="pause-card-icon" aria-hidden="true">${icons.music}</div>
      <div class="pause-card-text">
        <h2 id="pause-card-title">${t('1-minute gratitude pause')}</h2>
        <p class="muted small">${esc(t('Breathe with calming {site} sounds, then notice one good thing.', { site: BRAND.siteName }))}</p>
      </div>
      <button type="button" class="btn btn-primary" id="open-pause">${t('Begin')}</button>
    </section>

    ${reflectionDue ? `<section class="card reflect-nudge" aria-labelledby="reflect-nudge-title">
        <div>
          <h2 id="reflect-nudge-title"><span aria-hidden="true">🌙</span> ${t('End-of-day reflection')}</h2>
          <p class="muted">${t("What are the three things you're most grateful for today?")}</p>
        </div>
        <div class="row">
          <a class="btn btn-soft" href="#/reflection">${t('Reflect now')}</a>
          <button type="button" class="btn btn-ghost" id="reflect-later">${t('Not tonight')}</button>
        </div>
      </section>` : ''}

    <section class="card inspire" aria-labelledby="inspire-title">
      <h2 id="inspire-title"><span aria-hidden="true">✨</span> ${t('Need inspiration?')}</h2>
      <p class="prompt-text" id="prompt-text" aria-live="polite">“${esc(t(prompt.text))}”</p>
      <div class="row wrap">
        <button type="button" class="btn btn-soft" id="use-prompt">${t('Use this prompt')}</button>
        <button type="button" class="btn btn-ghost" id="another-prompt">${t('Give me another prompt')} <span aria-hidden="true">→</span></button>
      </div>
      <h3 class="chips-title">${t('Quick ideas')}</h3>
      <div class="chips" role="group" aria-label="${t('Quick gratitude ideas')}">
        ${QUICK_CHIPS.map((id) => {
          const c = CATEGORIES[id];
          return `<button type="button" class="chip ${activeChip === id ? 'is-active' : ''}" data-chip="${id}" aria-pressed="${activeChip === id}">
              <span aria-hidden="true">${c.emoji}</span> ${esc(chipName(id))}</button>`;
        }).join('')}
      </div>
    </section>

    <section class="card today" aria-labelledby="today-title">
      <div class="today-head">
        <h2 id="today-title">${t("Today's Gratitude")}</h2>
        <a href="#/journal" class="link">${t('View journal')}</a>
      </div>
      <div class="stat-row">
        <div class="stat"><span class="stat-num">${s.today}</span><span class="stat-label">${tn(s.today, 'moment recorded', 'moments recorded')}</span></div>
        <div class="stat streak"><span class="stat-num"><span aria-hidden="true">🔥</span> ${s.streak}</span><span class="stat-label">${tn(s.streak, 'day in a row', 'days in a row')}</span></div>
        <div class="stat"><span class="stat-num">${s.thisWeek}</span><span class="stat-label">${t('this week')}</span></div>
      </div>
      ${s.streak === 0 ? `<p class="encourage">${t('Today is another opportunity to begin.')} 🌱</p>` : s.today === 0 ? `<p class="encourage">${t('Add one gratitude today to keep your rhythm going.')}</p>` : ''}
      ${latest ? `<h3 class="sub-title">${t('Most recent')}</h3><div class="entry-list" id="latest-list">${entryCard(latest, { showDate: dayKey(latest.createdAt) !== dayKey(now), compact: true })}</div>` : `<p class="muted">${t('Your first gratitude will appear here.')}</p>`}
      ${state.challenge ? '' : `<p class="small"><a class="link" href="#/challenges">✨ ${t('Try a 7-day gratitude challenge')}</a></p>`}
      ${ctx.store.reflectionFor(dayKey(now)) ? `<p class="muted small">🌙 ${t('Today’s reflection is saved.')} <a class="link" href="#/reflection">${t('Edit it')}</a></p>` : `<p class="small"><a class="link" href="#/reflection">🌙 ${t('Write today’s three-gratitude reflection')}</a></p>`}
    </section>

    ${memory ? `<section class="card memory" aria-labelledby="memory-title">
        <h2 id="memory-title"><span aria-hidden="true">🕰️</span> ${esc(memory.label)}</h2>
        <p class="memory-text">“${esc(memory.entry.text)}”</p>
        <p class="muted small">${esc(new Date(memory.entry.createdAt).toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        <button type="button" class="btn btn-ghost small" id="hide-memory">${t('Hide for today')}</button>
      </section>` : ''}
  </div>`;
}

export function mount(root, ctx, params) {
  const { store } = ctx;
  bindHeader(root, ctx);
  const ta = root.querySelector('#gratitude-text');
  const saveBtn = root.querySelector('#save-btn');

  const syncSaveState = () => {
    saveBtn.classList.toggle('is-empty', !ta.value.trim());
  };
  ta.addEventListener('input', () => {
    draft.text = ta.value;
    saveDraft();
    syncSaveState();
  });
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      save();
    }
  });

  root.querySelector('#type-btn').addEventListener('click', () => {
    if (listening) voice?.stop();
    ta.focus();
  });
  root.querySelector('#say-btn').addEventListener('click', () => startOrStopVoice(ctx));

  root.querySelector('#entry-theme').addEventListener('change', (ev) => {
    draft.category = ev.target.value;
    saveDraft();
    refreshWords();
  });
  makeMoodDeselectable(root.querySelector('.compose'), (m) => {
    draft.mood = m;
    saveDraft();
  });
  root.querySelector('#clear-prompt')?.addEventListener('click', () => {
    draft.promptUsed = null;
    draft.promptCategory = null;
    saveDraft();
    ctx.rerender();
    document.getElementById('gratitude-text')?.focus();
  });

  function save() {
    const text = ta.value.trim();
    if (!text) {
      ack = '';
      const el = root.querySelector('#save-ack');
      el.textContent = t('Write or say a few words first — even one small thing is enough.');
      el.classList.add('show', 'is-hint');
      ta.focus();
      return;
    }
    if (listening) voice?.stop();
    const before = milestoneStatus(store.state.entries).filter((m) => m.achieved).map((m) => m.id);
    const challengeWasFinished = Boolean(challengeProgress(store.state.challenge)?.finished);
    store.addEntry({
      text,
      category: draft.category || null,
      mood: draft.mood,
      source: draft.usedVoice ? 'voice' : 'typed',
      promptUsed: draft.promptUsed,
    });
    const reached = milestoneStatus(store.state.entries).find((m) => m.achieved && !before.includes(m.id));
    const challengeBefore = challengeWasFinished;
    const cp = challengeProgress(store.state.challenge);
    lastSaved = { text, date: new Date() };
    resetDraft();
    activeChip = null;
    ack = t(SAVE_ACKNOWLEDGEMENTS[store.state.entries.length === 1 ? 0 : Math.floor(Math.random() * SAVE_ACKNOWLEDGEMENTS.length)]);
    if (reached) ack += ` ${reached.emoji} ${t('Milestone: {name}.', { name: t(reached.label) })}`;
    if (cp?.finished && !challengeBefore) ack += ` 🎉 ${t('You completed the {challenge}!', { challenge: t(cp.challenge.title) })}`;
    else if (cp && cp.doneToday) ack += ` ${t('Challenge day {day} of {total} done.', { day: cp.dayNumber, total: cp.total })}`;
    clearTimeout(ackTimer);
    ackTimer = setTimeout(() => {
      ack = '';
      lastSaved = null;
      document.getElementById('save-ack')?.classList.remove('show');
      document.getElementById('share-last')?.remove();
    }, 9000);
    ctx.rerender();
    document.getElementById('save-btn')?.focus();
  }
  saveBtn.addEventListener('click', save);

  root.querySelector('#word-ideas').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-word]');
    if (!chip) return;
    ta.value = addIdea(ta.value, chip.dataset.word);
    draft.text = ta.value;
    saveDraft();
    syncSaveState();
    announce(t("Added {word}. Save when you're ready.", { word: chip.dataset.word }));
  });

  root.querySelector('#heart-btn').addEventListener('click', () => {
    if (listening) voice?.stop();
    store.addEntry({
      text: t('Gave thanks silently in my heart'),
      source: 'heart',
      category: draft.category || null,
      mood: draft.mood,
      inferTheme: false,
      promptUsed: draft.promptUsed,
    });
    ack = t('A quiet thank-you, counted. 🤍');
    clearTimeout(ackTimer);
    ackTimer = setTimeout(() => {
      ack = '';
      document.getElementById('save-ack')?.classList.remove('show');
    }, 6000);
    ctx.rerender();
    document.getElementById('heart-btn')?.focus();
  });

  root.querySelector('#another-prompt').addEventListener('click', () => {
    newPrompt(ctx, activeChip || undefined);
    root.querySelector('#prompt-text').textContent = `“${t(prompt.text)}”`;
    if (!draft.promptUsed) refreshWords();
  });
  root.querySelector('#use-prompt').addEventListener('click', () => usePrompt(ctx));
  root.querySelectorAll('[data-chip]').forEach((chip) =>
    chip.addEventListener('click', () => {
      const id = chip.dataset.chip;
      activeChip = id;
      newPrompt(ctx, id);
      draft.category = id;
      usePrompt(ctx);
    })
  );

  root.querySelector('#hide-memory')?.addEventListener('click', () => store.updateUi({ memoryHiddenOn: dayKey(new Date()) }));
  root.querySelector('#reflect-later')?.addEventListener('click', () => store.updateUi({ reflectionDismissedOn: dayKey(new Date()) }));

  const latest = root.querySelector('#latest-list');
  if (latest) bindEntryActions(latest, store);

  root.querySelector('#share-last')?.addEventListener('click', () => lastSaved && shareDialog(lastSaved));
  root.querySelector('#open-pause').addEventListener('click', () =>
    openPause({
      onWrite: () => {
        const field = document.getElementById('gratitude-text');
        field?.focus();
        field?.scrollIntoView({ block: 'center' });
      },
    })
  );
  root.querySelector('#use-challenge')?.addEventListener('click', () => useChallengePrompt(ctx));
  bindNudges(root, ctx);
  if (params.challenge) {
    history.replaceState(null, '', '#/home');
    useChallengePrompt(ctx);
    return;
  }

  if (params.focus) {
    ta.focus({ preventScroll: true });
    root.querySelector('.compose').scrollIntoView({ block: 'center' });
    history.replaceState(null, '', '#/home');
  }
}

function currentPlatform() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return installPlatform({ userAgent: navigator.userAgent, standalone, maxTouchPoints: navigator.maxTouchPoints || 0 });
}

function nudgesHtml(ctx) {
  const { state } = ctx.store;
  const ui = state.ui;
  let out = '';
  if (backupDue({ entries: state.entries, lastBackupAt: ui.lastBackupAt, snoozedAt: ui.backupSnoozedAt })) {
    out += `<section class="card nudge backup-nudge" aria-labelledby="backup-title">
      <h2 id="backup-title"><span aria-hidden="true">💾</span> ${t('Keep your journal safe')}</h2>
      <p class="muted small">${t('Your entries live only on this phone. Save a backup now and then, so a lost or new phone never means lost memories.')}</p>
      <div class="row wrap">
        <button type="button" class="btn btn-primary small" id="backup-now">${t('Save a backup')}</button>
        <button type="button" class="btn btn-ghost small" id="backup-later">${t('Later')}</button>
      </div>
    </section>`;
  }
  const platform = currentPlatform();
  if (shouldShowInstall({ platform, entriesCount: state.entries.length, dismissed: ui.installDismissed })) {
    const canPrompt = Boolean(globalThis.__gmInstallPrompt);
    const steps = {
      ios: [t('Tap the Share button (the square with an arrow) at the bottom of Safari.'), t('Choose “Add to Home Screen”.'), t('Tap “Add”.')],
      android: [t('Tap the ⋮ menu at the top right of Chrome.'), t('Choose “Install app” or “Add to Home screen”.'), t('Tap “Install”.')],
      desktop: [t('In Chrome or Edge, click the install icon at the right of the address bar.'), t('Choose “Install”.')],
    }[platform];
    out += `<section class="card nudge install-nudge" aria-labelledby="install-title">
      <h2 id="install-title"><span aria-hidden="true">📲</span> ${t('Add Gladmoment to your home screen')}</h2>
      <p class="muted small">${t('It opens like an app, works offline, and reminders work better.')}</p>
      ${canPrompt
        ? `<button type="button" class="btn btn-primary small" id="install-now">${t('Install Gladmoment')}</button>`
        : `<ol class="install-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`}
      <button type="button" class="link-btn" id="install-dismiss">${t('Don’t show this again')}</button>
    </section>`;
  }
  return out;
}

function bindNudges(root, ctx) {
  const { store } = ctx;
  root.querySelector('#backup-now')?.addEventListener('click', () => {
    const stamp = dayKey(new Date());
    downloadFile(`gladmoment-${stamp}.json`, JSON.stringify(store.exportData(), null, 2), 'application/json');
    store.updateUi({ lastBackupAt: new Date().toISOString(), backupSnoozedAt: null });
    toast(t('Backup saved to your downloads. Keep it somewhere private.'));
  });
  root.querySelector('#backup-later')?.addEventListener('click', () => {
    store.updateUi({ backupSnoozedAt: new Date().toISOString() });
  });
  root.querySelector('#install-now')?.addEventListener('click', async () => {
    const ev = globalThis.__gmInstallPrompt;
    if (!ev) return;
    ev.prompt();
    const choice = await ev.userChoice.catch(() => null);
    globalThis.__gmInstallPrompt = null;
    if (choice?.outcome === 'accepted') store.updateUi({ installDismissed: true });
    else ctx.rerender();
  });
  root.querySelector('#install-dismiss')?.addEventListener('click', () => store.updateUi({ installDismissed: true }));
}

function challengeHtml(ctx) {
  const p = challengeProgress(ctx.store.state.challenge);
  if (!p || p.finished) {
    return p?.finished
      ? `<section class="card challenge-home"><p class="eyebrow">${t('Challenge complete')} 🎉</p><h2>${esc(t(p.challenge.title))}</h2>
          <a class="btn btn-soft" href="#/challenges">${t('Share it or start another')}</a></section>`
      : '';
  }
  const cat = CATEGORIES[p.today.category];
  return `<section class="card challenge-home" aria-labelledby="challenge-home-title">
    <div class="today-head">
      <p class="eyebrow" id="challenge-home-title"><span aria-hidden="true">${p.challenge.emoji}</span> ${esc(t(p.challenge.title))} · ${t('Day {day} of {total}', { day: p.dayNumber, total: p.total })}</p>
      <a class="link small" href="#/challenges">${t('Progress')}</a>
    </div>
    <div class="challenge-bar" aria-hidden="true"><span style="width:${p.percent}%"></span></div>
    <p class="challenge-prompt"><span aria-hidden="true">${cat.emoji}</span> ${esc(t(p.today.prompt))}</p>
    ${p.doneToday
      ? `<p class="encourage">${t('Day {day} done ✓ See you tomorrow for day {next}.', { day: p.dayNumber, next: p.dayNumber + 1 })}</p>`
      : `<button type="button" class="btn btn-soft" id="use-challenge">${t('Use today’s theme')}</button>`}
  </section>`;
}

function useChallengePrompt(ctx) {
  const p = challengeProgress(ctx.store.state.challenge);
  if (!p || p.finished) return;
  draft.promptUsed = t(p.today.prompt);
  draft.promptCategory = p.today.category;
  draft.category = p.today.category;
  saveDraft();
  ctx.rerender();
  const ta = document.getElementById('gratitude-text');
  ta?.focus();
  ta?.scrollIntoView({ block: 'center' });
}

function usePrompt(ctx) {
  draft.promptUsed = t(prompt.text);
  draft.promptCategory = prompt.category;
  saveDraft();
  ctx.rerender();
  const ta = document.getElementById('gratitude-text');
  ta?.focus();
  ta?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

async function startOrStopVoice(ctx) {
  if (!voice) return;
  if (listening) {
    voice.stop();
    return;
  }
  if (!voiceSupported()) {
    voiceMessage = t('Voice input isn’t supported in this browser. Try Chrome, Edge or Safari, or simply type.');
    updateVoiceUi();
    return;
  }
  const prefs = ctx.store.state.user.preferences;
  if (!prefs.voiceNoticeAccepted) {
    const { confirmDialog } = await import('../ui.js');
    const ok = await confirmDialog({
      title: t('Use your voice?'),
      body: t('Your browser will ask for microphone permission. The app only listens while “Listening…” is shown and stops when you tap Stop. Some browsers (such as Chrome) convert speech to text using their own online service, so your spoken words may be sent to the browser maker for transcription. Nothing is recorded or stored except the text you choose to save.'),
      confirmLabel: t('Start listening'),
      cancelLabel: t('Not now'),
    });
    if (!ok) return;
    ctx.store.updatePreferences({ voiceNoticeAccepted: true });
  }
  voice.start();
}
