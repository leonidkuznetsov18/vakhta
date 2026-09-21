import { brandingUk, brandingEn, brandingRu, type BrandingMessages } from './branding.js';
/** Mirrors the keys of TenantSettings in @vakhta/contracts; the i18n parity test keeps catalogs complete. */
type TenantSettingName =
  | 'arriveBeforeMinutes'
  | 'departAfterMinutes'
  | 'earlyStartWindowMinutes'
  | 'graceMinutes'
  | 'overtimeThresholdMinutes'
  | 'autoCloseGraceMinutes'
  | 'breakMinutes'
  | 'mealMinutes'
  | 'serviceTimeMinutes'
  | 'downtimeEscalationMinutes'
  | 'incidentSlaNormalMinutes'
  | 'incidentSlaCriticalMinutes'
  | 'incidentSlaSafetyMinutes'
  | 'cleaningReminderMinutes'
  | 'handoverReviewWindowMinutes'
  | 'qrRotationSeconds'
  | 'qrTtlSeconds'
  | 'mediaMinWidth'
  | 'mediaMinHeight'
  | 'mediaMinBrightness'
  | 'mediaNearDuplicateDistance'
  | 'mediaRetentionDays'
  | 'shiftReminderMinutes'
  | 'ackReminderHours'
  | 'appealWindowDays';
type TenantSettingGroupName =
  'presence' | 'shift' | 'breaks' | 'incidents' | 'handover' | 'kiosk' | 'photos';

/** Control panel (Vakhta Control) texts: operators only, still trilingual (AGENTS.md). */
export interface ControlMessages {
  readonly branding: BrandingMessages;
  readonly productName: string;
  readonly nav: {
    menu: string;
    closeMenu: string;
    tenants: string;
    catalog: string;
    operators: string;
    audit: string;
    signOut: string;
  };
  readonly auth: {
    title: string;
    email: string;
    password: string;
    signIn: string;
    totpCode: string;
    verify: string;
    setupTitle: string;
    setupHint: string;
    setupSecret: string;
    enable: string;
    failed: string;
    twoFactorRequired: string;
  };
  readonly tenants: {
    title: string;
    subtitle: string;
    create: string;
    search: string;
    columns: { tenant: string; status: string; modules: string; schema: string; lastJob: string };
    count: string;
    empty: string;
    open: string;
  };
  readonly status: Record<'DRAFT' | 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', string>;
  readonly modules: Record<
    'ADMIN_PANEL' | 'WORKER_BOT' | 'QR_KIOSK' | 'SUPPORT_BOT' | 'PHOTO_INSPECTION',
    string
  >;
  readonly moduleHints: Record<'ADMIN_PANEL' | 'WORKER_BOT' | 'QR_KIOSK', string>;
  readonly reserved: string;
  readonly create: {
    title: string;
    subtitle: string;
    name: string;
    slug: string;
    slugHint: string;
    slugTaken: string;
    locale: string;
    timezone: string;
    adminTitle: string;
    adminName: string;
    adminEmail: string;
    modulesTitle: string;
    botTokenTitle: string;
    botTokenOptional: string;
    botTokenHint: string;
    botTokenPlaceholder: string;
    cancel: string;
    submit: string;
    submitting: string;
  };
  readonly workspace: {
    breadcrumbs: string;
    enableModule: string;
    disableModule: string;
    tokenHelpTitle: string;
    tokenHelp: string;
    technical: {
      tenantId: string;
      domainId: string;
      connection: string;
      credentials: string;
      credentialsUpdated: string;
      isolation: string;
      dedicatedDatabase: string;
      registryHint: string;
      storage: string;
      storagePrefix: string;
      createdAt: string;
      updatedAt: string;
      url: string;
      verifiedAt: string;
      management: string;
      openDomain: string;
      domainHint: string;
      domainCount: string;
    };
    tabs: Record<
      | 'overview'
      | 'modules'
      | 'database'
      | 'bot'
      | 'domains'
      | 'parameters'
      | 'branding'
      | 'jobs'
      | 'audit'
      | 'danger',
      string
    >;
    onboardingTitle: string;
    onboardingHint: string;
    onboardingMissing: string;
    copy: string;
    copied: string;
    reissue: string;
    openPanel: string;
    database: string;
    schemaVersion: string;
    migratedAt: string;
    never: string;
    bot: string;
    botMissing: string;
    webhookSecret: string;
    present: string;
    absent: string;
    setToken: string;
    tokenSaved: string;
    kiosk: string;
    panel: string;
    api: string;
    domainsTitle: string;
    domainStatus: Record<'PENDING' | 'VERIFIED' | 'FAILED', string>;
    managed: string;
    custom: string;
    addDomain: string;
    host: string;
    surface: string;
    primary: string;
    branding: string;
    displayName: string;
    accentColor: string;
    save: string;
    saved: string;
    enabled: string;
    disabled: string;
    adminPanelRequired: string;
    suspendTitle: string;
    suspendHint: string;
    reason: string;
    suspend: string;
    resume: string;
    suspended: string;
    provision: string;
    noJobs: string;
    auditEmpty: string;
  };
  readonly jobs: {
    configure: string;
    pendingHint: string;
    skippedHint: string;
    finishedAt: string;
    startedAt: string;
    skippedCount: string;
    title: string;
    status: Record<'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED', string>;
    stepStatus: Record<
      'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED' | 'MANUAL_REQUIRED',
      string
    >;
    steps: Record<
      | 'CREATE_DATABASE'
      | 'MIGRATE'
      | 'SEED_DEFAULTS'
      | 'STORAGE_PREFIX'
      | 'REGISTER_DOMAINS'
      | 'BOT_WEBHOOK'
      | 'INVITE_ADMIN'
      | 'REMOVE_WEBHOOK'
      | 'EVICT_RUNTIME'
      | 'FINAL_BACKUP'
      | 'DROP_DATABASE'
      | 'DROP_STORAGE',
      string
    >;
    kinds: Record<
      | 'PROVISION'
      | 'ENABLE_MODULE'
      | 'DISABLE_MODULE'
      | 'SUSPEND'
      | 'RESUME'
      | 'ROTATE_BOT_TOKEN'
      | 'VERIFY_DOMAIN'
      | 'MIGRATE'
      | 'BACKUP'
      | 'DELETE',
      string
    >;
    manualDns: string;
    manualDatabase: string;
    retry: string;
    skip: string;
    attempts: string;
    progress: string;
  };
  readonly operators: {
    title: string;
    columns: { email: string; name: string; role: string; status: string; totp: string };
    roles: Record<'PLATFORM_ADMIN' | 'PLATFORM_VIEWER', string>;
  };
  readonly settings: {
    title: string;
    hint: string;
    groups: Record<TenantSettingGroupName, string>;
    labels: Record<TenantSettingName, string>;
    defaultValue: string;
    overridden: string;
    reset: string;
    resetAll: string;
    save: string;
    saved: string;
    invalidStored: string;
    clearInvalid: string;
    readOnly: string;
    notInteger: string;
    outOfRange: string;
    qrTtlTooShort: string;
    notProvisioned: string;
  };
  readonly common: {
    loading: string;
    retry: string;
    error: string;
    back: string;
    yes: string;
    no: string;
  };
}

