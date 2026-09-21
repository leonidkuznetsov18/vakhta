# Multi-tenant platform engineering memory

## Outcome and scope

2026-09-21; active feature `specs/011-multi-tenant-control-plane`, baseline `0566952`, current
`master` checkout. Owner request: each client plant gets its own database, bot, kiosk and branded
interface, created from a platform control panel that assigns modules. This entry records the
planning package; no code, schema, deployment or employee record changed.

## Current behavior and ownership

Single-customer deployment: one `DATABASE_URL`, one bot token, one panel and kiosk host, one
migration and backup target. Facts and file references: spec RECON. Product document:
[Multi-tenant platform](../../features/multi-tenant-platform.md) (planned).

## Decisions and reuse

- Isolation model: database per tenant on a shared cluster, shared stateless API and worker with
  an `AsyncLocalStorage` tenant context that fails closed, one bot per tenant, tenant hostnames,
  prefixed storage and Redis keys. Rejected: one deployment per tenant (cost, deploy per client)
  and `tenant_id` columns (contradicts the requirement, access risk). ADR-0015 (proposed).
- Control plane: separate `control-api` service and `control-web` app with their own registry
  database, operator auth with mandatory TOTP, encrypted tenant secrets, durable resumable
  provisioning jobs, append-only control audit. Provider tokens never enter the tenant API process.
- Compatibility: `TENANCY_MODE=env` keeps the pilot, local development and CI unchanged until the
  registry cutover; rollback is an env change with no data movement.
- Panel and kiosk remain single builds and read tenant configuration at runtime by host from a
  public control endpoint with a browser-storage cache.
- Modules `ADMIN_PANEL`, `WORKER_BOT`, `QR_KIOSK` are registry switches enforced by the API;
  `SUPPORT_BOT` and `PHOTO_INSPECTION` are reserved codes.
- Telegram offers no bot-creation API; operators paste BotFather tokens, validated with `getMe`.
- Owner refinement, 2026-09-21: the control panel is the single configuration surface with full
  create, edit and delete; creation is one wizard that ends with an onboarding link. Consequences
  recorded in the spec (US7, US8): section-18 parameters move from environment variables to a
  per-tenant settings catalog with platform defaults (the `settings` table exists but is used only
  by the support bot today); no mail provider exists, so links are copied, not e-mailed; deletion
  gets slug confirmation, a final backup and a retention window.
- Open owner decisions are listed in plan.md (hostname scheme, separate control service, one
  cluster, pilot slug, control panel languages).

## Verification

Planning only. Checks performed on 2026-09-21: Prettier format check on the new and edited Markdown
files; relative links inspected. No application build, tests or live QA were required or run.
Research rows marked **verify** in research.md are not yet confirmed.

## GitHub publication

2026-09-21, on owner request: epic [#91](https://github.com/leonidkuznetsov18/vakhta/issues/91) with fifteen native sub-issues #92–#106, label
`area:platform` created, one status label per issue (`status:needs-decision` on the epic and #92,
`status:backlog` elsewhere). Titles follow `Platform | Capability | Outcome`; bodies carry outcome,
scope, acceptance checkboxes with AC/FR traceability, resolved dependency numbers, verification and
pinned sources. Receipts with body hashes: `specs/011-multi-tenant-control-plane/publication.json`.

## Remaining work

Owner answers in [#92](https://github.com/leonidkuznetsov18/vakhta/issues/92); then delivery 1 (#93–#97). Provisioning time per tenant is to be
measured when the first non-pilot tenant is created (#104).
