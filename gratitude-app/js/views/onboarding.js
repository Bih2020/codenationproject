// First-run onboarding: welcome → frequency → active hours → notifications → name → done.
import { esc, icons } from '../ui.js';
import { FREQUENCY_OPTIONS, validateReminderSettings, defaultReminderSettings } from '../schedule.js';
import { notificationSupport, requestNotificationPermission } from '../notifications.js';
import { t, getLanguage } from '../i18n.js';

const STEPS = 6;
let step = 0;
let data = null;
let permission = null;
let error = '';

export function title() {
  return `${t('Welcome')} · Gladmoment`;
}

export function enter() {
  step = 0;
  error = '';
  const d = defaultReminderSettings();
  data = { displayName: '', mode: d.mode, intervalMinutes: d.intervalMinutes, customTimes: [...d.customTimes], activeStart: d.activeStart, activeEnd: d.activeEnd };
  permission = notificationSupport();
}

function stepHtml() {
  switch (step) {
    case 0:
      return `<div class="lang-switch" role="group" aria-label="Language / Langue">
          <button type="button" class="lang-btn" data-lang="en" aria-pressed="${getLanguage() === 'en'}" lang="en">English</button>
          <button type="button" class="lang-btn" data-lang="fr" aria-pressed="${getLanguage() === 'fr'}" lang="fr">Français</button>
        </div>
        <div class="ob-art" aria-hidden="true">✿</div>
        <h1 class="ob-title" tabindex="-1">${t('Welcome')}</h1>
        <p class="ob-lead">${t('Build a habit of noticing the good things already around you.')}</p>
        <ul class="ob-steps">
          <li><span aria-hidden="true">⏸️</span> ${t('Pause')}</li><li><span aria-hidden="true">💭</span> ${t('Reflect')}</li><li><span aria-hidden="true">✍️</span> ${t('Express')}</li><li><span aria-hidden="true">💛</span> ${t('Save')}</li><li><span aria-hidden="true">🌤️</span> ${t('Continue your day')}</li>
        </ul>`;
    case 1:
      return `<h1 class="ob-title" tabindex="-1">${t('How often would you like a gratitude reminder?')}</h1>
        <p class="ob-lead">${t('You can change this anytime in Settings.')}</p>
        <fieldset class="group"><legend class="sr-only">${t('Reminder frequency')}</legend>
          <div class="radio-stack">
            ${FREQUENCY_OPTIONS.filter((o) => o.minutes !== 240)
              .map(
                (o) => `<label class="radio-card" for="ob-f-${o.minutes}"><input type="radio" name="ob-freq" id="ob-f-${o.minutes}" value="${o.minutes}" ${data.mode === 'interval' && data.intervalMinutes === o.minutes ? 'checked' : ''}>
                  <span>${t(o.short)}${o.minutes === 120 ? ` <em class="badge">${t('Recommended')}</em>` : ''}</span></label>`
              )
              .join('')}
            <label class="radio-card" for="ob-f-custom"><input type="radio" name="ob-freq" id="ob-f-custom" value="custom" ${data.mode === 'custom' ? 'checked' : ''}>
              <span>${t('Custom times')}</span></label>
          </div>
        </fieldset>
        ${data.mode === 'custom' ? `<p class="muted small">${esc(t("We'll start with {times}. You can adjust these in Settings.", { times: data.customTimes.join(', ') }))}</p>` : ''}`;
    case 2:
      return `<h1 class="ob-title" tabindex="-1">${t('When should reminders be active?')}</h1>
        <p class="ob-lead">${t("Reminders stay quiet outside these hours, so they won't disturb your sleep.")}</p>
        <div class="time-range big">
          <label for="ob-start">${t('From')}</label><input type="time" id="ob-start" class="input time" value="${esc(data.activeStart)}">
          <label for="ob-end">${t('to')}</label><input type="time" id="ob-end" class="input time" value="${esc(data.activeEnd)}">
        </div>
        ${data.mode === 'custom' ? `<p class="muted small">${t('You chose custom times, which ring exactly when you set them.')}</p>` : ''}`;
    case 3: {
      const msg = {
        granted: `✅ ${t('Notifications are allowed. Thank you!')}`,
        native: `✅ ${t('Notifications are ready.')}`,
        denied: t('Notifications are turned off for now. That’s completely fine: you’ll still see a gentle reminder inside the app while it’s open, and you can allow notifications later in your browser settings.'),
        unsupported: t('This browser doesn’t support notifications. You’ll still see gentle reminders inside the app while it’s open.'),
        default: '',
      }[permission];
      return `<div class="ob-art" aria-hidden="true">🔔</div>
        <h1 class="ob-title" tabindex="-1">${t('Gentle reminders')}</h1>
        <p class="ob-lead">${t("To remind you when it's time for a gratitude moment, your device needs permission to show notifications.")}</p>
        <p class="muted">${t('We only use notifications for your gratitude reminders, never for marketing. You can switch reminders off at any time with the bell.')}</p>
        ${permission === 'default' ? `<button type="button" class="btn btn-primary btn-xl" id="ob-allow">${t('Allow notifications')}</button>` : ''}
        <p class="perm-result" role="status">${esc(msg || '')}</p>`;
    }
    case 4:
      return `<h1 class="ob-title" tabindex="-1">${t('What should we call you?')}</h1>
        <p class="ob-lead">${t("Optional. It's used only for your greeting, on this device.")}</p>
        <label for="ob-name" class="sr-only">${t('Display name')}</label>
        <input type="text" id="ob-name" class="input big" maxlength="40" placeholder="${esc(t('Your name (optional)'))}" value="${esc(data.displayName)}" autocomplete="given-name">`;
    default:
      return `<div class="ob-art" aria-hidden="true">🌅</div>
        <h1 class="ob-title" tabindex="-1">${data.displayName ? esc(t('Your gratitude journey begins, {name}.', { name: data.displayName })) : t('Your gratitude journey begins.')}</h1>
        <p class="ob-lead">${t('Whenever you have a moment, pause and notice one good thing. It only takes a few seconds.')}</p>`;
  }
}

