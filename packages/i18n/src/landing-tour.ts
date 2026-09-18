export type LandingTour = {
  title: string;
  body: string;
  benefit: string;
  how: string;
  more: string;
  evidence: string;
  liveEvidence: string;
  zoom: string;
  close: string;
  actualSize: string;
  overview: string;
  flowTitle: string;
  flowBody: string;
  flowNote: string;
  surfaces: string[];
  flow: {
    id: string;
    title: string;
    kiosk: string;
    telegram: string;
    panel: string;
    image: string;
    body: string;
  }[];
  botTitle: string;
  botBody: string;
  botSteps: string[];
  features: {
    id: string;
    label: string;
    title: string;
    body: string;
    steps: string[];
    value: string;
  }[];
};

export const tourUk: LandingTour = {
  liveEvidence:
    'Реальний робочий кейс у Vakhta. Персональні поля виключені з кадру. Підказки AI потребують перевірки майстра; це не доказ точності чи скорочення простоїв.',
  title: 'Подивіться, що зміниться у вашій щоденній роботі.',
  body: 'Від графіка до підсумків зміни: відкрийте потрібну можливість і роздивіться реальний інтерфейс.',
  benefit: 'Цінність для виробництва',
  how: 'Як це працює',
  more: 'Ще можливості для щоденної роботи',
  evidence:
    'Реальний інтерфейс українською. Дані й ілюстрації в панелі демонстраційні; це не результати клієнта.',
  zoom: 'На весь екран',
  close: 'Закрити',
  actualSize: 'Масштаб 100%',
  overview: 'Виробництво перед очима: що потребує дії зараз',
  flowTitle: 'Шість сценаріїв для стабільнішої роботи виробництва.',
  flowBody:
    'Попереджайте збої, реагуйте на простої та покращуйте наступну зміну. Оберіть сценарій, щоб побачити роль кожного інтерфейсу.',
  flowNote:
    'Ілюстрація процесу на основі реальних можливостей. Натискання змінює лише демонстрацію.',
  surfaces: ['Кіоск', 'Telegram працівника', 'Панель майстра'],
  flow: [
    {
      id: 'schedule',
      title: 'Планування',
      kiosk: 'Явка за призначенням',
      telegram: 'Свій план і сповіщення',
      panel: 'Графік → перевірка → публікація',
      body: 'Планувальник закриває зміни людьми та перевіряє конфлікти. Працівник бачить опублікований план; фактична явка допомагає виявити відхилення.',
      image: '/product/schedule-uk.webp',
    },
    {
      id: 'arrival',
      image: '/product/operations-uk.webp',
      title: 'Прихід',
      kiosk: 'QR на вході',
      telegram: 'Підтвердження приходу',
      panel: 'Явка в оперативній зміні',
      body: 'Працівник сканує QR та підтверджує прихід у боті. Панель показує зафіксовану явку.',
    },
    {
      id: 'incident',
      image: '/product/incident-live-uk.webp',
      title: 'Проблема',
      kiosk: 'Точка відмітки явки',
      telegram: 'Причина, опис, фото',
      panel: 'Інцидент → реакція майстра',
      body: 'Повідомлення з цеху потрапляє відповідальному. Реакція й рішення зберігаються в історії.',
    },
    {
      id: 'handover',
      image: '/product/photos-live-uk.webp',
      title: 'Передача',
      kiosk: 'Вихід після звіту',
      telegram: 'Чекліст → фото → звіт',
      panel: 'Перевірка → рішення',
      body: 'Працівник готує зону й звіт. Майстер перевіряє матеріали; наступна зміна приймає зону. Вихід фіксується QR.',
    },
    {
      id: 'review',
      image: '/product/panel-losses-uk.webp',
      title: 'Підсумки',
      kiosk: 'Зафіксовані прихід і вихід',
      telegram: 'Підсумок зміни та бали',
      panel: 'Звіти → повторні причини',
      body: 'Збережені події формують облік часу, підстави для балів і матеріал для розбору втрат.',
    },
    {
      id: 'bonus',
      title: 'Мотивація',
      kiosk: 'Запис присутності',
      telegram: 'Мої бали',
      panel: 'Рішення майстра → підсумки',
      body: 'Схвалений чекліст формує підставу для балів. Працівник бачить результат, а керівник — історію та підсумки. Бонус підтримує виконання стандартів.',
      image: '/product/bonus-uk.webp',
    },
  ],
  botTitle: 'Працівнику достатньо Telegram.',
  botBody:
    'Свій графік, робочі дії, звернення, чекліст і бали — у знайомому боті. На екрані — справжнє меню; нижче наведена послідовність роботи.',
  botSteps: [
    'Відсканувати QR → підтвердити прихід.',
    'Прийняти зону → почати роботу.',
    'За потреби: перерва, простій із причиною, повідомлення про проблему.',
    'Завершити роботу → прибирання → чекліст і фото → надіслати звіт.',
    'Відсканувати QR на виході → отримати підсумок зміни.',
  ],
  features: [
    {
      id: 'schedule',
      label: 'Графік',
      title: 'Кожна зміна має людей. Кожна людина знає свій план.',
      body: 'Плануйте денні й нічні зміни за зонами або працівниками. Побачте незакриті місця, відсутності та конфлікти перед публікацією.',
      steps: [
        'Призначте людей на зміни й зони.',
        'Перевірте конфлікти та опублікуйте графік.',
        'Працівник бачить свій план у Telegram.',
      ],
      value: 'Заздалегідь знаходьте нестачу людей, щоб вона не стала причиною зупинки.',
    },
    {
      id: 'incidents',
      label: 'Простої та інциденти',
      title: 'Проблема отримує відповідального, а не губиться в чаті.',
      body: 'Працівник повідомляє про перешкоду через бот. Майстер бачить причину, час, статус та історію реакції.',
      steps: [
        'Працівник обирає причину й додає опис або фото.',
        'Відповідальний отримує сповіщення; прострочення ескалується за правилами.',
        'Майстер фіксує реакцію та результат.',
      ],
      value: 'Зрозуміло, хто реагує і що вже зроблено. Повторні причини залишаються в історії.',
    },
    {
      id: 'handover',
      label: 'Чистота і передача',
      title: 'Наступна зміна отримує підготовлену зону та її історію.',
      body: 'Завершення роботи веде працівника до прибирання, чекліста й фото. Майстер перевіряє матеріали, а наступний працівник приймає зону.',
      steps: [
        'Працівник виконує чекліст своєї посади та надсилає фото.',
        'Майстер схвалює звіт або залишає конкретне зауваження.',
        'Наступна зміна переглядає передачу й фіксує приймання.',
      ],
      value: 'Менше втрачених домовленостей: стан зони, зауваження й рішення зберігаються разом.',
    },
    {
      id: 'reports',
      label: 'Звіти',
      title: 'Від окремих подій — до причин, які повторюються.',
      body: 'Зіставляйте зафіксовану роботу, перерви й простої. Переглядайте структуру втрат і звіти за потрібний період.',
      steps: [
        'Оберіть період і виробничий підрозділ.',
        'Подивіться розподіл часу та найбільші категорії втрат.',
        'Використайте записи й експорт для розбору з командою.',
      ],
      value:
        'Обирайте, яку повторювану проблему дослідити першою, на основі записів, а не пам’яті.',
    },
    {
      id: 'bonus',
      label: 'Бонус',
      title: 'Поясніть бали через конкретні результати зміни.',
      body: 'Схвалені чеклісти й зауваження формують зрозумілу історію балів. Панель показує працівників, підрозділи та підсумки місяця.',
      steps: [
        'Майстер перевіряє звіт і записує рішення.',
        'Працівник переглядає свої бали в Telegram.',
        'Керівник бачить зведення й історію за місяць.',
      ],
      value:
        'Прозорі підстави для обговорення внеску працівника. Це облік балів, а не розрахунок зарплати.',
    },
    {
      id: 'operations',
      label: 'Оперативна зміна',
      title: 'Знайте, хто працює і в якому стані перебуває зміна.',
      body: 'Явка, зона, план та поточний стан працівника зібрані в одному робочому екрані.',
      steps: [
        'Знайдіть працівника або відфільтруйте стан.',
        'Перегляньте записану історію зміни.',
        'За потреби майстер виконує дозволену дію з коментарем.',
      ],
      value: 'Менше пошуку по повідомленнях, більше контексту для рішення.',
    },
    {
      id: 'checklists',
      label: 'Конструктор чеклістів',
      title: 'Одна вимога до роботи — зрозуміла кожному.',
      body: 'Створюйте перевірки для посад: пункти, обов’язкові фото та правила для знімків. Версії зберігають контекст попередніх звітів.',
      steps: [
        'Визначте, що перевірити та сфотографувати.',
        'Прив’яжіть чекліст до посади.',
        'Працівник проходить його покроково в боті.',
      ],
      value: 'Стандарти виконуються як конкретні дії, а не залишаються в інструкції.',
    },
    {
      id: 'requests',
      label: 'Звернення',
      title: 'Відпустка чи корекція — з рішенням та історією.',
      body: 'Працівник подає звернення в Telegram. Відповідальні розглядають його на своєму кроці погодження.',
      steps: [
        'Працівник зазначає тип, період і причину.',
        'Відповідальний переглядає запит та додає рішення.',
        'Історія показує, хто і коли погодив звернення.',
      ],
      value: 'Погодження не губляться в особистих чатах.',
    },
    {
      id: 'communications',
      label: 'Повідомлення',
      title: 'Передайте робоче повідомлення потрібним людям.',
      body: 'Оберіть працівників у панелі та підготуйте повідомлення для Telegram з файлами або анкетою.',
      steps: [
        'Знайдіть одержувачів за працівником або підрозділом.',
        'Додайте текст, вкладення чи питання.',
        'Перевірте відправлення у відповідному списку.',
      ],
      value: 'Робоча інформація доходить через звичний для працівника канал.',
    },
    {
      id: 'photos',
      label: 'Перевірка фото',
      title: 'Повертайтеся до доказів, а не до суперечок по пам’яті.',
      body: 'Знімки зі звітів зберігаються з результатами перевірки та позначками. Фільтри допомагають знайти потрібний випадок.',
      steps: [
        'Знайдіть фото за періодом або результатом.',
        'Перегляньте матеріал та зафіксовані зауваження.',
        'Використайте його для послідовного розбору якості.',
      ],
      value:
        'Спільний контекст для розбору чистоти. Відповідальне рішення залишається за майстром.',
    },
    {
      id: 'administration',
      label: 'Працівники й налаштування',
      title: 'Організуйте свій майданчик, зони та доступи.',
      body: 'Картки працівників, посади, ролі, термінали та чеклісти зібрані в адмініструванні.',
      steps: [
        'Додайте працівників або імпортуйте список.',
        'Налаштуйте структуру та відповідні ролі.',
        'Прив’яжіть Telegram і підключіть термінали.',
      ],
      value: 'Єдина структура для графіка, явки та операційних процесів.',
    },
    {
      id: 'audit',
      label: 'Аудит',
      title: 'Рішення має автора, час і причину.',
      body: 'Журнал дій допомагає відновити послідовність змін і перевірити, що саме було змінено.',
      steps: [
        'Відфільтруйте потрібну дію або об’єкт.',
        'Відкрийте деталі запису.',
        'Порівняйте значення до і після зміни.',
      ],
      value: 'Простежуваність для внутрішнього контролю й розбору спірних ситуацій.',
    },
  ],
};

