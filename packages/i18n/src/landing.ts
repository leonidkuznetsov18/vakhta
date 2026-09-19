import { seoUk, seoEn, seoRu, type LandingSeo } from './landing-seo.js';
import { faqUk, faqEn, faqRu } from './landing-faq.js';
import { tourUk, tourEn, tourRu, type LandingTour } from './landing-tour.js';
type TextBlock = { title: string; body: string };
export type LandingMessages = {
  tour: LandingTour;
  seo: LandingSeo;
  download: string;
  portraits: string[];
  portraitNote: string;
  productScreens: {
    title: string;
    body: string;
    panel: string;
    panelCaption: string;
    kiosk: string;
    kioskCaption: string;
    telegram: string;
    telegramCaption: string;
    incidentCaption: string;
    handoverCaption: string;
    openImage: string;
  };
  title: string;
  description: string;
  skip: string;
  language: string;
  languageNames: { uk: string; en: string; ru: string };
  signIn: string;
  nav: { workflow: string; capabilities: string; pilot: string; faq: string };
  audience: string;
  hero: string;
  intro: string;
  pilotCta: string;
  demoCta: string;
  investorCta: string;
  readWorkflow: string;
  heroNote: string;
  illustration: string;
  worker: string;
  master: string;
  reportExample: string;
  responseExample: string;
  recordExample: string;
  followUp: string;
  problem: TextBlock;
  problems: TextBlock[];
  workflow: TextBlock;
  steps: TextBlock[];
  capabilities: TextBlock;
  losses: TextBlock;
  incidents: TextBlock;
  checklists: TextBlock;
  handover: TextBlock;
  lossLimit: string;
  supporting: TextBlock;
  teams: TextBlock;
  roles: TextBlock[];
  demo: TextBlock;
  demoSteps: string[];
  demoNote: string;
  pilot: TextBlock;
  pilotSteps: TextBlock[];
  pilotNote: string;
  trust: TextBlock;
  trustPoints: string[];
  investors: TextBlock;
  faq: string;
  questions: TextBlock[];
  contact: TextBlock;
  contactHint: string;
  emailHint: string;
  subjects: { pilot: string; demo: string; investor: string };
  emailBody: string;
  privacy: string;
  operator: string;
  footer: string;
  preview: string;
  contactPending: string;
  notFound: string;
  backHome: string;
};

