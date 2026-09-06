# Деплой у продакшен: Vercel + керовані сервіси

Це чек-лист «що створити і що налаштувати», щоб запустити «Вахту» для пілоту. Vercel добре хостить статичні збірки панелі й кіоска, але не підходить для довгоживучих процесів: API тримає long polling/вебхук бота, SSE-зʼєднання панелі й BullMQ-воркер, тому API і воркер живуть на платформі з контейнерами. Нижче варіант із мінімумом операційної роботи.

## 1. Що створити (акаунти й сервіси)

| Компонент               | Сервіс                                                                       | Навіщо                                                                           |
| ----------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Панель `apps/admin-web` | **Vercel** (проєкт 1, Vite static)                                           | статична збірка, HTTPS, свій домен `panel.<домен>`                               |
| Кіоск `apps/qr-kiosk`   | **Vercel** (проєкт 2, Vite static)                                           | сторінка терміналу з QR, `kiosk.<домен>`                                         |
| API `apps/api`          | **Railway** / Fly.io / Render (Docker, 1+ інстанс)                           | NestJS + Fastify, вебхук Telegram, SSE, `/metrics`; `api.<домен>`                |
| Worker `apps/worker`    | той самий провайдер, окремий сервіс без публічного порту                     | аутбокс, таймери, фото-пайплайн                                                  |
| PostgreSQL 16           | **Neon** або Supabase (або Postgres провайдера API)                          | єдине джерело істини; потрібні розширення `pgcrypto`, `btree_gist`               |
| Redis 7                 | **Upstash** (Redis-сумісний) або Redis провайдера API                        | BullMQ-черги і короткоживучий стан бота; `maxRetriesPerRequest: null` уже в коді |
| S3-сумісне сховище      | **Cloudflare R2** або AWS S3, приватний бакет                                | фото передач і медичні документи; лише presigned GET                             |
| Telegram-бот            | BotFather                                                                    | токен, username; вебхук на `https://api.<домен>/telegram/webhook`                |
| Домен і DNS             | Cloudflare / реєстратор                                                      | `panel.`, `kiosk.`, `api.` піддомени; TLS від Vercel і провайдера API            |
| Моніторинг              | вбудовані метрики провайдера + `/metrics`, за бажанням Sentry, Grafana Cloud | алерти з `docs/runbooks/observability.md`                                        |

## 2. Змінні середовища

API (`apps/api`):

```
NODE_ENV=production
API_PORT=3000
PUBLIC_BASE_URL=https://api.<домен>
CORS_ORIGINS=https://panel.<домен>,https://kiosk.<домен>
DATABASE_URL=postgres://...            # Neon: з ?sslmode=require
REDIS_URL=rediss://...                 # Upstash: TLS
AUTH_SECRET=<32+ випадкових символів>
ACTIVATION_PEPPER=<16+ випадкових символів>
TELEGRAM_BOT_TOKEN=<з BotFather>
TELEGRAM_BOT_USERNAME=<username бота без @>
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_SECRET=<16+ випадкових символів>
DEFAULT_SITE_TIMEZONE=<IANA, напр. Europe/Kyiv>
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=vakhta-media
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=true
# решта параметрів ТЗ 18 має значення за замовчуванням, див. .env.example
```

Worker (`apps/worker`): `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `TELEGRAM_BOT_TOKEN`, `S3_*`, `MEDIA_*` (за потреби).

Vercel, панель: `VITE_API_URL=https://api.<домен>`. Vercel, кіоск: `VITE_API_URL=https://api.<домен>`, `VITE_KIOSK_DEVICE_TOKEN=<токен терміналу з панелі «Администрирование → Терминалы»>`. Токен один на термінал; для кількох терміналів робіть окремі проєкти Vercel або задавайте токен через query-параметр на пристрої (не рекомендується).

Секрети генеруйте `openssl rand -base64 48`; ніколи не кладіть їх у git і не показуйте в логах.

## 3. Порядок запуску

