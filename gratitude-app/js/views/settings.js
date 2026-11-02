// Settings: reminders, notifications, appearance, personalisation, privacy & data.
import { esc, icons, pageHeader, toast, confirmDialog, downloadFile } from '../ui.js';
import { FREQUENCY_OPTIONS, validateReminderSettings, slotsForDay, isPaused, defaultReminderSettings } from '../schedule.js';
import { notificationSupport, requestNotificationPermission, vibrationSupported, showWebNotification } from '../notifications.js';
import { CATEGORIES } from '../prompts.js';
import { formatTime, weekdayName, dayKey, addDays, startOfDay } from '../dates.js';
import { t, tn, getLanguage } from '../i18n.js';
import { entriesToCsv } from '../store.js';
import { BELL_SOUNDS, BELL_VOLUMES, BELL_REPEATS, playBell } from '../sounds.js';
import { describeNext } from './home.js';
import { pushCapability, unsubscribePush, readPushStatus } from '../push.js';

let reminderError = '';

export function title() {
  return `${t('Settings')} · Gladmoment`;
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
    denied: ['🚫', 'Notifications are blocked.', 'That’s okay: you’ll still see a calm in-app reminder while the app is open. To receive device notifications, allow them for this site in your browser settings (usually the lock icon beside the address), then return here.'],
    unsupported: ['ℹ️', 'This browser doesn’t support notifications.', 'You’ll still see in-app reminders while the app is open. Installing the app or using a modern browser enables device notifications.'],
  };
  const [emoji, head, body] = map[p] || map.unsupported;
  return `<div class="perm-box perm-${p}" id="perm-box">
    <p class="perm-head"><span aria-hidden="true">${emoji}</span> ${t(head)}</p>
    <p class="muted small">${t(body)}</p>
    <div class="row wrap">
      ${p === 'default' ? `<button type="button" class="btn btn-primary" id="perm-request">${t('Allow notifications')}</button>` : ''}
      <button type="button" class="btn btn-soft" id="test-reminder">${t('Send a test reminder')}</button>
    </div>
    ${backgroundHtml()}
  </div>`;
}

/** Can reminders reach this phone while Gladmoment is closed? */
function backgroundHtml() {
  const cap = pushCapability();
  const lines = {
    on: ['✅', t('Reminders also arrive when Gladmoment is closed.'), t('They use your phone’s notification sound and volume. Keep notifications for Gladmoment (or your browser) switched on.')],
    'needs-sync': ['⏳', t('Setting up reminders for when Gladmoment is closed…'), ''],
    'needs-permission': ['🔔', t('Allow notifications so reminders can ring even when Gladmoment is closed.'), ''],
    denied: ['🚫', t('Reminders can’t reach you while Gladmoment is closed, because notifications are blocked.'), ''],
    'ios-needs-install': ['📲', t('On iPhone, add Gladmoment to your Home Screen first.'), t('Then open it from the Home Screen icon and allow notifications. iPhones only deliver reminders to apps on the Home Screen.')],
    unsupported: ['ℹ️', t('This browser can’t receive reminders while Gladmoment is closed.'), t('Try Chrome on Android, or Safari on iPhone with Gladmoment added to the Home Screen.')],
    server: ['⚠️', t('Couldn’t reach gemrhythm.com to set up reminders for when Gladmoment is closed.'), t('Check your internet connection. We’ll try again automatically.')],
  }[cap] || ['ℹ️', t('This browser can’t receive reminders while Gladmoment is closed.'), ''];
  return `<div class="bg-reminders" id="bg-reminders">
    <p class="perm-head"><span aria-hidden="true">${lines[0]}</span> ${lines[1]}</p>
    ${lines[2] ? `<p class="muted small">${lines[2]}</p>` : ''}
    ${cap === 'on' ? `<p class="muted small">${t('When Gladmoment is closed, the bell rings about once a minute (3 times, or up to 5 for “Until I respond”) and stops when you tap the reminder or open the app.')}</p>` : ''}
    ${cap === 'on' || cap === 'server' ? `<button type="button" class="btn btn-soft small" id="test-closed">${t('Test with the app closed')}</button>` : ''}
  </div>`;
}

