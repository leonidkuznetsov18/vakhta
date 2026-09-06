# Overview: what Vakhta is

Vakhta ("Вахта") is a shift-accounting system for a 24/7 production site with two 12-hour shifts.
Three parts:

- **Telegram bot for employees** (@vakhta_worker_bot): activation, arrival and departure by QR,
  the shift itself (start, work, breaks, meal, downtime, cleaning, handover, close), requests,
  scores and the personal plan. Everything is driven by buttons under the last bot message.
- **Web admin panel** (panel.vakhta.xyz): operations (live shifts, master actions), schedule,
  incidents, cleanliness and handover, requests, bonus, reports, audit, administration
  (employees, users and roles, directories, terminals, checklists). Roles limit what a user sees.
- **QR kiosk** (kiosk.vakhta.xyz on a tablet at the checkpoint): shows a rotating QR code; the
  employee scans it with the phone camera, the worker bot opens and records arrival or departure.

Languages: Ukrainian, English and Russian. The bot follows the employee's choice (/language),
the panel has a switcher in the sidebar, the kiosk follows ?lang= or the browser.

Time: all instants are server time in the site time zone (Europe/Kyiv by default). The business
date of a night shift is the date the shift started.

Where to look for help: the user guide (PDF, Russian) is linked from the bot under /help and the
"Помощь" button; this assistant answers questions about the bot, the panel and the kiosk.
