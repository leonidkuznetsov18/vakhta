# Vakhta

Telegram bot for shift accounting and a web panel for continuous 24/7 production with two 12-hour shifts. Source of requirements: the customer's spec "Telegram-бот учета рабочих смен, MVP v1.0". Architecture and plan: [docs/architecture-and-plan.md](docs/architecture-and-plan.md).

## Layout

```
apps/
  api/          NestJS: HTTP API, Telegram webhook, SSE
  worker/       BullMQ: outbox, timers, photo pipeline, bonus recompute
  admin-web/    React + Vite: web panel
  qr-kiosk/     Terminal page with a rotating QR
packages/
  domain/       Pure domain logic: shift FSM, time, QR challenge, bonus rules, locales
  contracts/    zod schemas of commands and events shared by the bot, API and panel
  db/           Drizzle schema for PostgreSQL and migrations
  i18n/         Texts of the bot, panel and kiosk in uk / en / ru
  config/       Shared tsconfig presets
docs/
  adr/          Architecture decision records
  runbooks/     Operating procedures
infra/compose/  Local stack: PostgreSQL, Redis, MinIO
```

## Local run

```bash
corepack enable
pnpm install
cp .env.example .env        # then fill in AUTH_SECRET, ACTIVATION_PEPPER, KIOSK_DEVICE_TOKEN
pnpm infra:up               # PostgreSQL :5432, Redis :6380, MinIO :9000/:9001
pnpm db:migrate             # apply migrations
pnpm db:seed                # site, units, positions, zones, reasons, the "Проходная" terminal
pnpm --filter api auth:bootstrap -- --email admin@example.com --password 'long-strong-password'
pnpm dev                    # everything: api :3000, worker, panel :5173, kiosk :5174
```

`pnpm dev` first builds the packages through Turborepo, then keeps the API and the worker in watch mode (`tsc --watch` + `node --watch`) and starts Vite for the panel and the kiosk. The panel shows "API online" when the API answers on `/health`; the kiosk shows a QR when `VITE_KIOSK_DEVICE_TOKEN` in `.env` matches the `KIOSK_DEVICE_TOKEN` the seed ran with.

Usual causes of "API unavailable" / "No connection to the server": the API is not running, `.env` lacks the mandatory `ACTIVATION_PEPPER`, the Docker stack is down, or `REDIS_URL` points at 6379 instead of 6380. Vite reads `VITE_*` from the root `.env`, not from the app folder.

Separately, without Turborepo:

```bash
pnpm --filter api dev
pnpm --filter worker dev
pnpm --filter admin-web dev
pnpm --filter qr-kiosk dev
```

## Languages

The product speaks Ukrainian, English and Russian; the catalogs live in `packages/i18n` (`uk.ts`, `en.ts`, `ru.ts`) with one typed shape, and `catalogs.test.ts` fails if a key or a placeholder diverges. The base language per NFR-08 is `ru`.

- **Bot.** The language is stored per employee (`employees.locale`). At the first Telegram link it is taken from the Telegram client language; `/language` or the 🌐 button on the home screen changes it. Every screen and every notification is rendered through the catalog of the recipient.
- **Panel.** The switcher on the login screen and in the navigation stores the choice in `localStorage` and reloads the page; every request carries `x-locale`, so report exports and incident statistics come back in the same language.
- **Kiosk.** `?lang=uk|en|ru` in the URL, otherwise the browser language.
- **API.** `DomainError` messages are English developer text; clients localize by the stable `code`.

The repository itself is English only: code, comments, tests, docs, commits.

## Signing in to the panel

Authentication is better-auth: email + password, optionally TOTP (Google Authenticator, 1Password). There is no self-registration. The first administrator is created by a script:

```bash
pnpm --filter api auth:bootstrap -- --email admin@example.com --password 'long-strong-password' --name 'Admin'
```

