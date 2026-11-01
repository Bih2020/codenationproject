// Home: header with greeting + bell, the gratitude composer, inspiration,
// today's progress, a memory from the past and the evening reflection nudge.
import { esc, icons, entryCard, bindEntryActions, moodPicker, makeMoodDeselectable, categoryOptions, toast, announce } from '../ui.js';
import { CATEGORIES, QUICK_CHIPS, pickPrompt, POSITIVE_MESSAGES, SAVE_ACKNOWLEDGEMENTS } from '../prompts.js';
import { nextReminder, isPaused, pauseEnd } from '../schedule.js';
import { summary, pickMemory, milestoneStatus } from '../stats.js';
import { greetingFor, formatLongDate, formatTime, dayKey, daysBetween, parseTime, WEEKDAYS_LONG } from '../dates.js';
import { createVoiceInput, voiceSupported } from '../voice.js';

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
let ackTimer = null;

function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (d && typeof d.text === 'string') return d;
  } catch { /* ignore */ }
  return { text: '', category: '', mood: null, promptUsed: null, usedVoice: false };
}
function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* ignore */ }
}
function resetDraft() {
  Object.assign(draft, { text: '', category: '', mood: null, promptUsed: null, usedVoice: false });
  saveDraft();
}

function newPrompt(ctx, category) {
  const p = ctx.store.state.user.preferences;
  prompt = pickPrompt({ category, preferred: p.preferredCategories, preference: p.promptPreference, recent: recentPrompts });
  recentPrompts = [prompt.id, ...recentPrompts].slice(0, 25);
}

export function title() {
  return 'Gratitude Moments';
}