export const tourEn: LandingTour = {
  liveEvidence:
    'Actual recorded case in Vakhta. Personal fields are outside the crop. AI suggestions require a master’s review; this is not evidence of accuracy or downtime reduction.',
  title: 'See what changes in everyday work.',
  body: 'From scheduling to shift results: explore each capability and inspect the actual interface.',
  benefit: 'Value for manufacturing',
  how: 'How it works',
  more: 'More for everyday operations',
  evidence:
    'Actual Ukrainian interface. Panel records and illustrations are demo data, not customer results.',
  zoom: 'Full screen',
  close: 'Close',
  actualSize: '100% size',
  overview: 'Production at a glance: what needs action now',
  flowTitle: 'Six workflows for more reliable production.',
  flowBody:
    'Prevent avoidable disruption, respond to downtime and improve the next shift. Choose a workflow to see how the interfaces connect.',
  flowNote:
    'Process illustration based on existing capabilities. Controls change only this demonstration.',
  surfaces: ['Kiosk', 'Worker’s Telegram', 'Master’s panel'],
  flow: [
    {
      id: 'schedule',
      title: 'Planning',
      kiosk: 'Assigned attendance',
      telegram: 'Personal plan and notifications',
      panel: 'Schedule → review → publish',
      body: 'Planners fill shifts and review conflicts. Workers see the published plan; recorded attendance helps reveal deviations.',
      image: '/product/schedule-uk.webp',
    },
    {
      id: 'arrival',
      image: '/product/operations-uk.webp',
      title: 'Arrival',
      kiosk: 'QR at the entrance',
      telegram: 'Confirm arrival',
      panel: 'Attendance in the shift view',
      body: 'Workers scan the QR and confirm arrival in the bot. The panel shows the recorded attendance.',
    },
    {
      id: 'incident',
      image: '/product/incident-live-uk.webp',
      title: 'Problem',
      kiosk: 'Attendance point',
      telegram: 'Reason, details, photo',
      panel: 'Incident → master’s response',
      body: 'A report from the floor reaches the responsible person. Responses and decisions stay in the record.',
    },
    {
      id: 'handover',
      image: '/product/photos-live-uk.webp',
      title: 'Handover',
      kiosk: 'Exit after reporting',
      telegram: 'Checklist → photos → report',
      panel: 'Review → decision',
      body: 'Workers prepare the zone and report. Masters review the material; the next shift accepts the zone. QR records departure.',
    },
    {
      id: 'review',
      image: '/product/panel-losses-uk.webp',
      title: 'Review',
      kiosk: 'Recorded arrival and exit',
      telegram: 'Shift summary and points',
      panel: 'Reports → recurring reasons',
      body: 'Recorded events support time accounting, points and a review of recurring losses.',
    },
    {
      id: 'bonus',
      title: 'Motivation',
      kiosk: 'Attendance record',
      telegram: 'My points',
      panel: 'Master’s decision → summary',
      body: 'An approved checklist provides the basis for points. Workers see the result; managers see history and totals. Points support consistent standards.',
      image: '/product/bonus-uk.webp',
    },
  ],
  botTitle: 'Workers already have Telegram.',
  botBody:
    'Their plan, work actions, requests, checklist and points are in one familiar bot. The image shows its actual menu; the sequence below explains the journey.',
  botSteps: [
    'Scan the QR → confirm arrival.',
    'Accept the zone → start work.',
    'As needed: break, downtime with a reason, or report a problem.',
    'Finish work → clean → checklist and photos → submit a report.',
    'Scan the exit QR → receive the shift summary.',
  ],
  features: [
    {
      id: 'schedule',
      label: 'Scheduling',
      title: 'Every shift has its people. Everyone knows the plan.',
      body: 'Plan day and night shifts by zone or employee. See open slots, absences and conflicts before publishing.',
      steps: [
        'Assign people to shifts and zones.',
        'Review conflicts and publish the schedule.',
        'Workers see their personal plan in Telegram.',
      ],
      value: 'Spot staffing gaps before they interrupt work.',
    },
    {
      id: 'incidents',
      label: 'Downtime & incidents',
      title: 'Give a problem an owner, not another chat thread.',
      body: 'Workers report an obstacle in the bot. Masters see its reason, time, status and response history.',
      steps: [
        'A worker selects a reason and adds details or a photo.',
        'The responsible person is notified; overdue responses follow escalation rules.',
        'The master records the response and outcome.',
      ],
      value: 'See who is responding and what has been done. Recurring reasons stay in the record.',
    },
    {
      id: 'handover',
      label: 'Cleaning & handover',
      title: 'Give the next shift a prepared zone and its history.',
      body: 'Finishing work leads to cleaning, a checklist and photos. A master reviews the report; the next worker accepts the zone.',
      steps: [
        'Workers complete their position’s checklist and submit photos.',
        'The master approves the report or records a specific concern.',
        'The next shift reviews the handover and records acceptance.',
      ],
      value: 'Keep the zone’s condition, concerns and decisions together between shifts.',
    },
    {
      id: 'reports',
      label: 'Reports',
      title: 'Turn recorded events into patterns worth investigating.',
      body: 'Compare recorded work, breaks and downtime. Explore loss categories and reports for the period you need.',
      steps: [
        'Select the period and production unit.',
        'Review time distribution and the largest loss categories.',
        'Use records and exports in the team review.',
      ],
      value: 'Choose the recurring problem to investigate first using records rather than memory.',
    },
    {
      id: 'bonus',
      label: 'Bonus',
      title: 'Explain points through specific shift outcomes.',
      body: 'Approved checklists and review comments form a traceable points history. See employees, units and monthly summaries.',
      steps: [
        'The master reviews a report and records the decision.',
        'Workers check their points in Telegram.',
        'Managers review monthly totals and history.',
      ],
      value:
        'A clear basis for discussing contributions. Points tracking is not payroll calculation.',
    },
    {
      id: 'operations',
      label: 'Live shift',
      title: 'See who is working and the recorded state of the shift.',
      body: 'Attendance, zone, plan and current worker status share one operational screen.',
      steps: [
        'Find a worker or filter by state.',
        'Review the recorded shift history.',
        'A master can take a permitted action with a comment.',
      ],
      value: 'Less searching through messages, more context for decisions.',
    },
    {
      id: 'checklists',
      label: 'Checklist builder',
      title: 'Make the standard clear to every worker.',
      body: 'Define checks for each position: items, required photos and photo rules. Versions preserve the context of earlier reports.',
      steps: [
        'Define what to check and photograph.',
        'Assign the checklist to a position.',
        'Workers follow it step by step in the bot.',
      ],
      value: 'Turn written standards into concrete actions.',
    },
    {
      id: 'requests',
      label: 'Employee requests',
      title: 'Leave or a correction, with a decision and a history.',
      body: 'Workers submit requests in Telegram. Responsible people review them at their approval stage.',
      steps: [
        'The worker chooses a type, period and reason.',
        'A reviewer records a decision.',
        'History shows who approved the request and when.',
      ],
      value: 'Keep approvals out of scattered personal conversations.',
    },
    {
      id: 'communications',
      label: 'Communications',
      title: 'Get work information to the right people.',
      body: 'Choose workers in the panel and prepare a Telegram message with attachments or a questionnaire.',
      steps: [
        'Find recipients by employee or unit.',
        'Add text, attachments or questions.',
        'Review dispatch in the sent list.',
      ],
      value: 'Reach workers through the channel they already use.',
    },
    {
      id: 'photos',
      label: 'Photo review',
      title: 'Return to the evidence, not conflicting recollections.',
      body: 'Report photos retain review results and annotations. Filters help locate a particular case.',
      steps: [
        'Find photos by period or review result.',
        'Inspect the material and recorded observations.',
        'Use it for consistent quality reviews.',
      ],
      value:
        'Shared context for cleanliness reviews. The master remains accountable for the decision.',
    },
    {
      id: 'administration',
      label: 'People & setup',
      title: 'Organize your site, zones and access.',
      body: 'Employee profiles, positions, roles, terminals and checklists share one administration area.',
      steps: [
        'Add workers or import a list.',
        'Configure the structure and relevant roles.',
        'Link Telegram and connect terminals.',
      ],
      value: 'One structure for schedules, attendance and operational processes.',
    },
    {
      id: 'audit',
      label: 'Audit',
      title: 'Know the author, time and reason behind a change.',
      body: 'The action log helps reconstruct changes and inspect exactly what changed.',
      steps: [
        'Filter by action or object.',
        'Open a record’s details.',
        'Compare values before and after the change.',
      ],
      value: 'Traceability for internal control and resolving disputed events.',
    },
  ],
};

