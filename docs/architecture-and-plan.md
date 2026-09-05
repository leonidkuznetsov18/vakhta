# Telegram-бот обліку змін: аналіз вимог, архітектура, план дій

Версія 0.1 · 5 вересня 2026 · базується на ТЗ «Telegram-бот учета рабочих смен, MVP v1.0»

---

## 1. Що будуємо

Система обліку робочих змін для безперервного виробництва 24/7 з двома 12-годинними змінами (день 08:00–20:00, ніч 20:00–08:00). Один бекенд, два клієнти:

| Клієнт           | Хто користується                                                                                 | Що робить                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Telegram-бот** | Працівники; майстер для оперативних підтверджень                                                 | Графік, прихід/відхід по QR, зміна і її стани, перерви, простої, прибирання, фото, передача зони, бали, звернення       |
| **Веб-панель**   | Майстер, планувальник, HR, начальник виробництва, контролер, бухгалтерія, адміністратор, аудитор | Оперативний екран, планування графіка, інциденти, спори передачі, звернення, бонус, звіти й аналітика, довідники, аудит |

Плюс один допоміжний клієнт, якого в ТЗ не виділено як компонент, але без нього не працює FR-QR-01: **екран-термінал** на контрольній точці, що показує QR з ротацією 30–60 с.

**Поза MVP** (ТЗ 1.4): замовлення, випуск, OEE, прив'язка до обладнання, розрахунок зарплати, інтеграції з ERP/MES/СКУД (лише інтерфейси), біометрія, автоматичні рішення ШІ.

---

## 2. Аналіз вимог

### 2.1. Вимоги, які визначають архітектуру

Це «жорсткі» вимоги, від яких не можна відступити, і вони диктують форму системи.

| #   | Вимога                                                                                                | Джерело в ТЗ                     | Наслідок для архітектури                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Серверний журнал подій є джерелом істини; події незмінні; виправлення створює компенсуючий запис      | 4, 4.5, FR-COR-03, NFR-07        | Append-only таблиця подій; стани й агрегати як проєкції, які можна перерахувати                                     |
| 2   | Рівно один активний інтервал у відкритій зміні; інтервали не перетинаються; перехід атомарний         | 4.3–4.5                          | FSM у коді + інваріанти в БД (partial unique, exclusion constraint); перехід у одній транзакції з блокуванням рядка |
| 3   | Ідемпотентність: `update_id`, `idempotency_key`, `expected_version`; повтор повертає перший результат | FR-UI-02, 12.3, NFR-04           | Таблиці `processed_telegram_updates` і `idempotency_keys`; оптимістична версія на `shift_session`                   |
| 4   | Серверний час, UTC у базі, IANA tz майданчика; нічна зміна один `shift_id` з діловою датою початку    | 6.1, NFR-11                      | `timestamptz` скрізь; планові моменти зберігаються як інстанти; локальний час лише на виводі                        |
| 5   | Динамічний QR без ПД, ≤ 64 base64url, TTL 60–120 с, один раз на пару працівник + зміна                | 5.2, 13.1                        | Challenge-таблиця з хешем токена; таблиця використань з унікальністю (employee, assignment, action)                 |
| 6   | Фото в приватному сховищі, SHA-256 + pHash, підписані короткоживучі URL                               | 5.7, 13                          | Асинхронний фото-пайплайн у воркері; S3-сумісне сховище; ніяких Telegram-URL назовні                                |
| 7   | Версіонування графіка, чек-листів, бонусних правил; розрахунок за версією на момент початку зміни     | FR-SCH-03/04, 7.1, FR-COR-05     | Версії як окремі сутності; `shift_session` фіксує посилання на версії при старті                                    |
| 8   | RBAC з областю даних; медичні дані ізольовані від майстра                                             | FR-AUTH-03, FR-REQ-02, FR-WEB-04 | Ролі + scope (site / org_unit / team / zone); окрема таблиця медичних документів з аудитом переглядів               |
| 9   | Ніщо не закривається таймером мовчки; забуте дію переводить у `NEEDS_CLARIFICATION`                   | 4.5, FR-COR-01/02                | Таймери лише нагадують і ставлять прапорець; ніколи не мутують інтервали                                            |
| 10  | Бонус 0–100, детермінований, N/A нормалізує знаменник, апеляції, second approval                      | 7                                | Bonus engine як чиста функція над журналом; результат зберігається з хешем входів                                   |
| 11  | Панель відображає подію ≤ 5 с; 2+ stateless-інстанси; 99,5 %; p95 ≤ 2 с                               | FR-WEB-01, NFR-01..06            | SSE + Redis pub/sub; жодного стану в пам'яті процесу; фонова робота в окремому воркері                              |

### 2.2. П'ять контурів і їхні зв'язки

ТЗ (4.1) свідомо розділяє п'ять життєвих циклів. Вони не зливаються в одну «зміну», і це найважливіше рішення доменної моделі.

| Контур           | Сутність                                        | Початок → кінець                   | Зв'язок                                             |
| ---------------- | ----------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Планова зміна    | `shift_assignment` у `schedule_version`         | публікація → закриття версії       | `assignment_id`                                     |
| Присутність      | `presence_session`                              | «Я на роботі» → «Я пішов»          | `employee_id`, `assignment_id`                      |
| Зміна працівника | `shift_session` + `activity_intervals`          | «Почати зміну» → «Закінчити зміну» | `assignment_id`, `schedule_version_id`              |
| Інцидент         | `downtime_incident` ← `downtime_reports`        | повідомлення → закриття майстром   | `zone_id`; особистий простій живе як інтервал зміни |
| Передача зони    | `handover_record` → `handover_review` → рішення | чернетка → приймання/рішення       | `shift_session_id`, `zone_id`                       |

Наслідки: присутність може бути довшою за зміну; інцидент може пережити зміну і стосуватись багатьох; передача не блокує відхід; усе зв'язується ідентифікаторами, а не вкладенням.

### 2.3. Що в ТЗ потребує рішення до старту розробки

Ці пункти не блокують проєктування, але блокують окремі фази. Пріоритет: **A** потрібно до фази 1, **B** до фази відповідного модуля, **C** до пілоту.

