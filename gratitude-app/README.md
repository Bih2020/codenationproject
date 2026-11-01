# Gladmoment 💛

A colourful, calm, mobile-first app that helps you pause during the day and notice something you're grateful for.

**Pause → Reflect → Express → Save → Continue your day.**

It's an installable Progressive Web App (PWA) written in plain HTML, CSS and JavaScript modules. There's no build step and no third-party runtime dependencies, and it works offline. Your journal stays on your device.

---

## Running it

You need Node.js 18 or newer.

```bash
cd gratitude-app
npm start            # → http://localhost:8080
```

Any static web server works (for example `python3 -m http.server 8080`). The app has to be served over `http://localhost` or `https://`. Opening `index.html` straight from the file system won't work, because browsers block ES modules, service workers and notifications on `file://` pages.

**On your phone:** host the folder on any HTTPS static host (GitHub Pages, Netlify and so on), open it, then choose *Add to Home Screen* or *Install app*.

### Tests

```bash
npm test             # 37 unit tests: scheduling, streaks, weekly stats, storage, prompts
npm run test:e2e     # 15 browser tests in headless Chromium (needs the `playwright` package)
```

The browser tests save screenshots to `tests/e2e/screenshots/`.

---

## What's included

| Area | Status |
|---|---|
| Onboarding (welcome → frequency → active hours → notification permission → name → done) | ✅ Works |
| Home: gradient header, date, greeting, daily message, **bell on/off switch**, next reminder, settings | ✅ Works |
| Gratitude entry: type it or say it, optional theme and mood, Save, gentle acknowledgement, Ctrl/⌘+Enter to save | ✅ Works |
| Saving to local storage (survives restarts; corrupt data is backed up; warns in private mode) | ✅ Works |
| "Need inspiration?": 172 prompts in 17 categories, "Give me another prompt", 10 quick-idea chips | ✅ Works |
| Journal: grouped by day, search, filter by theme, mood, date or favourites, month calendar, edit, delete with undo | ✅ Works |
| Favourites page and heart toggle | ✅ Works |
| Reminder settings: 30 min, 1, 2, 3 or 4 hours, custom times, active hours, days of the week, different weekend hours, pause and resume, sound, vibration | ✅ Works |
| Next reminder shown in the header and in settings | ✅ Works |
| Reminders while the app is open (in-app banner, soft chime, vibration) | ✅ Works |
| Device notifications when the app is open in another tab or minimised, with tap-to-open on the entry screen | ✅ Works (once permission is granted) |
| Device notifications when the app is fully closed | ⚠️ Needs native or push setup (see below) |
| Voice to text, with a privacy notice and a clear "🎙 Listening…" indicator | ✅ Works in Chrome, Edge and Safari. Firefox shows "type instead" |
| Mood check-in (optional) and mood insights, with a non-medical disclaimer | ✅ Works |
| Streaks (no penalty until the day is over), "this week" count, milestones | ✅ Works |
| Daily reflection (3 gratitudes, "what made today meaningful?", mood), saved to the journal | ✅ Works |
| Weekly summary (count, top themes, most active day, favourites, day-by-day chart, week navigation) | ✅ Works |
| "A Gratitude From the Past" (your own entries only, favours 1-week, 1, 3 or 6-month and 1-year anniversaries) | ✅ Works |
| Light, dark and system themes, three text sizes, reduce-motion option | ✅ Works |
| Bell sounds (singing bowl, chime, wind chimes, piano, harp), made in the app with no audio files; volume Soft/Medium/Loud (limiter keeps Loud clean); rings once, 3 times or until answered | ✅ Works |
| 1-minute gratitude pause: breathing guide, calm soundscape, link to Gemrhythm relaxation playlists (`js/config.js`); "From Gemrhythm" card on Insights | ✅ Works |
| Shareable gratitude cards (3 styles, 1080×1350) via the phone's share menu, or saved as an image | ✅ Works |
| Gratitude challenges (7, 21, 30 days); missed days never reset progress | ✅ Works |
| WordPress plugin with `[gladmoment_landing]` and `[gladmoment_button]` shortcodes | ✅ Works |
| English and French: follows the phone's language automatically, with a choice on the welcome screen and in Settings → Language; voice input, dates, themes, privacy page and landing page all translated | ✅ Works |
| "Add to home screen" guide (iPhone, Android and computer steps, or a one-tap Install button where the browser allows), shown after the first gratitude and dismissible | ✅ Works |
| Monthly "save a backup" reminder once there are 5+ entries (snoozes for a week) | ✅ Works |
| Link previews for Facebook, WhatsApp, TikTok and X (`icons/og-image.png`, tags in `index.html`) | ✅ Works |
| Save a backup (JSON) or download as a spreadsheet (CSV), restore a backup, delete all history, erase everything | ✅ Works |
| Offline support through the service worker | ✅ Works |

