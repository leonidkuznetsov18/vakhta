# Runbook: моніторинг і алерти

Джерела: ТЗ 12, 14 (NFR-01…NFR-05), ADR-0008.

## Сигнали

- `GET /health`: `200` з `serverTime`; перевіряється платформою хостингу кожні 30 с.
- `GET /metrics` (Prometheus): `http_request_duration_seconds` за маршрутом і статусом, `vakhta_outbox_pending` (рядки `PENDING` в аутбоксі), `vakhta_shifts_active`, `vakhta_incidents_open`, стандартні метрики процесу.
- Логи pino у JSON: `service`, `traceId`, без токенів і персональних даних (CLAUDE.md, ТЗ 13).

## Алерти (рекомендовані пороги)

| Сигнал                                          | Поріг               | Дія                                                                  |
| ----------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `http_request_duration_seconds` p95 бота/панелі | > 2 с протягом 5 хв | перевірити БД (повільні запити), масштабувати API                    |
| `vakhta_outbox_pending`                         | > 50 протягом 10 хв | воркер не працює або Telegram недоступний; див. `reserve-channel.md` |
| `/health` недоступний                           | 2 поспіль           | перезапуск інстансу, перевірка `DATABASE_URL`/`REDIS_URL`            |
| Помилки `job failed` у воркері                  | > 5 за 10 хв        | подивитись `lastError` у `media_objects` або лог таймерів            |
| Вебхук Telegram відповідає не 200               | будь-який           | `getWebhookInfo` через BotFather API, перевірити секрет              |

## Де дивитись

Grafana/Prometheus у `infra/compose` для локального стенду; у продакшені метрики збирає платформа (Railway/Fly/Render) або зовнішній Prometheus через `/metrics` за приватною адресою. Помилки застосунку можна відправляти в Sentry, задавши `SENTRY_DSN` (необовʼязково).
