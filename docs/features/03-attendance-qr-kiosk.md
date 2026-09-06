# Attendance by QR and the kiosk

## How arrival and departure are recorded (spec 4.2)

- The kiosk tablet at the checkpoint shows a QR that changes every 45 seconds (QR_ROTATION_SECONDS)
  and is valid for 90 seconds. It is a deep link into the worker bot with a one-time challenge.
- The employee scans it with the phone camera; the bot opens and records ARRIVE or DEPART for the
  employee linked to that Telegram account. A challenge is used once; a stale one is refused with a
  clear message and the employee scans again.
- The home screen then shows "Вы на работе с HH:MM" and, when a shift can start, the "Начать смену"
  button. Departure closes presence; the shift must be closed first.

## Kiosk pairing (no tokens)

Administration → Терминалы → "Зарегистрировать терминал" (name, site, checkpoint: entry, exit or
both). The panel shows an 8-character pairing code (15 minutes, single use) and a link for the
tablet. On the tablet open kiosk.vakhta.xyz, type the code (or open the link); the kiosk stores its
device token in the browser and starts showing QR codes. "Код подключения" issues a new code (the
old tablet stops), "Отключить" pauses the terminal, "Удалить" is allowed while it has no history.
The kiosk shows the clock, the date, the terminal name and the last sync; a "Fullscreen" button
keeps the screen on.

## Reserve channel

If the terminal is down, the shift master opens the shift from the panel ("Оперативная смена →
Открыть смену сотруднику", comment required, optional zone). It counts as a reserve arrival and
is visible in the "Использование бота" report.

## Typical questions

- "QR does not open the bot": the phone must have Telegram installed and the account linked; scan
  again if the code rotated; ask the master to open the shift from the panel as a last resort.
- "It says already arrived": presence is open; departure is recorded at the end of the shift.
