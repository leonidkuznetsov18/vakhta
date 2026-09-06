# Downtime and incidents (spec 5.5)

- "Начать простой" in the bot: reason from the directory, optional comment; the shift goes to
  DOWNTIME, the master is notified and the downtime escalates to the master after the configured
  minutes. "Вернуться" ends it.
- "Сообщить о проблеме": reason, comment or photo when the reason requires it, and the question
  whether work has stopped; a critical reason notifies the master at once.
- Panel "Простои и инциденты": list with statuses (OPEN → IN_PROGRESS → RESOLVED / REJECTED /
  DUPLICATE), SLA deadlines, quick transitions from the row menu, bulk close, statistics per
  reason and zone. The employee is notified when the incident is resolved.
- Reports "Простои" and "Структура времени" show downtime minutes per employee, reason and zone.

Downtime never reduces the bonus score by itself; only missing paperwork does (spec 7.4).