| Пріоритет | Питання                                                                              | Чому важливо                                                                                      |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| A         | 20 параметрів розділу 18 (tz, вікна, зони, QR TTL, пороги, строки)                   | Задають конфігурацію і тестові дані; більшість можна зробити налаштуваннями, але дефолти потрібні |
| A         | Хостинг: хмара чи on-prem                                                            | Визначає S3, керований Postgres чи власний, бекапи для RPO ≤ 15 хв                                |
| A         | IdP для веб-панелі: корпоративний SSO чи власний логін + TOTP                        | Впливає на модуль Auth з першої фази                                                              |
| A         | Навантажувальні числа (NFR: «заповнює замовник»)                                     | Без них не оцінити інфраструктуру і не побудувати load-тест                                       |
| B         | Хто здає і приймає спільну зону; як рахувати «командні» 10 балів                     | Впливає на модель `handover` і bonus engine                                                       |
| B         | «Защищённая веб-форма» як резервна відмітка: робимо в MVP чи лише термінал + майстер | Окремий екран з авторизацією працівника без Telegram                                              |
| B         | Термінал QR: планшет-кіоск, монітор, кількість точок, чи є точка на виході           | Окремий клієнт `qr-kiosk`, реєстрація пристроїв                                                   |
| B         | Дозвіл завантаження з галереї (FR-PHO-04)                                            | Налаштування; впливає на пояснення користувачам                                                   |
| C         | Юридична перевірка, обробка ПД, локальні акти                                        | Блокує грошовий запуск, не розробку; shadow-режим 1–2 місяці закладено в ТЗ                       |
| C         | Мова інтерфейсу: російська (NFR-08); чи потрібна українська                          | i18n закладаємо одразу, тексти в окремому пакеті                                                  |

### 2.4. Ризики

| Ризик                                                              | Вплив                            | Мітигація                                                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Пересилання фото QR (ТЗ чесно каже: динамічний QR не замінює СКУД) | Фіктивна присутність             | Ротація 30–60 с, TTL, прив'язка до терміналу, аномалії (два входи з одного challenge за секунди з різних чатів), шлях до СКУД/Mini App на наступному етапі |
| Недоступність Telegram або зв'язку на майданчику                   | Втрата подій, невдоволення       | Резервний термінал + майстер, `system_incident`, нейтралізація критеріїв бонусу, документований регламент (NFR-10)                                         |
| Слабка цифрова грамотність, нічні зміни, втома                     | Забуті кнопки, спотворені дані   | Один контекстний екран, ≤ 3 натискання, нагадування, `NEEDS_CLARIFICATION` замість автозакриття, польове тестування                                        |
| Бонус починає пригнічувати повідомлення про проблеми               | Приховування простоїв і небезпек | Правила ТЗ 7.1 зашиті в engine: простої й безпека не знижують бали; метрика «повідомлення не знижуються» в звітах                                          |
| Розмивання скоупу (обладнання, замовлення, зарплата)               | Зрив строків                     | Явний список «не в MVP» у backlog; інтеграційні інтерфейси як заглушки                                                                                     |
| DST і перехід часу під час нічної зміни                            | Неправильна тривалість           | Планові інстанти обчислюються з IANA tz при публікації; тести дат/часу (NFR-11)                                                                            |
| Гонки на кнопках і повторна доставка webhook                       | Дублі інтервалів                 | Три рівні ідемпотентності + блокування рядка + інваріанти в БД; chaos-тести                                                                                |

---

## 3. Архітектура

### 3.1. Стиль: модульний моноліт + воркер

ТЗ (12) рекомендує модульний моноліт, і це правильно для команди з 3–5 інженерів і одного майданчика. Мікросервіси тут дали б лише мережеві межі між модулями, які і так мають спілкуватись у одній транзакції (перехід стану записує інтервал, подію, аутбокс і версію разом).

Два процеси на одному коді:

- **api**: HTTP API для панелі, Telegram webhook, SSE-стрім подій. Stateless, масштабується горизонтально.
- **worker**: черги і таймери. Доставка нотифікацій з аутбоксу, нагадування й ескалації, фото-пайплайн, перерахунок бонусу, експорти.

Межі між доменними модулями всередині моноліту жорсткі: модуль експортує сервіси й події, а не таблиці. Це дозволяє пізніше винести, наприклад, bonus engine або фото-пайплайн, якщо буде потреба.

### 3.2. Компоненти

```
                Telegram                        Браузер (панель)           Екран на точці
                   │ webhook (secret header)         │ HTTPS REST + SSE          │ HTTPS (device token)
                   ▼                                 ▼                           ▼
            ┌───────────────────────────────────────────────────────────────────────────┐
            │  apps/api  (NestJS, N інстансів за Traefik)                               │
            │  ┌─────────────┐ ┌────────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │
            │  │ bot adapter │ │ REST/OpenAPI│ │ SSE hub │ │ auth/rbac│ │ qr kiosk   │  │
            │  └──────┬──────┘ └─────┬──────┘ └────▲────┘ └──────────┘ └─────┬──────┘  │
            │         └──────────────┴─────────────┼───────────────────────────┘         │
            │                    application services (один шар для бота і панелі)       │
            │      identity · org · scheduling · attendance · shift-fsm · incidents       │
            │      handover · requests · bonus · notifications · reporting · audit        │
            └──────────────┬────────────────────────┬──────────────────────┬─────────────┘
                           │ транзакції              │ pub/sub, locks        │ presigned URL
                           ▼                         ▼                      ▼
                    PostgreSQL 16              Redis 7                 S3-сумісне сховище
                    (події, стани,             (BullMQ, pub/sub,       (приватні фото,
                     проєкції, аутбокс)         короткі блокування)     експорти)
                           ▲                         ▲                      ▲
                           │ SKIP LOCKED / jobs      │                      │ put/get
            ┌──────────────┴─────────────────────────┴──────────────────────┴─────────────┐
            │  apps/worker (BullMQ)                                                        │
            │  outbox relay → Telegram · таймери й ескалації · фото-пайплайн (getFile →   │
            │  S3 → sha256/pHash/якість) · перерахунок бонусу · експорти CSV/XLSX          │
            └──────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
            OpenTelemetry → Grafana (Tempo/Loki/Prometheus) · Sentry
```

### 3.3. Стек і обґрунтування

