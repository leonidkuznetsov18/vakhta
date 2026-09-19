type Section = { title: string; body: string };
export type LandingSeo = {
  resourcesTitle: string;
  resourcesIntro: string;
  templateTitle: string;
  download: string;
  related: string;
  resourcesLabel: string;
  details: Partial<Record<string, { title: string; sections: Section[] }>>;
  resources: {
    id: string;
    title: string;
    intro: string;
    featureId: string;
    sections: Section[];
    fields: string[];
  }[];
};

export const seoUk: LandingSeo = {
  resourcesTitle: 'Практичні матеріали для виробництва',
  resourcesIntro:
    'Оберіть один процес, домовтеся про відповідальність і перевірте зміни за записаними фактами.',
  templateTitle: 'Шаблон для вашої команди',
  download: 'Завантажити шаблон (.txt)',
  related: 'Пов’язані можливості',
  resourcesLabel: 'Матеріали',
  details: {
    incidents: {
      title: 'Простої та інциденти на виробництві — Vakhta',
      sections: [
        {
          title: 'Виробнича ситуація',
          body: 'На ділянці бракує матеріалу, робота зупинилася, а майстер дізнається про це лише наприкінці зміни. Працівник повідомляє причину через Telegram. У панелі з’являється запис із контекстом, статусом та історією реакції. Наступного разу команді не потрібно відновлювати події з кількох чатів.',
        },
        {
          title: 'Люди та відповідальність',
          body: 'Працівник описує перешкоду. Майстер переглядає інцидент і фіксує реакцію та рішення. Ескалація привертає увагу до простроченої реакції; управлінське рішення залишається за відповідальною людиною. Керівник досліджує повторювані причини у звітах, а не оцінює ситуацію лише за кількістю повідомлень.',
        },
        {
          title: 'Що перевірити під час пілоту',
          body: 'Оберіть одну повторювану перешкоду: наприклад, очікування матеріалу. До початку пілоту погодьте, що вважається реакцією та як вимірюється час до неї. Порівнюйте схожі зміни, перевіряйте пропуски й відокремлюйте підтверджену причину від першого припущення працівника.',
        },
        {
          title: 'Межі та підготовка',
          body: 'Записи працівників не замінюють датчики обладнання й не доводять першопричину. Перед запуском визначте майданчик, відповідальних і причини, якими користуватиметься команда. Для демо достатньо опису одного недавнього випадку без персональних або конфіденційних даних.',
        },
      ],
    },
    handover: {
      title: 'Передача зміни на виробництві з чеклістами — Vakhta',
      sections: [
        {
          title: 'Виробнича ситуація',
          body: 'Попередня зміна прибрала зону, але наступна бачить залишені предмети або не знає про зауваження. Vakhta пов’язує чекліст, фотографії та рішення майстра. Під час передачі видно не лише позначку про завершення роботи, а й матеріали, на яких ґрунтується перевірка.',
        },
        {
          title: 'Люди та відповідальність',
          body: 'Працівник завершує роботу, виконує прибирання та призначений чекліст, додає фото й надсилає звіт. Майстер перевіряє матеріали та фіксує рішення. Наступний працівник приймає зону у своєму процесі. Зауваження зберігаються разом із передачею, щоб домовленості не губилися.',
        },
        {
          title: 'Що перевірити під час пілоту',
          body: 'Для однієї зони погодьте ознаки готовності та вимоги до фото. Порівнюйте частку передач із повними доказами, очікування рішення і повторні зауваження. Окремо обговорюйте випадки, коли наступна зміна отримала непідготовлене місце: сама наявність фото ще не означає якісну передачу.',
        },
        {
          title: 'Межі та підготовка',
          body: 'Кнопка завершення роботи веде до прибирання та звіту, а не закриває зміну одразу. Вихід фіксується QR після необхідних кроків; передбачені окремі регламентні дії майстра. Фото й підказки системи допомагають перевірці, але не замінюють рішення людини.',
        },
      ],
    },
    checklists: {
      title: 'Електронні чеклісти для виробництва — Vakhta',
      sections: [
        {
          title: 'Виробнича ситуація',
          body: 'Коли вимоги до прибирання пояснюють усно, різні зміни розуміють готовність по-різному. Конструктор допомагає зафіксувати потрібні пункти й вимоги до доказів. Працівник отримує призначений чекліст у робочому процесі, а майстер перевіряє його виконання в панелі.',
        },
        {
          title: 'Люди та відповідальність',
          body: 'Відповідальна людина налаштовує вимоги для потрібної роботи. Працівник виконує пункти й подає матеріали; майстер розглядає результат та зауваження. Перед пілотом пройдіть чекліст разом із виконавцем: формулювання має описувати спостережуваний результат, а не загальне «усе добре».',
        },
        {
          title: 'Що перевірити під час пілоту',
          body: 'Почніть із короткого чекліста однієї зони. Перевірте, чи люди однаково розуміють кожен пункт, чи фото дозволяють оцінити результат і які зауваження повторюються. Мета — придатна до роботи зона та зрозуміла передача, а не максимальна кількість заповнених пунктів.',
        },
        {
          title: 'Межі та підготовка',
          body: 'Це робочі вимоги вашого виробництва, а не готова сертифікація безпеки чи якості. Правила має перевірити відповідальна за процес людина. Не включайте до фото документи та особисті дані, які не потрібні для оцінки стану зони.',
        },
      ],
    },
    schedule: {
      title: 'Планування змін персоналу на виробництві — Vakhta',
      sections: [
        {
          title: 'Виробнича ситуація',
          body: 'До нічної зміни лишилося кілька годин, а в одній зоні немає призначеного працівника. У графіку планувальник бачить покриття, відсутності й конфлікти до публікації. Команда працює з опублікованим планом, а фактична явка допомагає виявити відхилення.',
        },
        {
          title: 'Люди та відповідальність',
          body: 'Планувальник готує призначення за працівниками або зонами та перевіряє конфлікти. Працівник переглядає свій опублікований план у Telegram. Майстер використовує оперативну панель, щоб побачити фактичний стан зміни. Запланована присутність і зафіксований прихід — різні факти.',
        },
        {
          title: 'Що перевірити під час пілоту',
          body: 'Оберіть підрозділ і один цикл планування. Перевірте незакриті місця перед публікацією, зрозумілість плану для працівників і розбіжності між планом та явкою. Погодьте, хто реагує на відсутність і як повідомляє про зміну домовленостей.',
        },
        {
          title: 'Межі та підготовка',
          body: 'Графік персоналу не планує виробничі замовлення, завантаження верстатів чи випуск продукції. Для запуску потрібні актуальні працівники, зони й правила змін. Рішення про заміну людини приймає уповноважений керівник; календар сам по собі не гарантує наявності персоналу.',
        },
      ],
    },
    reports: {
      title: 'Звіти про простої та робочий час — Vakhta',
      sections: [
        {
          title: 'Виробнича ситуація',
          body: 'За зміну виникло кілька коротких зупинок, але з пам’яті важко обрати найважливішу. Звіти збирають зафіксовану роботу, перерви й простої за період. Керівник може перейти від окремого випадку до структури записаних втрат і вибрати тему для наступного розбору.',
        },
        {
          title: 'Люди та відповідальність',
          body: 'Працівники створюють факти у своєму робочому процесі, майстер реагує та перевіряє матеріали. Керівник переглядає звіт у погоджених межах доступу. Під час обговорення дивіться не лише на підсумок, а й на повноту записів, причини та контекст відповідної зміни.',
        },
        {
          title: 'Що перевірити під час пілоту',
          body: 'Погодьте період, підрозділ і визначення показника до порівняння. Виберіть одну повторювану причину, перевірте записи та домовтеся про дію. Після зміни процесу порівняйте зіставні періоди; разом із результатом зазначте пропуски й зміни умов роботи.',
        },
        {
          title: 'Межі та підготовка',
          body: 'Сума інтервалів кількох працівників — це не автоматично тривалість простою обладнання. Vakhta не вимірює OEE чи потужність лінії. Записи допомагають сформувати й перевірити гіпотезу, але сам звіт не доводить причинність або досягнуту економію.',
        },
      ],
    },
  },
  resources: [
    {
      id: 'shift-handover-checklist',
      title: 'Чекліст передачі виробничої зміни: шаблон і приклад',
      intro:
        'Узгодьте, що наступна зміна має знати про зону, її стан і відкриті питання. Шаблон можна завантажити та адаптувати до вашого процесу.',
      featureId: 'handover',
      sections: [
        {
          title: 'Підготуйте передачу',
          body: 'Визначте одну зону та відповідального за перевірку. Перелічіть спостережувані ознаки готовності й необхідні фото. Не підміняйте цей робочий шаблон обов’язковими інструкціями безпеки вашого підприємства.',
        },
        {
          title: 'Зафіксуйте стан і наступний крок',
          body: 'Наприклад: після прибирання на столі залишилася тара. Працівник додає фото, майстер фіксує зауваження, а наступна зміна бачить, що потребує уваги. У записі мають бути факт, відповідальна людина та наступна дія; припущення зазначайте окремо.',
        },
        {
          title: 'Перевірте приймання',
          body: 'Порівняйте подані матеріали з погодженими вимогами. Зафіксуйте рішення та відкриті питання. Під час наступного розбору подивіться, які зауваження повторювалися і чи мала наступна зміна достатній контекст.',
        },
      ],
      fields: [
        'Дата і зміна',
        'Зона',
        'Хто передає',
        'Хто перевіряє',
        'Стан прибирання',
        'Пункти чекліста',
        'Фото та пояснення',
        'Відкриті питання',
        'Відповідальний і наступна дія',
        'Рішення щодо передачі',
      ],
    },
    {
      id: 'downtime-reasons-log',
      title: 'Журнал причин простоїв: від запису до дії',
      intro:
        'Відокремте те, що відбулося, від припущення про причину. Використайте журнал як основу розмови з майстром і перевірки повторюваних перешкод.',
      featureId: 'reports',
      sections: [
        {
          title: 'Домовтеся про одиниці обліку',
          body: 'Вкажіть, що вимірюєте: інтервал працівника, подію в зоні чи зупинку обладнання з окремим джерелом даних. Якщо двоє працівників чекали по 10 хв одночасно, це 20 людино-хвилин, а не доказ 20 хв простою верстата.',
        },
        {
          title: 'Запишіть спостереження',
          body: 'Приклад: о 10:00 працівник повідомив про відсутність матеріалу, майстер відреагував о 10:04. Час до реакції — 4 хв; це ще не час до відновлення роботи. Збережіть первинне повідомлення, наступну перевірку причини та фактичний результат окремо.',
        },
        {
          title: 'Оберіть одну зміну процесу',
          body: 'Згрупуйте зіставні записи за періодом і причинами. Перевірте пропуски, виберіть повторювану перешкоду та погодьте дію. Після її виконання порівняйте схожі зміни. Зменшення записаних втрат може означати також неповний облік — перевірте це до висновків.',
        },
      ],
      fields: [
        'Дата і зміна',
        'Зона',
        'Джерело запису',
        'Що спостерігали',
        'Початок і кінець інтервалу',
        'Одиниця виміру',
        'Повідомлена причина',
        'Перевірена причина',
        'Час повідомлення',
        'Час реакції',
        'Відповідальний',
        'Вжита дія',
        'Результат',
        'Пропуски та невідомі дані',
      ],
    },
  ],
};