export const landingEn: LandingMessages = {
  download: 'Download the team overview (.txt)',
  tour: tourEn,
  seo: seoEn,
  portraits: [
    'Machine operator',
    'Maintenance technician',
    'Quality inspector',
    'Shift supervisor',
    'Packaging operator',
    'Industrial electrician',
  ],
  portraitNote: 'Illustrative portraits of manufacturing professions, generated with AI.',
  productScreens: {
    title: 'Three interfaces. One connected shift.',
    body: 'A kiosk for attendance, Telegram for workers and a web panel for responsible managers. These are screenshots of the actual Vakhta interfaces.',
    panel: 'A clear view for the production team',
    panelCaption:
      'Actual web-panel interface with synthetic demo data. Ukrainian workspace. The figures illustrate the report, not customer results.',
    kiosk: 'At the entrance: the QR kiosk',
    kioskCaption: 'Actual kiosk screen with a historical, expired QR. It cannot record attendance.',
    telegram: 'In a worker’s pocket: Telegram',
    telegramCaption:
      'A cropped view of the actual bot in Telegram. Personal details are concealed. Ukrainian interface.',
    incidentCaption:
      'Actual incident details with synthetic demo records: a worker report and the recorded response.',
    handoverCaption:
      'Actual checklist and handover review with synthetic demo records. Ukrainian interface.',
    openImage: 'Open screenshot at full size',
  },
  title: 'Manufacturing shift operations and downtime response — Vakhta',
  description:
    'Connect worker reports, incident response, personnel checklists and shift handover. Explore recurring time loss in manufacturing and discuss a focused pilot.',
  skip: 'Skip to content',
  language: 'Language',
  languageNames: { uk: 'Українська', en: 'English', ru: 'Русский' },
  signIn: 'Sign in',
  nav: { workflow: 'How it works', capabilities: 'Capabilities', pilot: 'Pilot', faq: 'Questions' },
  audience: 'For manufacturing teams working in shifts',
  hero: 'Less downtime. Fewer repeat incidents. A better prepared shift.',
  intro:
    'Bring worker reports, responsible people and shift records together. Understand recurring interruptions and act while the problem still needs attention.',
  pilotCta: 'Discuss a pilot',
  demoCta: 'Request a demo',
  investorCta: 'Discuss investment',
  readWorkflow: 'See how it works',
  heroNote: 'Workers in Telegram. Managers in one web panel.',
  illustration: 'Illustrative workflow · not a product screenshot',
  worker: 'Worker · Telegram',
  master: 'Shift master · Web panel',
  reportExample: 'Work has stopped. Waiting for materials.',
  responseExample: 'Review the incident and record the response.',
  recordExample: 'Keep the reason and actions in the shift record.',
  followUp: 'From a report to a recorded response',
  problem: {
    title: 'The interruption is visible. Its story often is not.',
    body: 'Calls, chats and paper logs leave pieces of the same problem in different places. The next shift starts without the full picture.',
  },
  problems: [
    {
      title: 'The problem reaches a manager late',
      body: 'The worker reports it, but the message gets lost among other conversations.',
    },
    {
      title: 'The same reason comes back',
      body: 'Teams deal with the interruption without a shared record of when and why it happened.',
    },
    {
      title: 'Checks disappear between shifts',
      body: 'A missed checklist or unclear handover leaves the next team to discover the problem again.',
    },
  ],
  workflow: {
    title: 'Give every problem a clear next step.',
    body: 'Connect the people on the floor with the people responsible for the response.',
  },
  steps: [
    { title: 'Report', body: 'A worker records a problem through Telegram.' },
    {
      title: 'Respond',
      body: 'The shift master reviews the incident. Escalation helps surface overdue attention.',
    },
    {
      title: 'Check and hand over',
      body: 'Personnel follow checklists and attach evidence. The responsible person records the handover decision.',
    },
    {
      title: 'Learn from records',
      body: 'Review repeated reasons and recorded time loss to choose what to investigate next.',
    },
  ],
  capabilities: {
    title: 'Four connected parts of a more accountable shift.',
    body: 'Start with the interruption. Keep the context through response, checks and handover.',
  },
  losses: {
    title: 'Find recurring reasons for lost time',
    body: 'Review recorded employee activity and loss categories by production unit. Use recurring patterns to focus the next conversation on the shop floor.',
  },
  incidents: {
    title: 'Bring incidents to the people who can act',
    body: 'Record an incident, review its status and retain the response. SLA escalation draws attention to overdue incidents.',
  },
  checklists: {
    title: 'Make expected work clear to personnel',
    body: 'Create checklists for assigned work. Collect answers and photos so a reviewer can see what was submitted and request correction when needed.',
  },
  handover: {
    title: 'Carry context into the next shift',
    body: 'Keep checklist evidence, remarks and recorded acceptance decisions together. The next team can understand what was handed over.',
  },
  lossLimit:
    'Employee activity records are not machine telemetry. They help investigate time loss; they do not measure OEE, line capacity or prove a root cause.',
  supporting: {
    title: 'The rest of the shift stays connected',
    body: 'Shift planning, QR attendance, employee requests, communications and rule-based bonuses support the same operational record.',
  },
  teams: {
    title: 'One workflow. A useful view for each role.',
    body: 'From the person reporting an interruption to the person responsible for production.',
  },
  roles: [
    {
      title: 'Owner or production head',
      body: 'See recorded loss patterns and recurring incidents. Choose where to investigate and what a pilot should measure.',
    },
    {
      title: 'Shift master',
      body: 'See problems needing attention, review evidence and record the response and handover decisions.',
    },
    {
      title: 'Worker and reviewer',
      body: 'Report a problem, complete the assigned checklist and submit or review evidence in the relevant workflow.',
    },
  ],
  demo: {
    title: 'Bring one real problem to the demo.',
    body: 'Start with a recent interruption at your production site. Walk through the matching scenario together.',
  },
  demoSteps: [
    'A worker reports an interruption',
    'The responsible person reviews the incident',
    'A checklist and handover retain evidence',
    'A report shows recorded loss reasons',
  ],
  demoNote:
    'Screens are labelled as demonstrations or authorized real cases. Personal fields are excluded from real-case screenshots.',
  pilot: {
    title: 'Test it on one process. Decide from evidence.',
    body: 'A focused pilot starts with your recurring problem and a person responsible for the test.',
  },
  pilotSteps: [
    {
      title: 'Choose the scope',
      body: 'Agree on one production process, participating shifts and a pilot owner.',
    },
    {
      title: 'Record the starting point',
      body: 'Agree how to compare response time, recurring incident reasons and checklist completeness.',
    },
    {
      title: 'Review the result',
      body: 'Discuss what changed, what did not and whether the value justifies the next step.',
    },
  ],
  pilotNote:
    'Scope, timing and commercial terms are agreed together. Downtime reduction is a goal to test, not a promised percentage.',
  trust: {
    title: 'Evidence for decisions. People remain accountable.',
    body: 'Recorded facts help a manager investigate a problem without turning an incomplete record into a conclusion.',
  },
  trustPoints: [
    'Access follows assigned roles and scope.',
    'Checklist photos support a recorded human review.',
    'Overlapping employee intervals are not added up as equipment downtime.',
  ],
  investors: {
    title: 'Interested in the manufacturing thesis?',
    body: 'We are testing demand for connected frontline operations in manufacturing. Discuss the product, evidence and next milestones with us.',
  },
  faq: 'Before you bring it to the shop floor',
  questions: faqEn,
  contact: {
    title: 'What interrupts your production?',
    body: 'Tell us about your process, a recurring problem and your role. We will have a concrete starting point for a demo or pilot discussion.',
  },
  contactHint: 'Choose the conversation you want to start.',
  emailHint:
    'The button opens your email app with the recipient and subject filled in. You choose when to send the message.',
  subjects: {
    pilot: 'Vakhta: manufacturing pilot',
    demo: 'Vakhta: product demonstration',
    investor: 'Vakhta: investment discussion',
  },
  emailBody:
    'Company / production process:\nMy role:\nRecurring problem or topic:\nCurrent workaround:\nPreferred next step:\n',
  privacy:
    'This page has no lead form or third-party analytics. Email is sent through your email provider. Include only information needed for the conversation.',
  operator: 'Site operator',
  footer: 'Connected frontline operations for manufacturing.',
  preview: 'Preview — publication inputs and product evidence are still under review.',
  contactPending: 'Contact details will be available when the site launches.',
  notFound: 'This page was not found.',
  backHome: 'Open the landing page',
};

