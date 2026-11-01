// The 1-minute gratitude pause: a calm full-screen moment with a breathing
// circle and a soft soundscape, ending with an invitation to write.
import { BRAND } from './config.js';
import { startSoundscape } from './sounds.js';
import { esc } from './ui.js';

const STEPS = [
  'Breathe in slowly…',
  'Breathe out, and let your shoulders soften.',
  'Think of one good thing from today.',
  'It can be very small: a cup of tea, a kind word, the sky.',
  'Picture it clearly. Stay with it.',
  'Who or what made it possible?',
  'Silently, say thank you.',
  'Notice how that feels.',
];

const DURATION = 60;

/**
 * @param {{ onWrite?: () => void }} opts
 */
export function openPause({ onWrite } = {}) {
  const host = document.createElement('div');
  host.className = 'pause-overlay';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-labelledby', 'pause-title');
  host.innerHTML = `
    <div class="pause-inner">
      <h2 id="pause-title" class="pause-title">A 1-minute gratitude pause</h2>
      <div class="breath" aria-hidden="true"><span class="breath-ring"></span><span class="breath-core"></span></div>
      <p class="pause-step" aria-live="polite" id="pause-step">${esc(STEPS[0])}</p>
      <p class="pause-time" id="pause-time" aria-hidden="true">1:00</p>
      <div class="pause-actions">
        <button type="button" class="btn btn-ghost-light" id="pause-sound" aria-pressed="true">🔈 Sound on</button>
        <button type="button" class="btn btn-ghost-light" id="pause-close">End pause</button>
      </div>
      <div class="pause-done" id="pause-done" hidden>
        <p class="pause-step">Lovely. Would you like to write it down?</p>
        <div class="pause-actions">
          <button type="button" class="btn btn-light" id="pause-write">Write my gratitude</button>
          <button type="button" class="btn btn-ghost-light" id="pause-finish">Not now</button>
        </div>
        <a class="pause-music" href="${esc(BRAND.musicUrl)}" target="_blank" rel="noopener">🎵 Enjoyed the calm? Explore more ${esc(BRAND.siteName)} music</a>
      </div>
    </div>`;
  document.body.appendChild(host);
  document.body.classList.add('no-scroll');
  const previous = document.activeElement;

  let sound = startSoundscape({ trackUrl: BRAND.pauseTrackUrl });
  let soundOn = true;
  let left = DURATION;
  let step = 0;
  const stepEl = host.querySelector('#pause-step');
  const timeEl = host.querySelector('#pause-time');

  const timer = setInterval(() => {
    left -= 1;
    timeEl.textContent = `0:${String(Math.max(0, left)).padStart(2, '0')}`;
    const nextStep = Math.min(STEPS.length - 1, Math.floor(((DURATION - left) / DURATION) * STEPS.length));
    if (nextStep !== step) {
      step = nextStep;
      stepEl.textContent = STEPS[step];
    }
    if (left <= 0) finish();
  }, 1000);

  function finish() {
    clearInterval(timer);
    sound?.stop();
    sound = null;
    host.querySelector('.breath').classList.add('still');
    stepEl.hidden = true;
    timeEl.hidden = true;
    host.querySelector('.pause-actions').hidden = true;
    host.querySelector('#pause-done').hidden = false;
    host.querySelector('#pause-write').focus();
  }

  function close(write) {
    clearInterval(timer);
    sound?.stop();
    document.removeEventListener('keydown', onKey);
    host.remove();
    document.body.classList.remove('no-scroll');
    if (write) onWrite?.();
    else previous?.focus?.();
  }

  function onKey(ev) {
    if (ev.key === 'Escape') close(false);
    if (ev.key === 'Tab') {
      // keep focus inside the pause screen
      const f = [...host.querySelectorAll('button:not([hidden]), a[href]')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', onKey);

  host.querySelector('#pause-sound').addEventListener('click', (ev) => {
    soundOn = !soundOn;
    ev.currentTarget.setAttribute('aria-pressed', String(soundOn));
    ev.currentTarget.textContent = soundOn ? '🔈 Sound on' : '🔇 Sound off';
    if (soundOn) sound = startSoundscape({ trackUrl: BRAND.pauseTrackUrl });
    else {
      sound?.stop();
      sound = null;
    }
  });
  host.querySelector('#pause-close').addEventListener('click', () => close(false));
  host.querySelector('#pause-finish').addEventListener('click', () => close(false));
  host.querySelector('#pause-write').addEventListener('click', () => close(true));
  host.querySelector('#pause-close').focus();
  return { close, finish };
}