| Шар                     | Вибір                                                                                                                               | Чому саме це                                                                                                                                    | Альтернатива                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Мова / репозиторій      | TypeScript, pnpm workspaces + Turborepo                                                                                             | Бот, API, панель і термінал ділять типи, zod-контракти й доменну логіку; одна команда, одна мова                                                | Python (FastAPI + aiogram) якщо команда Python-first; тоді панель окремо на TS і контракти через OpenAPI |
| Бекенд-фреймворк        | NestJS 11 (Fastify adapter)                                                                                                         | Модулі = bounded contexts, DI, guards для RBAC, готові інтеграції BullMQ, Schedule, OpenAPI                                                     | Hono/Fastify + власна модульність: менше магії, більше ручної роботи                                     |
| Telegram                | grammY + плагіни menu, conversations, files, auto-retry, ratelimiter                                                                | Сучасний TS-first фреймворк, webhook з перевіркою secret token, зручні inline-меню; conversations зі сховищем у Redis для багатокрокових вводів | Telegraf                                                                                                 |
| База даних              | PostgreSQL 16 + Drizzle ORM                                                                                                         | Потрібні `tstzrange` + exclusion constraint, partial unique, `SELECT … FOR UPDATE`, `SKIP LOCKED`; Drizzle тримає SQL близько і не заважає      | Prisma: зручніше для CRUD, гірше для обмежень і блокувань                                                |
| Черги, таймери, pub/sub | Redis 7 + BullMQ                                                                                                                    | Відкладені job-и з детермінованим `jobId` для нагадувань і ескалацій; pub/sub для SSE між інстансами                                            | pg-boss на самому Postgres, якщо хочеться менше інфраструктури                                           |
| Файли                   | S3-сумісне сховище: MinIO on-prem або S3/R2 у хмарі                                                                                 | Приватні бакети, presigned URL з TTL 5 хв, versioning, lifecycle для retention                                                                  | Локальний диск: не масштабується на 2 інстанси                                                           |
| Панель                  | React 19 + Vite, TanStack Router/Query/Table, shadcn/ui + Tailwind, ECharts, react-hook-form + zod                                  | SPA за авторизацією без SSR; ECharts для таймлайнів зміни, теплокарт простоїв, стекових графіків часу                                           | Next.js: зайвий SSR для внутрішньої панелі                                                               |
| Автентифікація панелі   | better-auth: email + пароль + TOTP, плагін OIDC для корпоративного SSO                                                              | ТЗ вимагає MFA або SSO; better-auth дає обидва без окремого сервера                                                                             | Keycloak, якщо у замовника вже є або потрібна федерація                                                  |
| Термінал QR             | Статична сторінка (Vite) з device token, polling нового challenge кожні 30–60 с, офлайн-екран при втраті зв'язку                    | Мінімальний клієнт для кіоску-планшета або монітора                                                                                             | Нативний застосунок: не потрібен для MVP                                                                 |
| Час                     | `Temporal` (полі-філ) або Luxon для tz-математики                                                                                   | Коректні переходи DST при обчисленні планових інстантів                                                                                         | date-fns-tz                                                                                              |
| Фото                    | sharp (розмір, яскравість), sharp-phash / blockhash, `crypto` для SHA-256                                                           | Технічна перевірка FR-PHO-03 у воркері                                                                                                          |                                                                                                          |
| Експорт                 | exceljs, CSV нативно                                                                                                                | FR-WEB-05 з фіксацією в аудиті                                                                                                                  |                                                                                                          |
| Спостережуваність       | pino (structured), OpenTelemetry (traces + metrics), Grafana + Loki + Tempo + Prometheus, Sentry                                    | NFR-09: метрики, трейси, алерти черг, webhook, БД                                                                                               |                                                                                                          |
| Тести                   | Vitest, fast-check (property-based для FSM і часу), testcontainers (Postgres, Redis, MinIO), k6 (навантаження), Playwright (панель) | T-01…T-40 як інтеграційні сценарії                                                                                                              |                                                                                                          |
| Інфраструктура          | Docker, Traefik (TLS), Docker Compose для dev; для prod Kubernetes або 2 VM + Compose; pgBackRest з WAL-архівом у S3                | NFR-05 RPO ≤ 15 хв через WAL; NFR-06 2+ інстанси                                                                                                | Керований Postgres у хмарі знімає бекапи з команди                                                       |
| CI/CD                   | GitHub Actions: lint, typecheck, unit, integration, build образів, деплой staging → prod з ручним approve                           |                                                                                                                                                 |                                                                                                          |

### 3.4. Структура монорепо

```
apps/
  api/            NestJS: HTTP, webhook, SSE; імпортує модулі з packages/modules
  worker/         BullMQ processors і scheduler; той самий код модулів
  admin-web/      React SPA
  qr-kiosk/       Сторінка терміналу
packages/
  domain/         Чиста логіка без фреймворків: shift-fsm, time-calc, bonus-engine, qr-challenge
  modules/        Доменні модулі NestJS (identity, org, scheduling, attendance, shift, incidents,
                  handover, requests, bonus, notifications, reporting, audit, system)
  db/             Drizzle-схема, міграції, seed, SQL-обмеження
  contracts/      zod-схеми запитів/відповідей і подій; генерація OpenAPI; типи для web і kiosk
  i18n/           Тексти бота і панелі (ru як базова, uk/en заготовки)
  config/         Типізовані налаштування, tsconfig, eslint
docs/
  adr/            Записи архітектурних рішень
  runbooks/       Резервний канал, відновлення, інциденти
infra/
  compose/        dev і staging
  k8s/ або ansible/  prod
```

`packages/domain` не залежить від NestJS, БД чи Telegram. Саме там живуть FSM, розрахунок часу й bonus engine, і саме там найщільніші тести.

### 3.5. Доменні модулі

