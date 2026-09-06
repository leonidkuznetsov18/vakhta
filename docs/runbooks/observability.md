# Runbook: моніторинг і алерти

Джерела: ТЗ 12, 14 (NFR-01…NFR-05), ADR-0008.

## Сигнали

- `GET /health`: `200` з `serverTime`; перевіряється платформою хостингу і зовнішнім uptime-чеком кожні 30 с.
- `GET /metrics` (Prometheus) з `Authorization: Bearer <METRICS_TOKEN>`: `http_request_duration_seconds` за маршрутом і статусом, `vakhta_outbox_pending` (рядки `PENDING` в аутбоксі), `vakhta_shifts_active`, `vakhta_incidents_open`, `vakhta_bot_updates_total`, стандартні метрики процесу. Без токена (dev) ендпоінт відкритий; у продакшені токен обовʼязковий, інакше API не стартує.
- Sentry (`SENTRY_DSN`): несподівані помилки API (5xx, невідомі винятки), впалі job-и воркера з тегом `queue`, помилки релею аутбоксу. Заголовки `authorization`, `cookie`, `x-telegram-bot-api-secret-token`, IP і email вирізаються до відправки; трейси вимкнені.
- Логи pino у JSON: `service`, без токенів і персональних даних (CLAUDE.md, ТЗ 13).

## Алерти

Правила для Prometheus/Alertmanager або Grafana Cloud лежать у `infra/monitoring/prometheus-alerts.yml` і повторюють пороги нижче.

| Алерт                             | Умова                                       | Дія                                                                  |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| `VakhtaApiDown`                   | `/metrics` не скрейпиться 2 хв              | перезапуск інстансу, перевірка `DATABASE_URL`/`REDIS_URL`, логи      |
| `VakhtaApiSlow`                   | p95 > 2 с протягом 5 хв                     | повільні запити в Neon, масштабувати API                             |
| `VakhtaApi5xx`                    | > 3 помилок 5xx за хвилину 5 хв             | Sentry: перша помилка з трасою                                       |
| `VakhtaOutboxStuck`               | `vakhta_outbox_pending` > 50 протягом 10 хв | воркер не працює або Telegram недоступний; див. `reserve-channel.md` |
| `VakhtaIncidentsOpenHigh`         | > 10 відкритих інцидентів 30 хв             | майстри не реагують; зателефонувати старшому майстру                 |
| `VakhtaNoActiveShiftsInWorkHours` | 0 активних змін 30 хв                       | облік зупинився: кіоск, бот, резервний канал                         |
| Uptime-чек `/health`              | 2 невдачі поспіль                           | те саме, що `VakhtaApiDown`                                          |
| Sentry: нова помилка              | будь-яка в проді                            | оцінити за годину; job-и воркера повторюються самі                   |

## Де дивитись

- Railway: логи і CPU/RAM обох сервісів, історія деплоїв.
- Grafana Cloud (безкоштовний план) або власний Prometheus: скрейп `https://api.<домен>/metrics` з bearer-токеном, дашборд на чотири метрики вище.
- Sentry: помилки з тегом `service` (`api`/`worker`) і `queue`.
- Локальний стенд: `/metrics` без токена, `curl -s localhost:3000/metrics | grep vakhta_`.
