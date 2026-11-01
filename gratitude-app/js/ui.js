// Shared UI helpers: escaping, icons, toasts, dialogs and the entry card.
import { categoryLabel, CATEGORIES } from './prompts.js';
import { moodById, MOODS } from './stats.js';
import { formatTime } from './dates.js';
import { drawCard, shareCard, CARD_STYLES } from './sharecard.js';

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const svg = (path, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${path}</svg>`;

export const icons = {
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  vibrate: svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 8v8M21 8v8M11 18h2"/>'),
  bellOff: svg('<path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M18.6 13A17 17 0 0 1 18 8"/><path d="M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.3-5"/><path d="m2 2 20 20"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  home: svg('<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  heart: svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  heartFilled: svg('<path fill="currentColor" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  keyboard: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8M10 13h4"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  left: svg('<path d="m15 18-6-6 6-6"/>'),
  right: svg('<path d="m9 18 6-6-6-6"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  lock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
};

// ---------- announcements & toasts ----------
let toastTimer = null;
export function toast(message, { action, onAction, duration = 4500 } = {}) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  clearTimeout(toastTimer);
  region.innerHTML = `<div class="toast" role="status">
      <span>${esc(message)}</span>
      ${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}
    </div>`;
  const btn = region.querySelector('.toast-action');
  if (btn) {
    btn.addEventListener('click', () => {
      onAction?.();
      region.innerHTML = '';
    });
  }
  toastTimer = setTimeout(() => {
    region.innerHTML = '';
  }, duration);
}

export function announce(message) {
  const el = document.getElementById('sr-announcer');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => {
    el.textContent = message;
  }, 50);
}

// ---------- dialogs ----------
function openDialog(inner, { labelledBy = 'dialog-title', onClose } = {}) {
  const dlg = document.getElementById('dialog');
  dlg.innerHTML = inner;
  dlg.setAttribute('aria-labelledby', labelledBy);
  const previous = document.activeElement;
  dlg.onclose = () => {
    onClose?.(dlg.returnValue);
    dlg.innerHTML = '';
    previous?.focus?.();
  };
  dlg.onclick = (ev) => {
    if (ev.target === dlg) dlg.close('cancel');
  };
  dlg.showModal();
  return dlg;
}

export function confirmDialog({ title, body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = openDialog(
      `<form method="dialog" class="dialog-card">
        <h2 id="dialog-title">${esc(title)}</h2>
        ${body ? `<p class="muted">${esc(body)}</p>` : ''}
        <div class="dialog-actions">
          <button value="cancel" class="btn btn-ghost">${esc(cancelLabel)}</button>
          <button value="confirm" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(confirmLabel)}</button>
        </div>
      </form>`,
      { onClose: (v) => resolve(v === 'confirm') }
    );
    dlg.querySelector('button[value="cancel"]').focus();
  });
}

/** The bell menu: ring with sound, vibrate only (quiet), or off. Resolves to the chosen mode or null. */
export function bellModeDialog(current, { vibrationSupported = true } = {}) {
  const opt = (value, title, desc) => `<label class="bell-opt" for="bell-${value}">
      <input type="radio" name="bell-mode" id="bell-${value}" value="${value}" ${current === value ? 'checked' : ''}>
      <span class="bell-opt-icon" aria-hidden="true">${value === 'ring' ? icons.bell : value === 'quiet' ? icons.vibrate : icons.bellOff}</span>
      <span class="bell-opt-text"><strong>${title}</strong><span>${desc}</span></span>
    </label>`;
  return new Promise((resolve) => {
    let choice = null;
    const dlg = openDialog(
      `<form method="dialog" class="dialog-card" id="bell-form">
        <h2 id="dialog-title">Gratitude bell</h2>
        <fieldset class="bell-opts"><legend class="sr-only">Choose how reminders reach you</legend>
          ${opt('ring', 'Sound', 'A soft chime and a notification.')}
          ${opt('quiet', 'Vibrate only', `For work or school. No sound: just pause and give thanks silently in your heart.${vibrationSupported ? '' : ' (This device can’t vibrate, so reminders arrive silently.)'}`)}
          ${opt('off', 'Off', 'No reminders until you turn the bell back on.')}
        </fieldset>
        <div class="dialog-actions">
          <button value="cancel" class="btn btn-ghost" formnovalidate>Cancel</button>
          <button value="save" class="btn btn-primary">Done</button>
        </div>
      </form>`,
      { onClose: (v) => resolve(v === 'save' ? choice : null) }
    );
    dlg.querySelector('#bell-form').addEventListener('submit', (ev) => {
      if (ev.submitter?.value === 'save') choice = dlg.querySelector('input[name="bell-mode"]:checked')?.value || null;
    });
    // Choosing an option applies it straight away.
    dlg.querySelectorAll('input[name="bell-mode"]').forEach((r) =>
      r.addEventListener('change', () => {
        choice = r.value;
        dlg.close('save');
      })
    );
    dlg.querySelector('input[name="bell-mode"]:checked')?.focus();
  });
}

/** Preview a gratitude as a picture card, pick a style, then share or save it. */
export function shareDialog({ text, date = new Date(), heading }) {
  let styleId = CARD_STYLES[0].id;
  const canvas = document.createElement('canvas');
  const dlg = openDialog(
    `<div class="dialog-card share-card-dialog">
      <h2 id="dialog-title">Share as a card</h2>
      <img class="card-preview" id="card-preview" alt="Preview of your gratitude card">
      <div class="radio-grid three" role="radiogroup" aria-label="Card style">
        ${CARD_STYLES.map((c, i) => `<label class="radio-pill" for="card-${c.id}"><input type="radio" name="card-style" id="card-${c.id}" value="${c.id}" ${i === 0 ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}
      </div>
      <p class="muted small">Only this picture is shared, and only when you choose. Your journal stays private.</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" id="card-cancel">Close</button>
        <button type="button" class="btn btn-primary" id="card-share">${icons.share} Share</button>
      </div>
    </div>`
  );
  const preview = dlg.querySelector('#card-preview');
  const redraw = () => {
    drawCard(canvas, { text, date, styleId, heading });
    preview.src = canvas.toDataURL('image/png');
  };
  redraw();
  dlg.querySelectorAll('input[name="card-style"]').forEach((r) =>
    r.addEventListener('change', () => {
      styleId = r.value;
      redraw();
    })
  );
  dlg.querySelector('#card-cancel').addEventListener('click', () => dlg.close('cancel'));
  dlg.querySelector('#card-share').addEventListener('click', async () => {
    const result = await shareCard(canvas);
    if (result === 'downloaded') toast('Card saved to your downloads. Share it from your photos or files.');
    else if (result === 'shared') toast('Shared. Thank you for spreading a little gladness. 💛');
    else if (result === 'failed') toast('The card could not be created on this device.');
    if (result === 'shared' || result === 'downloaded') dlg.close('done');
  });
  dlg.querySelector('#card-share').focus();
  return dlg;
}

