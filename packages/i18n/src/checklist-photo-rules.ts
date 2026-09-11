export const photoRulesUk = {
  title: 'Вказати, що не повинно бути на фото',
  hint: 'Один предмет у кожному полі. Правила діють лише для цього чекліста в обраній зоні. Після надсилання звіту AI позначить можливі знахідки, а майстер перевірить результат у статусі Master Review.',
  zone: 'Зона',
  choose: 'Оберіть зону',
  item: 'Заборонений предмет',
  add: 'Додати предмет',
  remove: 'Видалити предмет',
  save: 'Зберегти правила',
  saved: 'Правила збережено',
  empty: 'Список порожній — автоматичний аналіз для цієї зони вимкнений.',
  invalid: 'Заповніть кожне поле: до 100 символів, без повторів, не більше 30 предметів.',
  conflict: 'Правила вже змінив інший користувач. Оновіть їх перед повторним збереженням.',
  reload: 'Завантажити збережені правила',
  discard: 'Замінити незбережені зміни збереженими правилами?',
  pending: 'AI перевіряє фото за правилами зони. Після завершення звіт перейде в Master Review.',
  review:
    'Master Review: відкрийте фото, перевірте й збережіть розмітку. Потім схваліть чекліст або надішліть підтверджене зауваження.',
};
export const photoRulesEn = {
  title: 'Specify what must not appear in the photo',
  hint: 'One object per field. Rules apply only to this checklist in the selected zone. After submission AI marks possible findings, then the master verifies them in Master Review.',
  zone: 'Zone',
  choose: 'Choose a zone',
  item: 'Prohibited object',
  add: 'Add object',
  remove: 'Remove object',
  save: 'Save rules',
  saved: 'Rules saved',
  empty: 'The list is empty — automatic analysis is off for this zone.',
  invalid: 'Complete every field: up to 100 characters, no duplicates, maximum 30 objects.',
  conflict: 'Another user changed these rules. Reload them before saving again.',
  reload: 'Load saved rules',
  discard: 'Replace unsaved changes with saved rules?',
  pending:
    'AI is checking photos against the zone rules. The report moves to Master Review when complete.',
  review:
    'Master Review: open the photos, check and save the annotations. Then approve the checklist or send a confirmed remark.',
};
export const photoRulesRu = {
  title: 'Указать, чего не должно быть на фото',
  hint: 'Один предмет в каждом поле. Правила действуют только для этого чек-листа в выбранной зоне. После отправки отчёта AI отметит возможные находки, а мастер проверит результат в статусе Master Review.',
  zone: 'Зона',
  choose: 'Выберите зону',
  item: 'Запрещённый предмет',
  add: 'Добавить предмет',
  remove: 'Удалить предмет',
  save: 'Сохранить правила',
  saved: 'Правила сохранены',
  empty: 'Список пуст — автоматический анализ для этой зоны выключен.',
  invalid: 'Заполните каждое поле: до 100 символов, без повторов, не более 30 предметов.',
  conflict: 'Правила уже изменил другой пользователь. Обновите их перед повторным сохранением.',
  reload: 'Загрузить сохранённые правила',
  discard: 'Заменить несохранённые изменения сохранёнными правилами?',
  pending: 'AI проверяет фото по правилам зоны. После завершения отчёт перейдёт в Master Review.',
  review:
    'Master Review: откройте фото, проверьте и сохраните разметку. Затем одобрите чек-лист или отправьте подтверждённое замечание.',
};
export type ChecklistPhotoRulesMessages = typeof photoRulesEn;