function previewHtml(rs) {
  const now = new Date();
  const next = describeNext(rs, now);
  let label = t('Today');
  let slots = slotsForDay(rs, now);
  if (!slots.length) {
    for (let i = 1; i < 8; i++) {
      const day = addDays(startOfDay(now), i);
      slots = slotsForDay(rs, day);
      if (slots.length) {
        label = i === 1 ? t('Tomorrow') : weekdayName(day.getDay());
        break;
      }
    }
  }
  return `<div class="preview" aria-live="polite" id="reminder-preview">
    <p class="preview-next"><span aria-hidden="true">${next.state === 'on' ? (next.quiet ? '📳' : '🔔') : next.state === 'paused' ? '⏸️' : '🔕'}</span> ${esc(next.text)}</p>
    ${slots.length ? `<p class="muted small">${esc(label)}: ${tn(slots.length, '{n} reminder', '{n} reminders')}: ${slots.slice(0, 12).map((d) => esc(formatTime(d))).join(', ')}${slots.length > 12 ? '…' : ''}</p>` : ''}
  </div>`;
}

export function render(ctx) {
  const { state } = ctx.store;
  const rs = state.reminderSettings;
  const p = state.user.preferences;
  const paused = isPaused(rs);
  const custom = rs.mode === 'custom';
  const intervalOptions = FREQUENCY_OPTIONS.map((o) => radio('freq', String(o.minutes), t(o.label), !custom && rs.intervalMinutes === o.minutes)).join('');
  const lang = p.language || 'auto';

  return `${pageHeader(t('Settings'), t('Make Gladmoment feel like yours'))}
  <div class="page settings">
    <section class="card" id="section-reminders" aria-labelledby="h-reminders">
      <h2 id="h-reminders"><span aria-hidden="true">🔔</span> ${t('Reminder settings')}</h2>
      ${sw('rs-enabled', t('Gratitude reminders'), rs.enabled, { desc: t('Same as the bell on the Home screen.') })}
      ${sw('rs-quiet', t('Vibrate only (quiet mode)'), rs.quiet, { desc: t('For work or school: no sound, just a vibration. Pause and give thanks silently in your heart.') + (vibrationSupported() ? '' : ` ${t('This device can’t vibrate, so reminders arrive silently.')}`) })}
      ${previewHtml(rs)}
      ${rs.enabled
        ? `<div class="pause-box">
          ${paused
            ? `<p>${esc(describeNext(rs).text)}</p><button type="button" class="btn btn-primary" id="rs-resume">${t('Resume reminders')}</button>`
            : `<p class="field-label">${t('Pause reminders')}</p>
               <div class="row wrap">
                 <button type="button" class="btn btn-soft small" data-pause="60">${t('For 1 hour')}</button>
                 <button type="button" class="btn btn-soft small" data-pause="today">${t('For the rest of today')}</button>
                 <button type="button" class="btn btn-soft small" data-pause="forever">${t('Until I resume')}</button>
               </div>`}
        </div>`
        : ''}

      <fieldset class="group">
        <legend class="field-label">${t('How often?')}</legend>
        <div class="radio-grid">${intervalOptions}${radio('freq', 'custom', t('Custom schedule'), custom)}</div>
      </fieldset>

      ${custom
        ? `<fieldset class="group">
          <legend class="field-label">${t('Reminder times')}</legend>
          <p class="muted small">${t('Reminders ring at exactly these times on the days you choose.')}</p>
          <ul class="time-list">
            ${rs.customTimes
              .map(
                (time, i) => `<li>
                <label class="sr-only" for="ct-${i}">${t('Reminder time {n}', { n: i + 1 })}</label>
                <input type="time" class="input time" id="ct-${i}" data-ct="${i}" value="${esc(time)}">
                <button type="button" class="icon-btn" data-ct-remove="${i}" aria-label="${esc(t('Remove reminder at {time}', { time: formatTime(time) }))}" ${rs.customTimes.length <= 1 ? 'disabled' : ''}>${icons.trash}</button>
              </li>`
              )
              .join('')}
          </ul>
          <button type="button" class="btn btn-soft small" id="ct-add" ${rs.customTimes.length >= 24 ? 'disabled' : ''}>+ ${t('Add a time')}</button>
        </fieldset>`
        : `<fieldset class="group">
          <legend class="field-label">${t('Reminders active')}</legend>
          <p class="muted small">${t("No reminders outside these hours, so they won't disturb your sleep.")}</p>
          <div class="time-range">
            <label for="rs-start" class="small">${t('From')}</label>
            <input type="time" class="input time" id="rs-start" value="${esc(rs.activeStart)}">
            <label for="rs-end" class="small">${t('to')}</label>
            <input type="time" class="input time" id="rs-end" value="${esc(rs.activeEnd)}">
          </div>
        </fieldset>`}

      <fieldset class="group">
        <legend class="field-label">${t('Days')}</legend>
        <div class="days" role="group" aria-label="${t('Reminder days')}">
          ${[1, 2, 3, 4, 5, 6, 0]
            .map((d) => `<button type="button" class="day-btn" data-day="${d}" aria-pressed="${rs.days[d]}" aria-label="${esc(weekdayName(d))}">${esc(weekdayName(d, 'short'))}</button>`)
            .join('')}
        </div>
        <div class="row wrap small-gap">
          <button type="button" class="link-btn" data-days="weekdays">${t('Weekdays only')}</button>
          <button type="button" class="link-btn" data-days="weekends">${t('Weekends only')}</button>
          <button type="button" class="link-btn" data-days="all">${t('Every day')}</button>
        </div>
      </fieldset>

      ${custom
        ? ''
        : `<fieldset class="group">
          <legend class="field-label">${t('Weekend settings')}</legend>
          ${sw('rs-weekend', t('Use different hours at weekends'), rs.weekendDifferent, { desc: t('For a slower start on Saturday and Sunday.') })}
          ${rs.weekendDifferent
            ? `<div class="time-range">
              <label for="rs-wstart" class="small">${t('From')}</label>
              <input type="time" class="input time" id="rs-wstart" value="${esc(rs.weekendStart)}">
              <label for="rs-wend" class="small">${t('to')}</label>
              <input type="time" class="input time" id="rs-wend" value="${esc(rs.weekendEnd)}">
            </div>`
            : ''}
        </fieldset>`}

      <p class="form-error" id="rs-error" role="alert" ${reminderError ? '' : 'hidden'}>${esc(reminderError)}</p>

      <fieldset class="group">
        <legend class="field-label">${t('Notification style')}</legend>
        ${sw('rs-sound', t('Notification sound'), rs.sound && !rs.quiet, { desc: rs.quiet ? t('Off while vibrate-only mode is on.') : '', disabled: rs.quiet })}
        <fieldset class="group">
          <legend class="field-label">${t('Bell sound')}</legend>
          <p class="muted small">${t('Plays in the app when a reminder arrives. Tap ▶ to listen.')}</p>
          <ul class="sound-list">
            ${BELL_SOUNDS.map((b) => `<li class="sound-row">
              <label class="radio-pill sound-pill" for="bell-sound-${b.id}">
                <input type="radio" name="bell-sound" id="bell-sound-${b.id}" value="${b.id}" ${(rs.bellSound || 'clear') === b.id ? 'checked' : ''}>
                <span><strong>${esc(t(b.label))}</strong><small>${esc(t(b.desc))}</small></span>
              </label>
              <button type="button" class="icon-btn play-btn" data-play="${b.id}" aria-label="${esc(t('Play {sound}', { sound: t(b.label) }))}">▶</button>
            </li>`).join('')}
          </ul>
        </fieldset>
        <fieldset class="group">
          <legend class="field-label">${t('Bell volume')}</legend>
          <div class="radio-grid three">
            ${BELL_VOLUMES.map((v) => radio('bell-volume', v.id, t(v.label), (rs.bellVolume || 'loud') === v.id)).join('')}
          </div>
        </fieldset>
        <fieldset class="group">
          <legend class="field-label">${t('Ring')}</legend>
          <div class="radio-grid three">
            ${BELL_REPEATS.map((r) => radio('bell-repeat', r.id, t(r.label), (rs.bellRepeat || 'three') === r.id)).join('')}
          </div>
          <p class="muted small">${t('“Until I respond” rings about every 4 seconds for up to a minute, and stops as soon as you tap the reminder.')}</p>
        </fieldset>
        <p class="muted small">${t('Tip: your phone’s own volume also matters. Turn it up and make sure silent mode is off.')}</p>
        ${sw('rs-vibration', t('Vibration'), rs.vibration, { desc: vibrationSupported() ? t('On supported phones.') : t('Not supported on this device.'), disabled: !vibrationSupported() })}
      </fieldset>
      ${permissionHtml()}
      <button type="button" class="link-btn" id="rs-defaults">${t('Restore default reminder settings')}</button>
    </section>

    <section class="card" id="section-appearance" aria-labelledby="h-appearance">
      <h2 id="h-appearance"><span aria-hidden="true">🎨</span> ${t('Language & appearance')}</h2>
      <fieldset class="group">
        <legend class="field-label">${t('Language')} <span class="muted" lang="${getLanguage() === 'fr' ? 'en' : 'fr'}">· ${getLanguage() === 'fr' ? 'Language' : 'Langue'}</span></legend>
        <div class="radio-grid three">
          ${radio('language', 'auto', t('Automatic'), lang === 'auto')}${radio('language', 'en', '<span lang="en">English</span>', lang === 'en')}${radio('language', 'fr', '<span lang="fr">Français</span>', lang === 'fr')}
        </div>
        <p class="muted small">${t('Automatic follows your phone’s language.')}</p>
      </fieldset>
      <fieldset class="group">
        <legend class="field-label">${t('Theme')}</legend>
        <div class="radio-grid three">
          ${radio('theme', 'system', t('System'), p.theme === 'system')}${radio('theme', 'light', t('Light'), p.theme === 'light')}${radio('theme', 'dark', t('Dark'), p.theme === 'dark')}
        </div>
      </fieldset>
      <fieldset class="group">
        <legend class="field-label">${t('Text size')}</legend>
        <div class="radio-grid three">
          ${radio('textsize', 'normal', t('Standard'), p.textSize === 'normal')}${radio('textsize', 'large', t('Large'), p.textSize === 'large')}${radio('textsize', 'larger', t('Largest'), p.textSize === 'larger')}
        </div>
      </fieldset>
      ${sw('pref-motion', t('Reduce motion'), p.reduceMotion, { desc: t('Turns off animations. Your device’s reduced-motion setting is always respected.') })}
    </section>

    <section class="card" id="section-personal" aria-labelledby="h-personal">
      <h2 id="h-personal"><span aria-hidden="true">🌷</span> ${t('Personalisation')}</h2>
      <label class="field-label" for="pref-name">${t('Your display name')}</label>
      <input type="text" id="pref-name" class="input" maxlength="40" value="${esc(state.user.displayName)}" placeholder="${esc(t('Optional'))}" autocomplete="given-name">
      <fieldset class="group">
        <legend class="field-label">${t('Preferred gratitude categories')}</legend>
        <p class="muted small">${t('Used for inspiration prompts when “Prefer my categories” is chosen.')}</p>
        <div class="chips">
          ${Object.entries(CATEGORIES)
            .map(([id, c]) => `<button type="button" class="chip ${p.preferredCategories.includes(id) ? 'is-active' : ''}" data-pref-cat="${id}" aria-pressed="${p.preferredCategories.includes(id)}"><span aria-hidden="true">${c.emoji}</span> ${esc(t(c.label))}</button>`)
            .join('')}
        </div>
      </fieldset>
      <fieldset class="group">
        <legend class="field-label">${t('Prompt preferences')}</legend>
        <div class="radio-grid">
          ${radio('promptpref', 'all', t('A bit of everything'), p.promptPreference === 'all')}
          ${radio('promptpref', 'preferred', t('Prefer my categories'), p.promptPreference === 'preferred')}
          ${radio('promptpref', 'everyday', t('Small, everyday things'), p.promptPreference === 'everyday')}
        </div>
      </fieldset>
      ${sw('pref-mood', t('Ask how I’m feeling'), p.askMood, { desc: t('Shows the optional mood check-in when saving.') })}
      ${sw('pref-memories', t('Show “A Gratitude From the Past”'), p.showMemories)}
      ${sw('pref-evening', t('Evening reflection prompt'), p.eveningReflection, { desc: t('Invites you to list three gratitudes at the end of the day.') })}
      ${p.eveningReflection ? `<div class="time-range"><label for="pref-rtime" class="small">${t('Show from')}</label><input type="time" id="pref-rtime" class="input time" value="${esc(p.reflectionTime)}"></div>` : ''}
    </section>

    <section class="card" id="section-privacy" aria-labelledby="h-privacy">
      <h2 id="h-privacy"><span aria-hidden="true">${icons.lock}</span> ${t('Privacy & your data')}</h2>
      <div class="privacy-text">
        <p><strong>${t('Your journal stays on this device.')}</strong> ${t('Entries, reflections, moods and settings are saved in this browser’s private storage for this app. There is no account and nothing is uploaded to a server.')}</p>
        <p>${t('Anyone with access to this device and browser profile could open the app, so use your device’s lock screen. Clearing your browser’s site data will erase the journal, so save a backup first if you want to keep it.')}</p>
        <p><strong>${t('Reminders when the app is closed:')}</strong> ${t('to ring your phone while Gladmoment is closed, gemrhythm.com stores your phone’s notification address and your upcoming reminder times (nothing else). Erasing everything removes them.')}</p>
        <p><strong>${t('Voice input:')}</strong> ${t('nothing is recorded or stored. Some browsers (such as Chrome) convert speech to text using their own online service, so spoken words may be processed by the browser maker.')}</p>
      </div>
      <div class="row wrap">
        <button type="button" class="btn btn-soft" id="export-json">${icons.download} ${t('Save a backup')}</button>
        <button type="button" class="btn btn-soft" id="export-csv">${icons.download} ${t('Download as spreadsheet')}</button>
        <label class="btn btn-soft" for="import-file">${icons.upload} ${t('Restore a backup')}</label>
        <input type="file" id="import-file" accept="application/json,.json" class="sr-only">
      </div>
      <p class="muted small">${t('A backup lets you move your journal to a new phone: save it here, then choose “Restore a backup” on the new phone. The spreadsheet opens in Excel or Google Sheets.')}</p>
      <p class="muted small">${t('To delete individual entries, open them in your journal and tap the bin icon.')} <a class="link" href="#/journal">${t('Open my journal')}</a></p>
      <div class="danger-zone">
        <button type="button" class="btn btn-danger-outline" id="delete-all" ${state.entries.length || state.reflections.length ? '' : 'disabled'}>${t('Delete all gratitude history')}</button>
        <button type="button" class="btn btn-danger-outline" id="reset-app">${t('Erase everything & start over')}</button>
      </div>
      <p class="muted small">${t('No account is used, so there is no online account to delete.')} <a class="link" href="./${getLanguage() === 'fr' ? 'privacy-fr.html' : 'privacy.html'}" target="_blank" rel="noopener">${t('Read the privacy policy')}</a></p>
    </section>

    <p class="about muted small">Gladmoment · ${t('works offline')} · ${t('version {v}', { v: '1.8' })}</p>
  </div>`;
}

