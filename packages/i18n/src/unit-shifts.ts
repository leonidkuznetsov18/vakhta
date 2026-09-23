import type { ShiftPeriod, ShiftTemplateError, TemplateHoursIssue } from '@vakhta/domain';

/** Unit shift templates (spec 013): the unit Sheet in Directories and the Schedule shift picker. */
export interface UnitShiftsMessages {
  shiftsColumn: string;
  openUnit: string;
  standardOnly: string;
  moreCount: string;
  inParent: string;
  viewOnly: string;
  sectionTitle: string;
  sectionHint: string;
  add: string;
  createFirst: string;
  empty: string;
  defaultsTitle: string;
  defaultLocked: string;
  start: string;
  end: string;
  length: string;
  untilNextDay: string;
  period: string;
  periodHint: string;
  periods: Record<ShiftPeriod, string>;
  name: string;
  preview: string;
  create: string;
  save: string;
  usedNotice: string;
  editShift: string;
  deleteShift: string;
  deleteTitle: string;
  deleteUsed: string;
  deleteUnused: string;
  delete: string;
  created: string;
  saved: string;
  deleted: string;
  hoursIssues: Record<TemplateHoursIssue, string>;
  errors: Record<ShiftTemplateError, string>;
  pickerTitle: string;
  pickerKept: string;
  pickerUnit: string;
  pickerStandard: string;
  pickerCustom: string;
  saveAsShift: string;
}

export const unitShiftsUK: UnitShiftsMessages = {
  shiftsColumn: 'Зміни',
  openUnit: 'Відкрити',
  standardOnly: 'Стандартні',
  moreCount: 'ще {count}',
  inParent: 'Входить у «{parent}»',
  viewOnly: 'лише перегляд',
  sectionTitle: 'Зміни підрозділу',
  sectionHint:
    'Ці зміни пропонуються лише в графіку цього підрозділу. Стандартні День і Ніч доступні всім підрозділам.',
  add: 'Нова зміна',
  createFirst: 'Створити першу зміну',
  empty:
    'У «{unit}» поки працюють за стандартними змінами. Створіть власні, якщо тут інший час роботи — наприклад, з 05:00 на 8 годин.',
  defaultsTitle: 'Стандартні зміни — для всіх підрозділів',
  defaultLocked: 'Стандартна зміна, спільна для всіх підрозділів',
  start: 'Початок',
  end: 'Кінець',
  length: 'Тривалість',
  untilNextDay: 'до наступного дня',
  period: 'Тип',
  periodHint:
    'Визначається за часом автоматично. Від типу залежить колір на Графіку і як зміна називається в боті.',
  periods: { DAY: 'День', NIGHT: 'Ніч', FULL_DAY: 'Доба' },
  name: 'Назва',
  preview: 'На Графіку',
  create: 'Створити зміну',
  save: 'Зберегти',
  usedNotice:
    'Нові години діятимуть для нових призначень. Уже заплановані зміни ({count}) залишаться як є.',
  editShift: 'Змінити «{name}»',
  deleteShift: 'Видалити «{name}»',
  deleteTitle: 'Видалити «{name}»?',
  deleteUsed:
    'Її більше не можна буде обрати на Графіку. Уже заплановані зміни ({count}) залишаться як є.',
  deleteUnused: 'Зміна ще ніде не використовується.',
  delete: 'Видалити',
  created: 'Зміну створено',
  saved: 'Зміну збережено',
  deleted: 'Зміну видалено',
  hoursIssues: {
    FULL_DAY_NEEDS_EQUAL_TIMES: 'Доба триває 24 години: кінець має дорівнювати початку',
    EQUAL_TIMES_NEED_FULL_DAY: 'Початок і кінець збігаються — це 24 години, оберіть «Доба»',
  },
  errors: {
    SHIFT_TEMPLATE_NAME_TAKEN: 'У підрозділі вже є зміна з такою назвою',
    SHIFT_TEMPLATE_STALE: 'Зміну щойно змінили. Закрийте й відкрийте її знову.',
    SHIFT_TEMPLATE_OUT_OF_UNIT: 'Ця зміна належить іншому підрозділу',
    SHIFT_TEMPLATE_RETIRED: 'Цю зміну видалено або змінено. Оберіть актуальну.',
    SHIFT_TEMPLATE_NOT_FOUND: 'Зміну не знайдено',
    SHIFT_TEMPLATE_DEFAULT: 'Стандартні зміни тут не змінюються',
  },
  pickerTitle: 'Зміна',
  pickerKept: 'Заплановано раніше',
  pickerUnit: 'Зміни «{unit}»',
  pickerStandard: 'Стандартні',
  pickerCustom: 'Свій час лише на цей день',
  saveAsShift: 'Зберегти як зміну «{unit}»',
};

