export const photoRulesEn = {
  dirty: 'Unsaved changes',
  discard: 'Discard unsaved changes to the object list?',

  title: 'Objects that must not appear in the photo',
  hint: 'Choose the objects from the shared catalog. One list per checklist, shared by all its versions; AI analysis in the photo editor searches only for these objects. Name every object in the singular ("Cup", not "Cups"): AI looks for every instance anyway, and a plural next to a singular makes the same object get boxed twice.',
  catalog: 'Catalog objects',
  catalogHint:
    'One entry per object type, shared by all checklists, always in the singular: "Cup", "Wire", "Pallet". Choose a spelling that everyone recognizes; the same type must not be added twice, neither as a plural nor as a synonym. Describe variants in the note.',
  selected: 'Selected for this checklist',
  newObject: 'New object',
  newObjectPlaceholder: 'For example: pallet',
  createObject: 'Add to catalog',
  catalogEdit: 'Edit catalog',
  catalogDone: 'Done editing',
  renameSave: 'Save name',
  deleteObject: 'Remove from catalog',
  deleteConfirm:
    'Remove "{name}" from the catalog? It leaves every checklist list; saved photo regions keep the name.',
  objectExists: 'Another catalog object already has this spelling.',
  note: 'Note (optional)',
  noteHint:
    'For the master and for AI: what such objects look like here, where they must not lie, and which cases are allowed. Up to 300 characters.',
  notePlaceholder: 'For example: cups inside the machine molds are product and are allowed',
  remove: 'Remove object',
  editRules: 'Edit rules',
  viewRules: 'Finish editing',
  save: 'Save rules',
  saved: 'Rules saved',
  empty:
    'No objects selected. AI analysis for this checklist stays unavailable until you choose at least one.',
  catalogEmpty: 'The catalog is empty. Add the first object.',
  invalid: 'Notes are limited to 300 characters; up to 30 objects per checklist.',
  conflict:
    'Another user changed these rules. Copy your unsaved edits and reopen the checklist to load the latest rules.',
};
export type ChecklistPhotoRulesMessages = typeof photoRulesEn;
export const photoRulesUk: ChecklistPhotoRulesMessages = {
  dirty: 'Є незбережені зміни',
  discard: 'Відкинути незбережені зміни списку обʼєктів?',

  title: 'Обʼєкти, яких не повинно бути на фото',
  hint: 'Оберіть обʼєкти зі спільного каталогу. Один список на чекліст, спільний для всіх його версій; аналіз з AI у редакторі фото шукає лише ці обʼєкти. Назви пишіть в однині («Стаканчик», а не «Стаканчики»): AI і так шукає всі екземпляри, а множина поряд з одниною дає подвійні рамки на тому самому предметі.',
  catalog: 'Обʼєкти каталогу',
  catalogHint:
    'Один запис на тип обʼєкта, спільний для всіх чеклістів, завжди в однині: «Стаканчик», «Провід», «Піддон». Обирайте написання, яке всі впізнають; один тип не додають двічі ні множиною, ні синонімом. Варіанти описуйте в уточненні.',
  selected: 'Обрано для цього чекліста',
  newObject: 'Новий обʼєкт',
  newObjectPlaceholder: 'Наприклад: піддон',
  createObject: 'Додати в каталог',
  catalogEdit: 'Редагувати каталог',
  catalogDone: 'Завершити редагування',
  renameSave: 'Зберегти назву',
  deleteObject: 'Видалити з каталогу',
  deleteConfirm:
    'Видалити «{name}» з каталогу? Обʼєкт зникне з усіх чек-листів; збережена розмітка фото збереже назву.',
  objectExists: 'Інший обʼєкт каталогу вже має таке написання.',
  note: 'Уточнення (необовʼязково)',
  noteHint:
    'Для майстра і для AI: як такі обʼєкти виглядають тут, де їм не місце і які випадки дозволені. До 300 символів.',
  notePlaceholder: 'Наприклад: стаканчики у гніздах машини є продукцією і дозволені',
  remove: 'Прибрати обʼєкт',
  editRules: 'Редагувати правила',
  viewRules: 'Завершити редагування правил',
  save: 'Зберегти правила',
  saved: 'Правила збережено',
  empty:
    'Обʼєктів не обрано. Аналіз з AI для цього чекліста недоступний, поки не обрано хоча б один.',
  catalogEmpty: 'Каталог порожній. Додайте перший обʼєкт.',
  invalid: 'Уточнення до 300 символів; до 30 обʼєктів на чекліст.',
  conflict:
    'Правила вже змінив інший користувач. Скопіюйте свої незбережені правки й відкрийте чекліст знову, щоб завантажити актуальні правила.',
};
export const photoRulesRu: ChecklistPhotoRulesMessages = {
  dirty: 'Есть несохранённые изменения',
  discard: 'Отменить несохранённые изменения списка объектов?',

  title: 'Объекты, которых не должно быть на фото',
  hint: 'Выберите объекты из общего каталога. Один список на чек-лист, общий для всех его версий; анализ с AI в редакторе фото ищет только эти объекты. Названия пишите в единственном числе («Стаканчик», а не «Стаканчики»): AI и так ищет все экземпляры, а множественное число рядом с единственным даёт двойные рамки на одном предмете.',
  catalog: 'Объекты каталога',
  catalogHint:
    'Одна запись на тип объекта, общая для всех чек-листов, всегда в единственном числе: «Стаканчик», «Провод», «Поддон». Выбирайте написание, которое все узнают; один тип не добавляют дважды ни во множественном числе, ни синонимом. Варианты описывайте в уточнении.',
  selected: 'Выбрано для этого чек-листа',
  newObject: 'Новый объект',
  newObjectPlaceholder: 'Например: поддон',
  createObject: 'Добавить в каталог',
  catalogEdit: 'Редактировать каталог',
  catalogDone: 'Завершить редактирование',
  renameSave: 'Сохранить название',
  deleteObject: 'Удалить из каталога',
  deleteConfirm:
    'Удалить «{name}» из каталога? Объект исчезнет из всех чек-листов; сохранённая разметка фото сохранит название.',
  objectExists: 'Другой объект каталога уже имеет такое написание.',
  note: 'Уточнение (необязательно)',
  noteHint:
    'Для мастера и для AI: как такие объекты выглядят здесь, где им не место и какие случаи разрешены. До 300 символов.',
  notePlaceholder: 'Например: стаканчики в гнёздах машины являются продукцией и разрешены',
  remove: 'Убрать объект',
  editRules: 'Редактировать правила',
  viewRules: 'Завершить редактирование правил',
  save: 'Сохранить правила',
  saved: 'Правила сохранены',
  empty:
    'Объекты не выбраны. Анализ с AI для этого чек-листа недоступен, пока не выбран хотя бы один.',
  catalogEmpty: 'Каталог пуст. Добавьте первый объект.',
  invalid: 'Уточнение до 300 символов; до 30 объектов на чек-лист.',
  conflict:
    'Правила уже изменил другой пользователь. Скопируйте свои несохранённые правки и откройте чек-лист заново, чтобы загрузить актуальные правила.',
};
