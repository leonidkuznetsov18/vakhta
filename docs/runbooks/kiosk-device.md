# Kiosk device setup

A kiosk is online only while its page runs. Browsers suspend pages they consider idle, and a
suspended page sends nothing: the panel then correctly shows "Нет связи". Configure every kiosk
device so the page is never suspended.

## Required

1. **A dedicated device or window.** The kiosk page is the only visible page, in full screen. Do not
   run the admin panel or other sites as tabs next to it: a background tab is throttled after five
   minutes and can be frozen or discarded.
2. **Never sleep the kiosk site.**
   - Microsoft Edge: policy `SleepingTabsBlockedForUrls` with the kiosk origin (also exempts it from
     efficiency mode and tab discard), or Settings → System and performance → "Never put these
     sites to sleep".
   - Google Chrome: Settings → Performance → Memory saver → "Always keep these sites active", or the
     enterprise policy `TabDiscardingExceptions`.
3. **Keep the device awake.** Disable OS sleep and screen-off on mains power; the kiosk requests a
   screen wake lock, but the OS power plan wins.
4. **A normal browser profile, not InPrivate/Incognito.** The device token lives in the site
   storage; a private session forgets it at every restart and the kiosk asks for a code again.
   Edge's Assigned Access "digital signage" runs InPrivate, so use a normal profile in full-screen
   (`--kiosk <url>` / `--start-fullscreen`) instead.
5. **Start page without a pairing code.** Use the "open kiosk" link from the panel
   (`/?terminal=<id>`), not the one-time `#pair=` link.

## Diagnosing "Нет связи"

- API HTTP logs (Railway, `@path:/kiosk/challenge`) show one request per rotation (45 s) per
  terminal. A gap followed by a page load (`OPTIONS` then `GET`) means the page was suspended or
  reloaded on the device, not a network or server fault.
- Traffic from the same site IP to other endpoints during the gap proves the site network is up.
- `POST /kiosk/pair` answering 401 repeatedly means someone is typing a spent or expired code;
  issue a new one with "Код подключения".

Sources: [Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api),
[intensive timer throttling](https://developer.chrome.com/blog/timer-throttling-in-chrome-88),
[freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver),
[Edge SleepingTabsBlockedForUrls](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/sleepingtabsblockedforurls),
[Edge kiosk mode](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode).