Further users and roles are created by the administrator in the panel or through `POST /admin/users`. Roles per spec 2: `ADMIN`, `PRODUCTION_HEAD`, `HR`, `PLANNER`, `SHIFT_MASTER`, `CLEANLINESS_CONTROLLER`, `ACCOUNTANT`, `AUDITOR`; each with a scope of `ENTERPRISE`, `SITE`, `ORG_UNIT`, `TEAM` or `ZONE`. `AUTH_SECRET` in `.env` signs cookies and encrypts TOTP secrets; changing it signs everyone out.

## Shift schedule

The `apps/api/src/scheduling` module implements spec 3: monthly schedule versions per unit with the lifecycle `DRAFT → IN_REVIEW → PUBLISHED → SUPERSEDED`. The planner (`PLANNER`) creates a draft and sends the whole month in one `PUT /admin/schedules/:id/assignments`; the server computes planned instants in the site's IANA time zone and validates overlaps, rest between shifts (`SCHEDULE_MIN_REST_MINUTES`), duplicates, hour limits and the day/night balance, taking into account already published shifts of the same employees in other units. Errors block `submit` and `publish`; warnings are only shown. The head of production (`PRODUCTION_HEAD`) or `ADMIN` publishes: the previous version becomes `SUPERSEDED`, employees with a linked Telegram get a message with an "Acknowledged" button, and the `timers` queue receives "shift soon" and repeated acknowledgement reminders.

```bash
# monthly draft
curl -b cookies.txt -X POST localhost:3000/admin/schedules -H 'content-type: application/json' \
  -d '{"siteId":"<site>","orgUnitId":"<unit>","periodMonth":"2026-10"}'
# assignments (templates: GET /admin/schedules/templates?siteId=<site>)
curl -b cookies.txt -X PUT localhost:3000/admin/schedules/<id>/assignments -H 'content-type: application/json' \
  -d '{"items":[{"employeeId":"<emp>","templateId":"<DAY>","businessDate":"2026-10-01","zoneId":"<zone>"}]}'
curl -b cookies.txt -X POST localhost:3000/admin/schedules/<id>/submit
curl -b cookies.txt -X POST localhost:3000/admin/schedules/<id>/publish -H 'content-type: application/json' -d '{}'
curl -b cookies.txt localhost:3000/admin/schedules/<id>/acknowledgements
```

The "Schedule" section of the panel (`apps/admin-web/src/schedule`) does the same without curl: site/unit/month filters, versions with status badges, an "employees × days" grid with D/N in a cell and the zone in the row, "Save" (PUT of the whole month), "Submit for review" (disabled while there are errors or unsaved changes), "Publish" / "Return to draft" for a version in review, a validation panel and an acknowledgement table for the published version. Page tests with a mocked API: `pnpm --filter admin-web test`.

In the bot the employee sees "My plan" (the `/plan` command or the button): a month calendar with day and night shifts, zones and an hours total, and confirms acknowledgement with a button. The worker polls `notification_outbox` every `OUTBOX_POLL_MS` and sends messages through the Bot API with retries; without `TELEGRAM_BOT_TOKEN` the relay is off and rows wait in `PENDING`.

## Shift: states, intervals, summary

The `apps/api/src/shift` module implements spec 4.3-4.5 and section 3.7 of the architecture document. "Start shift" in the bot (the button appears after "I am at work") creates `shift_sessions` and moves it to `PREPARATION` right away; from then on every button is a transition command with `expectedVersion` and the idempotency key `tg:<update_id>`. A transition runs in one transaction: `SELECT … FOR UPDATE`, version check, the pure `transition()` from `@vakhta/domain`, closing the open interval and opening a new one in `activity_intervals` (an EXCLUDE constraint on overlap, one open interval per session), an event in `domain_events`, the stored response in `idempotency_keys`. A stale button returns `VERSION_CONFLICT` and the current screen (spec 12.3). Guards: presence for the start, zone acceptance ("Accept zone") before work, a handover report before `SUBMIT_HANDOVER`, a reason from the directory for downtime and emergency exit.