export const controlUk: ControlMessages = {
  branding: brandingUk,
  productName: 'Vakhta Control',
  nav: {
    menu: 'Розділи',
    closeMenu: 'Закрити меню',
    tenants: 'Клієнти',
    catalog: 'Каталог модулів',
    operators: 'Оператори',
    audit: 'Аудит',
    signOut: 'Вийти',
  },
  auth: {
    title: 'Вхід оператора',
    email: 'E-mail',
    password: 'Пароль',
    signIn: 'Увійти',
    totpCode: 'Код з застосунку-автентифікатора',
    verify: 'Підтвердити',
    setupTitle: 'Увімкніть другий фактор',
    setupHint:
      'Відскануйте QR у Google Authenticator або 1Password і введіть код. Без TOTP доступ до консолі закритий.',
    setupSecret: 'Секрет для ручного введення',
    enable: 'Увімкнути',
    failed: 'Не вдалося увійти. Перевірте дані і спробуйте ще раз.',
    twoFactorRequired: 'Для операторів другий фактор обов’язковий.',
  },
  tenants: {
    title: 'Клієнти',
    subtitle: 'Кожен рядок — окреме виробництво зі своєю базою, ботом і адресами',
    create: 'Створити клієнта',
    search: 'Пошук за назвою або slug',
    columns: {
      tenant: 'Клієнт',
      status: 'Статус',
      modules: 'Модулі',
      schema: 'Схема',
      lastJob: 'Остання задача',
    },
    count: 'Показано {shown} з {total}',
    empty: 'Клієнтів ще немає. Створіть першого.',
    open: 'Відкрити',
  },
  status: {
    DRAFT: 'Чернетка',
    PROVISIONING: 'Підготовка',
    ACTIVE: 'Активний',
    SUSPENDED: 'Призупинено',
    ARCHIVED: 'В архіві',
  },
  modules: {
    ADMIN_PANEL: 'Адмін-панель',
    WORKER_BOT: 'Бот для працівників',
    QR_KIOSK: 'QR-кіоск',
    SUPPORT_BOT: 'Бот підтримки',
    PHOTO_INSPECTION: 'Фотоінспекція',
  },
  moduleHints: {
    ADMIN_PANEL: 'Обов’язковий для роботи клієнта: майстри, планувальники, HR, звіти.',
    WORKER_BOT: 'Власний Telegram-бот клієнта; токен можна додати пізніше.',
    QR_KIOSK: 'Планшет на прохідній: відмітка приходу і відходу.',
  },
  reserved: 'Зарезервовано. З’явиться в наступній програмі.',
  create: {
    title: 'Створити клієнта',
    subtitle: 'Одна форма. Після «Створити» підготовка стартує одразу, кроки видно наживо.',
    name: 'Назва',
    slug: 'Slug (частина адрес, змінити не можна)',
    slugHint: 'Адреси: {panel}, {kiosk}, {api}',
    slugTaken: 'Такий slug уже зайнятий або зарезервований.',
    locale: 'Мова за замовчуванням',
    timezone: 'Часовий пояс',
    adminTitle: 'Перший адміністратор',
    adminName: 'Ім’я',
    adminEmail: 'E-mail',
    modulesTitle: 'Модулі',
    botTokenTitle: 'Токен бота',
    botTokenOptional: 'необов’язково',
    botTokenHint:
      'Telegram не дає створювати ботів автоматично. Створіть бота в @BotFather і вставте токен: платформа перевірить його, збереже зашифрованим і підключить сама.',
    botTokenPlaceholder: 'Вставте токен із BotFather',
    cancel: 'Скасувати',
    submit: 'Створити і запустити підготовку',
    submitting: 'Створюємо…',
  },
  workspace: {
    breadcrumbs: 'Навігаційний шлях',
    enableModule: 'Увімкнути модуль',
    disableModule: 'Вимкнути модуль',
    tokenHelpTitle: 'Як отримати токен бота',
    tokenHelp:
      'У Telegram відкрийте офіційний @BotFather. Надішліть /newbot, задайте назву та ім’я користувача за підказками. Скопіюйте виданий токен у це поле й збережіть. Токен дає керування ботом: зберігайте його як пароль.',
    technical: {
      tenantId: 'ID клієнта',
      domainId: 'ID домену',
      connection: 'Підключення й ізоляція',
      credentials: 'Облікові дані БД',
      credentialsUpdated: 'Облікові дані оновлено',
      isolation: 'Ізоляція даних',
      dedicatedDatabase: 'Окрема база даних клієнта',
      registryHint:
        'Дані з реєстру. Наявність облікових даних не підтверджує доступність БД; розмір, з’єднання та резервні копії тут не перевіряються.',
      storage: 'Сховище й життєвий цикл',
      storagePrefix: 'Префікс об’єктного сховища',
      createdAt: 'Клієнта створено',
      updatedAt: 'Реєстр оновлено',
      url: 'HTTPS-адреса',
      verifiedAt: 'Домен перевірено',
      management: 'Керування',
      openDomain: 'Відкрити домен',
      domainHint:
        'Це збережений стан маршрутизації клієнта. DNS, сертифікат TLS і доступність сервісу не перевіряються наживо на цій сторінці.',
      domainCount: 'Доменів: {count}',
    },
    tabs: {
      overview: 'Огляд',
      modules: 'Модулі',
      database: 'База даних',
      bot: 'Бот',
      domains: 'Домени',
      jobs: 'Задачі',
      audit: 'Аудит',
      parameters: 'Параметри',
      branding: brandingUk.title,
      danger: 'Небезпечна зона',
    },
    onboardingTitle: 'Посилання для клієнта',
    onboardingHint:
      'Одне посилання: адміністратор встановлює пароль, бачить бота і кроки для кіоску. Діє 7 днів, пароль встановлюється один раз.',
    onboardingMissing: 'Посилання з’явиться після кроку «Запросити адміністратора».',
    copy: 'Копіювати',
    copied: 'Скопійовано',
    reissue: 'Видати нове',
    openPanel: 'Відкрити панель клієнта',
    database: 'База даних',
    schemaVersion: 'Версія схеми',
    migratedAt: 'Останні міграції',
    never: 'ще не було',
    bot: 'Бот',
    botMissing: 'Токен ще не додано: працівники не зможуть користуватись ботом.',
    webhookSecret: 'Секрет webhook',
    present: 'збережено',
    absent: 'немає',
    setToken: 'Зберегти токен',
    tokenSaved: 'Токен перевірено і збережено',
    kiosk: 'Кіоск',
    panel: 'Панель',
    api: 'API',
    domainsTitle: 'Адреси',
    domainStatus: { PENDING: 'чекає DNS', VERIFIED: 'перевірено', FAILED: 'помилка' },
    managed: 'платформна',
    custom: 'клієнтська',
    addDomain: 'Додати домен',
    host: 'Хост',
    surface: 'Поверхня',
    primary: 'основна',
    branding: 'Брендинг',
    displayName: 'Назва для працівників',
    accentColor: 'Акцентний колір (#rrggbb)',
    save: 'Зберегти',
    saved: 'Збережено',
    enabled: 'увімкнено',
    disabled: 'вимкнено',
    adminPanelRequired: 'Без адмін-панелі клієнтом не буде кому керувати.',
    suspendTitle: 'Призупинити клієнта',
    suspendHint: 'Панель, бот і кіоск перестають відповідати протягом хвилини. Дані не змінюються.',
    reason: 'Причина (обов’язково, потрапляє в аудит)',
    suspend: 'Призупинити',
    resume: 'Відновити',
    suspended: 'Клієнта призупинено',
    provision: 'Запустити підготовку',
    noJobs: 'Задач ще не було.',
    auditEmpty: 'Записів аудиту ще немає.',
  },
  jobs: {
    configure: 'Відкрити налаштування',
    pendingHint:
      'Крок очікує виконання попередніх кроків. Налаштування можна перевірити заздалегідь.',
    skippedHint:
      'Крок пропущено, а не виконано. Перевірте налаштування, якщо ця можливість потрібна.',
    finishedAt: 'Завершено',
    startedAt: 'Розпочато',
    skippedCount: 'Пропущено: {count}',
    title: 'Підготовка',
    status: {
      PENDING: 'очікує',
      RUNNING: 'виконується',
      DONE: 'виконано',
      FAILED: 'помилка',
      CANCELLED: 'скасовано',
    },
    stepStatus: {
      PENDING: 'очікує',
      RUNNING: 'виконується',
      DONE: 'виконано',
      FAILED: 'помилка',
      SKIPPED: 'пропущено',
      MANUAL_REQUIRED: 'потрібна дія',
    },
    steps: {
      CREATE_DATABASE: 'Створити базу даних',
      MIGRATE: 'Застосувати схему',
      SEED_DEFAULTS: 'Заповнити довідники',
      STORAGE_PREFIX: 'Зарезервувати сховище',
      REGISTER_DOMAINS: 'Зареєструвати адреси',
      BOT_WEBHOOK: 'Підключити бота',
      INVITE_ADMIN: 'Запросити адміністратора',
      REMOVE_WEBHOOK: 'Відключити бота',
      EVICT_RUNTIME: 'Оновити сервери',
      FINAL_BACKUP: 'Фінальний бекап',
      DROP_DATABASE: 'Видалити базу',
      DROP_STORAGE: 'Видалити файли',
    },
    kinds: {
      PROVISION: 'Підготовка клієнта',
      ENABLE_MODULE: 'Увімкнення модуля',
      DISABLE_MODULE: 'Вимкнення модуля',
      SUSPEND: 'Призупинення',
      RESUME: 'Відновлення',
      ROTATE_BOT_TOKEN: 'Заміна токена бота',
      VERIFY_DOMAIN: 'Перевірка домену',
      MIGRATE: 'Міграція',
      BACKUP: 'Бекап',
      DELETE: 'Видалення',
    },
    manualDns:
      'Потрібна ваша дія: додайте DNS-записи і натисніть «Повторити», або «Пропустити», якщо записи вже є.',
    manualDatabase:
      'Створіть базу вручну або задайте PROVISION_DATABASE_ADMIN_URL на control-api, потім «Повторити».',
    retry: 'Повторити',
    skip: 'Пропустити',
    attempts: 'спроб: {n}',
    progress: '{done} з {total} виконано',
  },
  operators: {
    title: 'Оператори',
    columns: { email: 'E-mail', name: 'Ім’я', role: 'Роль', status: 'Статус', totp: 'TOTP' },
    roles: { PLATFORM_ADMIN: 'Адміністратор платформи', PLATFORM_VIEWER: 'Перегляд' },
  },
  settings: {
    title: 'Параметри виробництва',
    hint: 'Значення зберігаються в базі клієнта. Змінені значення позначені, «Скинути» повертає платформне значення. Зміни діють на серверах клієнта протягом хвилини, без деплою, і потрапляють в аудит.',
    groups: {
      presence: 'Присутність',
      shift: 'Зміна і нагадування',
      breaks: 'Перерви',
      incidents: 'Простої та інциденти',
      handover: 'Прибирання, передача, апеляції',
      kiosk: 'Кіоск',
      photos: 'Фото',
    },
    labels: {
      arriveBeforeMinutes: 'Прихід до зміни, хв',
      departAfterMinutes: 'Відхід після зміни, хв',
      earlyStartWindowMinutes: 'Ранній старт, хв',
      graceMinutes: 'Пільга запізнення, хв',
      overtimeThresholdMinutes: 'Поріг переробки, хв',
      autoCloseGraceMinutes: 'Автозакриття після кінця зміни, хв',
      breakMinutes: 'Перерва, хв',
      mealMinutes: 'Обід, хв',
      serviceTimeMinutes: 'Службовий час, хв',
      downtimeEscalationMinutes: 'Ескалація простою, хв',
      incidentSlaNormalMinutes: 'SLA звичайного інциденту, хв',
      incidentSlaCriticalMinutes: 'SLA критичного інциденту, хв',
      incidentSlaSafetyMinutes: 'SLA інциденту безпеки, хв',
      cleaningReminderMinutes: 'Нагадування про прибирання, хв',
      handoverReviewWindowMinutes: 'Вікно перевірки передачі, хв',
      qrRotationSeconds: 'Ротація QR, с',
      qrTtlSeconds: 'Термін дії QR, с',
      mediaMinWidth: 'Мінімальна ширина фото, px',
      mediaMinHeight: 'Мінімальна висота фото, px',
      mediaMinBrightness: 'Мінімальна яскравість фото (0–255)',
      mediaNearDuplicateDistance: 'Поріг схожості дублів (0–64)',
      mediaRetentionDays: 'Зберігати фото, днів',
      shiftReminderMinutes: 'Нагадування до зміни, хв',
      ackReminderHours: 'Повторне нагадування про графік, год',
      appealWindowDays: 'Строк апеляції, робочих днів',
    },
    defaultValue: 'за замовчуванням: {value}',
    overridden: 'змінено',
    reset: 'Скинути',
    resetAll: 'Усе за замовчуванням',
    save: 'Зберегти',
    saved: 'Параметри збережено',
    invalidStored:
      'У базі клієнта некоректні значення, застосовано значення за замовчуванням: {keys}',
    clearInvalid: 'Видалити некоректні значення',
    readOnly: 'Змінювати параметри може лише адміністратор платформи.',
    notInteger: 'Ціле число',
    outOfRange: 'Допустимо від {min} до {max}',
    qrTtlTooShort: 'Термін дії QR не може бути коротшим за його ротацію.',
    notProvisioned: 'База клієнта ще не створена: параметри з’являться після підготовки.',
  },
  common: {
    loading: 'Завантаження…',
    retry: 'Повторити',
    error: 'Сервер недоступний або сталася помилка.',
    back: 'Назад',
    yes: 'так',
    no: 'ні',
  },
};

