# Checklists, photos and zone handover (spec 5.6–5.9)

## Checklists are built in the panel

Administration → "Чек-листы". A checklist has a name, one or more positions (required: a
checklist cannot be saved without a position), an optional zone type and an ordered list of items
of three kinds: check (✅ / ⚠️ remark), message to the next shift (free text) and photo (the
employee must send a photo). At least one photo item is required. "Заполнить по умолчанию"
prefills the standard list of the spec. Editing creates a new version; old reports keep their
version. A checklist can be disabled or deleted while unused.

A position has at most one checklist. Binding a checklist to a position that already has one
replaces the old binding (the position list marks it "сейчас: <name>"); a checklist left without
positions is disabled automatically. The employee card ("Сотрудники" → row) shows the single
"Чек-лист должности" with "Заменить" (pick another checklist, confirm) and "Убрать" (confirm);
when the position has none, an existing checklist can be attached there. The employees table has a
"Чек-лист" column; "Нет чек-листа" means the bot will ask nothing at the end of the shift for that
employee.

## How the employee fills it

After "Уборка завершена" the shift screen shows "📋 Чек-лист и фото" (only when the position has
a checklist). Each check has ✅ and ⚠️; a remark asks for a category, a text, whether it is safe
to work and what is needed (master, cleaning, repair). Photo items show a 📷 button: press it and
send the photo; a repeated photo replaces the previous one. The server checks photo quality in the
background (resolution, darkness, duplicates). "Не могу завершить уборку" lets the employee submit
with a reason. "Отправить отчёт" is available when every check is answered and every photo is
there; otherwise the bot lists what is missing.

## Acceptance

With a zone: the next shift in that zone sees "Приёмка" on its shift screen, accepts ("Принять без
замечаний") or reports a problem (category, comment, photo → dispute, a critical category opens an
incident). No answer by the deadline escalates to the master. Without a zone the report goes
straight to the master. Masters resolve disputes in "Чистота и передача" with a formal decision.

The report detail in the panel shows each item kind once: the checklist block lists the check
items with their answers and remarks, "Сообщения следующей смене" shows the note texts, and
"Фото" is a gallery of the photo items with the quality mark on the thumbnail. A click opens the
viewer with previous / next navigation and a strip of thumbnails; the receiver's photo and the
master's decisions follow below.

## Typical questions

- "There is no checklist button": the position has no checklist, or the shift is not yet in
  HANDOVER; ask the administrator to attach a checklist to the position.
- "I cannot send the report": read the list under "Отчёт ещё не готов" on the screen.