| Модуль             | Відповідальність                                                                                                     | Ключові таблиці                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **identity**       | Картки працівників, активація, прив'язка Telegram, веб-користувачі, ролі й області                                   | `employees`, `employee_positions`, `telegram_accounts`, `activation_codes`, `web_users`, `web_user_roles`                                       |
| **org**            | Майданчики, підрозділи, бригади, посади, контрольні зони, QR-термінали, довідники причин                             | `sites`, `org_units`, `teams`, `positions`, `responsibility_zones`, `zone_permissions`, `qr_terminals`, `reason_codes`                          |
| **scheduling**     | Шаблони змін, версії графіка, призначення, потреба в персоналі, перевірки конфліктів, ознайомлення, термінова заміна | `shift_templates`, `schedule_versions`, `shift_assignments`, `staffing_requirements`, `assignment_acknowledgements`                             |
| **attendance**     | QR challenge, прихід/відхід, резервні відмітки                                                                       | `qr_challenges`, `qr_challenge_uses`, `presence_sessions`                                                                                       |
| **shift**          | Сесія зміни, FSM, інтервали, підсумок, потенційна переробка, екстрений вихід, потреба уточнення                      | `shift_sessions`, `activity_intervals`, `shift_summaries`                                                                                       |
| **incidents**      | Повідомлення про проблему, спільні інциденти, SLA, злиття дублів                                                     | `downtime_reports`, `downtime_incidents`, `incident_status_history`                                                                             |
| **handover**       | Чек-листи, фото, звіт передачі, приймання, спори, рішення майстра                                                    | `checklist_definitions`, `checklist_answers`, `handover_records`, `handover_media`, `handover_reviews`, `handover_resolutions`, `media_objects` |
| **requests**       | Відсутності, обмін, додаткова зміна, корекції, переробки, апеляції; маршрути погодження                              | `requests`, `request_decisions`, `medical_documents`, `correction_requests`, `overtime_approvals`                                               |
| **bonus**          | Версії правил, розрахунок за зміну, критерії, коригування, закриття періоду                                          | `bonus_rule_versions`, `bonus_shift_scores`, `bonus_criteria_results`, `bonus_adjustments`, `bonus_periods`, `bonus_period_results`             |
| **notifications**  | Аутбокс, шаблони, статус доставки/прочитання, таймери ескалацій                                                      | `notification_outbox`, `escalation_timers`                                                                                                      |
| **reporting**      | Проєкції для панелі та звітів, експорти                                                                              | матеріалізовані в'юхи, `exports`                                                                                                                |
| **audit / system** | Журнал подій, аудит, ідемпотентність, системні інциденти, налаштування                                               | `domain_events`, `audit_log`, `processed_telegram_updates`, `idempotency_keys`, `system_incidents`, `settings`                                  |

### 3.6. Ключові архітектурні рішення (кандидати в ADR)

**ADR-1. Журнал подій + транзакційні проєкції, а не «повний» event sourcing.**
Кожна зміна стану записує рядок у `domain_events` (append-only, ролі БД без UPDATE/DELETE) і в тій самій транзакції оновлює таблиці стану (`shift_sessions`, `activity_intervals`). Стан завжди узгоджений з журналом, а перерахунок з журналу можливий (NFR-07). Повний ES з асинхронними проєкціями дав би eventual consistency, яка суперечить вимозі «панель = бот» і ускладнила б інваріанти.

**ADR-2. FSM як таблиця переходів у `packages/domain`, інваріанти продубльовано в БД.**
Переходи з ТЗ 4.4 описані даними: `(from, action) → { to, requires, effects }`. Чиста функція `transition(state, action, ctx)` тестується property-based (жодна послідовність дій не дає двох відкритих інтервалів, сума інтервалів = тривалість). У БД: `UNIQUE (employee_id) WHERE status IN ('open','ready_to_close')` на `shift_sessions`; `UNIQUE (shift_session_id) WHERE ended_at IS NULL` на `activity_intervals`; `EXCLUDE USING gist (shift_session_id WITH =, tstzrange(started_at, ended_at, '[)') WITH &&)`. Якщо код помилиться, база відмовить.

**ADR-3. Ідемпотентність на трьох рівнях.**
(1) Telegram: `processed_telegram_updates(update_id)`, для callback-ів `callback_query_id`; (2) команда: `idempotency_keys(key, scope)` зі збереженою відповіддю; (3) стан: `expected_version` на `shift_session`, у callback data кнопки кодується версія `a:<action>:<shift>:<version>`. Застаріла кнопка повертає актуальний екран без зміни (T-09, T-10).

**ADR-4. QR challenge.**
Термінал з device token запитує новий challenge кожні 30–60 с. Challenge: 16 випадкових байтів → base64url (22 символи) як `start`-параметр deep link. У БД зберігається `sha256(token)`, `terminal_id`, `issued_at`, `expires_at` (TTL 90–120 с, тобто два вікна ротації перекриваються). Використання фіксується в `qr_challenge_uses` з `UNIQUE (employee_id, assignment_id, action)`: два працівники можуть використати один challenge (T-02), повтор того самого працівника повертає перший результат (T-03). Підмінений токен не знаходить хешу і створює подію безпеки (T-05).

**ADR-5. Час.**
Усі моменти `timestamptz`; у `sites.timezone` IANA. При публікації версії графіка `plan_start_at`/`plan_end_at` обчислюються з локального часу шаблону і tz майданчика, тому DST враховано один раз. `business_date` = локальна дата `plan_start_at`. Час телефона ніколи не читається; `occurred_at` завжди серверний.

**ADR-6. Фото-пайплайн.**
Webhook зберігає лише `file_id`/`file_unique_id` та ставить job. Воркер: `getFile` → потік у S3 (приватний бакет, ключ `site/zone/shift/handover/angle/uuid`) → sharp: розміри, середня яскравість; SHA-256; pHash → пошук точних і близьких дублів → `quality_status`. Підозра переводить фото на ручну перевірку, не знімає бали (FR-PHO-03). Видача лише presigned GET з TTL 5 хв, кожен перегляд в аудиті.

**ADR-7. Bonus engine як чиста функція.**
`computeShiftScore(inputs, ruleVersion) → { criteria[], score, applicableMax, status }`, де inputs збираються з журналу і таблиць рішень. Результат зберігається з `inputs_hash`; повторний виклик з тими самими входами дає той самий результат. Перерахунок запускається подіями: закриття зміни, затверджена корекція, рішення по передачі, закриття інциденту, апеляція, підтверджена переробка, системний інцидент. Правила (ваги, шкали, пороги) у `bonus_rule_versions.rules` як JSON з `valid_from`; зміна створює нову версію.

**ADR-8. Аутбокс + BullMQ для нотифікацій і таймерів.**
Нотифікація створюється в тій самій транзакції, що і подія, у `notification_outbox` з `dedupe_key`. Воркер забирає `FOR UPDATE SKIP LOCKED`, шле в Telegram, зберігає `telegram_message_id`, статус доставки. Нагадування й ескалації: відкладені BullMQ job-и з детермінованим `jobId` (наприклад `break-reminder:<interval_id>`); при спрацюванні воркер перечитує стан і виходить, якщо дія вже виконана (FR-NTF-02). Таймер ніколи не змінює інтервал; після пільгового вікна він ставить `needs_clarification` і ескалює.

**ADR-9. RBAC з областю даних.**
`web_user_roles(user_id, role, scope_type, scope_id)`; кожен запит проходить через `ScopeFilter`, який додає предикати по `site_id / org_unit_id / team_id / zone_id`. Медичні документи в окремій таблиці з доступом лише для ролі HR і записом кожного перегляду в аудит (T-39).