export const tourRu: LandingTour = {
  liveEvidence:
    'Реальный рабочий случай в Vakhta. Персональные поля исключены из кадра. Подсказки AI требуют проверки мастера; это не доказательство точности или сокращения простоев.',
  title: 'Посмотрите, что изменится в ежедневной работе.',
  body: 'От графика до итогов смены: откройте нужную возможность и рассмотрите реальный интерфейс.',
  benefit: 'Ценность для производства',
  how: 'Как это работает',
  more: 'Другие возможности для ежедневной работы',
  evidence:
    'Реальный интерфейс на украинском. Данные и иллюстрации панели демонстрационные; это не результаты клиента.',
  zoom: 'На весь экран',
  close: 'Закрыть',
  actualSize: 'Масштаб 100%',
  overview: 'Производство перед глазами: что требует действия сейчас',
  flowTitle: 'Шесть сценариев для более стабильной работы производства.',
  flowBody:
    'Предупреждайте сбои, реагируйте на простои и улучшайте следующую смену. Выберите сценарий, чтобы увидеть роль каждого интерфейса.',
  flowNote:
    'Иллюстрация процесса на основе реальных возможностей. Нажатия меняют только демонстрацию.',
  surfaces: ['Киоск', 'Telegram сотрудника', 'Панель мастера'],
  flow: [
    {
      id: 'schedule',
      title: 'Планирование',
      kiosk: 'Явка по назначению',
      telegram: 'Свой план и уведомления',
      panel: 'График → проверка → публикация',
      body: 'Планировщик закрывает смены людьми и проверяет конфликты. Сотрудник видит опубликованный план; фактическая явка помогает выявлять отклонения.',
      image: '/product/schedule-uk.webp',
    },
    {
      id: 'arrival',
      image: '/product/operations-uk.webp',
      title: 'Приход',
      kiosk: 'QR на входе',
      telegram: 'Подтверждение прихода',
      panel: 'Явка в оперативной смене',
      body: 'Сотрудник сканирует QR и подтверждает приход в боте. Панель показывает записанную явку.',
    },
    {
      id: 'incident',
      image: '/product/incident-live-uk.webp',
      title: 'Проблема',
      kiosk: 'Точка отметки явки',
      telegram: 'Причина, описание, фото',
      panel: 'Инцидент → реакция мастера',
      body: 'Сообщение из цеха попадает ответственному. Реакция и решение сохраняются в истории.',
    },
    {
      id: 'handover',
      image: '/product/photos-live-uk.webp',
      title: 'Передача',
      kiosk: 'Выход после отчёта',
      telegram: 'Чек-лист → фото → отчёт',
      panel: 'Проверка → решение',
      body: 'Сотрудник готовит зону и отчёт. Мастер проверяет материалы; следующая смена принимает зону. Выход фиксируется QR.',
    },
    {
      id: 'review',
      image: '/product/panel-losses-uk.webp',
      title: 'Итоги',
      kiosk: 'Записанные приход и выход',
      telegram: 'Итоги смены и баллы',
      panel: 'Отчёты → повторные причины',
      body: 'Записанные события формируют учёт времени, основания для баллов и материал для разбора потерь.',
    },
    {
      id: 'bonus',
      title: 'Мотивация',
      kiosk: 'Запись присутствия',
      telegram: 'Мои баллы',
      panel: 'Решение мастера → итоги',
      body: 'Одобренный чек-лист формирует основание для баллов. Сотрудник видит результат, руководитель — историю и итоги. Бонус поддерживает выполнение стандартов.',
      image: '/product/bonus-uk.webp',
    },
  ],
  botTitle: 'Сотруднику достаточно Telegram.',
  botBody:
    'Свой график, рабочие действия, обращения, чек-лист и баллы — в привычном боте. На экране настоящее меню; ниже показана последовательность работы.',
  botSteps: [
    'Сканировать QR → подтвердить приход.',
    'Принять зону → начать работу.',
    'По необходимости: перерыв, простой с причиной, сообщение о проблеме.',
    'Завершить работу → уборка → чек-лист и фото → отправить отчёт.',
    'Сканировать QR на выходе → получить итог смены.',
  ],
  features: [
    {
      id: 'schedule',
      label: 'График',
      title: 'У каждой смены есть люди. Каждый знает свой план.',
      body: 'Планируйте дневные и ночные смены по зонам или сотрудникам. Проверяйте свободные места, отсутствия и конфликты перед публикацией.',
      steps: [
        'Назначьте людей на смены и зоны.',
        'Проверьте конфликты и опубликуйте график.',
        'Сотрудник видит свой план в Telegram.',
      ],
      value: 'Находите нехватку людей заранее, пока она не стала причиной остановки.',
    },
    {
      id: 'incidents',
      label: 'Простои и инциденты',
      title: 'У проблемы появляется ответственный.',
      body: 'Сотрудник сообщает о препятствии через бот. Мастер видит причину, время, статус и историю реакции.',
      steps: [
        'Сотрудник выбирает причину и добавляет описание или фото.',
        'Ответственный получает уведомление; просрочки эскалируются по правилам.',
        'Мастер фиксирует реакцию и результат.',
      ],
      value: 'Понятно, кто реагирует и что уже сделано. Повторные причины остаются в истории.',
    },
    {
      id: 'handover',
      label: 'Чистота и передача',
      title: 'Следующая смена получает подготовленную зону и её историю.',
      body: 'Завершение работы ведёт к уборке, чек-листу и фото. Мастер проверяет материалы, а следующий сотрудник принимает зону.',
      steps: [
        'Сотрудник проходит чек-лист своей должности и отправляет фото.',
        'Мастер одобряет отчёт или оставляет конкретное замечание.',
        'Следующая смена просматривает передачу и фиксирует приёмку.',
      ],
      value: 'Состояние зоны, замечания и решения сохраняются вместе между сменами.',
    },
    {
      id: 'reports',
      label: 'Отчёты',
      title: 'От отдельных событий — к повторяющимся причинам.',
      body: 'Сопоставляйте записанную работу, перерывы и простои. Изучайте категории потерь и отчёты за нужный период.',
      steps: [
        'Выберите период и подразделение.',
        'Посмотрите распределение времени и крупнейшие категории потерь.',
        'Используйте записи и экспорт для разбора с командой.',
      ],
      value: 'Выбирайте проблему для исследования по записям, а не по памяти.',
    },
    {
      id: 'bonus',
      label: 'Бонус',
      title: 'Объясните баллы через конкретные результаты смены.',
      body: 'Одобренные чек-листы и замечания формируют понятную историю баллов. Панель показывает сотрудников, подразделения и итоги месяца.',
      steps: [
        'Мастер проверяет отчёт и записывает решение.',
        'Сотрудник смотрит свои баллы в Telegram.',
        'Руководитель видит итоги и историю за месяц.',
      ],
      value:
        'Прозрачные основания для обсуждения вклада сотрудника. Учёт баллов не является расчётом зарплаты.',
    },
    {
      id: 'operations',
      label: 'Оперативная смена',
      title: 'Знайте, кто работает и в каком состоянии смена.',
      body: 'Явка, зона, план и текущее состояние сотрудника собраны в одном рабочем экране.',
      steps: [
        'Найдите сотрудника или отфильтруйте состояние.',
        'Посмотрите записанную историю смены.',
        'При необходимости мастер выполняет разрешённое действие с комментарием.',
      ],
      value: 'Меньше поиска по сообщениям, больше контекста для решения.',
    },
    {
      id: 'checklists',
      label: 'Конструктор чек-листов',
      title: 'Единые требования понятны каждому.',
      body: 'Создавайте проверки для должностей: пункты, обязательные фото и правила снимков. Версии сохраняют контекст старых отчётов.',
      steps: [
        'Определите, что проверить и сфотографировать.',
        'Привяжите чек-лист к должности.',
        'Сотрудник проходит его пошагово в боте.',
      ],
      value: 'Стандарты становятся конкретными действиями.',
    },
    {
      id: 'requests',
      label: 'Обращения',
      title: 'Отпуск или коррекция — с решением и историей.',
      body: 'Сотрудник подаёт обращение в Telegram. Ответственные рассматривают его на своём шаге согласования.',
      steps: [
        'Сотрудник указывает тип, период и причину.',
        'Ответственный рассматривает запрос и записывает решение.',
        'История показывает, кто и когда согласовал обращение.',
      ],
      value: 'Согласования не теряются в личных чатах.',
    },
    {
      id: 'communications',
      label: 'Сообщения',
      title: 'Передайте рабочую информацию нужным людям.',
      body: 'Выберите сотрудников в панели и подготовьте сообщение для Telegram с файлами или анкетой.',
      steps: [
        'Найдите получателей по сотруднику или подразделению.',
        'Добавьте текст, вложения или вопросы.',
        'Проверьте отправление в соответствующем списке.',
      ],
      value: 'Рабочая информация приходит через привычный сотруднику канал.',
    },
    {
      id: 'photos',
      label: 'Проверка фото',
      title: 'Возвращайтесь к материалам, а не к спорам по памяти.',
      body: 'Снимки отчётов сохраняются с результатами проверки и отметками. Фильтры помогают найти нужный случай.',
      steps: [
        'Найдите фото по периоду или результату проверки.',
        'Изучите материал и записанные замечания.',
        'Используйте его для последовательного разбора качества.',
      ],
      value: 'Общий контекст для проверки чистоты. Ответственное решение остаётся за мастером.',
    },
    {
      id: 'administration',
      label: 'Сотрудники и настройки',
      title: 'Настройте свою площадку, зоны и доступы.',
      body: 'Карточки сотрудников, должности, роли, терминалы и чек-листы собраны в администрировании.',
      steps: [
        'Добавьте сотрудников или импортируйте список.',
        'Настройте структуру и соответствующие роли.',
        'Привяжите Telegram и подключите терминалы.',
      ],
      value: 'Единая структура для графика, явки и операционных процессов.',
    },
    {
      id: 'audit',
      label: 'Аудит',
      title: 'У решения есть автор, время и причина.',
      body: 'Журнал действий помогает восстановить последовательность изменений и увидеть, что именно изменилось.',
      steps: [
        'Отфильтруйте действие или объект.',
        'Откройте детали записи.',
        'Сравните значения до и после изменения.',
      ],
      value: 'Прослеживаемость для внутреннего контроля и разбора спорных ситуаций.',
    },
  ],
};
