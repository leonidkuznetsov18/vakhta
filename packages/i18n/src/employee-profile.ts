export interface EmployeeProfileMessages {
  title: string;
  openProfile: string;
  back: string;
  contacts: string;
  personal: string;
  identity: string;
  work: string;
  schedule: string;
  compensation: string;
  notSpecified: string;
  notAssigned: string;
  fullName: string;
  birthDate: string;
  maritalStatus: string;
  phone: string;
  email: string;
  telegram: string;
  linked: string;
  unlinked: string;
  position: string;
  unit: string;
  team: string;
  master: string;
  masterOf: string;
  self: string;
  missingMaster: string;
  inactiveMaster: string;
  noPanelAccess: string;
  zone: string;
  currentShift: string;
  nextShift: string;
  notScheduled: string;
  monthZones: string;
  unavailableZone: string;
  history: string;
  noHistory: string;
  edit: string;
  save: string;
  cancel: string;
  copy: string;
  copied: string;
  saved: string;
  invalid: string;
  birthInvalid: string;
  conflict: string;
  currentValues: string;
  useLatest: string;
  terminated: string;
  upload: string;
  removeAvatar: string;
  avatarHint: string;
  avatarInvalid: string;
  avatarLarge: string;
  failed: string;
  noPublished: string;
  noNext: string;
  openSchedule: string;
  planned: string;
  shifts: string;
  effectiveFrom: string;
  employmentRate: string;
  hourlyRate: string;
  monthlySalary: string;
  referenceOnly: string;
  addEntry: string;
  correct: string;
  reason: string;
  current: string;
  scheduled: string;
  corrected: string;
  needsMaster: string;
  setMaster: string;
  clearMaster: string;
  allUnits: string;
  SINGLE: string;
  MARRIED: string;
  DIVORCED: string;
  WIDOWED: string;
}

export const employeeProfileEN: EmployeeProfileMessages = {
  title: 'Employee profile',
  openProfile: 'Open employee profile',
  back: 'Employees',
  contacts: 'Contacts',
  personal: 'Personal details',
  identity: 'Identity',
  work: 'Work assignment',
  schedule: 'Schedule',
  compensation: 'Compensation',
  notSpecified: 'Not specified',
  notAssigned: 'Not assigned',
  fullName: 'Full name',
  birthDate: 'Birth date',
  maritalStatus: 'Marital status',
  phone: 'Phone',
  email: 'Email',
  telegram: 'Telegram',
  linked: 'Telegram linked',
  unlinked: 'Telegram not linked',
  position: 'Position',
  unit: 'Unit',
  team: 'Team',
  master: 'Responsible master',
  masterOf: 'Master of units',
  self: 'This employee',
  missingMaster: 'Master not assigned',
  inactiveMaster: 'Master is inactive',
  noPanelAccess: 'Master has no panel access for this unit',
  zone: 'Zone',
  currentShift: 'Current shift',
  nextShift: 'Next shift',
  notScheduled: 'Not scheduled',
  monthZones: 'Zones this month',
  unavailableZone: 'Zone unavailable',
  history: 'History',
  noHistory: 'No recorded history',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  copy: 'Copy',
  copied: 'Copied',
  saved: 'Saved',
  invalid: 'Check the value',
  birthInvalid: 'Enter a valid birth date, at least 14 years ago',
  conflict:
    'This profile changed. Your draft is kept. Review the current values before saving again.',
  currentValues: 'Current values',
  useLatest: 'Use current version',
  terminated: 'Terminated employee · read-only profile',
  upload: 'Upload photo',
  removeAvatar: 'Remove photo',
  avatarHint: 'JPEG, PNG or WebP, up to 10 MB. The photo is cropped to a square.',
  avatarInvalid: 'Choose a valid JPEG, PNG or WebP image',
  avatarLarge: 'The photo exceeds 10 MB',
  failed: 'Could not save. Your input is kept. Try again.',
  noPublished: 'No published schedule for this month',
  noNext: 'No upcoming published shifts',
  openSchedule: 'Open in Schedule',
  planned: 'Planned',
  shifts: 'shifts',
  effectiveFrom: 'Effective from',
  employmentRate: 'Employment rate (FTE)',
  hourlyRate: 'Hourly tariff (UAH/h)',
  monthlySalary: 'Monthly salary (UAH/month)',
  referenceOnly: 'Reference data. No payroll calculation.',
  addEntry: 'Add compensation entry',
  correct: 'Correct entry',
  reason: 'Correction reason',
  current: 'Current terms',
  scheduled: 'Scheduled',
  corrected: 'Corrected',
  needsMaster: 'Units needing a master',
  setMaster: 'Assign master',
  clearMaster: 'Remove assignment',
  allUnits: 'All units',
  SINGLE: 'Single',
  MARRIED: 'Married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
};