**ADR-10. Реальний час через SSE + Redis pub/sub.**
Після коміту транзакції API публікує подію в канал `site:<id>`. SSE-хаб у кожному інстансі підписаний на Redis і роздає клієнтам панелі; клієнт інвалідовує запити TanStack Query. Резерв: polling 5 с (FR-WEB-01). WebSocket не потрібен, трафік односторонній.

**ADR-11. Бот без стану в сесії.**
Головний екран бота рендериться з серверного стану: `ScreenModel = f(employee, assignment, presence, shiftSession)` → текст + inline-клавіатура лише з допустимими діями (FR-UI-01). Повідомлення редагується на місці. Conversations (grammY) використовуються тільки для багатокрокових вводів: причина, коментар, три фото; їхній стан у Redis з TTL, а кожен крок одразу пишеться в чернетку в Postgres (T-26: два фото і чернетка переживають обрив).

### 3.7. Транзакція переходу стану

Це серце системи; кожна кнопка бота і кожна дія панелі проходять через один код.

1. Вхід: `action`, `shift_session_id`, `expected_version`, `idempotency_key` (для Telegram це `callback_query_id`), `actor`, необов'язкові `reason_code`, `comment`.
2. `BEGIN`. Перевірити `processed_telegram_updates` / `idempotency_keys`: якщо є, повернути збережену відповідь.
3. `SELECT … FROM shift_sessions WHERE id = $1 FOR UPDATE`. Якщо `version ≠ expected_version`, повернути актуальний стан без змін.
4. Викликати `domain.shiftFsm.transition(current, action, ctx)`. Помилка переходу повертає пояснення користувачу («спочатку поверніться з перерви»).
5. Закрити відкритий `activity_interval` (`ended_at = now()`), відкрити новий (`started_at = now()`, `resume_state` за правилом).
6. Вставити `domain_events` з усіма обов'язковими полями ТЗ 11.1.
7. Вставити рядки `notification_outbox`, поставити або скасувати `escalation_timers`.
8. `UPDATE shift_sessions SET current_state, resume_state, version = version + 1`.
9. Записати результат у `processed_telegram_updates` / `idempotency_keys`.
10. `COMMIT`. Опублікувати подію в Redis (SSE), відповісти в Telegram редагуванням екрана.

Той самий шлях для присутності (`presence_sessions`) і передачі (`handover_records`), лише з іншими таблицями стану.

### 3.8. Модель даних: ядро

Нижче лише ключові поля й обмеження; повна схема живе в `packages/db`.

**identity / org**

- `employees(id, personnel_number UNIQUE, full_name, status: active|blocked|terminated)`
- `employee_positions(id, employee_id, org_unit_id, team_id, position_id, manager_employee_id, valid_from, valid_to)` — кадровий перевід = нова версія
- `telegram_accounts(id, employee_id, telegram_user_id, status: active|revoked, linked_at, revoked_at, revoked_by, reason)` — `UNIQUE (telegram_user_id) WHERE status='active'`, `UNIQUE (employee_id) WHERE status='active'`
- `activation_codes(id, employee_id, code_hash, expires_at, attempts, used_at)`
- `web_users(id, email, password_hash, totp_secret, status)`; `web_user_roles(user_id, role, scope_type, scope_id)`
- `sites(id, name, timezone)`; `org_units(id, site_id, parent_id, name)`; `teams`; `positions`
- `responsibility_zones(id, site_id, org_unit_id, name, type, is_shared, checklist_definition_id)`; `zone_permissions(employee_id, zone_id)`
- `qr_terminals(id, site_id, name, checkpoint: entry|exit|both, device_token_hash, status)`
- `reason_codes(kind: downtime|correction|absence|handover|adjustment, code, label, requires_comment, requires_photo, notify_master, severity)`

**scheduling**

- `shift_templates(id, site_id, code: day|night, local_start, local_end)`
- `schedule_versions(id, site_id, org_unit_id, period_month, version_no, status: draft|in_review|published|superseded|closed, created_by, approved_by, published_at, supersedes_id, change_reason)`
- `shift_assignments(id, schedule_version_id, employee_id, template_id, business_date, plan_start_at, plan_end_at, position_id, org_unit_id, team_id, zone_id, kind: regular|extra|replacement|swap, status: planned|cancelled|replaced, replaces_assignment_id)`
- `assignment_acknowledgements(assignment_id, employee_id, schedule_version_id, acknowledged_at)`
- `staffing_requirements(schedule_version_id, business_date, template_id, org_unit_id, position_id, zone_id, required_count)`

**attendance / shift**

- `qr_challenges(id, terminal_id, token_hash, issued_at, expires_at)`
- `qr_challenge_uses(challenge_id, employee_id, assignment_id, action: arrive|depart, used_at, result)` — `UNIQUE (employee_id, assignment_id, action)`
- `presence_sessions(id, employee_id, assignment_id, arrived_at, departed_at, arrival_method: qr|terminal|master|web, departure_method, confirmed_by, status: open|closed|needs_clarification)`
- `shift_sessions(id, employee_id, assignment_id, schedule_version_id, checklist_definition_id, bonus_rule_version_id, business_date, started_at, ended_at, current_state, resume_state, status: open|ready_to_close|closed|emergency_exit, needs_clarification bool, version int)` — `UNIQUE (employee_id) WHERE status IN ('open','ready_to_close')`
- `activity_intervals(id, shift_session_id, state, started_at, ended_at, resume_state, open_event_id, close_event_id, downtime_report_id)` — `UNIQUE (shift_session_id) WHERE ended_at IS NULL`; exclusion constraint на перетин
- `shift_summaries(shift_session_id, planned_min, actual_min, working_min, preparation_min, service_min, cleaning_min, handover_min, break_min, meal_min, downtime_min, late_min, early_leave_min, overtime_pending_min, overtime_approved_min, unresolved_count, corrections_count)` — проєкція, перераховується

**incidents**

- `downtime_reports(id, shift_session_id, employee_id, zone_id, reason_code, comment, stopped_work bool, reported_at, incident_id, media_object_id)`
- `downtime_incidents(id, site_id, zone_id, reason_code, severity: normal|critical|safety, status: reported|acknowledged|in_progress|resolved|closed|duplicate|rejected, duplicate_of_id, assignee_id, sla_due_at, opened_at, closed_at)`
- `incident_status_history(incident_id, from_status, to_status, actor_id, at, comment)`

**handover**

