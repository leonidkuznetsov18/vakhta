export const photoRulesUk = {
  title: 'Вказати, що не повинно бути на фото',
  hint: 'Один предмет у кожному полі. Правила діють лише для цього чекліста в обраній зоні. Після надсилання звіту AI позначить можливі знахідки, а майстер перевірить результат у статусі Master Review.',
  zone: 'Зона',
  choose: 'Оберіть зону',
  item: 'Що не повинно бути на фото',
  add: 'Додати предмет',
  remove: 'Видалити предмет',
  save: 'Зберегти правила',
  saved: 'Правила збережено',
  empty: 'Список порожній — автоматичний аналіз для цієї зони вимкнений.',
  invalid:
    'Укажіть назви до 100 символів без повторів. До 30 предметів; уточнення й винятки — до 300 символів кожне.',
  conflict:
    'Правила вже змінив інший користувач. Скопіюйте свої незбережені правки й відкрийте чекліст знову, щоб завантажити актуальні правила.',
  pending: 'AI перевіряє фото за правилами зони. Після завершення звіт перейде в Master Review.',
  review:
    'Master Review: відкрийте фото, перевірте й збережіть розмітку. Потім схваліть чекліст або надішліть підтверджене зауваження.',
  simpleHint: 'Достатньо назви предмета. Уточнення та винятки — за потреби.',
  quickAdd: 'Швидко додати:',
  suggestions: ['Ганчірки', 'Стаканчики', 'Інструменти'],
  itemPlaceholder: 'Наприклад, залишені ручні інструменти',
  details: 'Уточнити правило',
  detailsAdded: 'Уточнення додано',
  clarification: 'Що саме шукати (необов’язково)',
  clarificationHint: 'Опишіть вигляд предмета або місце, де його не повинно бути. До 300 символів.',
  clarificationPlaceholder: 'Наприклад, окремі викрутки та ключі на робочому столі',
  exceptions: 'Що дозволено (необов’язково)',
  exceptionsHint:
    'Укажіть лише реальні винятки або схожі предмети, які дозволені. До 300 символів.',
  exceptionsPlaceholder: 'Наприклад, закріплені деталі обладнання',
};
export const photoRulesEn = {
  title: 'Specify what must not appear in the photo',
  hint: 'One object per field. Rules apply only to this checklist in the selected zone. After submission AI marks possible findings, then the master verifies them in Master Review.',
  zone: 'Zone',
  choose: 'Choose a zone',
  item: 'What must not appear in the photo',
  add: 'Add object',
  remove: 'Remove object',
  save: 'Save rules',
  saved: 'Rules saved',
  empty: 'The list is empty — automatic analysis is off for this zone.',
  invalid:
    'Use unique names up to 100 characters. Maximum 30 objects; clarification and exceptions up to 300 characters each.',
  conflict:
    'Another user changed these rules. Copy your unsaved edits and reopen the checklist to load the latest rules.',
  pending:
    'AI is checking photos against the zone rules. The report moves to Master Review when complete.',
  review:
    'Master Review: open the photos, check and save the annotations. Then approve the checklist or send a confirmed remark.',
  simpleHint: 'An object name is enough. Add clarification or exceptions only when needed.',
  quickAdd: 'Quick add:',
  suggestions: ['Rags', 'Cups', 'Tools'],
  itemPlaceholder: 'For example, loose hand tools',
  details: 'Clarify rule',
  detailsAdded: 'Clarification added',
  clarification: 'What to look for (optional)',
  clarificationHint: 'Describe the object or where it must not be left. Up to 300 characters.',
  clarificationPlaceholder: 'For example, loose screwdrivers and wrenches on the worktable',
  exceptions: 'What is allowed (optional)',
  exceptionsHint:
    'Specify only real exceptions or similar objects that are allowed. Up to 300 characters.',
  exceptionsPlaceholder: 'For example, fixed equipment components',
};
export const photoRulesRu = {
  title: 'Указать, чего не должно быть на фото',
  hint: 'Один предмет в каждом поле. Правила действуют только для этого чек-листа в выбранной зоне. После отправки отчёта AI отметит возможные находки, а мастер проверит результат в статусе Master Review.',
  zone: 'Зона',
  choose: 'Выберите зону',
  item: 'Чего не должно быть на фото',
  add: 'Добавить предмет',
  remove: 'Удалить предмет',
  save: 'Сохранить правила',
  saved: 'Правила сохранены',
  empty: 'Список пуст — автоматический анализ для этой зоны выключен.',
  invalid:
    'Укажите названия до 100 символов без повторов. До 30 предметов; уточнения и исключения — до 300 символов каждое.',
  conflict:
    'Правила уже изменил другой пользователь. Скопируйте свои несохранённые правки и откройте чек-лист заново, чтобы загрузить актуальные правила.',
  pending: 'AI проверяет фото по правилам зоны. После завершения отчёт перейдёт в Master Review.',
  review:
    'Master Review: откройте фото, проверьте и сохраните разметку. Затем одобрите чек-лист или отправьте подтверждённое замечание.',
  simpleHint: 'Достаточно названия предмета. Уточнения и исключения — при необходимости.',
  quickAdd: 'Быстро добавить:',
  suggestions: ['Тряпки', 'Стаканчики', 'Инструменты'],
  itemPlaceholder: 'Например, оставленные ручные инструменты',
  details: 'Уточнить правило',
  detailsAdded: 'Уточнение добавлено',
  clarification: 'Что именно искать (необязательно)',
  clarificationHint: 'Опишите вид предмета или место, где его не должно быть. До 300 символов.',
  clarificationPlaceholder: 'Например, отдельные отвёртки и ключи на рабочем столе',
  exceptions: 'Что разрешено (необязательно)',
  exceptionsHint:
    'Укажите только реальные исключения или похожие разрешённые предметы. До 300 символов.',
  exceptionsPlaceholder: 'Например, закреплённые детали оборудования',
};
export type ChecklistPhotoRulesMessages = typeof photoRulesEn;