export const controlEn: ControlMessages = {
  branding: brandingEn,
  productName: 'Vakhta Control',
  nav: {
    menu: 'Sections',
    closeMenu: 'Close menu',
    tenants: 'Clients',
    catalog: 'Module catalog',
    operators: 'Operators',
    audit: 'Audit',
    signOut: 'Sign out',
  },
  auth: {
    title: 'Operator sign-in',
    email: 'E-mail',
    password: 'Password',
    signIn: 'Sign in',
    totpCode: 'Code from your authenticator app',
    verify: 'Verify',
    setupTitle: 'Enable the second factor',
    setupHint:
      'Scan the QR code in Google Authenticator or 1Password and enter the code. Without TOTP the console stays closed.',
    setupSecret: 'Secret for manual entry',
    enable: 'Enable',
    failed: 'Sign-in failed. Check the details and try again.',
    twoFactorRequired: 'Operators must use a second factor.',
  },
  tenants: {
    title: 'Clients',
    subtitle: 'Each row is a separate plant with its own database, bot and addresses',
    create: 'Create client',
    search: 'Search by name or slug',
    columns: {
      tenant: 'Client',
      status: 'Status',
      modules: 'Modules',
      schema: 'Schema',
      lastJob: 'Last job',
    },
    count: 'Showing {shown} of {total}',
    empty: 'No clients yet. Create the first one.',
    open: 'Open',
  },
  status: {
    DRAFT: 'Draft',
    PROVISIONING: 'Provisioning',
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    ARCHIVED: 'Archived',
  },
  modules: {
    ADMIN_PANEL: 'Admin panel',
    WORKER_BOT: 'Worker bot',
    QR_KIOSK: 'QR kiosk',
    SUPPORT_BOT: 'Support bot',
    PHOTO_INSPECTION: 'Photo inspection',
  },
  moduleHints: {
    ADMIN_PANEL: 'Required for a usable client: masters, planners, HR, reports.',
    WORKER_BOT: 'The client’s own Telegram bot; the token can be added later.',
    QR_KIOSK: 'The tablet at the gate: arrival and departure.',
  },
  reserved: 'Reserved. Arrives in a later program.',
  create: {
    title: 'Create client',
    subtitle: 'One form. Provisioning starts right after “Create”; the steps are visible live.',
    name: 'Name',
    slug: 'Slug (part of the addresses, cannot change)',
    slugHint: 'Addresses: {panel}, {kiosk}, {api}',
    slugTaken: 'This slug is taken or reserved.',
    locale: 'Default language',
    timezone: 'Time zone',
    adminTitle: 'First administrator',
    adminName: 'Name',
    adminEmail: 'E-mail',
    modulesTitle: 'Modules',
    botTokenTitle: 'Bot token',
    botTokenOptional: 'optional',
    botTokenHint:
      'Telegram cannot create bots automatically. Create the bot in @BotFather and paste the token: the platform verifies it, stores it encrypted and connects it.',
    botTokenPlaceholder: 'Paste the token from BotFather',
    cancel: 'Cancel',
    submit: 'Create and start provisioning',
    submitting: 'Creating…',
  },
  workspace: {
    breadcrumbs: 'Breadcrumbs',
    enableModule: 'Enable module',
    disableModule: 'Disable module',
    tokenHelpTitle: 'How to get a bot token',
    tokenHelp:
      'In Telegram, open the official @BotFather. Send /newbot and follow the prompts for a name and username. Copy the issued token into this field and save. The token controls your bot: keep it private like a password.',
    technical: {
      tenantId: 'Client ID',
      domainId: 'Domain ID',
      connection: 'Connection and isolation',
      credentials: 'Database credentials',
      credentialsUpdated: 'Credentials updated',
      isolation: 'Data isolation',
      dedicatedDatabase: 'Dedicated client database',
      registryHint:
        'Registry data. Stored credentials do not confirm database availability; size, connections and backups are not checked here.',
      storage: 'Storage and lifecycle',
      storagePrefix: 'Object storage prefix',
      createdAt: 'Client created',
      updatedAt: 'Registry updated',
      url: 'HTTPS address',
      verifiedAt: 'Domain verified',
      management: 'Management',
      openDomain: 'Open domain',
      domainHint:
        'This is the recorded client routing state. DNS, the TLS certificate and service availability are not checked live on this page.',
      domainCount: 'Domains: {count}',
    },
    tabs: {
      overview: 'Overview',
      modules: 'Modules',
      database: 'Database',
      bot: 'Bot',
      domains: 'Domains',
      jobs: 'Jobs',
      audit: 'Audit',
      parameters: 'Parameters',
      branding: brandingEn.title,
      danger: 'Danger zone',
    },
    onboardingTitle: 'Link for the client',
    onboardingHint:
      'One link: the administrator sets a password, sees the bot and the kiosk steps. Valid for 7 days; the password is set once.',
    onboardingMissing: 'The link appears after the “Invite administrator” step.',
    copy: 'Copy',
    copied: 'Copied',
    reissue: 'Issue a new one',
    openPanel: 'Open client panel',
    database: 'Database',
    schemaVersion: 'Schema version',
    migratedAt: 'Last migration',
    never: 'not yet',
    bot: 'Bot',
    botMissing: 'No token yet: employees cannot use the bot.',
    webhookSecret: 'Webhook secret',
    present: 'stored',
    absent: 'missing',
    setToken: 'Save token',
    tokenSaved: 'Token verified and stored',
    kiosk: 'Kiosk',
    panel: 'Panel',
    api: 'API',
    domainsTitle: 'Addresses',
    domainStatus: { PENDING: 'waiting for DNS', VERIFIED: 'verified', FAILED: 'failed' },
    managed: 'platform',
    custom: 'client',
    addDomain: 'Add domain',
    host: 'Host',
    surface: 'Surface',
    primary: 'primary',
    branding: 'Branding',
    displayName: 'Name shown to employees',
    accentColor: 'Accent colour (#rrggbb)',
    save: 'Save',
    saved: 'Saved',
    enabled: 'enabled',
    disabled: 'disabled',
    adminPanelRequired: 'Without the admin panel nobody can manage the client.',
    suspendTitle: 'Suspend client',
    suspendHint: 'Panel, bot and kiosk stop answering within a minute. No data changes.',
    reason: 'Reason (required, goes to the audit)',
    suspend: 'Suspend',
    resume: 'Resume',
    suspended: 'Client is suspended',
    provision: 'Start provisioning',
    noJobs: 'No jobs yet.',
    auditEmpty: 'No audit entries yet.',
  },
  jobs: {
    configure: 'Open configuration',
    pendingHint:
      'This step is waiting for earlier steps. You can review its configuration in advance.',
    skippedHint:
      'This step was skipped, not completed. Review configuration if you need this capability.',
    finishedAt: 'Finished',
    startedAt: 'Started',
    skippedCount: 'Skipped: {count}',
    title: 'Provisioning',
    status: {
      PENDING: 'pending',
      RUNNING: 'running',
      DONE: 'done',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
    },
    stepStatus: {
      PENDING: 'pending',
      RUNNING: 'running',
      DONE: 'done',
      FAILED: 'failed',
      SKIPPED: 'skipped',
      MANUAL_REQUIRED: 'action needed',
    },
    steps: {
      CREATE_DATABASE: 'Create database',
      MIGRATE: 'Apply schema',
      SEED_DEFAULTS: 'Seed directories',
      STORAGE_PREFIX: 'Reserve storage',
      REGISTER_DOMAINS: 'Register addresses',
      BOT_WEBHOOK: 'Connect bot',
      INVITE_ADMIN: 'Invite administrator',
      REMOVE_WEBHOOK: 'Disconnect bot',
      EVICT_RUNTIME: 'Refresh servers',
      FINAL_BACKUP: 'Final backup',
      DROP_DATABASE: 'Drop database',
      DROP_STORAGE: 'Drop files',
    },
    kinds: {
      PROVISION: 'Client provisioning',
      ENABLE_MODULE: 'Module enable',
      DISABLE_MODULE: 'Module disable',
      SUSPEND: 'Suspend',
      RESUME: 'Resume',
      ROTATE_BOT_TOKEN: 'Bot token rotation',
      VERIFY_DOMAIN: 'Domain verification',
      MIGRATE: 'Migration',
      BACKUP: 'Backup',
      DELETE: 'Deletion',
    },
    manualDns:
      'Your action is needed: create the DNS records and press “Retry”, or “Skip” if they already exist.',
    manualDatabase:
      'Create the database by hand or set PROVISION_DATABASE_ADMIN_URL on control-api, then “Retry”.',
    retry: 'Retry',
    skip: 'Skip',
    attempts: 'attempts: {n}',
    progress: '{done} of {total} done',
  },
  operators: {
    title: 'Operators',
    columns: { email: 'E-mail', name: 'Name', role: 'Role', status: 'Status', totp: 'TOTP' },
    roles: { PLATFORM_ADMIN: 'Platform administrator', PLATFORM_VIEWER: 'Viewer' },
  },
  settings: {
    title: 'Operating parameters',
    hint: 'Values are stored in the client database. Changed values are marked, and “Reset” returns the platform default. Changes reach the client servers within a minute, without a deploy, and are audited.',
    groups: {
      presence: 'Presence',
      shift: 'Shift and reminders',
      breaks: 'Breaks',
      incidents: 'Downtime and incidents',
      handover: 'Cleaning, handover, appeals',
      kiosk: 'Kiosk',
      photos: 'Photos',
    },
    labels: {
      arriveBeforeMinutes: 'Arrival before the shift, min',
      departAfterMinutes: 'Departure after the shift, min',
      earlyStartWindowMinutes: 'Early start, min',
      graceMinutes: 'Lateness grace, min',
      overtimeThresholdMinutes: 'Overtime threshold, min',
      autoCloseGraceMinutes: 'Auto-close after shift end, min',
      breakMinutes: 'Break, min',
      mealMinutes: 'Meal, min',
      serviceTimeMinutes: 'Service time, min',
      downtimeEscalationMinutes: 'Downtime escalation, min',
      incidentSlaNormalMinutes: 'Normal incident SLA, min',
      incidentSlaCriticalMinutes: 'Critical incident SLA, min',
      incidentSlaSafetyMinutes: 'Safety incident SLA, min',
      cleaningReminderMinutes: 'Cleaning reminder, min',
      handoverReviewWindowMinutes: 'Handover review window, min',
      qrRotationSeconds: 'QR rotation, s',
      qrTtlSeconds: 'QR lifetime, s',
      mediaMinWidth: 'Minimum photo width, px',
      mediaMinHeight: 'Minimum photo height, px',
      mediaMinBrightness: 'Minimum photo brightness (0–255)',
      mediaNearDuplicateDistance: 'Near-duplicate threshold (0–64)',
      mediaRetentionDays: 'Keep photos, days',
      shiftReminderMinutes: 'Reminder before a shift, min',
      ackReminderHours: 'Schedule acknowledgement reminder, h',
      appealWindowDays: 'Appeal window, working days',
    },
    defaultValue: 'default: {value}',
    overridden: 'changed',
    reset: 'Reset',
    resetAll: 'All to defaults',
    save: 'Save',
    saved: 'Parameters saved',
    invalidStored: 'The client database holds invalid values; defaults apply: {keys}',
    clearInvalid: 'Remove invalid values',
    readOnly: 'Only a platform administrator can change parameters.',
    notInteger: 'Whole number',
    outOfRange: 'Allowed from {min} to {max}',
    qrTtlTooShort: 'The QR lifetime cannot be shorter than its rotation.',
    notProvisioned: 'The client database does not exist yet: parameters appear after provisioning.',
  },
  common: {
    loading: 'Loading…',
    retry: 'Retry',
    error: 'The server is unavailable or an error occurred.',
    back: 'Back',
    yes: 'yes',
    no: 'no',
  },
};

