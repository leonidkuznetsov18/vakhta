# Attendance by QR and the kiosk

## How arrival and departure are recorded (spec 4.2)

- The kiosk tablet at the checkpoint shows a QR that changes every 45 seconds (QR_ROTATION_SECONDS)
  and is valid for 90 seconds. It is a deep link into the worker bot with a one-time challenge.
- The employee scans it with the phone camera; the bot opens and records ARRIVE or DEPART for the
  employee linked to that Telegram account. A challenge is used once; a stale one is refused with a
  clear message and the employee scans again.
- After "Я на работе" the bot opens the shift at once when one can start (a scheduled shift or
  a master-opened one): the employee sees the shift screen with "Принять зону" / "Начать работу"
  without any intermediate message. When no shift can start, the home screen shows "Вы на работе с
  HH:MM" and the reason. After checklist submission, departure validates the QR and closes the
  shift and presence together. An expired QR leaves both unchanged; scan the current kiosk QR.
  Scanning before submission reminds the employee to finish the checklist.

## Kiosk pairing (no tokens)

Administration → Терминалы → "Зарегистрировать терминал" (name, site, checkpoint: entry, exit or
both). The panel shows an 8-character pairing code (15 minutes, single use) and a link for the
tablet. On the tablet open kiosk.vakhta.xyz, type the code (or open the link); the kiosk stores its
device token in the browser and starts showing QR codes. "Код подключения" issues a new code (the
old tablet stops), "Отключить" pauses the terminal, "Удалить" (reason required) removes it: a
terminal without attendance history is deleted outright, one with history disappears from the
lists and stops issuing QR codes while its records stay in reports and audit.
The kiosk shows the clock, the date, the terminal name and the last sync; a "Fullscreen" button
keeps the screen on. The language buttons in the bottom-left corner (UA / EN / РУ) switch every
text of the screen; the choice is kept in the tablet's browser, and `?lang=` in the URL still
wins for a link prepared by the administrator.

The terminal list shows, for every enabled and paired terminal, whether it is "На связи" or
"Нет связи" right now, with the same rule as the Overview: no QR renewal for more than three
rotations means offline. "Активен" (not disabled) and "Сопряжён с устройством" (has a device
token) never mean online on their own. The "Связь" filter narrows the list; the Overview cards
"Терминал без связи" and "unpaired terminals" open it already filtered.

## Staying connected 24/7

A paired kiosk page that stays open keeps its connection without anyone touching it:

- The pairing link works once. The kiosk removes the code from its address at once, and a spent
  code opened again (a saved start page, a reload) never replaces a working pairing: the kiosk keeps
  its stored token and shows the QR. Only "Код подключения" in the panel replaces a pairing.
- The next QR is due at a wall-clock time, so a hidden or throttled browser tab (timers run once a
  minute) still renews it inside the three-rotation window. Returning to the tab, waking the device,
  restoring the page or the network coming back renews the QR at once.
- A failed request retries after 5, 10, 20, then every 30 seconds with jitter; requests time out
  after 15 seconds. An unreachable tenant configuration is retried in the page every 30 seconds.
- Releases: the API deploys with a health check and no gap; the open kiosk checks every 10 minutes
  whether a new kiosk release is published and reloads into it right after a successful QR renewal.
  The device token is kept across reloads (persistent storage is requested).

What the page cannot do by itself is run while the browser has frozen, put to sleep or discarded
it, or while the device sleeps. Device setup is in `docs/runbooks/kiosk-device.md`.

## Reserve channel

If the terminal is down, the shift master opens the shift from the panel ("Оперативная смена →
Открыть смену сотруднику", comment required, optional zone). It counts as a reserve arrival and
is visible in the "Использование бота" report.

## Typical questions

- "QR does not open the bot": the phone must have Telegram installed and the account linked; scan
  again if the code rotated; ask the master to open the shift from the panel as a last resort.
- "It says already arrived": presence is open; departure is recorded at the end of the shift.
