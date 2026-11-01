// Settings: reminders, notifications, appearance, personalisation, privacy & data.
import { esc, icons, pageHeader, toast, confirmDialog, downloadFile } from '../ui.js';
import { FREQUENCY_OPTIONS, validateReminderSettings, slotsForDay, isPaused, defaultReminderSettings } from '../schedule.js';
import { notificationSupport, requestNotificationPermission, vibrationSupported, showWebNotification } from '../notifications.js';
import { CATEGORIES } from '../prompts.js';
import { formatTime, WEEKDAYS_SHORT, WEEKDAYS_LONG, dayKey, addDays, startOfDay } from '../dates.js';
import { entriesToCsv } from '../store.js';
import { BELL_SOUNDS, playBell } from '../sounds.js';
import { describeNext } from './home.js';

let reminderError = '';

export function title() {
  return 'Settings · Gladmoment';
}

export function enter() {
  reminderError = '';
}

const sw = (id, label, checked, { desc = '', disabled = false } = {}) => `<div class="switch-row">
    <label for="${id}" class="switch-text">
      <span class="switch-label">${label}</span>
      ${desc ? `<span class="switch-desc">${desc}</span>` : ''}
    </label>
    <input type="checkbox" role="switch" class="switch" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
  </div>`;

const radio = (name, value, label, checked, id = `${name}-${value}`) =>
  `<label class="radio-pill" for="${id}"><input type="radio" id="${id}" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;

function permissionHtml() {
  const p = notificationSupport();
  const map = {
    granted: ['✅', 'Notifications are allowed.', 'Reminders appear as device notifications while the app is open in a tab or installed window, and as a gentle in-app banner while you are using it.'],
    native: ['✅', 'Native notifications available.', 'Reminders are scheduled with the device’s notification system and arrive even when the app is closed.'],
    default: ['🔔', 'Notifications haven’t been allowed yet.', 'Allow notifications so a gentle reminder can appear when it’s time for a gratitude moment.'],
    denied: ['🚫', 'Notifications are blocked.', 'That’s okay — you’ll still see a calm in-app reminder while the app is open. To receive device notifications, allow them for this site in your browser settings (usually the lock icon beside the address), then return here.'],
    unsupported: ['ℹ️', 'This browser doesn’t support notifications.', 'You’ll still see in-app reminders while the app is open. Installing the app or using a modern browser enables device notifications.'],
  };
  const [emoji, head, body] = map[p] || map.unsupported;
  return `<div class="perm-box perm-${p}" id="perm-box">
    <p class="perm-head"><span aria-hidden="true">${emoji}</span> ${head}</p>
    <p class="muted small">${body}</p>
    <div class="row wrap">
      ${p === 'default' ? '<button type="button" class="btn btn-primary" id="perm-request">Allow notifications</button>' : ''}
      <button type="button" class="btn btn-soft" id="test-reminder">Send a test reminder</button>
    </div>
  </div>`;
}

function previewHtml(rs) {
  const now = new Date();
  const today = slotsForDay(rs, now);
  const next = describeNext(rs, now);
  let day = startOfDay(now);
  let label = 'Today';
  let slots = today;
  if (!slots.length) {
    for (let i = 1; i < 8; i++) {
      day = addDays(startOfDay(now), i);
      slots = slotsForDay(rs, day);
      if (slots.length) {
        label = i === 1 ? 'Tomorrow' : WEEKDAYS_LONG[day.getDay()];
        break;
      }
    }
  }
  return `<div class="preview" aria-live="polite" id="reminder-preview">
    <p class="preview-next"><span aria-hidden="true">${next.state === 'on' ? (next.quiet ? '📳' : '🔔') : next.state === 'paused' ? '⏸️' : '🔕'}</span> ${esc(next.text)}</p>
    ${slots.length ? `<p class="muted small">${esc(label)}: ${slots.length} ${slots.length === 1 ? 'reminder' : 'reminders'} — ${slots.slice(0, 12).map((d) => esc(formatTime(d))).join(', ')}${slots.length > 12 ? '…' : ''}</p>` : ''}
  </div>`;
}

export function render(ctx) {
  const { state } = ctx.store;
  const rs = state.reminderSettings;
  const p = state.user.preferences;
  const paused = isPaused(rs);
  const custom = rs.mode === 'custom';
  const intervalOptions = FREQUENCY_OPTIONS.map((o) => radio('freq', String(o.minutes), o.label, !custom && rs.intervalMinutes === o.minutes)).join('');

  return `${pageHeader('Settings', 'Make Gladmoment feel like yours')}
  <div class="page settings">
    <section class="card" id="section-reminders" aria-labelledby="h-reminders">
      <h2 id="h-reminders"><span aria-hidden="true">🔔</span> Reminder settings</h2>
      ${sw('rs-enabled', 'Gratitude reminders', rs.enabled, { desc: 'Same as the bell on the Home screen.' })}
      ${sw('rs-quiet', 'Vibrate only (quiet mode)', rs.quiet, { desc: 'For work or school: no sound, just a vibration. Pause and give thanks silently in your heart.' + (vibrationSupported() ? '' : ' This device can’t vibrate, so reminders arrive silently.') })}
      ${previewHtml(rs)}
      ${rs.enabled
        ? `<div class="pause-box">
          ${paused
            ? `<p>${esc(describeNext(rs).text)}</p><button type="button" class="btn btn-primary" id="rs-resume">Resume reminders</button>`
            : `<p class="field-label">Pause reminders</p>
               <div class="row wrap">
                 <button type="button" class="btn btn-soft small" data-pause="60">For 1 hour</button>
                 <button type="button" class="btn btn-soft small" data-pause="today">For the rest of today</button>
                 <button type="button" class="btn btn-soft small" data-pause="forever">Until I resume</button>
               </div>`}
        </div>`
        : ''}

      <fieldset class="group">
        <legend class="field-label">How often?</legend>
        <div class="radio-grid">${intervalOptions}${radio('freq', 'custom', 'Custom schedule', custom)}</div>
      </fieldset>

      ${custom
        ? `<fieldset class="group">
          <legend class="field-label">Reminder times</legend>
          <p class="muted small">Reminders ring at exactly these times on the days you choose.</p>
          <ul class="time-list">
            ${rs.customTimes
              .map(
                (t, i) => `<li>
                <label class="sr-only" for="ct-${i}">Reminder time ${i + 1}</label>
                <input type="time" class="input time" id="ct-${i}" data-ct="${i}" value="${esc(t)}">
                <button type="button" class="icon-btn" data-ct-remove="${i}" aria-label="Remove reminder at ${esc(formatTime(t))}" ${rs.customTimes.length <= 1 ? 'disabled' : ''}>${icons.trash}</button>
              </li>`
              )
              .join('')}
          </ul>
          <button type="button" class="btn btn-soft small" id="ct-add" ${rs.customTimes.length >= 24 ? 'disabled' : ''}>+ Add a time</button>
        </fieldset>`
        : `<fieldset class="group">
          <legend class="field-label">Reminders active</legend>
          <p class="muted small">No reminders outside these hours, so they won't disturb your sleep.</p>
          <div class="time-range">
            <label for="rs-start" class="small">From</label>
            <input type="time" class="input time" id="rs-start" value="${esc(rs.activeStart)}">
            <label for="rs-end" class="small">to</label>
            <input type="time" class="input time" id="rs-end" value="${esc(rs.activeEnd)}">
          </div>
        </fieldset>`}

      <fieldset class="group">
        <legend class="field-label">Days</legend>
        <div class="days" role="group" aria-label="Reminder days">
          ${[1, 2, 3, 4, 5, 6, 0]
            .map((d) => `<button type="button" class="day-btn" data-day="${d}" aria-pressed="${rs.days[d]}" aria-label="${WEEKDAYS_LONG[d]}">${WEEKDAYS_SHORT[d]}</button>`)
            .join('')}
        </div>
        <div class="row wrap small-gap">
          <button type="button" class="link-btn" data-days="weekdays">Weekdays only</button>
          <button type="button" class="link-btn" data-days="weekends">Weekends only</button>
          <button type="button" class="link-btn" data-days="all">Every day</button>
        </div>
      </fieldset>

      ${custom
        ? ''
        : `<fieldset class="group">
          <legend class="field-label">Weekend settings</legend>
          ${sw('rs-weekend', 'Use different hours at weekends', rs.weekendDifferent, { desc: 'For a slower start on Saturday and Sunday.' })}
          ${rs.weekendDifferent
            ? `<div class="time-range">
              <label for="rs-wstart" class="small">From</label>
              <input type="time" class="input time" id="rs-wstart" value="${esc(rs.weekendStart)}">
              <label for="rs-wend" class="small">to</label>
              <input type="time" class="input time" id="rs-wend" value="${esc(rs.weekendEnd)}">
            </div>`
            : ''}
        </fieldset>`}

      <p class="form-error" id="rs-error" role="alert" ${reminderError ? '' : 'hidden'}>${esc(reminderError)}</p>

      <fieldset class="group">
        <legend class="field-label">Notification style</legend>
        ${sw('rs-sound', 'Notification sound', rs.sound && !rs.quiet, { desc: rs.quiet ? 'Off while vibrate-only mode is on.' : '', disabled: rs.quiet })}
        <fieldset class="group">
          <legend class="field-label">Bell sound</legend>
          <p class="muted small">Plays in the app when a reminder arrives. Tap ▶ to listen.</p>
          <ul class="sound-list">
            ${BELL_SOUNDS.map((b) => `<li class="sound-row">
              <label class="radio-pill sound-pill" for="bell-sound-${b.id}">
                <input type="radio" name="bell-sound" id="bell-sound-${b.id}" value="${b.id}" ${(rs.bellSound || 'bowl') === b.id ? 'checked' : ''}>
                <span><strong>${esc(b.label)}</strong><small>${esc(b.desc)}</small></span>
              </label>
              <button type="button" class="icon-btn play-btn" data-play="${b.id}" aria-label="Play ${esc(b.label)}">▶</button>
            </li>`).join('')}
          </ul>
        </fieldset>
        ${sw('rs-vibration', 'Vibration', rs.vibration, { desc: vibrationSupported() ? 'On supported phones.' : 'Not supported on this device.', disabled: !vibrationSupported() })}
      </fieldset>
      ${permissionHtml()}
      <button type="button" class="link-btn" id="rs-defaults">Restore default reminder settings</button>
    </section>

    <section class="card" id="section-appearance" aria-labelledby="h-appearance">
      <h2 id="h-appearance"><span aria-hidden="true">🎨</span> Appearance</h2>
      <fieldset class="group">
        <legend class="field-label">Theme</legend>
        <div class="radio-grid three">
          ${radio('theme', 'system', 'System', p.theme === 'system')}${radio('theme', 'light', 'Light', p.theme === 'light')}${radio('theme', 'dark', 'Dark', p.theme === 'dark')}
        </div>
      </fieldset>
      <fieldset class="group">
        <legend class="field-label">Text size</legend>
        <div class="radio-grid three">
          ${radio('textsize', 'normal', 'Standard', p.textSize === 'normal')}${radio('textsize', 'large', 'Large', p.textSize === 'large')}${radio('textsize', 'larger', 'Largest', p.textSize === 'larger')}
        </div>
      </fieldset>
      ${sw('pref-motion', 'Reduce motion', p.reduceMotion, { desc: 'Turns off animations. Your device’s reduced-motion setting is always respected.' })}
    </section>

    <section class="card" id="section-personal" aria-labelledby="h-personal">
      <h2 id="h-personal"><span aria-hidden="true">🌷</span> Personalisation</h2>
      <label class="field-label" for="pref-name">Your display name</label>
      <input type="text" id="pref-name" class="input" maxlength="40" value="${esc(state.user.displayName)}" placeholder="Optional" autocomplete="given-name">
      <fieldset class="group">
        <legend class="field-label">Preferred gratitude categories</legend>
        <p class="muted small">Used for inspiration prompts when “Prefer my categories” is chosen.</p>
        <div class="chips">
          ${Object.entries(CATEGORIES)
            .map(([id, c]) => `<button type="button" class="chip ${p.preferredCategories.includes(id) ? 'is-active' : ''}" data-pref-cat="${id}" aria-pressed="${p.preferredCategories.includes(id)}"><span aria-hidden="true">${c.emoji}</span> ${esc(c.label)}</button>`)
            .join('')}
        </div>
      </fieldset>
      <fieldset class="group">
        <legend class="field-label">Prompt preferences</legend>
        <div class="radio-grid">
          ${radio('promptpref', 'all', 'A bit of everything', p.promptPreference === 'all')}
          ${radio('promptpref', 'preferred', 'Prefer my categories', p.promptPreference === 'preferred')}
          ${radio('promptpref', 'everyday', 'Small, everyday things', p.promptPreference === 'everyday')}
        </div>
      </fieldset>
      ${sw('pref-mood', 'Ask how I’m feeling', p.askMood, { desc: 'Shows the optional mood check-in when saving.' })}
      ${sw('pref-memories', 'Show “A Gratitude From the Past”', p.showMemories)}
      ${sw('pref-evening', 'Evening reflection prompt', p.eveningReflection, { desc: 'Invites you to list three gratitudes at the end of the day.' })}
      ${p.eveningReflection ? `<div class="time-range"><label for="pref-rtime" class="small">Show from</label><input type="time" id="pref-rtime" class="input time" value="${esc(p.reflectionTime)}"></div>` : ''}
    </section>

    <section class="card" id="section-privacy" aria-labelledby="h-privacy">
      <h2 id="h-privacy"><span aria-hidden="true">${icons.lock}</span> Privacy &amp; your data</h2>
      <div class="privacy-text">
        <p><strong>Your journal stays on this device.</strong> Entries, reflections, moods and settings are saved in this browser’s private storage for this app. There is no account and nothing is uploaded to a server.</p>
        <p>Anyone with access to this device and browser profile could open the app, so use your device’s lock screen. Clearing your browser’s site data will erase the journal — export a copy first if you want a backup.</p>
        <p><strong>Voice input:</strong> nothing is recorded or stored. Some browsers (such as Chrome) convert speech to text using their own online service, so spoken words may be processed by the browser maker.</p>
      </div>
      <div class="row wrap">
        <button type="button" class="btn btn-soft" id="export-json">${icons.download} Save a backup</button>
        <button type="button" class="btn btn-soft" id="export-csv">${icons.download} Download as spreadsheet</button>
        <label class="btn btn-soft" for="import-file">${icons.upload} Restore a backup</label>
        <input type="file" id="import-file" accept="application/json,.json" class="sr-only">
      </div>
      <p class="muted small">A backup lets you move your journal to a new phone: save it here, then choose “Restore a backup” on the new phone. The spreadsheet opens in Excel or Google Sheets.</p>
      <p class="muted small">To delete individual entries, open them in <a class="link" href="#/journal">your journal</a> and tap the bin icon.</p>
      <div class="danger-zone">
        <button type="button" class="btn btn-danger-outline" id="delete-all" ${state.entries.length || state.reflections.length ? '' : 'disabled'}>Delete all gratitude history</button>
        <button type="button" class="btn btn-danger-outline" id="reset-app">Erase everything &amp; start over</button>
      </div>
      <p class="muted small">No account is used, so there is no online account to delete. <a class="link" href="./privacy.html" target="_blank" rel="noopener">Read the privacy policy</a></p>
    </section>

    <p class="about muted small">Gladmoment · works offline · version 1.0</p>
  </div>`;
}

export function mount(root, ctx, params) {
  const { store } = ctx;
  const rs = () => store.state.reminderSettings;

  function applyReminders(patch) {
    const candidate = { ...rs(), ...patch };
    const errors = validateReminderSettings(candidate);
    if (errors.length) {
      reminderError = errors[0];
      const el = root.querySelector('#rs-error');
      el.textContent = reminderError;
      el.hidden = false;
      return false;
    }
    reminderError = '';
    store.updateReminders(patch);
    return true;
  }

  root.querySelector('#rs-enabled').addEventListener('change', (ev) => {
    store.updateReminders({ enabled: ev.target.checked, pausedUntil: null });
    toast(ev.target.checked ? 'Reminders on.' : 'Reminders off.');
  });
  root.querySelector('#rs-resume')?.addEventListener('click', () => {
    store.updateReminders({ pausedUntil: null });
    toast('Reminders resumed.');
  });
  root.querySelectorAll('[data-pause]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.pause;
      let until;
      if (v === 'forever') until = 'forever';
      else if (v === 'today') until = startOfDay(addDays(new Date(), 1)).toISOString();
      else until = new Date(Date.now() + Number(v) * 60000).toISOString();
      store.updateReminders({ pausedUntil: until });
      toast('Reminders paused. Resume anytime.');
    })
  );
  root.querySelectorAll('input[name="freq"]').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.value === 'custom') applyReminders({ mode: 'custom' });
      else applyReminders({ mode: 'interval', intervalMinutes: Number(r.value) });
    })
  );
  root.querySelectorAll('[data-ct]').forEach((inp) =>
    inp.addEventListener('change', () => {
      if (!inp.value) return;
      const times = [...rs().customTimes];
      times[Number(inp.dataset.ct)] = inp.value;
      applyReminders({ customTimes: [...new Set(times)].sort() });
    })
  );
  root.querySelectorAll('[data-ct-remove]').forEach((b) =>
    b.addEventListener('click', () => {
      const times = rs().customTimes.filter((_, i) => i !== Number(b.dataset.ctRemove));
      applyReminders({ customTimes: times });
    })
  );
  root.querySelector('#ct-add')?.addEventListener('click', () => {
    const times = rs().customTimes;
    const last = times[times.length - 1] || '08:00';
    const [h, m] = last.split(':').map(Number);
    let nh = (h + 2) % 24;
    let candidate = `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    while (times.includes(candidate)) {
      nh = (nh + 1) % 24;
      candidate = `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    applyReminders({ customTimes: [...times, candidate].sort() });
    requestAnimationFrame(() => {
      const idx = store.state.reminderSettings.customTimes.indexOf(candidate);
      document.getElementById(`ct-${idx}`)?.focus();
    });
  });
  const timeField = (id, key) =>
    root.querySelector(id)?.addEventListener('change', (ev) => {
      if (ev.target.value) applyReminders({ [key]: ev.target.value });
    });
  timeField('#rs-start', 'activeStart');
  timeField('#rs-end', 'activeEnd');
  timeField('#rs-wstart', 'weekendStart');
  timeField('#rs-wend', 'weekendEnd');
  root.querySelectorAll('.day-btn').forEach((b) =>
    b.addEventListener('click', () => {
      const days = [...rs().days];
      const d = Number(b.dataset.day);
      days[d] = !days[d];
      if (applyReminders({ days })) requestAnimationFrame(() => document.querySelector(`.day-btn[data-day="${d}"]`)?.focus());
    })
  );
  root.querySelectorAll('[data-days]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.days;
      const days = [0, 1, 2, 3, 4, 5, 6].map((d) => (v === 'all' ? true : v === 'weekdays' ? d >= 1 && d <= 5 : d === 0 || d === 6));
      applyReminders({ days });
    })
  );
  root.querySelector('#rs-weekend')?.addEventListener('change', (ev) => applyReminders({ weekendDifferent: ev.target.checked }));
  root.querySelector('#rs-quiet').addEventListener('change', (ev) => {
    store.updateReminders(ev.target.checked ? { quiet: true, vibration: true } : { quiet: false });
    toast(ev.target.checked ? 'Vibrate only. Give thanks silently in your heart.' : 'Sound back on.');
  });
  root.querySelectorAll('input[name="bell-sound"]').forEach((r) =>
    r.addEventListener('change', () => {
      store.updateReminders({ bellSound: r.value });
      playBell(r.value);
    })
  );
  root.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => playBell(b.dataset.play)));
  root.querySelector('#rs-sound').addEventListener('change', (ev) => store.updateReminders({ sound: ev.target.checked }));
  root.querySelector('#rs-vibration').addEventListener('change', (ev) => store.updateReminders({ vibration: ev.target.checked }));
  root.querySelector('#rs-defaults').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Restore default reminders?', body: 'Every 2 hours, 8:00 AM – 10:00 PM, every day.', confirmLabel: 'Restore' })) {
      reminderError = '';
      store.updateReminders(defaultReminderSettings());
      toast('Default reminder settings restored.');
    }
  });

  root.querySelector('#perm-request')?.addEventListener('click', async () => {
    const result = await requestNotificationPermission();
    store.setNotificationPermission(result);
    ctx.rerender();
    toast(result === 'granted' ? 'Notifications allowed. Thank you.' : 'Notifications not allowed — in-app reminders will still appear.');
  });
  root.querySelector('#test-reminder').addEventListener('click', async () => {
    const shown = await showWebNotification(rs());
    if (!shown) ctx.engine.onReminder(new Date(), { visible: true });
    else toast('Test notification sent.');
  });

  // Appearance
  root.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => store.updatePreferences({ theme: r.value })));
  root.querySelectorAll('input[name="textsize"]').forEach((r) => r.addEventListener('change', () => store.updatePreferences({ textSize: r.value })));
  root.querySelector('#pref-motion').addEventListener('change', (ev) => store.updatePreferences({ reduceMotion: ev.target.checked }));

  // Personalisation
  const name = root.querySelector('#pref-name');
  name.addEventListener('change', () => {
    store.updateUser({ displayName: name.value });
    toast('Name saved.');
  });
  root.querySelectorAll('[data-pref-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.prefCat;
      const cur = store.state.user.preferences.preferredCategories;
      store.updatePreferences({ preferredCategories: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      requestAnimationFrame(() => document.querySelector(`[data-pref-cat="${id}"]`)?.focus());
    })
  );
  root.querySelectorAll('input[name="promptpref"]').forEach((r) => r.addEventListener('change', () => store.updatePreferences({ promptPreference: r.value })));
  root.querySelector('#pref-mood').addEventListener('change', (ev) => store.updatePreferences({ askMood: ev.target.checked }));
  root.querySelector('#pref-memories').addEventListener('change', (ev) => store.updatePreferences({ showMemories: ev.target.checked }));
  root.querySelector('#pref-evening').addEventListener('change', (ev) => store.updatePreferences({ eveningReflection: ev.target.checked }));
  root.querySelector('#pref-rtime')?.addEventListener('change', (ev) => ev.target.value && store.updatePreferences({ reflectionTime: ev.target.value }));

  // Data
  const stamp = dayKey(new Date());
  root.querySelector('#export-json').addEventListener('click', () => {
    downloadFile(`gladmoment-${stamp}.json`, JSON.stringify(store.exportData(), null, 2), 'application/json');
    toast('Backup saved to your downloads. Keep it somewhere private.');
  });
  root.querySelector('#export-csv').addEventListener('click', () => {
    downloadFile(`gladmoment-${stamp}.csv`, entriesToCsv(store.state.entries), 'text/csv');
    toast('Spreadsheet saved to your downloads. Keep it somewhere private.');
  });
  root.querySelector('#import-file').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const added = store.importData(JSON.parse(await file.text()));
      toast(`Backup restored: ${added} gratitude ${added === 1 ? 'moment' : 'moments'} added.`);
    } catch (err) {
      toast(err.message?.includes('Gladmoment') ? err.message : 'That file couldn’t be restored. Choose a Gladmoment backup file.');
    }
  });
  root.querySelector('#delete-all').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete all gratitude history?',
      body: `This permanently removes ${store.state.entries.length} entries and all reflections from this device. Your settings are kept. This can’t be undone — consider exporting first.`,
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (ok) {
      store.deleteAllHistory();
      toast('All gratitude history deleted.');
    }
  });
  root.querySelector('#reset-app').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Erase everything?',
      body: 'All entries, reflections and settings will be removed from this device and the app will start fresh. This can’t be undone.',
      confirmLabel: 'Erase & start over',
      danger: true,
    });
    if (ok) {
      store.resetApp();
      try {
        sessionStorage.clear();
      } catch { /* ignore */ }
      ctx.navigate('#/onboarding');
    }
  });

  if (params.section) {
    document.getElementById(`section-${params.section}`)?.scrollIntoView({ block: 'start' });
    history.replaceState(null, '', '#/settings');
  }
}
