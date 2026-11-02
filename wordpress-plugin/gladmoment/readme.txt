=== Gladmoment ===
Contributors: gemrhythm
Tags: gratitude, journal, wellbeing, reminders
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.8.0
License: MIT

A gentle gratitude reminder and journal for your visitors.

== Description ==
Activating the plugin installs the Gladmoment app at yoursite.com/gladmoment/.
Visitors can add it to their phone's home screen. Journal entries are stored only
on each visitor's own device; journals are never stored in your WordPress database.

Reminders when the app is closed (push notifications): phones that allow notifications
register an anonymous push address and their upcoming reminder times with your site
(table wp_gladmoment_push). Your site sends each reminder when it is due. For on-time
reminders, add a Hostinger cron job that runs every minute; the exact command is shown
in Settings → Gladmoment.

Shortcodes:
- [gladmoment_landing] : a complete landing section (features, install steps, privacy).
  Add lang="fr" for French: [gladmoment_landing lang="fr"]. Without it, the site language is used.
- [gladmoment_button text="Try our gratitude app"] : a single button.

Deactivating the plugin removes the /gladmoment/ folder it created.

== Changelog ==
= 1.8.0 =
* With the app closed, the bell rings again each minute (3 times, or up to 5 for "Until I respond") and stops when the reminder is tapped, dismissed or the app is opened.
= 1.7.2 =
* Cron job can no longer be answered by the cache (uses POST; reminder check marked no-cache).
* Settings shows what the notification service answered, plus a "Ring all signed-up phones now" test button.
= 1.7.1 =
* The app rings by itself whenever it is running, so a reminder is never missed if the website push is delayed (no double ring).
= 1.7.0 =
* Reminders ring even when Gladmoment is closed (Web Push), on Android and on iPhone (Home Screen app).
= 1.6.0 =
* Clearer, louder bell; pause music from your WordPress media; playlist link on Home.