---

## How reminders work, and the native integration still needed

The reminder code is split into layers so that how reminders are delivered can change without touching the rest of the app:

```
js/schedule.js        Pure logic: which times should reminders fire?
                      (interval or custom times, active hours, days, weekend hours, pause, bell on/off)
js/notifications.js   Delivery
   ├─ ReminderEngine  Checks every 20 seconds and fires any reminder time that has just passed
   ├─ Web adapter     Notification API through the service worker (tapping opens #/home?focus=1)
   └─ Native adapter  Capacitor LocalNotifications: schedules the next 14 days whenever settings change
sw.js                 notificationclick → focus or open the app on the entry screen. A `push` handler is ready.
```

**What works today in a browser:** reminders fire on time while the app is open, whether it's in front, in another tab or minimised as an installed PWA. When the app is visible you get a calm in-app banner. Otherwise you get a system notification. Tapping either one opens the gratitude-entry screen.

**What doesn't work in a plain browser:** a web page can't schedule notifications once it's fully closed. Browsers don't offer an API for that. There are two ways to add it:

1. **Native app (recommended):** wrap the app with [Capacitor](https://capacitorjs.com/):
   ```bash
   npm i @capacitor/core @capacitor/cli @capacitor/local-notifications
   npx cap init "Gladmoment" com.example.gratitude --web-dir .
   npx cap add android && npx cap add ios
   ```
   `notifications.js` detects `Capacitor.Plugins.LocalNotifications` automatically. It then schedules the next 60 reminders (up to 14 days ahead) and reschedules whenever settings change. Still to do for this path:
   - Add a notification icon on Android, plus `SCHEDULE_EXACT_ALARM` if you want exact timing on Android 12+.
   - Handle `localNotificationActionPerformed` and navigate to `#/home?focus=1`.
   - Add a microphone usage description on iOS (`NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`).
   - Optionally switch voice input to `@capacitor-community/speech-recognition` so it can work on-device.

   **This adapter has not been tested on a real device yet.**
2. **Web Push:** needs a small server that stores each user's push subscription and reminder schedule and sends pushes on time. `sw.js` already handles `push` events. Note that this means reminder times (not journal content) would be stored on a server, and that should be disclosed.

---

## Languages

All text is English in the code and translated with `t('English text')` (see `js/i18n.js`).
French lives in `tools/fr-ui.mjs` (screens) and `tools/fr-content.mjs` (prompts, word ideas,
challenges and so on, in the same order as the English). Run `node tools/build-fr.mjs` to rebuild
`js/i18n/fr.js`; it stops with a list if anything is untranslated. `npm test` runs it too.
On WordPress, `[gladmoment_landing lang="fr"]` shows the French landing page.

## Privacy

- **Everything is stored locally** in the browser's storage for this app (key `gratitude-moments:v1`). There's no account and no server, and the app makes no network requests apart from loading its own files.
- **Voice:** nothing is recorded or stored. Listening only starts when you tap, is always shown on screen, stops when you leave the app, and stops automatically after 90 seconds. Some browsers (including Chrome) send the audio to the browser maker's speech service to turn it into text. The app explains this before the first use.
- Local storage isn't encrypted. Anyone using the same device and browser profile could open the journal. A passcode lock would be a sensible future feature.
- The insights are for personal reflection only and make no medical or psychological claims.

---

## Data model

Defined in `js/store.js`:

```text
User          { id, displayName, createdAt, onboarded,
                preferences{theme, textSize, reduceMotion, preferredCategories, promptPreference,
                            askMood, showMemories, eveningReflection, reflectionTime},
                notificationSettings{permission} }
ReminderSettings { enabled (bell), pausedUntil, mode: interval|custom, intervalMinutes, customTimes[],
                activeStart, activeEnd, days[7], weekendDifferent, weekendStart, weekendEnd, sound, vibration }
Reminder      { id, userId, frequency, scheduledTime, active, selectedDays[] }   (built from the settings)
GratitudeEntry{ id, userId, text, createdAt, updatedAt, category, categorySource: user|auto,
                mood, favourite, source: typed|voice|reflection, promptUsed, reflectionId }
DailyReflection { id, date, entryIds[3], items[3], reflection, mood, createdAt, updatedAt }
```

## Project structure

```
index.html, css/styles.css, manifest.webmanifest, sw.js, server.js, icons/
js/app.js              Starts the app; router, theme, reminder engine, service worker
js/store.js            Persistent state and actions (add, edit, delete, favourite, reflection, export, import)
js/schedule.js         Reminder maths (pure functions)
js/notifications.js    Reminder delivery (web and native adapters)
js/voice.js            Speech to text
js/stats.js            Streaks, weekly stats, milestones, moods, memories (pure functions)
js/prompts.js          Categories, prompt library, theme guessing
js/ui.js               Escaping, icons, toasts, dialogs, entry card
js/views/*.js          home, journal, insights, week, favourites, settings, onboarding, reflection
tests/unit/*.test.mjs  node:test unit tests
tests/e2e/run.mjs      Playwright browser tests
```

## Publishing Gladmoment

**Live home: https://gemrhythm.com/gladmoment/** (Hostinger, alongside the Gemrhythm WordPress site).
Easiest: in WordPress go to Plugins → Add New → Upload Plugin, upload
`gladmoment-wordpress-plugin.zip` (built by `wordpress-plugin/build.sh`) and activate it. The plugin
copies the app to `/gladmoment/`, adds a `[gladmoment_button]` shortcode, and removes the folder on
deactivation. Alternative: upload `gladmoment-website.zip` in hPanel → File Manager → `public_html`
and extract it. Purge LiteSpeed Cache after each update.

1. **Website (free, works on any phone):** turn on GitHub Pages for the repository
   (Settings → Pages → Deploy from a branch → pick the branch and `/ (root)`).
   The app is then at `https://<user>.github.io/<repo>/gratitude-app/`. People open it and
   choose *Add to Home Screen* or *Install app*. Netlify or Cloudflare Pages work too: drag the
   `gratitude-app` folder onto their dashboard. A custom domain (for example `gladmoment.app`) can point at either.
2. **Google Play:** package the website with [PWABuilder](https://www.pwabuilder.com/) or Capacitor.
   You need a Google Play developer account (one-off fee), a privacy policy URL (`privacy.html`),
   screenshots and the Data safety form (answer: no data collected).
3. **Apple App Store:** wrap with Capacitor and build in Xcode on a Mac. You need the Apple Developer
   Program (yearly fee). Apple rejects apps that are only a website in a wrapper, so add native
   notifications (see above) before submitting.

Before launch: test on real phones, and check that the
name is free in the app stores and the trade mark register.

## Suggested next step

**Wrap the app with Capacitor and test the native adapter on a real iPhone and Android phone.** That's what turns "reminders while the app is open" into dependable reminders across the whole day, which is the core promise of the app. After that, the most valuable additions would be an optional passcode or biometric lock for the journal, and on-device speech recognition.