export const seoEn: LandingSeo = {
  resourcesTitle: 'Practical resources for manufacturing',
  resourcesIntro:
    'Choose one process, agree who is responsible and evaluate changes using recorded facts.',
  templateTitle: 'A template for your team',
  download: 'Download the template (.txt)',
  related: 'Related capabilities',
  resourcesLabel: 'Resources',
  details: {
    incidents: {
      title: 'Manufacturing downtime and incident response — Vakhta',
      sections: [
        {
          title: 'A situation on the shop floor',
          body: 'A work area is waiting for material, but the supervisor hears about it only at shift end. A worker reports the reason through Telegram. The panel retains context, status and response history, so the team does not have to reconstruct the event from several conversations.',
        },
        {
          title: 'People and responsibilities',
          body: 'Workers describe the obstacle. The shift master reviews the incident and records a response and decision. Escalation draws attention to overdue responses; the responsible person remains accountable for the decision. Production leaders review recurring recorded reasons instead of judging the situation by message counts alone.',
        },
        {
          title: 'What to evaluate in a pilot',
          body: 'Choose one recurring obstacle, such as waiting for material. Before starting, agree what counts as a response and how its delay is measured. Compare similar shifts, check missing records and separate a verified cause from the worker’s initial hypothesis.',
        },
        {
          title: 'Scope and preparation',
          body: 'Worker records do not replace equipment sensors or establish root cause. Define the site, responsible people and reasons before launch. Bring one recent example to the demo without personal or confidential information.',
        },
      ],
    },
    handover: {
      title: 'Manufacturing shift handover with checklists — Vakhta',
      sections: [
        {
          title: 'A situation on the shop floor',
          body: 'The outgoing team cleaned an area, yet the next team finds objects left behind or does not know about a concern. Vakhta connects the checklist, photos and the master’s decision. The handover retains the evidence behind the review, rather than just a completion mark.',
        },
        {
          title: 'People and responsibilities',
          body: 'The worker finishes work, cleans the area, completes the assigned checklist, adds photos and submits a report. The master reviews the evidence and records a decision. The incoming worker accepts the area in their own workflow. Remarks remain attached to the handover.',
        },
        {
          title: 'What to evaluate in a pilot',
          body: 'For one area, agree readiness criteria and photo requirements. Compare handovers with complete evidence, waiting time for review and recurring remarks. Discuss cases where the next shift inherited an unprepared workplace: a photo alone does not prove a good handover.',
        },
        {
          title: 'Scope and preparation',
          body: 'Finishing work leads to cleaning and reporting; it does not immediately close the shift. Exit is recorded by QR after the required steps, with separate regulated master actions available. Photos and system suggestions support review; a person makes the decision.',
        },
      ],
    },
    checklists: {
      title: 'Digital checklists for manufacturing teams — Vakhta',
      sections: [
        {
          title: 'A situation on the shop floor',
          body: 'Verbal cleaning instructions leave different shifts with different expectations. The checklist builder helps record required items and evidence. Workers receive the assigned checklist within their workflow, while the master reviews the submitted result in the panel.',
        },
        {
          title: 'People and responsibilities',
          body: 'The responsible person configures requirements for the work. Workers complete the items and submit evidence; the master reviews the result and remarks. Before a pilot, walk through the checklist with a worker: each item should describe an observable outcome, not a vague “everything is fine”.',
        },
        {
          title: 'What to evaluate in a pilot',
          body: 'Start with a short checklist for one area. Check whether people interpret each item consistently, whether photos support a decision and which remarks recur. The purpose is a ready workplace and a clear handover, not the highest number of checked boxes.',
        },
        {
          title: 'Scope and preparation',
          body: 'These are your operational requirements, not a safety or quality certification. The process owner should review the rules. Exclude documents and personal information from photos unless needed to assess the area.',
        },
      ],
    },
    schedule: {
      title: 'Manufacturing employee shift scheduling — Vakhta',
      sections: [
        {
          title: 'A situation on the shop floor',
          body: 'A night shift starts soon, but one area has no assigned worker. The planner can review coverage, absences and conflicts before publishing the schedule. Workers use the published plan, and recorded attendance helps reveal deviations.',
        },
        {
          title: 'People and responsibilities',
          body: 'The planner prepares assignments by worker or area and reviews conflicts. Workers see their published plan in Telegram. The master uses the operations panel to review the actual shift state. Planned presence and a recorded arrival are different facts.',
        },
        {
          title: 'What to evaluate in a pilot',
          body: 'Choose one department and one planning cycle. Review open slots before publication, whether workers understand their plans and where attendance differs from assignments. Agree who responds to an absence and how changed arrangements are communicated.',
        },
        {
          title: 'Scope and preparation',
          body: 'Employee scheduling does not plan production orders, machine capacity or output. Launch requires current workers, areas and shift rules. An authorized manager decides on replacements; a calendar alone does not guarantee staffing.',
        },
      ],
    },
    reports: {
      title: 'Manufacturing downtime and working-time reports — Vakhta',
      sections: [
        {
          title: 'A situation on the shop floor',
          body: 'Several short interruptions occurred during a shift, but memory alone cannot identify the most useful next investigation. Reports bring together recorded work, breaks and downtime for a period. Leaders can move from individual events to the structure of recorded time loss.',
        },
        {
          title: 'People and responsibilities',
          body: 'Workers create records through their workflow, and the master responds and reviews evidence. Leaders access reports within their assigned scope. When discussing totals, also consider missing records, recorded reasons and the conditions of each shift.',
        },
        {
          title: 'What to evaluate in a pilot',
          body: 'Agree the period, department and metric definition before comparing results. Choose one recurring reason, review the records and agree an action. After changing the process, compare similar periods and document gaps and changes in working conditions.',
        },
        {
          title: 'Scope and preparation',
          body: 'Adding several workers’ overlapping intervals does not give equipment downtime. Vakhta does not measure OEE or line capacity. Reports support the investigation of a hypothesis; they do not establish causality or prove savings by themselves.',
        },
      ],
    },
  },
  resources: [
    {
      id: 'shift-handover-checklist',
      title: 'Manufacturing shift handover checklist: template and example',
      intro:
        'Agree what the incoming shift needs to know about an area, its condition and unresolved questions. Download and adapt this template to your process.',
      featureId: 'handover',
      sections: [
        {
          title: 'Prepare the handover',
          body: 'Choose one area and a person responsible for review. List observable readiness criteria and required photos. This operational template does not replace your site’s mandatory safety instructions.',
        },
        {
          title: 'Record the condition and next action',
          body: 'For example, packaging remains on a table after cleaning. The worker adds a photo, the master records a remark and the incoming shift sees what needs attention. Include the observed fact, an accountable person and the next action; keep assumptions separate.',
        },
        {
          title: 'Review acceptance',
          body: 'Compare the evidence with agreed requirements. Record the decision and unresolved questions. At the next review, check which remarks recurred and whether the incoming team had enough context.',
        },
      ],
      fields: [
        'Date and shift',
        'Area',
        'Outgoing worker',
        'Reviewer',
        'Cleaning condition',
        'Checklist items',
        'Photos and explanation',
        'Unresolved questions',
        'Owner and next action',
        'Handover decision',
      ],
    },
    {
      id: 'downtime-reasons-log',
      title: 'Downtime reasons log: from records to action',
      intro:
        'Separate what happened from an assumption about its cause. Use this log to discuss recurring obstacles with the shift master.',
      featureId: 'reports',
      sections: [
        {
          title: 'Agree the measurement unit',
          body: 'Specify whether you measure a worker interval, an area event or equipment downtime from a separate source. Two workers waiting for 10 minutes at the same time represent 20 person-minutes, not evidence of 20 minutes of machine downtime.',
        },
        {
          title: 'Record the observation',
          body: 'Example: a worker reports missing material at 10:00 and the master responds at 10:04. The response delay is four minutes; this is not yet the time to resume work. Keep the initial report, cause verification and actual outcome separate.',
        },
        {
          title: 'Choose one process change',
          body: 'Group comparable records by period and reason. Check gaps, choose a recurring obstacle and agree an action. Afterward, compare similar shifts. A reduction in recorded losses can also mean incomplete reporting: check that before drawing conclusions.',
        },
      ],
      fields: [
        'Date and shift',
        'Area',
        'Record source',
        'Observed fact',
        'Interval start and end',
        'Measurement unit',
        'Reported reason',
        'Verified reason',
        'Report time',
        'Response time',
        'Owner',
        'Action taken',
        'Outcome',
        'Missing and unknown data',
      ],
    },
  ],
};