export function enter(ctx) {
  if (!prompt) newPrompt(ctx);
  voice = createVoiceInput({
    onStateChange: (on) => {
      listening = on;
      if (on) voiceMessage = '';
      updateVoiceUi();
      announce(on ? 'Listening. Speak your gratitude, then tap stop.' : 'Stopped listening. You can edit the text before saving.');
    },
    onInterim: (t) => {
      interim = t;
      const el = document.getElementById('voice-interim');
      if (el) el.textContent = t;
    },
    onFinal: (t) => {
      if (!t) return;
      const ta = document.getElementById('gratitude-text');
      const base = (ta ? ta.value : draft.text).trimEnd();
      const text = base ? t : t.charAt(0).toUpperCase() + t.slice(1);
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
    btn.querySelector('.btn-label').textContent = listening ? 'Stop' : 'Say it';
    btn.querySelector('.btn-icon').innerHTML = listening ? icons.stop : icons.mic;
    btn.setAttribute('aria-label', listening ? 'Stop voice input' : 'Say it: speak your gratitude using the microphone');
  }
  if (msg) {
    msg.textContent = voiceMessage;
    msg.hidden = !voiceMessage;
  }
}

// ---------- header ----------
export function describeNext(settings, now = new Date()) {
  if (!settings.enabled) return { state: 'off', text: 'Reminders are off', short: 'Reminders off' };
  if (isPaused(settings, now)) {
    const end = pauseEnd(settings);
    if (end === Infinity) return { state: 'paused', text: 'Reminders paused', short: 'Paused' };
    return { state: 'paused', text: `Reminders paused until ${whenLabel(new Date(end), now)}`, short: 'Paused' };
  }
  const next = nextReminder(settings, now);
  if (!next) return { state: 'none', text: 'No upcoming reminders — check your schedule', short: 'None scheduled' };
  return { state: 'on', text: `Next gratitude moment: ${whenLabel(next, now)}`, short: whenLabel(next, now), at: next };
}

function whenLabel(d, now) {
  const diff = daysBetween(now, d);
  const t = formatTime(d);
  if (diff === 0) return t;
  if (diff === 1) return `tomorrow, ${t}`;
  return `${WEEKDAYS_LONG[d.getDay()]}, ${t}`;
}

function headerHtml(ctx) {
  const { state } = ctx.store;
  const now = new Date();
  const g = greetingFor(now);
  const name = state.user.displayName;
  const msg = POSITIVE_MESSAGES[(now.getDate() + now.getMonth()) % POSITIVE_MESSAGES.length];
  const rs = state.reminderSettings;
  const next = describeNext(rs, now);
  const on = rs.enabled;
  const bellLabel = on
    ? `Gratitude reminders are on. ${next.text}. Tap to turn reminders off.`
    : 'Gratitude reminders are off. Tap to turn reminders on.';
  return `<header class="hero" id="hero">
    <div class="hero-blobs" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="hero-top">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">✿</span>
        <div>
          <p class="brand-name">Gratitude Moments</p>
          <p class="brand-date">${esc(formatLongDate(now))}</p>
        </div>
      </div>
      <div class="hero-actions">
        <button type="button" id="bell-toggle" class="hero-icon bell ${on ? 'is-on' : 'is-off'}" aria-pressed="${on}" aria-label="${esc(bellLabel)}" title="${on ? 'Turn reminders off' : 'Turn reminders on'}">
          ${on ? icons.bell : icons.bellOff}
          ${on && next.state === 'on' ? '<span class="bell-dot" aria-hidden="true"></span>' : ''}
        </button>
        <a href="#/settings" class="hero-icon" aria-label="Settings">${icons.settings}</a>
      </div>
    </div>
    <h1 class="greeting" tabindex="-1">${esc(g.text)}${name ? `, ${esc(name)}` : ''} <span aria-hidden="true">${g.emoji}</span></h1>
    <p class="hero-quote">“${esc(msg)}”</p>
    <div class="next-row">
      <a href="#/settings?section=reminders" class="next-chip state-${next.state}" id="next-chip">
        <span aria-hidden="true">${next.state === 'on' ? '🔔' : next.state === 'paused' ? '⏸️' : '🔕'}</span>
        <span>${esc(next.text)}</span>
      </a>
      ${next.state === 'paused' ? '<button type="button" class="chip-btn" id="resume-btn">Resume</button>' : ''}
      ${next.state === 'off' ? '<button type="button" class="chip-btn" id="bell-on-btn">Turn on</button>' : ''}
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
  root.querySelector('#bell-toggle')?.addEventListener('click', () => {
    const enabled = !store.state.reminderSettings.enabled;
    store.updateReminders({ enabled, pausedUntil: null });
    const next = describeNext(store.state.reminderSettings);
    toast(enabled ? `Reminders on. ${next.text}.` : 'Reminders off. Turn them back on anytime with the bell.');
    requestAnimationFrame(() => document.getElementById('bell-toggle')?.focus());
  });
  root.querySelector('#resume-btn')?.addEventListener('click', () => {
    store.updateReminders({ pausedUntil: null });
    toast('Reminders resumed.');
  });
  root.querySelector('#bell-on-btn')?.addEventListener('click', () => {
    store.updateReminders({ enabled: true, pausedUntil: null });
    toast('Reminders on.');
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
      <h2 id="compose-title" class="compose-title">What are you grateful for right now?</h2>
      ${draft.promptUsed ? `<div class="prompt-context">
          <span><span class="sr-only">Using prompt: </span>${esc(draft.promptUsed)}</span>
          <button type="button" class="icon-btn small" id="clear-prompt" aria-label="Stop using this prompt">${icons.close}</button>
        </div>` : ''}
      <div class="input-modes" role="group" aria-label="Choose how to share your gratitude">
        <button type="button" class="mode-btn" id="type-btn">
          <span class="btn-icon">${icons.keyboard}</span><span>Type it</span>
        </button>
        <button type="button" class="mode-btn mic ${listening ? 'is-listening' : ''}" id="say-btn" aria-pressed="${listening}"
          aria-label="${listening ? 'Stop voice input' : 'Say it: speak your gratitude using the microphone'}" ${canSpeak ? '' : 'aria-describedby="voice-unsupported"'}>
          <span class="btn-icon">${listening ? icons.stop : icons.mic}</span><span class="btn-label">${listening ? 'Stop' : 'Say it'}</span>
        </button>
      </div>
      <label for="gratitude-text" class="sr-only">What are you grateful for? Start with: I'm grateful for…</label>
      <textarea id="gratitude-text" class="textarea big" rows="4" maxlength="2000" placeholder="I'm grateful for..." autocomplete="off">${esc(draft.text)}</textarea>
      <div class="voice-status" id="voice-status" role="status" ${listening ? '' : 'hidden'}>
        <span class="rec-dot" aria-hidden="true"></span>
        <strong>🎙 Listening...</strong>
        <span class="interim" id="voice-interim">${esc(interim)}</span>
      </div>
      <p class="voice-message" id="voice-message" role="alert" ${voiceMessage ? '' : 'hidden'}>${esc(voiceMessage)}</p>
      ${canSpeak ? '' : '<p class="hint" id="voice-unsupported">Voice input isn’t supported in this browser — typing works everywhere.</p>'}
      <div class="compose-extras">
        <label class="field-label small" for="entry-theme">Theme <span class="muted">(optional)</span></label>
        <select id="entry-theme" class="select">${categoryOptions(draft.category)}</select>
        ${prefs.askMood ? moodPicker('entry-mood', draft.mood) : ''}
      </div>
      <button type="button" class="btn btn-primary btn-xl ${draft.text.trim() ? '' : 'is-empty'}" id="save-btn">Save Gratitude</button>
      <p class="save-ack ${ack ? 'show' : ''}" id="save-ack" role="status" aria-live="polite">${esc(ack)}</p>
    </section>

    ${reflectionDue ? `<section class="card reflect-nudge" aria-labelledby="reflect-nudge-title">
        <div>
          <h2 id="reflect-nudge-title"><span aria-hidden="true">🌙</span> End-of-day reflection</h2>
          <p class="muted">What are the three things you're most grateful for today?</p>
        </div>
        <div class="row">
          <a class="btn btn-soft" href="#/reflection">Reflect now</a>
          <button type="button" class="btn btn-ghost" id="reflect-later">Not tonight</button>
        </div>
      </section>` : ''}

    <section class="card inspire" aria-labelledby="inspire-title">
      <h2 id="inspire-title"><span aria-hidden="true">✨</span> Need inspiration?</h2>
      <p class="prompt-text" id="prompt-text" aria-live="polite">“${esc(prompt.text)}”</p>
      <div class="row wrap">
        <button type="button" class="btn btn-soft" id="use-prompt">Use this prompt</button>
        <button type="button" class="btn btn-ghost" id="another-prompt">Give me another prompt <span aria-hidden="true">→</span></button>
      </div>
      <h3 class="chips-title">Quick ideas</h3>
      <div class="chips" role="group" aria-label="Quick gratitude ideas">
        ${QUICK_CHIPS.map((id) => {
          const c = CATEGORIES[id];
          return `<button type="button" class="chip ${activeChip === id ? 'is-active' : ''}" data-chip="${id}" aria-pressed="${activeChip === id}">
              <span aria-hidden="true">${c.emoji}</span> ${esc(c.chip || c.label)}</button>`;
        }).join('')}
      </div>
    </section>

    <section class="card today" aria-labelledby="today-title">
      <div class="today-head">
        <h2 id="today-title">Today's Gratitude</h2>
        <a href="#/journal" class="link">View journal</a>
      </div>
      <div class="stat-row">
        <div class="stat"><span class="stat-num">${s.today}</span><span class="stat-label">${s.today === 1 ? 'moment' : 'moments'} recorded</span></div>
        <div class="stat streak"><span class="stat-num"><span aria-hidden="true">🔥</span> ${s.streak}</span><span class="stat-label">${s.streak === 1 ? 'day streak' : 'day streak'}</span></div>
        <div class="stat"><span class="stat-num">${s.thisWeek}</span><span class="stat-label">this week</span></div>
      </div>
      ${s.streak === 0 ? '<p class="encourage">Today is another opportunity to begin. 🌱</p>' : s.today === 0 ? '<p class="encourage">Add one gratitude today to keep your rhythm going.</p>' : ''}
      ${latest ? `<h3 class="sub-title">Most recent</h3><div class="entry-list" id="latest-list">${entryCard(latest, { showDate: dayKey(latest.createdAt) !== dayKey(now), compact: true })}</div>` : '<p class="muted">Your first gratitude will appear here.</p>'}
      ${ctx.store.reflectionFor(dayKey(now)) ? '<p class="muted small">🌙 Today’s reflection is saved. <a class="link" href="#/reflection">Edit it</a></p>' : `<p class="small"><a class="link" href="#/reflection">🌙 Write today’s three-gratitude reflection</a></p>`}
    </section>

    ${memory ? `<section class="card memory" aria-labelledby="memory-title">
        <h2 id="memory-title"><span aria-hidden="true">🕰️</span> ${esc(memory.label)}</h2>
        <p class="memory-text">“${esc(memory.entry.text)}”</p>
        <p class="muted small">${esc(new Date(memory.entry.createdAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        <button type="button" class="btn btn-ghost small" id="hide-memory">Hide for today</button>
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
  });
  makeMoodDeselectable(root.querySelector('.compose'), (m) => {
    draft.mood = m;
    saveDraft();
  });
  root.querySelector('#clear-prompt')?.addEventListener('click', () => {
    draft.promptUsed = null;
    saveDraft();
    ctx.rerender();
    document.getElementById('gratitude-text')?.focus();
  });

  function save() {
    const text = ta.value.trim();
    if (!text) {
      ack = '';
      const el = root.querySelector('#save-ack');
      el.textContent = 'Write or say a few words first — even one small thing is enough.';
      el.classList.add('show', 'is-hint');
      ta.focus();
      return;
    }
    if (listening) voice?.stop();
    const before = milestoneStatus(store.state.entries).filter((m) => m.achieved).map((m) => m.id);
    store.addEntry({
      text,
      category: draft.category || null,
      mood: draft.mood,
      source: draft.usedVoice ? 'voice' : 'typed',
      promptUsed: draft.promptUsed,
    });
    const reached = milestoneStatus(store.state.entries).find((m) => m.achieved && !before.includes(m.id));
    resetDraft();
    activeChip = null;
    ack = SAVE_ACKNOWLEDGEMENTS[store.state.entries.length === 1 ? 0 : Math.floor(Math.random() * SAVE_ACKNOWLEDGEMENTS.length)];
    if (reached) ack += ` ${reached.emoji} Milestone: ${reached.label}.`;
    clearTimeout(ackTimer);
    ackTimer = setTimeout(() => {
      ack = '';
      document.getElementById('save-ack')?.classList.remove('show');
    }, 6000);
    ctx.rerender();
    document.getElementById('save-btn')?.focus();
  }
  saveBtn.addEventListener('click', save);

  root.querySelector('#another-prompt').addEventListener('click', () => {
    newPrompt(ctx, activeChip || undefined);
    root.querySelector('#prompt-text').textContent = `“${prompt.text}”`;
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

  if (params.focus) {
    ta.focus({ preventScroll: true });
    root.querySelector('.compose').scrollIntoView({ block: 'center' });
    history.replaceState(null, '', '#/home');
  }
}

function usePrompt(ctx) {
  draft.promptUsed = prompt.text;
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
    voiceMessage = 'Voice input isn’t supported in this browser. Try Chrome, Edge or Safari — or simply type.';
    updateVoiceUi();
    return;
  }
  const prefs = ctx.store.state.user.preferences;
  if (!prefs.voiceNoticeAccepted) {
    const { confirmDialog } = await import('../ui.js');
    const ok = await confirmDialog({
      title: 'Use your voice?',
      body:
        'Your browser will ask for microphone permission. The app only listens while “Listening…” is shown and stops when you tap Stop. ' +
        'Some browsers (such as Chrome) convert speech to text using their own online service, so your spoken words may be sent to the browser maker for transcription. ' +
        'Nothing is recorded or stored except the text you choose to save.',
      confirmLabel: 'Start listening',
      cancelLabel: 'Not now',
    });
    if (!ok) return;
    ctx.store.updatePreferences({ voiceNoticeAccepted: true });
  }
  voice.start();
}
