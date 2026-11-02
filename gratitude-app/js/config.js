// Brand settings. Change these in one place.
export const BRAND = {
  appName: 'Gladmoment',
  siteName: 'Gemrhythm',
  siteUrl: 'https://gemrhythm.com/',
  appUrl: 'gemrhythm.com/gladmoment',
  // Where the "relaxation music" links go (Gemrhythm relaxation playlists).
  musicUrl: 'https://gemrhythm.com/playlist-category/relaxation/',
  // Optional: a relative path to your own MP3 for the 1-minute pause,
  // e.g. 'audio/gratitude-pause.mp3'. When empty, a calm built-in soundscape is used.
  pauseTrackUrl: '',
  // Set from WordPress (Settings → Gladmoment → Pause music) via config.json.
  pauseTracks: [],
};

/** Load settings saved in WordPress (config.json next to the app), if present. */
export async function loadSiteConfig() {
  try {
    const res = await fetch('./config.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const c = await res.json();
    if (typeof c.musicUrl === 'string' && /^https?:\/\//.test(c.musicUrl)) BRAND.musicUrl = c.musicUrl;
    if (Array.isArray(c.pauseTracks)) BRAND.pauseTracks = c.pauseTracks.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  } catch { /* no site settings: use the defaults */ }
}