- `checklist_definitions(id, version, zone_type, position_id, items jsonb, valid_from)`
- `handover_records(id, shift_session_id, zone_id, submitted_by, checklist_definition_id, status: draft|submitted|accepted|disputed|resolved_accepted|resolved_issue_confirmed|resolved_no_fault|superseded, submitted_at, accept_deadline_at, superseded_by_id, version)`
- `checklist_answers(handover_id, item_key, ok bool, remark_category, remark_text, safe_to_work, needs: master|cleaning|repair)`
- `handover_media(handover_id, angle: overview|surfaces|floor, media_object_id)`
- `handover_reviews(id, handover_id, reviewer_employee_id, reviewer_shift_session_id, decision: accepted|issue, category, comment, media_object_id, reviewed_at)` — CHECK reviewer ≠ submitted_by (T-32)
- `handover_resolutions(id, handover_id, resolved_by, decision, reason_code, comment, at)`
- `media_objects(id, telegram_file_id, telegram_file_unique_id, storage_key, size, width, height, sha256, phash, brightness, quality_status: pending|ok|low_res|dark|corrupt|duplicate_suspect|manual_review, received_at, retention_until)`

**requests**

- `requests(id, type: vacation|sick|day_off|swap|extra_shift|cannot_attend|late|early_leave|tech_issue|appeal|replacement_offer, employee_id, status: draft|submitted|in_review|approved|rejected|cancelled|expired, period_from, period_to, payload jsonb, route jsonb, current_step, created_at)`
- `request_decisions(request_id, step, actor_id, acting_role, decision, comment, at)`
- `medical_documents(id, request_id, media_object_id)` — доступ лише HR, перегляди в аудиті
- `correction_requests(id, shift_session_id, target_event_id, proposed_at, proposed_state, reason_code, comment, evidence_media_id, status, decided_by, compensating_event_id)`
- `overtime_approvals(id, shift_session_id, interval_start, interval_end, minutes, reason, status, approved_by)`

**bonus**

- `bonus_rule_versions(id, site_id, valid_from, rules jsonb, created_by, approved_by)` — ваги розділів, шкали пунктуальності, пільгові вікна, поріг 60 балів, поріг second approval
- `bonus_shift_scores(id, shift_session_id, rule_version_id, status: preliminary|pending|manual_review|appealed|confirmed|not_evaluated, score numeric, applicable_max, earned, inputs_hash, computed_at)`
- `bonus_criteria_results(score_id, criterion_code, section, max_points, earned_points, status: earned|missed|not_applicable|pending|appealed|confirmed, basis jsonb)`
- `bonus_adjustments(id, score_id, criterion_code, delta, reason_code, comment, author_id, second_approver_id, at)`
- `bonus_periods(id, site_id, month, status: open|closing|closed, rule_version_id, closed_by, closed_at)`; `bonus_period_results(period_id, employee_id, s_month, weight_sum, base_amount, bonus_amount, status)`

**notifications / audit / system**

- `notification_outbox(id, recipient_type, recipient_id, channel, template, payload, dedupe_key UNIQUE, status: pending|sent|delivered|read|failed, attempts, next_attempt_at, telegram_message_id)`
- `escalation_timers(id, kind, subject_type, subject_id, fire_at, status, job_id)`
- `domain_events(id uuid, type, occurred_at, received_at, employee_id, shift_session_id, zone_id, incident_id, source: telegram|web|terminal|system|integration, actor_id, acting_role, reason_code, comment, approval_id, telegram_update_id, idempotency_key, corrects_event_id, schedule_version_id, checklist_version_id, bonus_rule_version_id, payload jsonb, trace_id)` — append-only
- `processed_telegram_updates(update_id PK, processed_at, result jsonb)`; `idempotency_keys(key, scope, request_hash, response jsonb, created_at)`
- `audit_log(id, actor_id, actor_type, action, object_type, object_id, before jsonb, after jsonb, reason, at, ip, trace_id)` — append-only
- `system_incidents(id, site_id, scope jsonb, started_at, ended_at, cause, confirmed_by, neutralizes_criteria bool)`
- `settings(site_id, key, value jsonb, version)`

### 3.9. API

REST з OpenAPI, згенерованим з zod-контрактів; групи за ТЗ 12.3. Бот викликає ті самі application services напряму, без HTTP.

| Група              | Операції                                                       | Особливості                                             |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| `/me`              | профіль, план на місяць, поточна зміна, підсумок, бали         | лише власні дані працівника                             |
| `/attendance`      | `arrive`, `depart`, `reserve-confirm`                          | QR challenge + ідемпотентність                          |
| `/shifts`          | `start`, `transition`, `close`, `summary`                      | `expected_version`; одна точка входу для всіх переходів |
| `/incidents`       | `report`, `acknowledge`, `merge`, `resolve`, `close`           | окремо від особистого інтервалу                         |
| `/handovers`       | `draft`, `media`, `submit`, `accept`, `dispute`, `resolve`     | версія звіту й зони                                     |
| `/requests`        | `absence`, `swap`, `extra`, `correction`, `appeal`, `decide`   | маршрути погодження                                     |
| `/admin/schedules` | `draft`, `validate`, `submit`, `approve`, `publish`, `replace` | версії, конфлікти                                       |
| `/admin/bonuses`   | `preview`, `adjust`, `confirm`, `close-period`, `export`       | лише формалізовані коригування                          |
| `/admin/*`         | довідники, ролі, термінали, чек-листи, причини, налаштування   |                                                         |
| `/events` (SSE)    | стрім подій майданчика                                         | фільтр по scope                                         |
| `/kiosk`           | `challenge` (device token)                                     | для терміналу                                           |

Кожна команда зміни приймає `idempotency_key` і `expected_version`; конфлікт версії повертає `409` з актуальним станом.

### 3.10. Безпека

- TLS скрізь; секрети у vault або зашифрованих env; bot token, QR-секрети й presigned URL не потрапляють у логи.
- Webhook: перевірка `X-Telegram-Bot-Api-Secret-Token`, rate limit, дедуплікація `update_id`, ліміт розміру файлів.
- Веб: better-auth з TOTP або OIDC SSO; сесії з коротким TTL; CSRF для cookie-сесій; заголовки CSP/HSTS.
- RBAC + scope на кожному запиті; заборонений доступ логується (T-39).
- Фото: приватний бакет, presigned GET 5 хв, аудит переглядів і експортів.
- Медичні документи: окрема таблиця, окремі права, ніколи не в оперативних екранах.
- Ролі БД: application-роль без `UPDATE/DELETE` на `domain_events` і `audit_log`.
- Retention: `retention_until` на медіа і подіях, lifecycle у S3, юридична блокада видалення прапорцем.
- Аномалії QR: один challenge з двох чатів за < 3 с, використання з різних терміналів за короткий час → подія безпеки для майстра.

