// Speech-to-text using the browser's Web Speech API.
// Recording only ever starts from an explicit tap and is always visibly indicated.
// Note: in some browsers (e.g. Chrome) audio is processed by the browser vendor's
// online speech service — the app discloses this before first use.

const Recognition = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

export function voiceSupported() {
  return Boolean(Recognition());
}

export const VOICE_ERRORS = {
  'not-allowed': 'Microphone access is blocked. You can allow it in your browser’s site settings, or simply type instead.',
  'service-not-allowed': 'Voice input isn’t available in this browser right now. You can type instead.',
  'audio-capture': 'No microphone was found. Please check your device, or type instead.',
  'no-speech': "I didn't catch anything. Tap the microphone and try again when you're ready.",
  network: 'Voice input needs an internet connection in this browser. You can type instead.',
  aborted: null,
};

/**
 * @param {{ lang?: string, onInterim?: (t: string) => void, onFinal?: (t: string) => void,
 *           onStateChange?: (listening: boolean) => void, onError?: (message: string, code: string) => void }} handlers
 */
export function createVoiceInput({ lang, onInterim, onFinal, onStateChange, onError } = {}) {
  const Ctor = Recognition();
  let rec = null;
  let listening = false;
  let maxTimer = null;

  function setListening(v) {
    listening = v;
    onStateChange?.(v);
  }

  function stop() {
    clearTimeout(maxTimer);
    if (rec) {
      try {
        rec.stop();
      } catch { /* already stopped */ }
    }
  }

  function start() {
    if (!Ctor) {
      onError?.('Voice input isn’t supported in this browser. Try Chrome, Edge or Safari, or type instead.', 'unsupported');
      return false;
    }
    if (listening) return true;
    rec = new Ctor();
    rec.lang = lang || document.documentElement.lang || navigator.language || 'en-GB';
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) onFinal?.(r[0].transcript.trim());
        else interim += r[0].transcript;
      }
      onInterim?.(interim.trim());
    };
    rec.onerror = (ev) => {
      const msg = VOICE_ERRORS[ev.error] ?? 'Voice input stopped unexpectedly. You can try again or type instead.';
      if (msg) onError?.(msg, ev.error);
    };
    rec.onend = () => {
      clearTimeout(maxTimer);
      onInterim?.('');
      setListening(false);
      rec = null;
    };
    try {
      rec.start();
      // Safety net: never listen for more than 90 seconds.
      maxTimer = setTimeout(stop, 90000);
      return true;
    } catch (err) {
      onError?.('Voice input could not start. Please try again.', 'start-failed');
      rec = null;
      return false;
    }
  }

  // Stop listening if the user leaves the app.
  const onHide = () => document.visibilityState === 'hidden' && stop();
  document.addEventListener('visibilitychange', onHide);

  return {
    start,
    stop,
    get listening() {
      return listening;
    },
    destroy() {
      document.removeEventListener('visibilitychange', onHide);
      stop();
    },
  };
}