export const landingUk: LandingMessages = {
  download: 'Завантажити огляд для команди (.txt)',
  tour: tourUk,
  seo: seoUk,
  portraits: [
    'Оператор верстата',
    'Технік з обслуговування',
    'Контролер якості',
    'Майстер зміни',
    'Оператор пакувальної лінії',
    'Промисловий електрик',
  ],
  portraitNote: 'Ілюстративні портрети виробничих професій, згенеровані ШІ.',
  productScreens: {
    title: 'Три інтерфейси. Одна пов’язана зміна.',
    body: 'Кіоск для обліку присутності, Telegram для працівників і вебпанель для відповідальних керівників. Це знімки справжніх інтерфейсів Вахти.',
    panel: 'Зрозуміла картина для виробничої команди',
    panelCaption:
      'Справжній інтерфейс вебпанелі з вигаданими демоданими. Українська робоча область. Числа ілюструють звіт, а не результати клієнтів.',
    kiosk: 'На вході — QR-кіоск',
    kioskCaption:
      'Справжній екран кіоску з історичним QR, термін дії якого минув. Він не дозволяє відмітити присутність.',
    telegram: 'У кишені працівника — Telegram',
    telegramCaption:
      'Фрагмент справжнього бота в Telegram. Особисті дані приховано. Український інтерфейс.',
    incidentCaption:
      'Справжні деталі інциденту з вигаданими демозаписами: повідомлення працівника та зафіксована реакція.',
    handoverCaption:
      'Справжня перевірка чекліста й передачі з вигаданими демозаписами. Український інтерфейс.',
    openImage: 'Відкрити знімок у повному розмірі',
  },
  title: 'Управління змінами та простоями на виробництві — Vakhta',
  description:
    'Повідомлення працівників, реагування на інциденти, чеклісти персоналу й передача зміни в одному процесі. Дослідіть повторювані втрати часу та обговоріть пілот.',
  skip: 'Перейти до змісту',
  language: 'Мова',
  languageNames: { uk: 'Українська', en: 'English', ru: 'Русский' },
  signIn: 'Увійти',
  nav: { workflow: 'Як це працює', capabilities: 'Можливості', pilot: 'Пілот', faq: 'Запитання' },
  audience: 'Для виробництв зі змінними командами',
  hero: 'Менше простоїв. Менше повторних інцидентів. Підготовлена зміна.',
  intro:
    'Поєднайте повідомлення працівників, відповідальних людей і записи зміни. Знаходьте повторювані перешкоди та дійте, поки проблема потребує уваги.',
  pilotCta: 'Обговорити пілот',
  demoCta: 'Замовити демо',
  investorCta: 'Обговорити інвестицію',
  readWorkflow: 'Подивитися, як це працює',
  heroNote: 'Працівники — у Telegram. Керівники — в одній вебпанелі.',
  illustration: 'Ілюстрація процесу · не знімок продукту',
  worker: 'Працівник · Telegram',
  master: 'Майстер зміни · Вебпанель',
  reportExample: 'Робота зупинилася. Очікуємо матеріали.',
  responseExample: 'Переглянути інцидент і зафіксувати реакцію.',
  recordExample: 'Зберегти причину й дії в записах зміни.',
  followUp: 'Від повідомлення до зафіксованої реакції',
  problem: {
    title: 'Зупинку видно. Її історію — не завжди.',
    body: 'Дзвінки, чати й паперові журнали зберігають різні частини однієї проблеми. Наступна зміна починає роботу без повної картини.',
  },
  problems: [
    {
      title: 'Керівник дізнається запізно',
      body: 'Працівник повідомив про проблему, але повідомлення загубилося серед інших розмов.',
    },
    {
      title: 'Та сама причина повторюється',
      body: 'Команда усуває перешкоду, але спільного запису про те, коли й чому вона виникла, немає.',
    },
    {
      title: 'Перевірки губляться між змінами',
      body: 'Пропущений чекліст або незрозуміла передача змушують наступну команду знову виявляти проблему.',
    },
  ],
  workflow: {
    title: 'Для кожної проблеми — зрозумілий наступний крок.',
    body: 'Поєднайте людей на виробництві з тими, хто відповідає за реагування.',
  },
  steps: [
    { title: 'Повідомити', body: 'Працівник фіксує проблему через Telegram.' },
    {
      title: 'Відреагувати',
      body: 'Майстер зміни переглядає інцидент. Ескалація допомагає привернути увагу до прострочених реакцій.',
    },
    {
      title: 'Перевірити й передати',
      body: 'Персонал виконує чеклісти й додає докази. Відповідальна людина фіксує рішення щодо передачі.',
    },
    {
      title: 'Дослідити записи',
      body: 'Перегляньте повторювані причини й зафіксовані втрати часу, щоб обрати, що дослідити далі.',
    },
  ],
  capabilities: {
    title: 'Чотири складові зміни з чіткою відповідальністю.',
    body: 'Почніть із перешкоди. Збережіть контекст під час реагування, перевірок і передачі зміни.',
  },
  losses: {
    title: 'Знаходьте повторювані причини втрат часу',
    body: 'Переглядайте зафіксовану активність працівників і категорії втрат за підрозділами. Повторювані закономірності підкажуть тему наступної розмови в цеху.',
  },
  incidents: {
    title: 'Доводьте інциденти до тих, хто може діяти',
    body: 'Фіксуйте інцидент, переглядайте його статус і зберігайте реакцію. Ескалація за SLA привертає увагу до прострочених інцидентів.',
  },
  checklists: {
    title: 'Пояснюйте персоналу, що саме потрібно зробити',
    body: 'Створюйте чеклісти для призначеної роботи. Збирайте відповіді й фото, щоб відповідальна людина могла перевірити результат і за потреби запросити виправлення.',
  },
  handover: {
    title: 'Передавайте контекст наступній зміні',
    body: 'Зберігайте докази виконання чекліста, зауваження й рішення щодо приймання разом. Наступна команда розумітиме, що їй передали.',
  },
  lossLimit:
    'Записи активності працівників — не телеметрія обладнання. Вони допомагають досліджувати втрати часу, але не вимірюють OEE, потужність лінії та не доводять першопричину.',
  supporting: {
    title: 'Решта роботи зміни також пов’язана',
    body: 'Планування змін, QR-облік присутності, запити працівників, комунікації та бонуси за правилами доповнюють спільну історію роботи.',
  },
  teams: {
    title: 'Один процес. Корисний погляд для кожної ролі.',
    body: 'Від людини, яка повідомляє про перешкоду, до людини, яка відповідає за виробництво.',
  },
  roles: [
    {
      title: 'Власник або керівник виробництва',
      body: 'Бачить закономірності в записах втрат та повторювані інциденти. Обирає, що дослідити й що виміряти під час пілоту.',
    },
    {
      title: 'Майстер зміни',
      body: 'Бачить проблеми, які потребують уваги, перевіряє докази та фіксує реакцію й рішення щодо передачі.',
    },
    {
      title: 'Працівник і контролер',
      body: 'Повідомляють про проблему, виконують призначений чекліст, подають або перевіряють докази у відповідному процесі.',
    },
  ],
  demo: {
    title: 'Принесіть на демо одну реальну проблему.',
    body: 'Почніть із нещодавньої перешкоди на вашому виробництві. Разом пройдіть відповідний сценарій.',
  },
  demoSteps: [
    'Працівник повідомляє про перешкоду',
    'Відповідальна людина переглядає інцидент',
    'Чекліст і передача зміни зберігають докази',
    'Звіт показує зафіксовані причини втрат',
  ],
  demoNote:
    'Підписи відрізняють демодані від погоджених реальних кейсів. Персональні поля реальних записів виключені з кадру.',
  pilot: {
    title: 'Перевірте на одному процесі. Вирішуйте за фактами.',
    body: 'Пілот починається з вашої повторюваної проблеми та людини, відповідальної за перевірку.',
  },
  pilotSteps: [
    {
      title: 'Оберіть межі',
      body: 'Погодьте один виробничий процес, залучені зміни й відповідального за пілот.',
    },
    {
      title: 'Зафіксуйте початковий стан',
      body: 'Погодьте, як порівнювати час реакції, повторювані причини інцидентів і повноту чеклістів.',
    },
    {
      title: 'Оцініть результат',
      body: 'Обговоріть, що змінилося, що залишилося незмінним і чи виправдовує цінність наступний крок.',
    },
  ],
  pilotNote:
    'Обсяг, строки й комерційні умови погоджуємо разом. Зменшення простоїв — мета перевірки, а не обіцяний відсоток.',
  trust: {
    title: 'Докази для рішень. Відповідальність — за людьми.',
    body: 'Зафіксовані факти допомагають керівнику дослідити проблему, не перетворюючи неповний запис на висновок.',
  },
  trustPoints: [
    'Доступ відповідає призначеним ролям і межам відповідальності.',
    'Фото з чеклістів підтримують зафіксовану перевірку людиною.',
    'Одночасні інтервали працівників не підсумовуються як простій обладнання.',
  ],
  investors: {
    title: 'Цікавить гіпотеза для виробництв?',
    body: 'Ми перевіряємо попит на пов’язану роботу виробничих команд. Обговоріть із нами продукт, докази та наступні етапи.',
  },
  faq: 'Перед тим як впроваджувати в цеху',
  questions: faqUk,
  contact: {
    title: 'Що перериває роботу вашого виробництва?',
    body: 'Розкажіть про процес, повторювану проблему й вашу роль. Це стане конкретною відправною точкою для демо або обговорення пілоту.',
  },
  contactHint: 'Оберіть тему розмови.',
  emailHint:
    'Кнопка відкриє поштовий застосунок із заповненими одержувачем і темою. Ви самі вирішуєте, коли надіслати лист.',
  subjects: {
    pilot: 'Вахта: пілот на виробництві',
    demo: 'Вахта: демонстрація продукту',
    investor: 'Вахта: обговорення інвестиції',
  },
  emailBody:
    'Компанія / виробничий процес:\nМоя роль:\nПовторювана проблема або тема:\nПоточний спосіб вирішення:\nБажаний наступний крок:\n',
  privacy:
    'На сторінці немає форми збору заявок і сторонньої аналітики. Лист надсилається через ваш поштовий сервіс. Додавайте лише інформацію, потрібну для розмови.',
  operator: 'Оператор сайту',
  footer: 'Пов’язана робота виробничих команд.',
  preview: 'Попередній перегляд — дані для публікації та докази роботи продукту ще перевіряються.',
  contactPending: 'Контактні дані з’являться після запуску сайту.',
  notFound: 'Такої сторінки не знайдено.',
  backHome: 'Відкрити головну сторінку',
};