### 3.11. Експлуатація і спостережуваність

- Метрики: латентність webhook і команд (p95 ≤ 2 с), глибина черг, вік найстарішого рядка аутбоксу, помилки Telegram API, помилки фото-пайплайну, відставання SSE.
- Трейси: `trace_id` наскрізь від webhook через транзакцію до воркера; записується в `domain_events`.
- Алерти: черга росте, аутбокс старіше 60 с, webhook 5xx, реплікація Postgres відстає, диск S3, невдалі бекапи.
- Бекапи: WAL-архів кожні ≤ 5 хв + повний щоденний; тест відновлення раз на місяць (NFR-05).
- Runbook резервного каналу: що робить майстер, коли бот недоступний; як адміністратор створює `system_incident`; як синхронізуються відмітки після відновлення (NFR-10).

### 3.12. Тестова стратегія

| Рівень               | Що перевіряє                                                                                                              | Інструменти                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Unit, property-based | FSM: жодна послідовність дій не порушує інваріанти; розрахунок часу; bonus engine детермінований і монотонний по правилах | Vitest, fast-check               |
| Інтеграційні         | T-01…T-40 як сценарії проти реального Postgres/Redis/MinIO; ідемпотентність, гонки (паралельні кнопки), DST               | testcontainers                   |
| Контрактні           | OpenAPI відповідає zod; панель зібрана проти контрактів                                                                   | openapi-typescript, CI-перевірка |
| Бот e2e              | Сценарії через фейковий Telegram API (grammY дозволяє підміну transformer-а)                                              | Vitest                           |
| Панель e2e           | Критичні шляхи: публікація графіка, рішення по спору, закриття періоду                                                    | Playwright                       |
| Навантаження         | Пік ±15 хв від межі зміни: одночасні приходи, старти, фото                                                                | k6                               |
| Chaos                | Втрата відповіді клієнту, повторна доставка webhook, падіння одного інстансу, недоступний Redis                           | скрипти + testcontainers         |
| Безпека              | Залежності, ZAP проти панелі, перевірка scope на кожному ендпоінті                                                        | npm audit, OWASP ZAP             |

---

## 4. План дій

### 4.1. Припущення

- Команда: 2 бекенд-інженери, 1 фронтенд-інженер, 1 QA/DevOps (частково), 1 аналітик/PM (частково). Дизайнер для UX бота і панелі на фазі 0–1.
- Оцінки нижче орієнтовні і уточнюються після фази 0. Порядок фаз повторює ТЗ 17, але межі зсунуто: звернення й запити перенесено до фази бонусу, бо вони ділять механізм маршрутів погодження.
- Кожна фаза закінчується демо на staging і проходженням своїх сценаріїв T-xx.

### 4.2. Фази

**Фаза 0. Discovery і фундамент (2 тижні)**

Мета: узгодити параметри, підняти інфраструктуру, закласти скелет.

- Воркшоп із замовником: 20 параметрів розділу 18, матриця прав, перелік зон, довідник причин, чек-лист, резервний канал.
- Глосарій домену (терміни ТЗ 1.5 як коди сутностей) і ADR-1…ADR-11.
- Монорепо, лінтери, tsconfig, Vitest, husky; Docker Compose з Postgres, Redis, MinIO, OTel Collector, Grafana.
- CI: lint, typecheck, unit, integration з testcontainers, збірка образів.
- База: Drizzle, міграції, `domain_events`, `audit_log`, `settings`, `reason_codes`, ролі БД.
- Telegram: реєстрація бота, webhook з secret token, `processed_telegram_updates`, health-check, `/start`.
- Спостережуваність: pino, OTel, `/metrics`, Sentry.
- UX-прототип бота: п'ять контекстів головного екрана (ТЗ 5.1), клікабельно в самому боті.
- Запит навантажувальних чисел і рішення про хостинг.

Вихід: запущений staging з «порожнім» ботом і панеллю логіну; підписані параметри.

**Фаза 1. Основа: люди, структура, графік (3 тижні)**

- identity: картки, активація за кодом/лінком (хеш, TTL, ліміт спроб), прив'язка Telegram, перепривʼязка з аудитом (FR-AUTH-01/02).
- org: майданчики, підрозділи, бригади, посади, зони, права на зони.
- Auth панелі: better-auth, TOTP, ролі й scope (FR-AUTH-03), `ScopeFilter`.
- scheduling: шаблони, версії, призначення, потреба в персоналі, валідації (перетини, відпочинок між змінами, ліміти годин, рівномірність день/ніч), маршрут draft → in_review → published, ознайомлення.
- Бот: «Мій план» на місяць, ознайомлення зі зміною, нагадування «зміна скоро».
- Панель: розділ «Графік» з редактором місяця, перевірками, публікацією, версіями; «Адміністрування» для довідників.
- Аутбокс і воркер доставки (потрібно вже для нагадувань).

Сценарії: AC-01, AC-02, T-33 (частково).
Вихід: працівник бачить опублікований план і підтверджує ознайомлення.

**Фаза 2. Час: QR, присутність, зміна, стани (4 тижні)**

- QR: термінали, challenge, ротація, kiosk-сторінка, deep link, використання, аномалії.
- attendance: «Я на роботі», «Я пішов», резервні відмітки (термінал, майстер).
- shift: FSM з усіма переходами ТЗ 4.4, `resume_state`, інваріанти в БД, транзакція переходу, `expected_version`.
- Перерви, обід, службовий час: таймери, нагадування, ескалація майстру, пропущена перерва з причиною.
- `NEEDS_CLARIFICATION`, корекції як компенсуючі події, екстрений вихід, `overtime_pending`.
- Підсумок зміни (`shift_summaries`) і екран «Після зміни» в боті.
- Панель: «Оперативна зміна» з SSE, фільтрами, картками з первинними подіями; черга корекцій для майстра.
- Load-тест піку зміни (k6).

Сценарії: AC-03…AC-07, AC-09, T-01…T-12, T-15…T-23.
Вихід: безперервний облік 12-годинної зміни без розривів.

**Фаза 3. Простої та інциденти (2 тижні)**

