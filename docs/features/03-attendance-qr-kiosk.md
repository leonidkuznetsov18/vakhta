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
  HH:MM" and the reason. Departure closes presence; the shift must be closed first.

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

## Reserve channel

If the terminal is down, the shift master opens the shift from the panel ("Оперативная смена →
Открыть смену сотруднику", comment required, optional zone). It counts as a reserve arrival and
is visible in the "Использование бота" report.

## Typical questions

- "QR does not open the bot": the phone must have Telegram installed and the account linked; scan
  again if the code rotated; ask the master to open the shift from the panel as a last resort.
- "It says already arrived": presence is open; departure is recorded at the end of the shift.