Timers (`BREAK_MINUTES`, `MEAL_MINUTES`, `SERVICE_TIME_MINUTES`, `DOWNTIME_ESCALATION_MINUTES`) are scheduled after commit as delayed BullMQ jobs with a jobId per interval; the worker re-reads the state and stays silent if the employee has already returned. The "Return" reminder comes with a button carrying the current version; the downtime escalation writes a `DOWNTIME_ESCALATED` event. Closing or an emergency exit computes `shift_summaries` (work, breaks, meal, downtime, late, early leave, `overtime_pending` above `OVERTIME_THRESHOLD_MINUTES`) and sends the summary to the bot; the "After the shift" screen keeps showing it for 4 more hours.

The "Live shift" panel (`apps/admin-web/src/operations`) listens to `GET /admin/shifts/stream` (SSE with the cookie) and re-reads the list on every state change. The shift master can perform any transition with a mandatory comment (`POST /admin/shifts/:id/transition`, guards skipped, audit written), open a shift for an employee without a phone (`POST /admin/shifts/start`) and flag "Needs review" (`POST /admin/shifts/:id/clarify`).

## Downtime and incidents

The `apps/api/src/incidents` module implements spec 5.5 and FR-DWN-01…07. In the bot the "Report a problem" button on the shift screen leads through a reason from the `reason_codes` directory (kind `DOWNTIME`), a comment for reasons with `requires_comment`, an optional photo for `requires_photo` (the Telegram `file_id` is stored; the phase-4 worker moves it to S3) and the question "Is work stopped?". The unfinished report lives in Redis with a 10-minute TTL, not in process memory. "No" creates only the incident (AC-08); "Yes" additionally opens a personal `DOWNTIME` in the same transaction through `ShiftService.transitionWithin`.

Reports for the same zone and reason within `INCIDENT_DUPLICATE_WINDOW_MINUTES` are linked to the open incident (FR-DWN-04); the original `downtime_reports` rows remain. The SLA follows the reason severity (`INCIDENT_SLA_*_MINUTES`), safety escalates immediately, and the worker job `incident-sla.<id>` sets `escalated_at` and writes `INCIDENT_SLA_BREACHED` if the master has not reacted. In the "Downtime and incidents" panel the master acknowledges, takes into work, resolves, closes, rejects or marks a duplicate per the transition table from `@vakhta/domain`; each step writes `incident_status_history`, an event and an audit row. Resolving an incident does not close the personal downtime: the employee gets a message and presses "Return" themselves (FR-DWN-06). Statistics by reason and zone for a period: incidents, reports, downtime minutes from `activity_intervals`, average resolution time, SLA breaches.

## Cleaning, photos, zone handover

The `apps/api/src/handover` module implements spec 5.6-5.9 (FR-CLN, FR-PHO, FR-HND). `CLEANING_REMINDER_MINUTES` before the planned end the worker reminds about cleaning with a "…start cleaning" button; `CLEANING_DONE` opens a report draft with the current `checklist_definitions` template (the default with the eight spec items is created automatically). In the bot the checklist: ✅ or ⚠️ per item (a remark needs a category from `reason_codes` kind `HANDOVER`, text, a safety assessment and the need for master/cleaning/repair), a message to the next shift, three photo angles (a repeated photo of an angle replaces the previous one), "I cannot finish cleaning" with a reason (FR-CLN-05). "Submit report" validates the draft with the domain function `validateHandoverDraft`, moves the report to `SUBMITTED` with the acceptance deadline `acceptDeadline` and performs the `SUBMIT_HANDOVER` transition in the same transaction; the handing employee closes the shift without waiting for the receiver (FR-HND-02). `CONTINUE_WORK` after the report makes it `SUPERSEDED` (FR-HND-07).