export const employeeProfileUK: EmployeeProfileMessages = {
  title: 'Профіль працівника',
  openProfile: 'Відкрити профіль працівника',
  back: 'Працівники',
  contacts: 'Контакти',
  personal: 'Особисті дані',
  identity: 'Основні дані',
  work: 'Робоче призначення',
  schedule: 'Графік',
  compensation: 'Умови оплати',
  notSpecified: 'Не вказано',
  notAssigned: 'Не призначено',
  fullName: 'ПІБ',
  birthDate: 'Дата народження',
  maritalStatus: 'Сімейний стан',
  phone: 'Телефон',
  email: 'Електронна пошта',
  telegram: 'Telegram',
  linked: 'Telegram підключено',
  unlinked: 'Telegram не підключено',
  position: 'Посада',
  unit: 'Підрозділ',
  team: 'Бригада',
  master: 'Відповідальний майстер',
  masterOf: 'Майстер підрозділів',
  self: 'Цей працівник',
  missingMaster: 'Майстра не призначено',
  inactiveMaster: 'Майстер неактивний',
  noPanelAccess: 'Майстер не має доступу до цього підрозділу в панелі',
  zone: 'Зона',
  currentShift: 'Поточна зміна',
  nextShift: 'Наступна зміна',
  notScheduled: 'Не заплановано',
  monthZones: 'Зони цього місяця',
  unavailableZone: 'Зона недоступна',
  history: 'Історія',
  noHistory: 'Історії ще немає',
  edit: 'Редагувати',
  save: 'Зберегти',
  cancel: 'Скасувати',
  copy: 'Копіювати',
  copied: 'Скопійовано',
  saved: 'Збережено',
  invalid: 'Перевірте значення',
  birthInvalid: 'Вкажіть коректну дату народження: вік від 14 років',
  conflict:
    'Профіль змінився. Вашу чернетку збережено. Перевірте актуальні дані перед повторним збереженням.',
  currentValues: 'Актуальні дані',
  useLatest: 'Використати актуальну версію',
  terminated: 'Працівника звільнено · профіль лише для читання',
  upload: 'Завантажити фото',
  removeAvatar: 'Прибрати фото',
  avatarHint: 'JPEG, PNG або WebP до 10 МБ. Фото обрізається до квадрата.',
  avatarInvalid: 'Оберіть коректне зображення JPEG, PNG або WebP',
  avatarLarge: 'Фото перевищує 10 МБ',
  failed: 'Не вдалося зберегти. Введені дані залишилися. Спробуйте ще раз.',
  noPublished: 'Цього місяця немає опублікованого графіка',
  noNext: 'Немає наступних опублікованих змін',
  openSchedule: 'Відкрити у графіку',
  planned: 'Заплановано',
  shifts: 'змін',
  effectiveFrom: 'Діє з',
  employmentRate: 'Частка зайнятості (ставка)',
  hourlyRate: 'Тариф (грн/год)',
  monthlySalary: 'Оклад (грн/міс)',
  referenceOnly: 'Довідкові дані. Зарплата не розраховується.',
  addEntry: 'Додати умови оплати',
  correct: 'Виправити запис',
  reason: 'Причина виправлення',
  current: 'Чинні умови',
  scheduled: 'Заплановано',
  corrected: 'Виправлено',
  needsMaster: 'Підрозділи без майстра',
  setMaster: 'Призначити майстра',
  clearMaster: 'Прибрати призначення',
  allUnits: 'Усі підрозділи',
  SINGLE: 'Не перебуває у шлюбі',
  MARRIED: 'У шлюбі',
  DIVORCED: 'Шлюб розірвано',
  WIDOWED: 'Втрата чоловіка / дружини',
};