- «Повідомити про проблему» → «Роботу зупинено?» → інцидент і/або `DOWNTIME`.
- Довідник причин, обов'язковий коментар для «Інше», фото за причиною.
- Життєвий цикл інциденту, злиття дублів, SLA, ескалація за порогом і негайно для безпеки.
- Обід під час інциденту: повернення в `DOWNTIME` або `WORKING` (FR-DWN-06).
- Панель: «Простої та інциденти», екран майстра, звіт по причинах і зонах.

Сценарії: AC-08, T-13, T-14.
Вихід: статистика простоїв і SLA.

**Фаза 4. Прибирання, фото, передача (3 тижні)**

- Нагадування за 30 хв, атомарний перехід у `CLEANING`, чек-лист за зоною і роллю, зауваження.
- Фото-пайплайн: три ракурси, S3, SHA-256, pHash, якість, чернетка, що переживає обрив.
- Передача: `SUBMITTED` без очікування, приймання наступною зміною, зауваження з фото, спір, рішення майстра, `SUPERSEDED`, тайм-аут на майстра, заборона прийняти власну передачу.
- Панель: «Чистота і передача» з фото до/після, спорами, простроченими прийманнями; підписані URL і аудит переглядів.

Сценарії: AC-10…AC-13, T-24…T-32, T-39.
Вихід: асинхронна передача 24/7.

**Фаза 5. Звернення, бонус, звіти (3 тижні)**

- requests: усі типи звернень, маршрути за матрицею ТЗ 2.1, медичні документи лише для HR, обмін і додаткова зміна як нові версії графіка, термінова заміна.
- bonus: версії правил, engine з чотирма розділами і шкалами, N/A-нормалізація, поріг 60, попередні й підтверджені бали, коригування з second approval, апеляції, закриття періоду, експорт для бухгалтерії.
- Бот: екран балів з підставою кожного зниження, апеляція.
- Панель: «Звернення», «Бонус», «Звіти» (шість звітів ТЗ 9.3, CSV/XLSX з аудитом), «Аудит».

Сценарії: AC-14…AC-18, T-33…T-38, T-40.
Вихід: прозорі 0–100 і вивантаження.

**Фаза 6. Зміцнення і підготовка пілоту (2 тижні)**

- Навантажувальні, chaos, security, recovery-тести; учення відновлення з бекапу.
- Алерти, дашборди, runbook резервного каналу, SLA підтримки.
- Інструкції для працівника, майстра, планувальника, HR, адміністратора.
- Польове usability-тестування з денною і нічною зміною при слабкому зв'язку.
- Definition of Done з ТЗ 17.1: закриття Severity 1–2, погоджений список Severity 3.

**Фаза 7. Пілот у тіньовому режимі (4–8 тижнів)**

- Дві зміни, бали без впливу на виплати, щотижневий розбір різниці день/ніч, технічних винятків, спірних фото.
- Калібрування вікон, порогів і шкал; нова версія правил.

**Фаза 8. Промисловий запуск (1–2 тижні)**

- Затверджена бонусна база, версія шкал, локальний документ; моніторинг, бекапи, підтримка 24/7.

### 4.3. Дорожня карта

| Тижні | Фаза                       | Головний результат          |
| ----- | -------------------------- | --------------------------- |
| 1–2   | 0. Discovery і фундамент   | Параметри, staging, скелет  |
| 3–5   | 1. Основа                  | Опублікований графік у боті |
| 6–9   | 2. Час                     | Повний облік 12 годин       |
| 10–11 | 3. Простої                 | Статистика простоїв         |
| 12–14 | 4. Передача                | Фото і приймання 24/7       |
| 15–17 | 5. Звернення, бонус, звіти | Бали 0–100, вивантаження    |
| 18–19 | 6. Зміцнення               | Готовність до пілоту        |
| 20–27 | 7. Пілот                   | Калібровані правила         |
| 28–29 | 8. Запуск                  | Промислова експлуатація     |

Близько 19 тижнів розробки до пілоту за наведеного складу команди. Найбільший невизначений блок: фаза 2, бо FSM і ідемпотентність мають бути бездоганними до того, як на них ляжуть простої, передача і бонус.

### 4.4. Беклог перших двох тижнів

1. Провести воркшоп по 20 параметрах і зафіксувати відповіді в `docs/parameters.md`.
2. Затвердити ADR-1…ADR-11 у `docs/adr/`.
3. Підняти монорепо: `apps/api`, `apps/worker`, `apps/admin-web`, `apps/qr-kiosk`, `packages/domain|modules|db|contracts|i18n|config`.
4. Docker Compose dev-стек і `.env.example`; CI з testcontainers.
5. Міграції: `sites`, `employees`, `domain_events`, `audit_log`, `settings`, `reason_codes`, `processed_telegram_updates`.
6. Webhook з secret token, дедуплікація, `/start`, health, метрики, трейси.
7. `packages/domain/shift-fsm`: таблиця переходів з ТЗ 4.4 і property-тести інваріантів. Це можна почати до БД: чиста логіка.
8. `packages/domain/time`: обчислення планових інстантів, ділової дати, запізнення, раннього відходу; тести DST.
9. Прототип п'яти екранів бота з текстами російською в `packages/i18n`.
10. Скелет панелі: логін з TOTP, layout з дев'ятьма розділами, SSE-хук, тема.
11. Runbook-чернетка резервного каналу для обговорення з майстрами.

### 4.5. Definition of Done для MVP (з ТЗ 17.1)

- Усі вимоги Must і AC-01…AC-18 реалізовані й трасуються до тестів.
- T-01…T-40, інтеграційні, навантажувальні, security і recovery-тести пройдені.
- Немає дефектів Severity 1–2; список Severity 3 погоджений.
- Моніторинг, алерти, бекапи, відновлення й резервний канал 24/7 налаштовані.
- Інструкції для всіх ролей; польове тестування з денною і нічною зміною.
- Замовник підписав правила графіка, зони, чек-листи, причини, шкали і матрицю прав.
- Експорт, строки зберігання, обробка ПД і трудові правила погоджені.

---

## 5. Що потрібно від замовника зараз

1. Відповіді на 20 параметрів розділу 18 ТЗ (хоча б дефолти).
2. Рішення про хостинг і IdP для панелі.
3. Навантажувальні числа: працівників на зміну, майданчиків, фото на хвилину.
4. Хто відповідальний за спільні зони і як рахувати командні бали.
5. Чи входить веб-форма резервної відмітки в MVP.
6. Контакт юриста для перевірки ПД і трудового права в країні застосування.