1. **База.** Створити Postgres, увімкнути розширення: `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;` (міграція 0006 сама створює `btree_gist`, але на керованих БД може знадобитись право). Виконати міграції: `DATABASE_URL=... pnpm --filter @vakhta/db migrate`.
2. **Сид довідників.** `DATABASE_URL=... DEFAULT_SITE_TIMEZONE=... pnpm --filter @vakhta/db seed` (площадка, підрозділи, шаблони змін, зони, довідник причин; ідемпотентно). Далі довідники ведуться в панелі.
3. **Redis, S3.** Створити інстанс Upstash і бакет R2 (приватний, без публічного доступу; CORS на бакеті не потрібен, бо панель відкриває presigned GET напряму).
4. **API.** Зібрати образ з `apps/api/Dockerfile` (див. нижче), задати змінні, викласти. Перевірити `GET /health`.
5. **Адміністратор панелі.** `pnpm --filter api auth:bootstrap -- --email admin@<домен> --name "Адмін"` з `DATABASE_URL`/`AUTH_SECRET` продакшену (створює користувача з роллю ADMIN; пароль виводиться один раз). Увійти в панель і ввімкнути TOTP у профілі.
6. **Telegram.** `pnpm --filter api telegram:set-webhook` з продакшен-змінними: реєструє `https://api.<домен>/telegram/webhook` із секретом. Перевірити `/start` у боті.
7. **Worker.** Викласти образ `apps/worker`. У логах має бути `worker запущено` і `outboxRelay: true`.
8. **Панель і кіоск на Vercel.** Два проєкти з root directory `apps/admin-web` і `apps/qr-kiosk`, Build Command `pnpm --filter <name> build` (з кореня монорепо: Vercel визначає pnpm workspace), Output `dist`, Node 22. Framework preset: Vite. Змінні з розділу 2.
9. **Термінал.** У панелі зареєструвати термінал і вставити токен у змінні кіоска; відкрити `kiosk.<домен>` на планшеті в кіоск-режимі браузера.
10. **Дані пілоту.** Створити працівників, посади, зони, опублікувати графік, видати коди активації (панель «Администрирование»).

## 4. Dockerfile для API і воркера

```dockerfile
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r build

FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo .
ENV NODE_ENV=production
# API:    CMD ["node", "apps/api/dist/main.js"]
# Worker: CMD ["node", "apps/worker/dist/main.js"]
```

`sharp` потребує glibc або musl-збірки: образ `node:22-alpine` підходить, pnpm ставить бінарники для musl автоматично; `onlyBuiltDependencies` у `pnpm-workspace.yaml` уже містить `sharp`.

## 5. Обмеження Vercel, про які треба знати

- **API не на Vercel.** Serverless-функції Vercel не тримають SSE довше кількох десятків секунд і не запускають воркер; long polling бота неможливий. Тому `TELEGRAM_MODE=webhook` і окремий хост для API.
- **Один API-інстанс для SSE.** Шини змін (`ShiftChanges` тощо) внутрішньопроцесні; при масштабуванні API до кількох інстансів панель отримає події лише від свого інстансу. Панель усе одно перечитує список раз на подію, тож для пілоту достатньо одного інстансу або sticky sessions; для масштабу треба винести шину в Redis pub/sub.
- **Cookie better-auth між доменами.** Панель на `panel.<домен>` і API на `api.<домен>` — різні origin, тому `CORS_ORIGINS` має містити адресу панелі, а cookie сесії ставиться з `SameSite=None; Secure` (better-auth робить це для cross-site при HTTPS). Обидва хости мусять бути під HTTPS.
- **`/metrics` відкритий.** Закрити мережею провайдера (private networking) або додати basic auth на рівні платформи перед публічним доступом.

## 6. Перед оголошенням пілоту

- Пройти `docs/runbooks/deploy.md`, `recovery.md`, `observability.md`, `reserve-channel.md`; налаштувати алерти.
- Заповнити `docs/parameters.md` рішеннями замовника (вікна, шкали, причини, зони, чек-листи, бонусна база).
- Юридична перевірка обробки персональних даних і трудових правил країни застосування (ТЗ 13, 18 п. 20).
- Навантажувальний прогін `infra/load/k6-shift-boundary.js` проти staging із реальними числами замовника (ТЗ 16).
