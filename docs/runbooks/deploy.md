# Runbook: викладення нової версії

Джерела: ТЗ 12, 14 (NFR-05 відновлення), ADR-0001 (append-only журнал), ADR-0008 (аутбокс і таймери).

## Порядок

1. **Перед викладенням.** CI на `master` зелений (`check` і `images`); переглянути `packages/db/drizzle/*.sql` нової версії: міграції мають бути лише додавальними (нові таблиці, колонки з default, індекси `CONCURRENTLY` за потреби). Видалення колонок робиться окремим релізом після того, як код перестав їх читати.
2. **Бекап.** Переконатись, що нічний дамп за вчора є в бакеті (workflow «DB backup») або зняти snapshot вручну (`scripts/db/backup.sh`). Бакет фото має versioning, окремий бекап не потрібен.
3. **Міграції.** Railway виконує `node packages/db/dist/migrate.js` як pre-deploy команду сервісу API (`apps/api/railway.json`) перед перемиканням трафіку; при помилці деплой зупиняється, стара версія працює далі. На іншому хостингу: `docker run --rm -e DATABASE_URL ghcr.io/leonidkuznetsov18/vakhta-api:sha-<commit> node packages/db/dist/migrate.js`.
4. **API.** Деплой з `master` (Railway збирає Dockerfile сам) або образ `ghcr.io/…/vakhta-api:sha-<commit>`; health-check `GET /health` має повернути `200` і `serverTime`. Вебхук Telegram не перереєстровується, якщо `PUBLIC_BASE_URL` не змінився; інакше `node apps/api/dist/cli/set-webhook.js` зі змінними продакшену (див. `docs/deploy.md`, п. 8).
5. **Worker.** Викласти воркер після API: він читає ті самі таблиці й черги; BullMQ-джоби, поставлені старою версією, сумісні, бо контракти job-ів зодом валідуються, а невідомі імена логуються й пропускаються.
6. **Панель і кіоск.** Vercel деплоїть з `master` автоматично; перевірити, що `VITE_API_URL` не змінився, а кіоск має актуальний `VITE_KIOSK_DEVICE_TOKEN`.
7. **Перевірка.** Кіоск показує QR і оновлює його; бот відповідає на `/start`; у панелі відкривається «Оперативная смена» зі SSE (індикатор «Обновляется в реальном времени»); `GET /metrics` з `Authorization: Bearer <METRICS_TOKEN>` віддає лічильники; у Sentry нема нових помилок за 15 хв.

## Відкат

- Код: у Railway «Redeploy» попереднього деплою або образ `ghcr.io/…:sha-<попередній commit>`. Схема лишається новою (додавальні міграції), стара версія її не помічає.
- Дані: журнал подій append-only, тому відкат коду не ламає історію; проєкції (`shift_summaries`, `bonus_shift_scores`) можна перерахувати `POST /admin/bonus/scores/:sessionId/recompute` або майбутньою командою перерахунку.
- Якщо міграція зламала схему: відновити snapshot (див. `recovery.md`) і повторити релиз після виправлення.

## Секрети, що потребують ротації при компрометації

`TELEGRAM_BOT_TOKEN` (BotFather → revoke, оновити секрет, перереєструвати вебхук), `TELEGRAM_WEBHOOK_SECRET`, `AUTH_SECRET` (розлогінює всіх користувачів панелі), `ACTIVATION_PEPPER` (робить недійсними невикористані коди активації — видати нові), `S3_*` ключі, токени терміналів (`POST /admin/org/terminals` видає новий, старий вимикається).
