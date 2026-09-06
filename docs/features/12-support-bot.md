# Support assistant (@vakhta_support_bot)

A separate Telegram bot that answers questions about the worker bot, the admin panel and the
kiosk. It is opened from the "Поддержка" button of the worker bot or directly.

- Available to employees whose Telegram is linked in the worker bot (and to the allow-listed
  administrators). Others are asked to activate the account first.
- Answers in the language of the question. Text questions get text answers; a voice message gets
  a voice answer plus the text, when voice is enabled on the server.
- Knowledge: these feature docs, the user guide and the changelog of the running version; the bot
  says when something is not covered and points to the master or the administrator. It never
  changes data and never sees shifts, scores or personal records.
- /reset clears the conversation context; the context of a chat is kept for one hour.
- Limits: 40 questions per hour per person.
