import type { SectionGuide } from './messages.js';
export const photoLibraryEn = {
  title: 'Annotated photos',
  description:
    'Saved photo reviews from workplace handovers. Open a photo to inspect or edit its annotations.',
  photo: 'Photo',
  status: 'Review result',
  date: 'Shift date',
  zone: 'Zone',
  employee: 'Worker',
  regions: 'Regions',
  remarks: 'Remarks',
  updated: 'Last saved',
  actions: 'Actions',
  open: 'Open photo',
  openHint:
    'View all regions and descriptions. Authorized reviewers can edit and save annotations.',
  archived: 'Replaced photo · read only',
  archivedHint:
    'This photo was replaced in the report. Its saved annotations remain available for viewing.',
  search: 'Search',
  searchHint: 'Search all saved photos by zone, worker, photo label or remarks.',
  statusHint:
    'Filter by the saved human review result. AI suggestions alone are not a completed review.',
  all: 'All results',
  from: 'Shift date from',
  to: 'Shift date to',
  dateHint: 'Filter by the shift date, including both boundaries.',
  invalidDates: 'The end date must be on or after the start date.',
  searchAction: 'Find photos',
  reset: 'Clear filters',
  resetHint: 'Show all saved photos within your access scope.',
  empty: 'No saved photo reviews found',
  emptyHint: 'Clear filters or open a handover photo and save its review to add it here.',
};
export type PhotoLibraryMessages = { [K in keyof typeof photoLibraryEn]: string };
export const photoLibraryUk: PhotoLibraryMessages = {
  title: 'База анотованих фото',
  description:
    'Збережені перевірки фото з передачі робочих місць. Відкрийте фото, щоб переглянути або відредагувати розмітку.',
  photo: 'Фото',
  status: 'Результат перевірки',
  date: 'Дата зміни',
  zone: 'Зона',
  employee: 'Працівник',
  regions: 'Областей',
  remarks: 'Зауваження',
  updated: 'Останнє збереження',
  actions: 'Дії',
  open: 'Відкрити фото',
  openHint:
    'Перегляньте всі області й описи. Уповноважені користувачі можуть редагувати та зберігати розмітку.',
  archived: 'Фото замінено · лише перегляд',
  archivedHint:
    'Це фото замінили у звіті. Його збережена розмітка залишається доступною для перегляду.',
  search: 'Пошук',
  searchHint:
    'Пошук серед усіх збережених фото за зоною, працівником, назвою фото або зауваженнями.',
  statusHint:
    'Фільтр за збереженим результатом перевірки людиною. Самі підказки AI не є завершеною перевіркою.',
  all: 'Усі результати',
  from: 'Дата зміни від',
  to: 'Дата зміни до',
  dateHint: 'Фільтр за датою зміни, включно з обома межами.',
  invalidDates: 'Кінцева дата не може бути раніше початкової.',
  searchAction: 'Знайти фото',
  reset: 'Скинути фільтри',
  resetHint: 'Показати всі збережені фото в межах вашого доступу.',
  empty: 'Збережених перевірок фото не знайдено',
  emptyHint:
    'Скиньте фільтри або відкрийте фото у звіті передачі та збережіть його перевірку, щоб додати сюди.',
};
export const photoLibraryRu: PhotoLibraryMessages = {
  title: 'База аннотированных фото',
  description:
    'Сохранённые проверки фото из передачи рабочих мест. Откройте фото, чтобы просмотреть или отредактировать разметку.',
  photo: 'Фото',
  status: 'Результат проверки',
  date: 'Дата смены',
  zone: 'Зона',
  employee: 'Сотрудник',
  regions: 'Областей',
  remarks: 'Замечания',
  updated: 'Последнее сохранение',
  actions: 'Действия',
  open: 'Открыть фото',
  openHint:
    'Просмотрите все области и описания. Уполномоченные пользователи могут редактировать и сохранять разметку.',
  archived: 'Фото заменено · только просмотр',
  archivedHint:
    'Это фото заменили в отчёте. Его сохранённая разметка остаётся доступной для просмотра.',
  search: 'Поиск',
  searchHint:
    'Поиск среди всех сохранённых фото по зоне, сотруднику, названию фото или замечаниям.',
  statusHint:
    'Фильтр по сохранённому результату проверки человеком. Сами подсказки AI не являются завершённой проверкой.',
  all: 'Все результаты',
  from: 'Дата смены от',
  to: 'Дата смены до',
  dateHint: 'Фильтр по дате смены, включая обе границы.',
  invalidDates: 'Конечная дата не может быть раньше начальной.',
  searchAction: 'Найти фото',
  reset: 'Сбросить фильтры',
  resetHint: 'Показать все сохранённые фото в пределах вашего доступа.',
  empty: 'Сохранённых проверок фото не найдено',
  emptyHint:
    'Сбросьте фильтры или откройте фото в отчёте передачи и сохраните его проверку, чтобы добавить сюда.',
};
export const libraryGuideEn: SectionGuide = {
  title: photoLibraryEn.title,
  purpose:
    'A single place to find and improve saved photo examples without reopening each handover report.',
  steps: [
    'Search by worker, zone or remarks. Use the review result and shift dates to narrow the list, then press Find photos.',
    'Open a photo to see its regions and full descriptions. Edit the existing annotations as needed and press Save changes.',
    'After saving, close the editor. The table refreshes with the saved result and region count. No further action is required.',
  ],
  faq: [
    {
      q: 'Which photos appear here?',
      a: 'Photos with a saved human review, including unfinished reviews and clean photos with no marked regions. Unsaved changes and AI suggestions alone do not add a photo.',
    },
    {
      q: 'Who can edit?',
      a: 'Administrators, production heads, shift masters and cleanliness controllers can edit within their assigned scope. HR and auditors can view. Replaced photos are read only.',
    },
    {
      q: 'Does editing create another copy?',
      a: 'No. Both pages use the same review and revision history. The original image is unchanged. If another reviewer saves first, reload before saving your changes.',
    },
    {
      q: 'What happens next?',
      a: 'Saved annotations accumulate examples for later model evaluation and training. Saving does not train AI, approve the handover or change employee scores.',
    },
  ],
};
export const libraryGuideUk: SectionGuide = {
  title: photoLibraryUk.title,
  purpose:
    'Єдине місце для пошуку й уточнення збережених прикладів фото без відкривання кожного звіту передачі.',
  steps: [
    'Знайдіть фото за працівником, зоною або зауваженнями. За потреби оберіть результат перевірки та дати зміни й натисніть «Знайти фото».',
    'Відкрийте фото, щоб побачити області й повні описи. За потреби виправте розмітку та натисніть «Зберегти зміни».',
    'Після збереження закрийте редактор. Таблиця оновить результат і кількість областей. На цьому роботу з фото завершено.',
  ],
  faq: [
    {
      q: 'Які фото потрапляють у базу?',
      a: 'Фото зі збереженою перевіркою людиною, зокрема незавершені перевірки та чисті фото без областей. Незбережені зміни й самі підказки AI не додають фото до бази.',
    },
    {
      q: 'Хто може редагувати?',
      a: 'Адміністратори, керівники виробництва, майстри та контролери чистоти — у межах свого доступу. HR та аудитори можуть переглядати. Замінені фото доступні лише для перегляду.',
    },
    {
      q: 'Редагування створює ще одну копію?',
      a: 'Ні. Обидві сторінки використовують одну перевірку та історію її версій. Оригінал фото не змінюється. Якщо інший користувач збереже зміни першим, потрібно завантажити актуальну перевірку.',
    },
    {
      q: 'Що буде далі?',
      a: 'Розмітка накопичує приклади для майбутньої оцінки й навчання моделі. Збереження не навчає AI, не схвалює звіт передачі й не змінює бали працівника.',
    },
  ],
};
export const libraryGuideRu: SectionGuide = {
  title: photoLibraryRu.title,
  purpose:
    'Единое место для поиска и уточнения сохранённых примеров фото без открытия каждого отчёта передачи.',
  steps: [
    'Найдите фото по сотруднику, зоне или замечаниям. При необходимости выберите результат проверки и даты смены и нажмите «Найти фото».',
    'Откройте фото, чтобы увидеть области и полные описания. При необходимости исправьте разметку и нажмите «Сохранить изменения».',
    'После сохранения закройте редактор. Таблица обновит результат и количество областей. На этом работа с фото завершена.',
  ],
  faq: [
    {
      q: 'Какие фото попадают в базу?',
      a: 'Фото с сохранённой проверкой человеком, включая незавершённые проверки и чистые фото без областей. Несохранённые изменения и сами подсказки AI не добавляют фото в базу.',
    },
    {
      q: 'Кто может редактировать?',
      a: 'Администраторы, руководители производства, мастера и контролёры чистоты — в пределах своего доступа. HR и аудиторы могут просматривать. Заменённые фото доступны только для просмотра.',
    },
    {
      q: 'Редактирование создаёт ещё одну копию?',
      a: 'Нет. Обе страницы используют одну проверку и историю её версий. Оригинал фото не меняется. Если другой пользователь сохранит изменения первым, нужно загрузить актуальную проверку.',
    },
    {
      q: 'Что будет дальше?',
      a: 'Разметка накапливает примеры для будущей оценки и обучения модели. Сохранение не обучает AI, не одобряет отчёт передачи и не меняет баллы сотрудника.',
    },
  ],
};
