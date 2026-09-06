# Activation and the worker bot

## Activation (spec 2.2)

1. HR or the administrator creates the employee in the panel ("Администрирование → Сотрудники →
   Добавить сотрудника": personnel number and full name) or imports a CSV.
2. In the employee row menu (⋯) "Код активации" issues a one-time 8-character code (valid 72
   hours), a deep link to the bot and a QR of that link; a code sheet can be printed for a team.
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