Photos are stored as `media_objects` with only the Telegram `file_id`/`file_unique_id`; the worker job in the `media` queue downloads the file, puts it into the private S3 bucket (`S3_*`), computes SHA-256, dimensions, brightness and pHash (`@vakhta/domain/media`), and marks `LOW_RES`/`DARK`/`CORRUPT`/`DUPLICATE_SUSPECT` without an automatic penalty (FR-PHO-03, T-24…T-26). The panel gets photos only through `GET /admin/handovers/media/:id/link` (presigned GET for `MEDIA_LINK_TTL_SECONDS`, every view audited, FR-PHO-06). Without `S3_BUCKET` photos stay `PENDING`.

The receiving shift sees handovers of its zone on the shift screen ("Acceptance"): "Accept without remarks" also accepts the zone for the new shift; "There is a problem" needs a category, a comment and a new photo, opens `DISPUTED`, and a critical category creates an incident (FR-HND-04). Accepting one's own handover is impossible (T-32). If the receiver has not responded by the deadline, the worker escalates the acceptance to the master without reducing the handing employee's score (FR-HND-06). In the "Cleanliness and handover" panel the master sees the checklist, photos before/after, disputes and overdue acceptances and records a formal decision `RESOLVED_ACCEPTED` / `RESOLVED_ISSUE_CONFIRMED` / `RESOLVED_NO_FAULT` with a comment (FR-HND-05); `handoverBonusEffect` in the domain maps statuses to the bonus effect (spec 5.9).

## Requests, corrections, overtime

The `apps/api/src/requests` module implements spec 8 and FR-REQ-01…04, FR-COR-03…05, FR-TIME-06. Request types and routes per the spec 2.1 matrix live in the domain (`requests/routes.ts`): vacation and day off go through the manager and HR, sick leave only HR, a shift swap is first approved by the second employee in the bot, then by the master and the manager; every step has a decision deadline, overdue ones are highlighted in the panel. The employee creates a request in the bot ("Requests": type → period or shift → minutes or colleague → comment → for sick leave an optional photo of the note), sees the list of their requests and receives the decision. A medical document is registered as `media_objects` with purpose `medical`, and its link is issued only to HR/ADMIN; a master's attempt to open the document is audited (FR-REQ-02, T-40).

Approving requests that change the schedule creates a new version based on the published one and publishes it with a reason (FR-REQ-04): an absence removes the period's shifts, a swap exchanges employees, an extra shift adds an `EXTRA` assignment. Approved late or early-leave minutes are kept on the request for the bonus (spec 7.3). Corrections (`corrections.service.ts`) apply a proposal (`MOVE_BOUNDARY`, `RECLASSIFY`, `CLOSE_SHIFT_AT`) to intervals through the domain `applyCorrection` with invariant checks, write a compensating `SHIFT_CORRECTED` event referencing the corrected event, recompute the summary and clear "needs review"; the master can apply a correction directly from the panel or by approving the employee's request. Potential overtime from `shift_summaries.overtime_pending` waits for the manager's decision in `overtime_approvals` and does not increase the bonus (AC-14).

## Bonus

The `apps/api/src/bonus` module implements spec 7 per ADR-0007: rules live in `bonus_rule_versions` as JSON with an effective date (the default is created from `DEFAULT_BONUS_RULES`), shift inputs are collected from the summary, presence, intervals, events, incidents, handover and approved requests (`collect`), the evaluation `evaluateShift` + `scoreShift` in the domain is deterministic and stored in `bonus_shift_scores` and `bonus_criteria_results` with an input hash. Recompute is triggered by the change buses of other modules: shift close, handover, incident or request decisions. Downtime and safety reports never reduce the score (7.4 counts only completeness of paperwork), a dispute or a suspicious photo moves the criterion to review (`PENDING`), an approved vacation/sick leave excludes the shift (`NOT_EVALUATED`), an open appeal gives `APPEALED`, less than 60 applicable points gives `MANUAL_REVIEW`.

