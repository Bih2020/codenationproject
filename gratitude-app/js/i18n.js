// Translations. English text is the key; other languages map English → translation.
// Missing translations fall back to English (and a unit test checks none are missing).
import FR from './i18n/fr.js';

const DICTS = { fr: FR };
export const LANGUAGES = [
  { id: 'auto', label: 'Automatic', native: 'Automatic / Automatique' },
  { id: 'en', label: 'English', native: 'English' },
  { id: 'fr', label: 'French', native: 'Français' },
];

let lang = 'en';

/** Resolve a preference ('auto' | 'en' | 'fr') to a language. */
export function detectLanguage(pref = 'auto', nav = globalThis.navigator) {
  if (pref === 'en' || pref === 'fr') return pref;
  const first = String(nav?.languages?.[0] || nav?.language || 'en').toLowerCase();
  return first.startsWith('fr') ? 'fr' : 'en';
}

export function setLanguage(l) {
  lang = l === 'fr' ? 'fr' : 'en';
  if (globalThis.document?.documentElement) document.documentElement.lang = lang === 'fr' ? 'fr' : 'en-GB';
  return lang;
}

export const getLanguage = () => lang;

/** Locale for dates and times: French uses fr-FR; English follows the device. */
export const getLocale = () => (lang === 'fr' ? 'fr-FR' : undefined);

/** Speech-recognition language. */
export const getSpeechLang = () => (lang === 'fr' ? 'fr-FR' : 'en-GB');

function fill(s, vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Translate `key` (English text), filling {placeholders} from `vars`. */
export function t(key, vars) {
  const s = lang === 'en' ? key : DICTS[lang]?.[key] ?? key;
  return fill(s, vars);
}

/** Plural: picks `one` or `other` (French treats 0 and 1 as singular). {n} is filled in. */
export function tn(n, one, other, vars = {}) {
  const single = lang === 'fr' ? Math.abs(n) < 2 : n === 1;
  // When English uses the same words for both forms, the plural translation lives under "<key>#other".
  if (!single && one === other && lang !== 'en' && DICTS[lang]?.[`${other}#other`]) {
    return fill(DICTS[lang][`${other}#other`], { n, ...vars });
  }
  return t(single ? one : other, { n, ...vars });
}

export function hasTranslation(l, key) {
  return Boolean(DICTS[l] && Object.prototype.hasOwnProperty.call(DICTS[l], key));
}