export const controlRu: ControlMessages = {
  branding: brandingRu,
  productName: 'Vakhta Control',
  nav: {
    menu: 'Разделы',
    closeMenu: 'Закрыть меню',
    tenants: 'Клиенты',
    catalog: 'Каталог модулей',
    operators: 'Операторы',
    audit: 'Аудит',
    signOut: 'Выйти',
  },
  auth: {
    title: 'Вход оператора',
    email: 'E-mail',
    password: 'Пароль',
    signIn: 'Войти',
    totpCode: 'Код из приложения-аутентификатора',
    verify: 'Подтвердить',
    setupTitle: 'Включите второй фактор',
    setupHint:
      'Отсканируйте QR в Google Authenticator или 1Password и введите код. Без TOTP доступ к консоли закрыт.',
    setupSecret: 'Секрет для ручного ввода',
    enable: 'Включить',
    failed: 'Не удалось войти. Проверьте данные и попробуйте снова.',
    twoFactorRequired: 'Для операторов второй фактор обязателен.',
  },
  tenants: {
    title: 'Клиенты',
    subtitle: 'Каждая строка — отдельное производство со своей базой, ботом и адресами',
    create: 'Создать клиента',
    search: 'Поиск по названию или slug',
    columns: {
      tenant: 'Клиент',
      status: 'Статус',
      modules: 'Модули',
      schema: 'Схема',
      lastJob: 'Последняя задача',
    },
    count: 'Показано {shown} из {total}',
    empty: 'Клиентов пока нет. Создайте первого.',
    open: 'Открыть',
  },
  status: {
    DRAFT: 'Черновик',
    PROVISIONING: 'Подготовка',
    ACTIVE: 'Активный',
    SUSPENDED: 'Приостановлен',
    ARCHIVED: 'В архиве',
  },
  modules: {
    ADMIN_PANEL: 'Админ-панель',
    WORKER_BOT: 'Бот для работников',
    QR_KIOSK: 'QR-киоск',
    SUPPORT_BOT: 'Бот поддержки',
    PHOTO_INSPECTION: 'Фотоинспекция',
  },
  moduleHints: {
    ADMIN_PANEL: 'Обязателен для работы клиента: мастера, планировщики, HR, отчёты.',
    WORKER_BOT: 'Собственный Telegram-бот клиента; токен можно добавить позже.',
    QR_KIOSK: 'Планшет на проходной: отметка прихода и ухода.',
  },
  reserved: 'Зарезервировано. Появится в следующей программе.',
  create: {
    title: 'Создать клиента',
    subtitle: 'Одна форма. После «Создать» подготовка стартует сразу, шаги видны вживую.',
    name: 'Название',
    slug: 'Slug (часть адресов, изменить нельзя)',
    slugHint: 'Адреса: {panel}, {kiosk}, {api}',
    slugTaken: 'Такой slug уже занят или зарезервирован.',
    locale: 'Язык по умолчанию',
    timezone: 'Часовой пояс',
    adminTitle: 'Первый администратор',
    adminName: 'Имя',
    adminEmail: 'E-mail',
    modulesTitle: 'Модули',
    botTokenTitle: 'Токен бота',
    botTokenOptional: 'необязательно',
    botTokenHint:
      'Telegram не позволяет создавать ботов автоматически. Создайте бота в @BotFather и вставьте токен: платформа проверит его, сохранит зашифрованным и подключит сама.',
    botTokenPlaceholder: 'Вставьте токен из BotFather',
    cancel: 'Отмена',
    submit: 'Создать и запустить подготовку',
    submitting: 'Создаём…',
  },
  workspace: {
    breadcrumbs: 'Навигационный путь',
    enableModule: 'Включить модуль',
    disableModule: 'Выключить модуль',
    tokenHelpTitle: 'Как получить токен бота',
    tokenHelp:
      'В Telegram откройте официального @BotFather. Отправьте /newbot, задайте название и имя пользователя по подсказкам. Скопируйте выданный токен в это поле и сохраните. Токен даёт управление ботом: храните его как пароль.',
    technical: {
      tenantId: 'ID клиента',
      domainId: 'ID домена',
      connection: 'Подключение и изоляция',
      credentials: 'Учётные данные БД',
      credentialsUpdated: 'Учётные данные обновлены',
      isolation: 'Изоляция данных',
      dedicatedDatabase: 'Отдельная база данных клиента',
      registryHint:
        'Данные реестра. Наличие учётных данных не подтверждает доступность БД; размер, соединения и резервные копии здесь не проверяются.',
      storage: 'Хранилище и жизненный цикл',
      storagePrefix: 'Префикс объектного хранилища',
      createdAt: 'Клиент создан',
      updatedAt: 'Реестр обновлён',
      url: 'HTTPS-адрес',
      verifiedAt: 'Домен проверен',
      management: 'Управление',
      openDomain: 'Открыть домен',
      domainHint:
        'Это сохранённое состояние маршрутизации клиента. DNS, сертификат TLS и доступность сервиса не проверяются в реальном времени на этой странице.',
      domainCount: 'Доменов: {count}',
    },
    tabs: {
      overview: 'Обзор',
      modules: 'Модули',
      database: 'База данных',
      bot: 'Бот',
      domains: 'Домены',
      jobs: 'Задачи',
      audit: 'Аудит',
      parameters: 'Параметры',
      branding: brandingRu.title,
      danger: 'Опасная зона',
    },
    onboardingTitle: 'Ссылка для клиента',
    onboardingHint:
      'Одна ссылка: администратор задаёт пароль, видит бота и шаги для киоска. Действует 7 дней, пароль задаётся один раз.',
    onboardingMissing: 'Ссылка появится после шага «Пригласить администратора».',
    copy: 'Копировать',
    copied: 'Скопировано',
    reissue: 'Выдать новую',
    openPanel: 'Открыть панель клиента',
    database: 'База данных',
    schemaVersion: 'Версия схемы',
    migratedAt: 'Последние миграции',
    never: 'ещё не было',
    bot: 'Бот',
    botMissing: 'Токен ещё не добавлен: работники не смогут пользоваться ботом.',
    webhookSecret: 'Секрет webhook',
    present: 'сохранён',
    absent: 'нет',
    setToken: 'Сохранить токен',
    tokenSaved: 'Токен проверен и сохранён',
    kiosk: 'Киоск',
    panel: 'Панель',
    api: 'API',
    domainsTitle: 'Адреса',
    domainStatus: { PENDING: 'ждёт DNS', VERIFIED: 'проверен', FAILED: 'ошибка' },
    managed: 'платформенный',
    custom: 'клиентский',
    addDomain: 'Добавить домен',
    host: 'Хост',
    surface: 'Поверхность',
    primary: 'основной',
    branding: 'Брендинг',
    displayName: 'Название для работников',
    accentColor: 'Акцентный цвет (#rrggbb)',
    save: 'Сохранить',
    saved: 'Сохранено',
    enabled: 'включён',
    disabled: 'выключен',
    adminPanelRequired: 'Без админ-панели клиентом будет некому управлять.',
    suspendTitle: 'Приостановить клиента',
    suspendHint: 'Панель, бот и киоск перестают отвечать в течение минуты. Данные не меняются.',
    reason: 'Причина (обязательно, попадает в аудит)',
    suspend: 'Приостановить',
    resume: 'Возобновить',
    suspended: 'Клиент приостановлен',
    provision: 'Запустить подготовку',
    noJobs: 'Задач ещё не было.',
    auditEmpty: 'Записей аудита ещё нет.',
  },
  jobs: {
    configure: 'Открыть настройки',
    pendingHint: 'Шаг ожидает выполнения предыдущих шагов. Настройки можно проверить заранее.',
    skippedHint: 'Шаг пропущен, а не выполнен. Проверьте настройки, если эта возможность нужна.',
    finishedAt: 'Завершено',
    startedAt: 'Начато',
    skippedCount: 'Пропущено: {count}',
    title: 'Подготовка',
    status: {
      PENDING: 'ожидает',
      RUNNING: 'выполняется',
      DONE: 'выполнено',
      FAILED: 'ошибка',
      CANCELLED: 'отменено',
    },
    stepStatus: {
      PENDING: 'ожидает',
      RUNNING: 'выполняется',
      DONE: 'выполнено',
      FAILED: 'ошибка',
      SKIPPED: 'пропущено',
      MANUAL_REQUIRED: 'нужно действие',
    },
    steps: {
      CREATE_DATABASE: 'Создать базу данных',
      MIGRATE: 'Применить схему',
      SEED_DEFAULTS: 'Заполнить справочники',
      STORAGE_PREFIX: 'Зарезервировать хранилище',
      REGISTER_DOMAINS: 'Зарегистрировать адреса',
      BOT_WEBHOOK: 'Подключить бота',
      INVITE_ADMIN: 'Пригласить администратора',
      REMOVE_WEBHOOK: 'Отключить бота',
      EVICT_RUNTIME: 'Обновить серверы',
      FINAL_BACKUP: 'Финальный бэкап',
      DROP_DATABASE: 'Удалить базу',
      DROP_STORAGE: 'Удалить файлы',
    },
    kinds: {
      PROVISION: 'Подготовка клиента',
      ENABLE_MODULE: 'Включение модуля',
      DISABLE_MODULE: 'Выключение модуля',
      SUSPEND: 'Приостановка',
      RESUME: 'Возобновление',
      ROTATE_BOT_TOKEN: 'Замена токена бота',
      VERIFY_DOMAIN: 'Проверка домена',
      MIGRATE: 'Миграция',
      BACKUP: 'Бэкап',
      DELETE: 'Удаление',
    },
    manualDns:
      'Нужно ваше действие: добавьте DNS-записи и нажмите «Повторить», либо «Пропустить», если записи уже есть.',
    manualDatabase:
      'Создайте базу вручную или задайте PROVISION_DATABASE_ADMIN_URL на control-api, затем «Повторить».',
    retry: 'Повторить',
    skip: 'Пропустить',
    attempts: 'попыток: {n}',
    progress: '{done} из {total} выполнено',
  },
  operators: {
    title: 'Операторы',
    columns: { email: 'E-mail', name: 'Имя', role: 'Роль', status: 'Статус', totp: 'TOTP' },
    roles: { PLATFORM_ADMIN: 'Администратор платформы', PLATFORM_VIEWER: 'Просмотр' },
  },
  settings: {
    title: 'Параметры производства',
    hint: 'Значения хранятся в базе клиента. Изменённые значения отмечены, «Сбросить» возвращает платформенное значение. Изменения действуют на серверах клиента в течение минуты, без деплоя, и попадают в аудит.',
    groups: {
      presence: 'Присутствие',
      shift: 'Смена и напоминания',
      breaks: 'Перерывы',
      incidents: 'Простои и инциденты',
      handover: 'Уборка, передача, апелляции',
      kiosk: 'Киоск',
      photos: 'Фото',
    },
    labels: {
      arriveBeforeMinutes: 'Приход до смены, мин',
      departAfterMinutes: 'Уход после смены, мин',
      earlyStartWindowMinutes: 'Ранний старт, мин',
      graceMinutes: 'Льгота опоздания, мин',
      overtimeThresholdMinutes: 'Порог переработки, мин',
      autoCloseGraceMinutes: 'Автозакрытие после конца смены, мин',
      breakMinutes: 'Перерыв, мин',
      mealMinutes: 'Обед, мин',
      serviceTimeMinutes: 'Служебное время, мин',
      downtimeEscalationMinutes: 'Эскалация простоя, мин',
      incidentSlaNormalMinutes: 'SLA обычного инцидента, мин',
      incidentSlaCriticalMinutes: 'SLA критического инцидента, мин',
      incidentSlaSafetyMinutes: 'SLA инцидента безопасности, мин',
      cleaningReminderMinutes: 'Напоминание об уборке, мин',
      handoverReviewWindowMinutes: 'Окно проверки передачи, мин',
      qrRotationSeconds: 'Ротация QR, с',
      qrTtlSeconds: 'Срок действия QR, с',
      mediaMinWidth: 'Минимальная ширина фото, px',
      mediaMinHeight: 'Минимальная высота фото, px',
      mediaMinBrightness: 'Минимальная яркость фото (0–255)',
      mediaNearDuplicateDistance: 'Порог похожести дублей (0–64)',
      mediaRetentionDays: 'Хранить фото, дней',
      shiftReminderMinutes: 'Напоминание до смены, мин',
      ackReminderHours: 'Повторное напоминание о графике, ч',
      appealWindowDays: 'Срок апелляции, рабочих дней',
    },
    defaultValue: 'по умолчанию: {value}',
    overridden: 'изменено',
    reset: 'Сбросить',
    resetAll: 'Всё по умолчанию',
    save: 'Сохранить',
    saved: 'Параметры сохранены',
    invalidStored: 'В базе клиента некорректные значения, применены значения по умолчанию: {keys}',
    clearInvalid: 'Удалить некорректные значения',
    readOnly: 'Менять параметры может только администратор платформы.',
    notInteger: 'Целое число',
    outOfRange: 'Допустимо от {min} до {max}',
    qrTtlTooShort: 'Срок действия QR не может быть короче его ротации.',
    notProvisioned: 'База клиента ещё не создана: параметры появятся после подготовки.',
  },
  common: {
    loading: 'Загрузка…',
    retry: 'Повторить',
    error: 'Сервер недоступен или произошла ошибка.',
    back: 'Назад',
    yes: 'да',
    no: 'нет',
  },
};