export function mount(root, ctx, params) {
  const { store } = ctx;
  const rs = () => store.state.reminderSettings;

  function applyReminders(patch) {
    const candidate = { ...rs(), ...patch };
    const errors = validateReminderSettings(candidate);
    if (errors.length) {
      reminderError = t(errors[0]);
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
    toast(ev.target.checked ? t('Reminders on.') : t('Reminders off.'));
  });
  root.querySelector('#rs-resume')?.addEventListener('click', () => {
    store.updateReminders({ pausedUntil: null });
    toast(t('Reminders resumed.'));
  });
  root.querySelectorAll('[data-pause]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.pause;
      let until;
      if (v === 'forever') until = 'forever';
      else if (v === 'today') until = startOfDay(addDays(new Date(), 1)).toISOString();
      else until = new Date(Date.now() + Number(v) * 60000).toISOString();
      store.updateReminders({ pausedUntil: until });
      toast(t('Reminders paused. Resume anytime.'));
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
    toast(ev.target.checked ? t('Vibrate only. Give thanks silently in your heart.') : t('Sound back on.'));
  });
  root.querySelectorAll('input[name="bell-sound"]').forEach((r) =>
    r.addEventListener('change', () => {
      store.updateReminders({ bellSound: r.value, bellSoundChosen: true });
      playBell(r.value, { volume: rs().bellVolume });
    })
  );
  root.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => playBell(b.dataset.play, { volume: rs().bellVolume })));
  root.querySelectorAll('input[name="bell-volume"]').forEach((r) =>
    r.addEventListener('change', () => {
      store.updateReminders({ bellVolume: r.value });
      playBell(rs().bellSound, { volume: r.value });
    })
  );
  root.querySelectorAll('input[name="bell-repeat"]').forEach((r) => r.addEventListener('change', () => store.updateReminders({ bellRepeat: r.value })));
  root.querySelector('#rs-sound').addEventListener('change', (ev) => store.updateReminders({ sound: ev.target.checked }));
  root.querySelector('#rs-vibration').addEventListener('change', (ev) => store.updateReminders({ vibration: ev.target.checked }));
  root.querySelector('#rs-defaults').addEventListener('click', async () => {
    if (await confirmDialog({ title: t('Restore default reminders?'), body: t('Every 2 hours, {start} to {end}, every day.', { start: formatTime('08:00'), end: formatTime('22:00') }), confirmLabel: t('Restore') })) {
      reminderError = '';
      store.updateReminders(defaultReminderSettings());
      toast(t('Default reminder settings restored.'));
    }
  });

  root.querySelector('#perm-request')?.addEventListener('click', async () => {
    const result = await requestNotificationPermission();
    store.setNotificationPermission(result);
    if (result === 'granted') await globalThis.__gmSyncPush?.();
    ctx.rerender();
    toast(result === 'granted' ? t('Notifications allowed. Thank you.') : t('Notifications not allowed. In-app reminders will still appear.'));
  });
  root.querySelector('#test-closed')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const status = await globalThis.__gmSyncPush?.({ extraTimes: [new Date(Date.now() + 60 * 1000)] });
    if (status?.state === 'on') toast(t('Now close Gladmoment (or lock your phone). A test reminder will arrive in about a minute.'), { duration: 10000 });
    else toast(t('Couldn’t reach gemrhythm.com to set up reminders for when Gladmoment is closed.'));
    ctx.rerender();
  });
  root.querySelector('#test-reminder').addEventListener('click', async () => {
    const shown = await showWebNotification(rs());
    ctx.engine.ring(rs());
    ctx.engine.onReminder(new Date(), { visible: true });
    if (shown) toast(t('Test notification sent.'));
  });

  // Appearance
  root.querySelectorAll('input[name="language"]').forEach((r) => r.addEventListener('change', () => store.updatePreferences({ language: r.value })));
  root.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => store.updatePreferences({ theme: r.value })));
  root.querySelectorAll('input[name="textsize"]').forEach((r) => r.addEventListener('change', () => store.updatePreferences({ textSize: r.value })));
  root.querySelector('#pref-motion').addEventListener('change', (ev) => store.updatePreferences({ reduceMotion: ev.target.checked }));

  // Personalisation
  const name = root.querySelector('#pref-name');
  name.addEventListener('change', () => {
    store.updateUser({ displayName: name.value });
    toast(t('Name saved.'));
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
    store.updateUi({ lastBackupAt: new Date().toISOString(), backupSnoozedAt: null });
    toast(t('Backup saved to your downloads. Keep it somewhere private.'));
  });
  root.querySelector('#export-csv').addEventListener('click', () => {
    downloadFile(`gladmoment-${stamp}.csv`, entriesToCsv(store.state.entries), 'text/csv');
    toast(t('Spreadsheet saved to your downloads. Keep it somewhere private.'));
  });
  root.querySelector('#import-file').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const added = store.importData(JSON.parse(await file.text()));
      toast(tn(added, 'Backup restored: {n} gratitude moment added.', 'Backup restored: {n} gratitude moments added.'));
    } catch (err) {
      toast(err.message?.includes('Gladmoment') ? t(err.message) : t('That file couldn’t be restored. Choose a Gladmoment backup file.'));
    }
  });
  root.querySelector('#delete-all').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('Delete all gratitude history?'),
      body: t('This permanently removes {n} entries and all reflections from this device. Your settings are kept. This can’t be undone, so consider saving a backup first.', { n: store.state.entries.length }),
      confirmLabel: t('Delete everything'),
      danger: true,
    });
    if (ok) {
      store.deleteAllHistory();
      toast(t('All gratitude history deleted.'));
    }
  });
  root.querySelector('#reset-app').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('Erase everything?'),
      body: t('All entries, reflections and settings will be removed from this device and the app will start fresh. This can’t be undone.'),
      confirmLabel: t('Erase & start over'),
      danger: true,
    });
    if (ok) {
      await unsubscribePush();
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