A manual adjustment (`POST /admin/bonus/scores/:id/adjust`) has a reason from the `ADJUSTMENT` directory, a comment and an author; a reduction above `secondApprovalThreshold` waits for a second approval by another person. Closing a period (`POST /admin/bonus/period/:siteId/:month/close`) pins the rules version, confirms evaluated shifts, computes `S_month` per formula 7.6 and notifies employees; HR sets the bonus base, accounting exports CSV only for a closed period with an audit row (FR-WEB-04/05). After closing, scores are not rewritten; an adjustment remains a separate entry (FR-COR-05). In the bot "My scores": the month coefficient, shifts with statuses, a breakdown of every criterion with its basis and "Appeal" within `APPEAL_WINDOW_DAYS` (the appeal goes to the unit manager as an `APPEAL` request).

## Reports and audit

The `apps/api/src/reports` module serves the six MVP reports (spec 9.3) as aggregates over projections: planned vs. actual hours and deviations with potential and approved overtime; time structure by state with corrections and reviews; downtime by reason and zone with reaction time and personal downtime; photo quality and handover results with disputes and acceptance deadlines; bot usage with fallback check-in reasons; preliminary and confirmed scores with the main reason for reduction. There are no "who rested least" rankings. `GET /admin/reports/:kind` returns a table with columns, totals, generation time and a data version; `GET /admin/reports/:kind/export/csv|xlsx` returns the same report as a file and writes the export to the audit with the data version (FR-WEB-05). The "Reports" panel builds a report for a period, site and unit; "Audit" shows `audit_log` (manual actions, sign-ins, photo views, exports, permission changes with before/after) and `domain_events` with filters and a link to the corrected event.

## Telegram bot: modes and QR check-in

`TELEGRAM_MODE=polling` (the default outside `NODE_ENV=production`): the API pulls updates itself, no public address needed. `TELEGRAM_MODE=webhook`: Telegram sends updates to `PUBLIC_BASE_URL/telegram/webhook`, which needs `TELEGRAM_WEBHOOK_SECRET` and a public address (locally a tunnel `cloudflared tunnel --url http://localhost:3000`, then `pnpm --filter api telegram:set-webhook`). `update_id` deduplication is the first bot middleware and works in both modes.

Presence flow (spec 4.2, FR-QR-03..06): the terminal shows a QR with a deep link, the employee opens it, the bot shows a single button "I am at work" or "I have left" depending on whether presence is open. Arrival is attached to the published shift whose window `[start − PRESENCE_ARRIVE_BEFORE_MINUTES, end]` contains the instant; without such a shift the bot asks to contact the master. One QR serves several employees, a repeat by the same employee for the same shift returns the first mark, an expired QR is rejected, a tampered one creates a security event. Fallback check-in by the master: `POST /admin/attendance/reserve`.

## Employee activation in the bot

The spec 2.2 flow is implemented in `apps/api/src/identity`. Endpoints are available to the `ADMIN` and `HR` roles after signing in to the panel (session cookie).

```bash
# 1. Sign in (the cookie is stored in a file)
curl -c cookies.txt -X POST localhost:3000/auth/sign-in/email -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"long-strong-password"}'

# 2. Employee card
curl -b cookies.txt -X POST localhost:3000/admin/employees -H 'content-type: application/json' \
  -d '{"personnelNumber":"000123","fullName":"Иванов Иван Иванович"}'

# 3. Activation code (shown once; the database keeps only the HMAC hash)
curl -b cookies.txt -X POST localhost:3000/admin/employees/<id>/activation-codes
```

The employee opens the `deepLink` from the response or sends the code to the bot as a message, sees the masked card and confirms the link. Relinking another Telegram account is done only through `POST /admin/employees/<id>/telegram/relink` with a reason (FR-AUTH-02).

API integration tests start PostgreSQL through testcontainers. On macOS with Colima or OrbStack the helper `apps/api/test/db.ts` takes the Docker socket address from the active `docker context`.

## Hardening and operations