export const unitShiftsEN: UnitShiftsMessages = {
  shiftsColumn: 'Shifts',
  openUnit: 'Open',
  standardOnly: 'Standard',
  moreCount: '{count} more',
  inParent: 'Part of “{parent}”',
  viewOnly: 'view only',
  sectionTitle: 'Unit shifts',
  sectionHint:
    'These shifts are offered only in this unit’s schedule. The standard Day and Night shifts are available to every unit.',
  add: 'New shift',
  createFirst: 'Create the first shift',
  empty:
    '“{unit}” works on the standard shifts for now. Create its own when the hours differ here — for example, 8 hours from 05:00.',
  defaultsTitle: 'Standard shifts — for every unit',
  defaultLocked: 'Standard shift shared by every unit',
  start: 'Start',
  end: 'End',
  length: 'Length',
  untilNextDay: 'until the next day',
  period: 'Type',
  periodHint:
    'Set automatically from the hours. The type decides the colour on the Schedule and how the bot names the shift.',
  periods: { DAY: 'Day', NIGHT: 'Night', FULL_DAY: 'Full day' },
  name: 'Name',
  preview: 'On the Schedule',
  create: 'Create shift',
  save: 'Save',
  usedNotice:
    'The new hours apply to new assignments. Shifts already planned ({count}) stay as they are.',
  editShift: 'Edit “{name}”',
  deleteShift: 'Delete “{name}”',
  deleteTitle: 'Delete “{name}”?',
  deleteUsed:
    'It can no longer be chosen on the Schedule. Shifts already planned ({count}) stay as they are.',
  deleteUnused: 'This shift is not used anywhere yet.',
  delete: 'Delete',
  created: 'Shift created',
  saved: 'Shift saved',
  deleted: 'Shift deleted',
  hoursIssues: {
    FULL_DAY_NEEDS_EQUAL_TIMES: 'A full day lasts 24 hours: the end must equal the start',
    EQUAL_TIMES_NEED_FULL_DAY: 'Start and end are the same — that is 24 hours, choose “Full day”',
  },
  errors: {
    SHIFT_TEMPLATE_NAME_TAKEN: 'The unit already has a shift with this name',
    SHIFT_TEMPLATE_STALE: 'This shift has just been changed. Close it and open it again.',
    SHIFT_TEMPLATE_OUT_OF_UNIT: 'This shift belongs to another unit',
    SHIFT_TEMPLATE_RETIRED: 'This shift was deleted or changed. Choose a current one.',
    SHIFT_TEMPLATE_NOT_FOUND: 'Shift not found',
    SHIFT_TEMPLATE_DEFAULT: 'Standard shifts cannot be changed here',
  },
  pickerTitle: 'Shift',
  pickerKept: 'Planned earlier',
  pickerUnit: '“{unit}” shifts',
  pickerStandard: 'Standard',
  pickerCustom: 'Own hours for this day only',
  saveAsShift: 'Save as a “{unit}” shift',
};

export const unitShiftsRU: UnitShiftsMessages = {
  shiftsColumn: 'Смены',
  openUnit: 'Открыть',
  standardOnly: 'Стандартные',
  moreCount: 'ещё {count}',
  inParent: 'Входит в «{parent}»',
  viewOnly: 'только просмотр',
  sectionTitle: 'Смены подразделения',
  sectionHint:
    'Эти смены предлагаются только в графике этого подразделения. Стандартные День и Ночь доступны всем подразделениям.',
  add: 'Новая смена',
  createFirst: 'Создать первую смену',
  empty:
    '«{unit}» пока работает по стандартным сменам. Создайте свои, если здесь другое время работы — например, с 05:00 на 8 часов.',
  defaultsTitle: 'Стандартные смены — для всех подразделений',
  defaultLocked: 'Стандартная смена, общая для всех подразделений',
  start: 'Начало',
  end: 'Конец',
  length: 'Длительность',
  untilNextDay: 'до следующего дня',
  period: 'Тип',
  periodHint:
    'Определяется по времени автоматически. От типа зависит цвет в Графике и как смена называется в боте.',
  periods: { DAY: 'День', NIGHT: 'Ночь', FULL_DAY: 'Сутки' },
  name: 'Название',
  preview: 'В Графике',
  create: 'Создать смену',
  save: 'Сохранить',
  usedNotice:
    'Новые часы будут действовать для новых назначений. Уже запланированные смены ({count}) останутся как есть.',
  editShift: 'Изменить «{name}»',
  deleteShift: 'Удалить «{name}»',
  deleteTitle: 'Удалить «{name}»?',
  deleteUsed:
    'Её больше нельзя будет выбрать в Графике. Уже запланированные смены ({count}) останутся как есть.',
  deleteUnused: 'Смена ещё нигде не используется.',
  delete: 'Удалить',
  created: 'Смена создана',
  saved: 'Смена сохранена',
  deleted: 'Смена удалена',
  hoursIssues: {
    FULL_DAY_NEEDS_EQUAL_TIMES: 'Сутки длятся 24 часа: конец должен совпадать с началом',
    EQUAL_TIMES_NEED_FULL_DAY: 'Начало и конец совпадают — это 24 часа, выберите «Сутки»',
  },
  errors: {
    SHIFT_TEMPLATE_NAME_TAKEN: 'В подразделении уже есть смена с таким названием',
    SHIFT_TEMPLATE_STALE: 'Смену только что изменили. Закройте и откройте её снова.',
    SHIFT_TEMPLATE_OUT_OF_UNIT: 'Эта смена принадлежит другому подразделению',
    SHIFT_TEMPLATE_RETIRED: 'Эту смену удалили или изменили. Выберите актуальную.',
    SHIFT_TEMPLATE_NOT_FOUND: 'Смена не найдена',
    SHIFT_TEMPLATE_DEFAULT: 'Стандартные смены здесь не меняются',
  },
  pickerTitle: 'Смена',
  pickerKept: 'Запланирована ранее',
  pickerUnit: 'Смены «{unit}»',
  pickerStandard: 'Стандартные',
  pickerCustom: 'Своё время только на этот день',
  saveAsShift: 'Сохранить как смену «{unit}»',
};