export function categoryOptions(selected, { includeAuto = true } = {}) {
  return `${includeAuto ? `<option value="">No theme / let the app guess</option>` : ''}${Object.entries(CATEGORIES)
    .map(([id, c]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${c.emoji} ${esc(c.label)}</option>`)
    .join('')}`;
}

export function moodPicker(name, selected, { legend = 'How are you feeling? (optional)' } = {}) {
  return `<fieldset class="mood-picker">
    <legend>${esc(legend)}</legend>
    <div class="mood-options">
      ${MOODS.map(
        (m) => `<label class="mood-option">
          <input type="radio" name="${name}" value="${m.id}" ${m.id === selected ? 'checked' : ''}>
          <span class="mood-face" aria-hidden="true">${m.emoji}</span>
          <span class="mood-label">${esc(m.label)}</span>
        </label>`
      ).join('')}
    </div>
  </fieldset>`;
}

/** Wire radio-buttons so that clicking the selected mood un-selects it (mood is optional). */
export function makeMoodDeselectable(root, onChange) {
  root.querySelectorAll('.mood-option input').forEach((input) => {
    let wasChecked = false;
    input.addEventListener('pointerdown', () => {
      wasChecked = input.checked;
    });
    input.addEventListener('keydown', (ev) => {
      if ((ev.key === ' ' || ev.key === 'Enter') && input.checked) {
        ev.preventDefault();
        input.checked = false;
        onChange?.(null);
      }
    });
    input.addEventListener('click', () => {
      if (wasChecked) {
        input.checked = false;
        wasChecked = false;
        onChange?.(null);
      } else onChange?.(input.value);
    });
  });
}

export function editEntryDialog(entry) {
  return new Promise((resolve) => {
    const dlg = openDialog(
      `<form method="dialog" class="dialog-card" id="edit-form">
        <h2 id="dialog-title">Edit gratitude</h2>
        <label class="field-label" for="edit-text">Your gratitude</label>
        <textarea id="edit-text" class="textarea" rows="5" required>${esc(entry.text)}</textarea>
        <label class="field-label" for="edit-cat">Theme</label>
        <select id="edit-cat" class="select">${categoryOptions(entry.categorySource === 'user' ? entry.category : '')}</select>
        ${moodPicker('edit-mood', entry.mood)}
        <p class="form-error" id="edit-error" role="alert" hidden>Please write something before saving.</p>
        <div class="dialog-actions">
          <button value="cancel" class="btn btn-ghost" formnovalidate>Cancel</button>
          <button value="save" class="btn btn-primary">Save changes</button>
        </div>
      </form>`,
      {
        onClose: (v) => {
          // values captured before innerHTML is cleared
          resolve(v === 'save' ? result : null);
        },
      }
    );
    let result = null;
    let mood = entry.mood;
    makeMoodDeselectable(dlg, (m) => {
      mood = m;
    });
    const form = dlg.querySelector('#edit-form');
    form.addEventListener('submit', (ev) => {
      const text = dlg.querySelector('#edit-text').value.trim();
      if (ev.submitter?.value !== 'save') return;
      if (!text) {
        ev.preventDefault();
        dlg.querySelector('#edit-error').hidden = false;
        return;
      }
      result = { text, category: dlg.querySelector('#edit-cat').value || null, mood };
    });
    const ta = dlg.querySelector('#edit-text');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
}

// ---------- entry card ----------
export function entryCard(e, { showDate = false, compact = false } = {}) {
  const mood = e.mood ? moodById(e.mood) : null;
  const when = new Date(e.createdAt);
  const dateStr = showDate ? `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ` : '';
  const meta = [
    e.category ? `<span class="tag">${esc(categoryLabel(e.category))}</span>` : '',
    mood ? `<span class="tag tag-mood" title="Mood: ${esc(mood.label)}"><span aria-hidden="true">${mood.emoji}</span> ${esc(mood.label)}</span>` : '',
    e.source === 'voice' ? '<span class="tag tag-soft">🎙 Spoken</span>' : '',
    e.source === 'reflection' ? '<span class="tag tag-soft">🌙 Reflection</span>' : '',
    e.source === 'heart' ? '<span class="tag tag-soft">🤍 In my heart</span>' : '',
  ].join('');
  return `<article class="entry-card ${compact ? 'compact' : ''}" data-id="${esc(e.id)}">
    <div class="entry-head">
      <time datetime="${esc(e.createdAt)}" class="entry-time">${dateStr}${esc(formatTime(when))}</time>
      <button type="button" class="icon-btn fav-btn ${e.favourite ? 'is-fav' : ''}" data-action="fav" data-id="${esc(e.id)}"
        aria-pressed="${e.favourite}" aria-label="${e.favourite ? 'Remove from favourites' : 'Add to favourites'}">
        ${e.favourite ? icons.heartFilled : icons.heart}
      </button>
    </div>
    <p class="entry-text">“${esc(e.text)}”</p>
    ${e.promptUsed && e.source !== 'reflection' ? `<p class="entry-prompt">Prompt: ${esc(e.promptUsed)}</p>` : ''}
    <div class="entry-foot">
      <div class="tags">${meta}</div>
      ${compact ? `<div class="entry-actions">
        <button type="button" class="icon-btn" data-action="share" data-id="${esc(e.id)}" aria-label="Share this gratitude as a picture card">${icons.share}</button>
      </div>` : `<div class="entry-actions">
        <button type="button" class="icon-btn" data-action="share" data-id="${esc(e.id)}" aria-label="Share this gratitude as a picture card">${icons.share}</button>
        <button type="button" class="icon-btn" data-action="edit" data-id="${esc(e.id)}" aria-label="Edit this gratitude">${icons.edit}</button>
        <button type="button" class="icon-btn" data-action="delete" data-id="${esc(e.id)}" aria-label="Delete this gratitude">${icons.trash}</button>
      </div>`}
    </div>
  </article>`;
}

/** Delegate favourite/edit/delete clicks for any list of entry cards. */
export function bindEntryActions(root, store) {
  root.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn || !root.contains(btn)) return;
    const id = btn.dataset.id;
    const entry = store.state.entries.find((e) => e.id === id);
    if (!entry) return;
    if (btn.dataset.action === 'fav') {
      store.toggleFavourite(id);
      announce(entry.favourite ? 'Added to favourites' : 'Removed from favourites');
      // re-focus the same button after re-render
      requestAnimationFrame(() => document.querySelector(`button[data-action="fav"][data-id="${CSS.escape(id)}"]`)?.focus());
    } else if (btn.dataset.action === 'share') {
      shareDialog({ text: entry.text, date: entry.createdAt });
    } else if (btn.dataset.action === 'edit') {
      const patch = await editEntryDialog(entry);
      if (patch) {
        store.updateEntry(id, patch);
        toast('Gratitude updated.');
      }
    } else if (btn.dataset.action === 'delete') {
      const ok = await confirmDialog({
        title: 'Delete this gratitude?',
        body: `“${entry.text.slice(0, 120)}${entry.text.length > 120 ? '…' : ''}”`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) {
        const removed = store.deleteEntry(id);
        toast('Gratitude deleted.', { action: 'Undo', onAction: () => store.restoreEntry(removed), duration: 7000 });
      }
    }
  });
}

export function pageHeader(title, subtitle = '') {
  return `<header class="page-header">
    <div class="page-header-inner">
      <h1 class="page-title" tabindex="-1">${esc(title)}</h1>
      ${subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : ''}
    </div>
  </header>`;
}

export function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
