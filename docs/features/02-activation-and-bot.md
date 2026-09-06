# Activation and the worker bot

## Activation (spec 2.2)

1. HR or the administrator creates the employee in the panel ("Администрирование → Сотрудники →
   Добавить сотрудника": personnel number and full name) or imports a CSV.
2. The employee card holds the collapsible block "Активация в боте": the steps for the
   administrator, "Выдать код активации" (a one-time 8-character code valid 72 hours, the deep
   link and the QR, with copy buttons), and two send buttons. "Отправить на почту" mails the card
   (code, button with the link, QR inline) to the e-mail of the card; "Отправить в Telegram" sends
   it as a photo with an "Активировать аккаунт" button to the employee's chat with the bot. A bot
   cannot write first, so the Telegram button works once the employee has opened
   @vakhta_worker_bot and pressed Start (the bot remembers everyone who wrote to it); until then
   the panel says so and offers "Поделиться из моего Telegram". Every send issues a fresh code and
   is written to the audit; the row menu "Код активации" opens the card with a new code; a code
   sheet can still be printed for a team.
3. The employee opens @vakhta_worker_bot, presses Start and enters the code (or opens the link /
   scans the QR). The bot links the Telegram account to the employee card and shows the home screen.
4. One Telegram account per employee. "Сменить Telegram" in the panel relinks to a new account;
   "Заблокировать" / "Уволить" close access (the bot answers "access denied").

## Home screen

Greeting with the masked name and personnel number, the next planned shift, unacknowledged
schedule versions, the presence state and the shift screen when a shift is open. Buttons: "Мой
план", "Обращения", "Мои баллы", "Коррекция события", help ("Помощь" opens the user guide),
"Поддержка" opens the support assistant, and the 🌐 language button.

Commands: /start (home), /plan (my plan), /scores (my scores), /requests (my requests),
/language, /help. The bot menu shows them in the employee's language.

## Behaviour

- Stateless: every button carries the action and the version of the shift; an outdated button
  redraws the current screen instead of applying an old action.
- When a master, a terminal or a timer changes the shift, the bot sends a fresh home screen by
  itself; the employee never has to write "Ok" to refresh.
- Free text is accepted only where the bot asks for it (activation code, comment, remark text,
  minutes, period); otherwise it answers "use the buttons".