export const employeeProfileRU: EmployeeProfileMessages = {
  title: 'Профиль сотрудника',
  openProfile: 'Открыть профиль сотрудника',
  back: 'Сотрудники',
  contacts: 'Контакты',
  personal: 'Личные данные',
  identity: 'Основные данные',
  work: 'Рабочее назначение',
  schedule: 'График',
  compensation: 'Условия оплаты',
  notSpecified: 'Не указано',
  notAssigned: 'Не назначено',
  fullName: 'ФИО',
  birthDate: 'Дата рождения',
  maritalStatus: 'Семейное положение',
  phone: 'Телефон',
  email: 'Электронная почта',
  telegram: 'Telegram',
  linked: 'Telegram подключён',
  unlinked: 'Telegram не подключён',
  position: 'Должность',
  unit: 'Подразделение',
  team: 'Бригада',
  master: 'Ответственный мастер',
  masterOf: 'Мастер подразделений',
  self: 'Этот сотрудник',
  missingMaster: 'Мастер не назначен',
  inactiveMaster: 'Мастер неактивен',
  noPanelAccess: 'У мастера нет доступа к этому подразделению в панели',
  zone: 'Зона',
  currentShift: 'Текущая смена',
  nextShift: 'Следующая смена',
  notScheduled: 'Не запланировано',
  monthZones: 'Зоны этого месяца',
  unavailableZone: 'Зона недоступна',
  history: 'История',
  noHistory: 'Истории ещё нет',
  edit: 'Редактировать',
  save: 'Сохранить',
  cancel: 'Отмена',
  copy: 'Копировать',
  copied: 'Скопировано',
  saved: 'Сохранено',
  invalid: 'Проверьте значение',
  birthInvalid: 'Укажите корректную дату рождения: возраст от 14 лет',
  conflict:
    'Профиль изменился. Ваш черновик сохранён. Проверьте актуальные данные перед повторным сохранением.',
  currentValues: 'Актуальные данные',
  useLatest: 'Использовать актуальную версию',
  terminated: 'Сотрудник уволен · профиль только для чтения',
  upload: 'Загрузить фото',
  removeAvatar: 'Убрать фото',
  avatarHint: 'JPEG, PNG или WebP до 10 МБ. Фото обрезается до квадрата.',
  avatarInvalid: 'Выберите корректное изображение JPEG, PNG или WebP',
  avatarLarge: 'Фото превышает 10 МБ',
  failed: 'Не удалось сохранить. Введённые данные сохранены. Попробуйте снова.',
  noPublished: 'В этом месяце нет опубликованного графика',
  noNext: 'Нет следующих опубликованных смен',
  openSchedule: 'Открыть в графике',
  planned: 'Запланировано',
  shifts: 'смен',
  effectiveFrom: 'Действует с',
  employmentRate: 'Доля занятости (ставка)',
  hourlyRate: 'Тариф (грн/ч)',
  monthlySalary: 'Оклад (грн/мес)',
  referenceOnly: 'Справочные данные. Зарплата не рассчитывается.',
  addEntry: 'Добавить условия оплаты',
  correct: 'Исправить запись',
  reason: 'Причина исправления',
  current: 'Текущие условия',
  scheduled: 'Запланировано',
  corrected: 'Исправлено',
  needsMaster: 'Подразделения без мастера',
  setMaster: 'Назначить мастера',
  clearMaster: 'Убрать назначение',
  allUnits: 'Все подразделения',
  SINGLE: 'Не состоит в браке',
  MARRIED: 'В браке',
  DIVORCED: 'Брак расторгнут',
  WIDOWED: 'Утрата супруга / супруги',
};