export const seoRu: LandingSeo = {
  resourcesTitle: 'Практические материалы для производства',
  resourcesIntro:
    'Выберите один процесс, договоритесь об ответственности и проверьте изменения по записанным фактам.',
  templateTitle: 'Шаблон для вашей команды',
  download: 'Скачать шаблон (.txt)',
  related: 'Связанные возможности',
  resourcesLabel: 'Материалы',
  details: {
    incidents: {
      title: 'Простои и инциденты на производстве — Vakhta',
      sections: [
        {
          title: 'Производственная ситуация',
          body: 'На участке не хватает материала, работа остановилась, а мастер узнаёт об этом лишь в конце смены. Работник сообщает причину через Telegram. Панель сохраняет контекст, статус и историю реакции, чтобы команде не приходилось восстанавливать события из нескольких чатов.',
        },
        {
          title: 'Люди и ответственность',
          body: 'Работник описывает препятствие. Мастер рассматривает инцидент и фиксирует реакцию и решение. Эскалация обращает внимание на просроченную реакцию; ответственность за решение остаётся у человека. Руководитель исследует повторяющиеся причины в отчётах, а не оценивает ситуацию только по числу сообщений.',
        },
        {
          title: 'Что проверить во время пилота',
          body: 'Выберите одно повторяющееся препятствие, например ожидание материала. До пилота договоритесь, что считается реакцией и как измеряется время до неё. Сравнивайте похожие смены, проверяйте пропуски и отделяйте подтверждённую причину от первоначального предположения работника.',
        },
        {
          title: 'Границы и подготовка',
          body: 'Записи работников не заменяют датчики оборудования и не доказывают первопричину. Определите площадку, ответственных и используемые причины до запуска. Для демо достаточно одного недавнего случая без персональных или конфиденциальных данных.',
        },
      ],
    },
    handover: {
      title: 'Передача смены на производстве с чек-листами — Vakhta',
      sections: [
        {
          title: 'Производственная ситуация',
          body: 'Предыдущая смена убрала зону, но следующая находит оставленные предметы или не знает о замечаниях. Vakhta связывает чек-лист, фотографии и решение мастера. При передаче видны материалы проверки, а не только отметка о завершении работы.',
        },
        {
          title: 'Люди и ответственность',
          body: 'Работник завершает работу, выполняет уборку и назначенный чек-лист, добавляет фото и отправляет отчёт. Мастер проверяет материалы и фиксирует решение. Следующий работник принимает зону в своём процессе. Замечания сохраняются вместе с передачей.',
        },
        {
          title: 'Что проверить во время пилота',
          body: 'Для одной зоны согласуйте признаки готовности и требования к фото. Сравнивайте долю передач с полными доказательствами, ожидание решения и повторные замечания. Отдельно разбирайте случаи, когда следующая смена получила неподготовленное место: наличие фото ещё не означает качественную передачу.',
        },
        {
          title: 'Границы и подготовка',
          body: 'Завершение работы ведёт к уборке и отчёту, а не закрывает смену сразу. Выход фиксируется QR после необходимых шагов; предусмотрены отдельные регламентные действия мастера. Фото и подсказки системы помогают проверке, но решение принимает человек.',
        },
      ],
    },
    checklists: {
      title: 'Электронные чек-листы для производства — Vakhta',
      sections: [
        {
          title: 'Производственная ситуация',
          body: 'Устные требования к уборке разные смены понимают по-разному. Конструктор помогает зафиксировать необходимые пункты и доказательства. Работник получает назначенный чек-лист в своём процессе, а мастер проверяет результат в панели.',
        },
        {
          title: 'Люди и ответственность',
          body: 'Ответственный настраивает требования к работе. Работник выполняет пункты и подаёт материалы; мастер рассматривает результат и замечания. До пилота пройдите чек-лист вместе с исполнителем: формулировка должна описывать наблюдаемый результат, а не общее «всё хорошо».',
        },
        {
          title: 'Что проверить во время пилота',
          body: 'Начните с короткого чек-листа одной зоны. Проверьте одинаковое понимание пунктов, пригодность фото для проверки и повторные замечания. Цель — готовая к работе зона и понятная передача, а не максимальное число заполненных пунктов.',
        },
        {
          title: 'Границы и подготовка',
          body: 'Это рабочие требования вашего производства, а не готовая сертификация безопасности или качества. Правила должен проверить ответственный за процесс. Не включайте в фото документы и личные данные, не нужные для оценки зоны.',
        },
      ],
    },
    schedule: {
      title: 'Планирование смен персонала на производстве — Vakhta',
      sections: [
        {
          title: 'Производственная ситуация',
          body: 'До ночной смены осталось несколько часов, а в одной зоне нет назначенного работника. Планировщик видит покрытие, отсутствия и конфликты до публикации. Команда использует опубликованный план, а фактическая явка помогает находить отклонения.',
        },
        {
          title: 'Люди и ответственность',
          body: 'Планировщик готовит назначения по работникам или зонам и проверяет конфликты. Работник видит опубликованный план в Telegram. Мастер использует оперативную панель для фактического состояния смены. Плановая явка и зафиксированный приход — разные факты.',
        },
        {
          title: 'Что проверить во время пилота',
          body: 'Выберите подразделение и один цикл планирования. Проверьте незакрытые места до публикации, понятность плана и расхождения с явкой. Договоритесь, кто реагирует на отсутствие и как сообщает об изменившихся договорённостях.',
        },
        {
          title: 'Границы и подготовка',
          body: 'График персонала не планирует производственные заказы, загрузку станков или выпуск продукции. Для запуска нужны актуальные работники, зоны и правила смен. Решение о замене принимает уполномоченный руководитель; календарь сам по себе не гарантирует наличие людей.',
        },
      ],
    },
    reports: {
      title: 'Отчёты о простоях и рабочем времени — Vakhta',
      sections: [
        {
          title: 'Производственная ситуация',
          body: 'За смену произошло несколько коротких остановок, но по памяти трудно выбрать важнейшую. Отчёты собирают зафиксированную работу, перерывы и простои за период. Руководитель может перейти от отдельного события к структуре записанных потерь и выбрать тему для разбора.',
        },
        {
          title: 'Люди и ответственность',
          body: 'Работники создают записи в своём процессе, мастер реагирует и проверяет материалы. Руководитель смотрит отчёт в рамках своего доступа. Обсуждая итоги, учитывайте полноту записей, причины и условия конкретной смены.',
        },
        {
          title: 'Что проверить во время пилота',
          body: 'Согласуйте период, подразделение и определение показателя до сравнения. Выберите повторяющуюся причину, проверьте записи и договоритесь о действии. После изменения процесса сравните сопоставимые периоды, отметив пропуски и изменения условий работы.',
        },
        {
          title: 'Границы и подготовка',
          body: 'Сумма пересекающихся интервалов работников не равна простою оборудования. Vakhta не измеряет OEE или мощность линии. Записи помогают проверить гипотезу, но отчёт сам по себе не доказывает причинность или достигнутую экономию.',
        },
      ],
    },
  },
  resources: [
    {
      id: 'shift-handover-checklist',
      title: 'Чек-лист передачи производственной смены: шаблон и пример',
      intro:
        'Согласуйте, что следующая смена должна знать о зоне, её состоянии и открытых вопросах. Скачайте шаблон и адаптируйте его к своему процессу.',
      featureId: 'handover',
      sections: [
        {
          title: 'Подготовьте передачу',
          body: 'Выберите одну зону и ответственного за проверку. Перечислите наблюдаемые признаки готовности и нужные фото. Этот рабочий шаблон не заменяет обязательные инструкции безопасности предприятия.',
        },
        {
          title: 'Запишите состояние и следующий шаг',
          body: 'Например, после уборки на столе осталась тара. Работник добавляет фото, мастер фиксирует замечание, следующая смена видит, что требует внимания. Укажите факт, ответственного и следующее действие; предположения отмечайте отдельно.',
        },
        {
          title: 'Проверьте приёмку',
          body: 'Сопоставьте материалы с согласованными требованиями. Зафиксируйте решение и открытые вопросы. На следующем разборе проверьте повторные замечания и достаточность контекста для входящей смены.',
        },
      ],
      fields: [
        'Дата и смена',
        'Зона',
        'Кто передаёт',
        'Кто проверяет',
        'Состояние уборки',
        'Пункты чек-листа',
        'Фото и пояснения',
        'Открытые вопросы',
        'Ответственный и следующее действие',
        'Решение по передаче',
      ],
    },
    {
      id: 'downtime-reasons-log',
      title: 'Журнал причин простоев: от записи к действию',
      intro:
        'Отделяйте произошедшее от предположения о причине. Используйте журнал для разговора с мастером и проверки повторяющихся препятствий.',
      featureId: 'reports',
      sections: [
        {
          title: 'Согласуйте единицы учёта',
          body: 'Укажите, что измеряете: интервал работника, событие в зоне или простой оборудования по отдельному источнику. Двое работников, одновременно ожидавших по 10 минут, дают 20 человеко-минут, а не доказательство 20 минут простоя станка.',
        },
        {
          title: 'Запишите наблюдение',
          body: 'Пример: работник сообщил об отсутствии материала в 10:00, мастер отреагировал в 10:04. Время до реакции — 4 минуты; это ещё не время до возобновления работы. Сохраните первоначальное сообщение, проверку причины и фактический результат отдельно.',
        },
        {
          title: 'Выберите одно изменение процесса',
          body: 'Сгруппируйте сопоставимые записи по периоду и причинам. Проверьте пропуски, выберите повторяющееся препятствие и согласуйте действие. Затем сравните похожие смены. Снижение записанных потерь может означать неполный учёт — проверьте это до выводов.',
        },
      ],
      fields: [
        'Дата и смена',
        'Зона',
        'Источник записи',
        'Наблюдение',
        'Начало и конец интервала',
        'Единица измерения',
        'Сообщённая причина',
        'Проверенная причина',
        'Время сообщения',
        'Время реакции',
        'Ответственный',
        'Принятое действие',
        'Результат',
        'Пропуски и неизвестные данные',
      ],
    },
  ],
};