export function render() {
  const last = step === STEPS - 1;
  return `<div class="onboarding">
    <div class="ob-card card">
      <div class="ob-progress" role="progressbar" aria-label="${t('Setup progress')}" aria-valuemin="1" aria-valuemax="${STEPS}" aria-valuenow="${step + 1}">
        ${Array.from({ length: STEPS }, (_, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}
      </div>
      <div class="ob-body">${stepHtml()}</div>
      <p class="form-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
      <div class="ob-actions">
        ${step > 0 && !last ? `<button type="button" class="btn btn-ghost" id="ob-back">${icons.left} ${t('Back')}</button>` : '<span></span>'}
        <button type="button" class="btn btn-primary btn-lg" id="ob-next">${step === 0 ? t('Get started') : last ? t('Go to my gratitude') : step === 3 && permission === 'default' ? t('Maybe later') : step === 4 && !data.displayName ? t('Skip') : t('Continue')}</button>
      </div>
      ${step === 0 ? `<p class="muted small center">🔒 ${t('Your journal stays private on this device.')}</p>` : ''}
    </div>
  </div>`;
}

export function mount(root, ctx) {
  const rerender = () => {
    ctx.rerender();
    document.querySelector('.ob-title')?.focus();
  };
  root.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      ctx.store.updatePreferences({ language: b.dataset.lang });
      requestAnimationFrame(() => document.querySelector(`[data-lang="${b.dataset.lang}"]`)?.focus());
    })
  );
  root.querySelectorAll('input[name="ob-freq"]').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.value === 'custom') data.mode = 'custom';
      else {
        data.mode = 'interval';
        data.intervalMinutes = Number(r.value);
      }
      ctx.rerender();
    })
  );
  root.querySelector('#ob-start')?.addEventListener('change', (e) => (data.activeStart = e.target.value || data.activeStart));
  root.querySelector('#ob-end')?.addEventListener('change', (e) => (data.activeEnd = e.target.value || data.activeEnd));
  root.querySelector('#ob-name')?.addEventListener('input', (e) => {
    data.displayName = e.target.value;
    const next = root.querySelector('#ob-next');
    next.textContent = data.displayName.trim() ? t('Continue') : t('Skip');
  });
  root.querySelector('#ob-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') root.querySelector('#ob-next').click();
  });
  root.querySelector('#ob-allow')?.addEventListener('click', async () => {
    permission = await requestNotificationPermission();
    ctx.rerender();
    document.querySelector('#ob-next')?.focus();
  });
  root.querySelector('#ob-back')?.addEventListener('click', () => {
    error = '';
    step = Math.max(0, step - 1);
    rerender();
  });
  root.querySelector('#ob-next').addEventListener('click', () => {
    error = '';
    if (step === 2) {
      const errs = validateReminderSettings({ ...defaultReminderSettings(), ...data, mode: 'interval' });
      if (errs.length) {
        error = t(errs[0]);
        ctx.rerender();
        return;
      }
    }
    if (step < STEPS - 1) {
      step++;
      rerender();
      if (step === 4) document.getElementById('ob-name')?.focus();
      return;
    }
    ctx.store.completeOnboarding({
      displayName: data.displayName,
      permission,
      reminderSettings: {
        mode: data.mode,
        intervalMinutes: data.intervalMinutes,
        customTimes: data.customTimes,
        activeStart: data.activeStart,
        activeEnd: data.activeEnd,
      },
    });
    ctx.navigate('#/home?focus=1');
  });
}