export const landingRu: LandingMessages = {
  download: 'Скачать обзор для команды (.txt)',
  tour: tourRu,
  seo: seoRu,
  portraits: [
    'Оператор станка',
    'Техник по обслуживанию',
    'Контролёр качества',
    'Мастер смены',
    'Оператор упаковочной линии',
    'Промышленный электрик',
  ],
  portraitNote: 'Иллюстративные портреты производственных профессий, сгенерированные ИИ.',
  productScreens: {
    title: 'Три интерфейса. Одна связанная смена.',
    body: 'Киоск для учёта присутствия, Telegram для работников и веб-панель для ответственных руководителей. Это снимки настоящих интерфейсов Вахты.',
    panel: 'Понятная картина для производственной команды',
    panelCaption:
      'Настоящий интерфейс веб-панели с вымышленными демоданными. Украинская рабочая область. Числа иллюстрируют отчёт, а не результаты клиентов.',
    kiosk: 'На входе — QR-киоск',
    kioskCaption:
      'Настоящий экран киоска с историческим QR, срок действия которого истёк. Он не позволяет отметить присутствие.',
    telegram: 'В кармане работника — Telegram',
    telegramCaption:
      'Фрагмент настоящего бота в Telegram. Личные данные скрыты. Украинский интерфейс.',
    incidentCaption:
      'Настоящие детали инцидента с вымышленными демозаписями: сообщение работника и зафиксированная реакция.',
    handoverCaption:
      'Настоящая проверка чек-листа и передачи с вымышленными демозаписями. Украинский интерфейс.',
    openImage: 'Открыть снимок в полном размере',
  },
  title: 'Управление сменами и простоями на производстве — Vakhta',
  description:
    'Сообщения работников, реагирование на инциденты, чек-листы персонала и передача смены в одном процессе. Исследуйте повторяющиеся потери времени и обсудите пилот.',
  skip: 'Перейти к содержанию',
  language: 'Язык',
  languageNames: { uk: 'Українська', en: 'English', ru: 'Русский' },
  signIn: 'Войти',
  nav: {
    workflow: 'Как это работает',
    capabilities: 'Возможности',
    pilot: 'Пилот',
    faq: 'Вопросы',
  },
  audience: 'Для производств со сменными командами',
  hero: 'Меньше простоев. Меньше повторных инцидентов. Подготовленная смена.',
  intro:
    'Объедините сообщения работников, ответственных людей и записи смены. Находите повторяющиеся препятствия и действуйте, пока проблема требует внимания.',
  pilotCta: 'Обсудить пилот',
  demoCta: 'Заказать демо',
  investorCta: 'Обсудить инвестицию',
  readWorkflow: 'Посмотреть, как это работает',
  heroNote: 'Работники — в Telegram. Руководители — в одной веб-панели.',
  illustration: 'Иллюстрация процесса · не снимок продукта',
  worker: 'Работник · Telegram',
  master: 'Мастер смены · Веб-панель',
  reportExample: 'Работа остановилась. Ожидаем материалы.',
  responseExample: 'Рассмотреть инцидент и зафиксировать реакцию.',
  recordExample: 'Сохранить причину и действия в записях смены.',
  followUp: 'От сообщения к зафиксированной реакции',
  problem: {
    title: 'Остановку видно. Её историю — не всегда.',
    body: 'Звонки, чаты и бумажные журналы хранят разные части одной проблемы. Следующая смена начинает работу без полной картины.',
  },
  problems: [
    {
      title: 'Руководитель узнаёт поздно',
      body: 'Работник сообщил о проблеме, но сообщение потерялось среди других разговоров.',
    },
    {
      title: 'Та же причина повторяется',
      body: 'Команда устраняет препятствие, но общей записи о том, когда и почему оно возникло, нет.',
    },
    {
      title: 'Проверки теряются между сменами',
      body: 'Пропущенный чек-лист или неясная передача заставляют следующую команду снова обнаруживать проблему.',
    },
  ],
  workflow: {
    title: 'Для каждой проблемы — понятный следующий шаг.',
    body: 'Объедините людей на производстве с теми, кто отвечает за реагирование.',
  },
  steps: [
    { title: 'Сообщить', body: 'Работник фиксирует проблему через Telegram.' },
    {
      title: 'Отреагировать',
      body: 'Мастер смены рассматривает инцидент. Эскалация помогает привлечь внимание к просроченным реакциям.',
    },
    {
      title: 'Проверить и передать',
      body: 'Персонал выполняет чек-листы и добавляет доказательства. Ответственный человек фиксирует решение о передаче.',
    },
    {
      title: 'Исследовать записи',
      body: 'Посмотрите повторяющиеся причины и зафиксированные потери времени, чтобы выбрать, что исследовать дальше.',
    },
  ],
  capabilities: {
    title: 'Четыре составляющие смены с ясной ответственностью.',
    body: 'Начните с препятствия. Сохраните контекст при реагировании, проверках и передаче смены.',
  },
  losses: {
    title: 'Находите повторяющиеся причины потерь времени',
    body: 'Просматривайте зафиксированную активность работников и категории потерь по подразделениям. Повторяющиеся закономерности подскажут тему следующего разговора в цеху.',
  },
  incidents: {
    title: 'Доводите инциденты до тех, кто может действовать',
    body: 'Фиксируйте инцидент, просматривайте его статус и сохраняйте реакцию. Эскалация по SLA привлекает внимание к просроченным инцидентам.',
  },
  checklists: {
    title: 'Объясняйте персоналу, что именно нужно сделать',
    body: 'Создавайте чек-листы для назначенной работы. Собирайте ответы и фото, чтобы ответственный человек мог проверить результат и при необходимости запросить исправления.',
  },
  handover: {
    title: 'Передавайте контекст следующей смене',
    body: 'Храните доказательства выполнения чек-листа, замечания и решения о приёмке вместе. Следующая команда будет понимать, что ей передали.',
  },
  lossLimit:
    'Записи активности работников — не телеметрия оборудования. Они помогают исследовать потери времени, но не измеряют OEE, мощность линии и не доказывают первопричину.',
  supporting: {
    title: 'Остальная работа смены тоже связана',
    body: 'Планирование смен, QR-учёт присутствия, запросы работников, коммуникации и бонусы по правилам дополняют общую историю работы.',
  },
  teams: {
    title: 'Один процесс. Полезный взгляд для каждой роли.',
    body: 'От человека, который сообщает о препятствии, до человека, который отвечает за производство.',
  },
  roles: [
    {
      title: 'Владелец или руководитель производства',
      body: 'Видит закономерности в записях потерь и повторяющиеся инциденты. Выбирает, что исследовать и что измерить во время пилота.',
    },
    {
      title: 'Мастер смены',
      body: 'Видит проблемы, требующие внимания, проверяет доказательства и фиксирует реакцию и решения о передаче.',
    },
    {
      title: 'Работник и контролёр',
      body: 'Сообщают о проблеме, выполняют назначенный чек-лист, подают или проверяют доказательства в соответствующем процессе.',
    },
  ],
  demo: {
    title: 'Принесите на демо одну реальную проблему.',
    body: 'Начните с недавнего препятствия на вашем производстве. Вместе пройдите соответствующий сценарий.',
  },
  demoSteps: [
    'Работник сообщает о препятствии',
    'Ответственный человек рассматривает инцидент',
    'Чек-лист и передача смены сохраняют доказательства',
    'Отчёт показывает зафиксированные причины потерь',
  ],
  demoNote:
    'Подписи отличают демоданные от согласованных реальных кейсов. Персональные поля реальных записей исключены из кадра.',
  pilot: {
    title: 'Проверьте на одном процессе. Решайте по фактам.',
    body: 'Пилот начинается с вашей повторяющейся проблемы и человека, ответственного за проверку.',
  },
  pilotSteps: [
    {
      title: 'Выберите границы',
      body: 'Согласуйте один производственный процесс, участвующие смены и ответственного за пилот.',
    },
    {
      title: 'Зафиксируйте исходное состояние',
      body: 'Согласуйте, как сравнивать время реакции, повторяющиеся причины инцидентов и полноту чек-листов.',
    },
    {
      title: 'Оцените результат',
      body: 'Обсудите, что изменилось, что осталось прежним и оправдывает ли ценность следующий шаг.',
    },
  ],
  pilotNote:
    'Объём, сроки и коммерческие условия согласуем вместе. Сокращение простоев — цель проверки, а не обещанный процент.',
  trust: {
    title: 'Доказательства для решений. Ответственность — за людьми.',
    body: 'Зафиксированные факты помогают руководителю исследовать проблему, не превращая неполную запись в вывод.',
  },
  trustPoints: [
    'Доступ соответствует назначенным ролям и границам ответственности.',
    'Фото из чек-листов поддерживают зафиксированную проверку человеком.',
    'Одновременные интервалы работников не суммируются как простой оборудования.',
  ],
  investors: {
    title: 'Интересует гипотеза для производств?',
    body: 'Мы проверяем спрос на связанную работу производственных команд. Обсудите с нами продукт, доказательства и следующие этапы.',
  },
  faq: 'Перед внедрением в цеху',
  questions: faqRu,
  contact: {
    title: 'Что прерывает работу вашего производства?',
    body: 'Расскажите о процессе, повторяющейся проблеме и вашей роли. Это станет конкретной отправной точкой для демо или обсуждения пилота.',
  },
  contactHint: 'Выберите тему разговора.',
  emailHint:
    'Кнопка откроет почтовое приложение с заполненными получателем и темой. Вы сами решаете, когда отправить письмо.',
  subjects: {
    pilot: 'Вахта: пилот на производстве',
    demo: 'Вахта: демонстрация продукта',
    investor: 'Вахта: обсуждение инвестиции',
  },
  emailBody:
    'Компания / производственный процесс:\nМоя роль:\nПовторяющаяся проблема или тема:\nТекущий способ решения:\nЖелаемый следующий шаг:\n',
  privacy:
    'На странице нет формы сбора заявок и сторонней аналитики. Письмо отправляется через ваш почтовый сервис. Добавляйте только информацию, необходимую для разговора.',
  operator: 'Оператор сайта',
  footer: 'Связанная работа производственных команд.',
  preview:
    'Предварительный просмотр — данные для публикации и доказательства работы продукта ещё проверяются.',
  contactPending: 'Контактные данные появятся после запуска сайта.',
  notFound: 'Такая страница не найдена.',
  backHome: 'Открыть главную страницу',
};