- `GET /metrics` serves Prometheus metrics (`http_request_duration_seconds` per route, `vakhta_outbox_pending`, `vakhta_shifts_active`, `vakhta_incidents_open`, default process metrics); with `METRICS_TOKEN` it requires `Authorization: Bearer`, and in production the token is mandatory. Alert rules are in `infra/monitoring/prometheus-alerts.yml`, thresholds in `docs/runbooks/observability.md`.
- Sentry is enabled by `SENTRY_DSN` in the API and the worker: only unexpected errors, without authorization headers, cookies or the webhook secret.
- `NODE_ENV=production` validates the configuration before the port opens: https in `PUBLIC_BASE_URL` and `CORS_ORIGINS`, `TELEGRAM_MODE=webhook` with a secret, secrets without placeholders, `S3_*`, `METRICS_TOKEN`. Variable template: `.env.production.example`.
- Images: `apps/api/Dockerfile` and `apps/worker/Dockerfile` build from the monorepo root; CI publishes them to GHCR from `master`. Migrations in the container: `node packages/db/dist/migrate.js`; administrator and webhook: `node apps/api/dist/cli/bootstrap-admin.js`, `node apps/api/dist/cli/set-webhook.js`.
- `apps/api/src/app.e2e.test.ts` boots the whole application on Fastify with Postgres and Redis in containers and checks access boundaries between roles, audit of denied access to medical documents, report exports with audit, body validation and CORS.
- `apps/api/src/load/shift-boundary.load.test.ts` models the shift-boundary peak: `VAKHTA_LOAD_EMPLOYEES` employees record arrival at once, press "Start shift" twice and make the first transition; it checks the absence of duplicates (AC-05) and p95 at the service level. `infra/load/k6-shift-boundary.js` loads the HTTP surfaces (kiosk, panel) on staging.
- Runbooks: `docs/runbooks/deploy.md` (release and rollback), `recovery.md` (nightly backup to R2 by a workflow, restore with `scripts/db/restore.sh`, drills), `observability.md` (signals and alerts), `reserve-channel.md` (working without the bot). Environments dev/prod, services and the first-run order: `docs/deploy.md`.

## Commands

| Command                                                      | What it does                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm build`                                                 | Build every package in dependency order (Turborepo)                 |
| `pnpm typecheck`                                             | Type-check every package                                            |
| `pnpm test`                                                  | Vitest in every package; `packages/domain` has FSM property tests   |
| `pnpm lint`                                                  | ESLint for the whole repository                                     |
| `pnpm check`                                                 | typecheck + lint + test                                             |
| `pnpm infra:up` / `infra:down`                               | Local stack in Docker                                               |
| `pnpm db:generate`                                           | Generate a SQL migration from the Drizzle schema                    |
| `pnpm db:migrate`                                            | Apply migrations to `DATABASE_URL` (drizzle-kit, dev)               |
| `pnpm db:migrate:js`                                         | The same through `packages/db/dist/migrate.js`, as in the container |
| `pnpm db:seed`                                               | Pilot directories, idempotent                                       |
| `pnpm --filter api auth:bootstrap -- --email … --password …` | First panel administrator                                           |
| `pnpm --filter api telegram:set-webhook`                     | Register the bot webhook at `PUBLIC_BASE_URL`                       |
| `docker build -f apps/api/Dockerfile .`                      | API image (for the worker `apps/worker/Dockerfile`)                 |

## Non-negotiable principles

- The server event log is the source of truth. Events are never edited or deleted; a fix creates a compensating event.
- An open shift has exactly one active interval. The FSM lives in `packages/domain`; invariants are duplicated in the database.
- Every command is idempotent: `update_id`, `idempotency_key`, `expected_version`.
- Time is stored in UTC; local time appears only on output, in the site's IANA time zone.
- Timers remind but never close states.
- The bonus is computed by a pure function from versioned rules and is never reduced for downtime or a safety report.
