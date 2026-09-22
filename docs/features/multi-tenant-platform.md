# Multi-tenant platform and control panel

Status: **control hosting deployed; tenant rollout in progress**. Owner: product owner. Recorded: 2026-09-21.
Authority: the owner asked for an architecture where every client plant has its own database, bot,
kiosk and branded interface, created and managed from a platform control panel that assigns
modules. The tenant foundation and initial control panel are implemented; the pilot still uses env mode.
The complete behavior below remains the target until the remaining deliveries pass acceptance.

**Support boundary:** do not tell employees, masters or administrators that these capabilities
exist. Current behavior stays as documented in the other feature files. Specification, plan and
evidence: [specs/011-multi-tenant-control-plane](../../specs/011-multi-tenant-control-plane/spec.md)
and the [engineering memory](../engineering/features/multi-tenant-platform.md).

## Implemented and remaining

Implemented in the repository: tenant-scoped API and worker, encrypted registry, operator sign-in
with session-bound TOTP, tenant creation, module switches, domain records, bot-token validation,
resumable provisioning, invitation generation, audit and the initial trilingual control panel.
The operator panel has been checked locally against the real API at desktop and mobile widths.
Control hosting is deployed at `https://control.vakhta.xyz`, with the separate control API and
registry on Railway. The first operator has been created; owner TOTP enrollment is required at
first sign-in. Credentials are in the owner's private 1Password vault.
Read-only operators cannot retrieve administrator invitation tokens. Required provisioning steps
cannot be skipped; a manual DNS step can be skipped without marking its domains verified.

Operating parameters (presence windows, breaks, escalation and SLA, QR rotation and lifetime,
photo checks and the other section-18 values) are edited per client on the Parameters tab. They
are stored in the client's own database and reach its API, bot, kiosk and worker within one
registry refresh, without a deploy; every change is audited. Values not set on the tab follow the
platform defaults; the pilot keeps its deployment values as its defaults.

Not yet available: complete workspace actions and table pagination, and tenant deletion.
Nightly backups cover every client database; restoring one client is a runbook procedure.

## What it is

A **tenant** is one client company: a plant or a group of plants. Everything a tenant records (its
employees, shifts, incidents, photos, reports, panel users) lives in that tenant's own database.
A tenant has its own Telegram worker bot, its own panel address (for example `zavoda.vakhta.xyz`),
its own kiosk address (`zavoda-kiosk.vakhta.xyz`) and its own display name and logo on those
surfaces. Tenants never see each other's data.

The **control panel** ("Vakhta Control", `control.vakhta.xyz`) is used only by Vakhta platform
operators, not by client staff. Operators sign in with e-mail, password and a mandatory
authenticator code.

## Target behavior

- **Creating a client.** One form: the client name, a short slug suggested from the name (letters,
  digits and hyphens; it becomes part of the addresses and never changes), the default language,
  the plant time zone, the modules, the first administrator's name and e-mail, and optionally the
  bot token. "Create" starts provisioning at once and shows the steps live.
- **One place for everything.** The client card shows every setting in tabs: modules, database,
  bot, kiosk, panel, domains, branding, parameters (presence windows, breaks, escalation, SLA,
  QR rotation and the other values from the customer parameter list), jobs and audit. Everything
  editable is edited there with validation; secrets are masked. Actions such as "check connection",
  "run migrations", "verify bot", "issue new invitation" and "back up now" sit next to their values.
- **Modules.** "Admin panel", "Worker bot" and "QR kiosk" can be switched on or off per client.
  A switched-off module disappears from the client's panel, the kiosk shows a notice that the
  terminal is not enabled, and the bot stops receiving messages. Switching does not need a release.
  "Support bot" and "Photo inspection" are reserved names for later.
- **Provisioning.** "Provision" starts a job with visible steps: create the database, apply the
  schema, seed the directories (positions, downtime reasons, shift templates, the first site),
  reserve the storage folder, register the addresses, and invite the first administrator. Bot
  connection runs independently after activation. An enabled Worker bot without a token keeps a
  visible Add bot token task with a link to its configuration. Each step shows done, failed or "needs your action" with instructions (for
  example a DNS record to create). A failed step can be retried without repeating the others.
- **Bot.** Telegram has no way to create bots automatically. The operator creates the bot in
  BotFather, pastes the token, and the platform checks it and connects it. The token is stored
  encrypted and is never shown again.
- **Onboarding link.** When provisioning finishes the operator gets one link for the client and
  copies it into any channel. The client's administrator opens it, sets a password, sees the bot
  link with a QR code and the kiosk pairing steps, and starts adding employees, terminals and
  schedules exactly as today. The link works once for the password and expires after seven days;
  the operator can issue a new one. If the bot token is added later, the page says the bot is being
  connected.
- **Tenant administrators.** Overview lists every administrator with their login email and MFA
  status. After initial password setup the onboarding card disappears. Platform administrators
  can set a new password, generate one with Reset password, or delete administrator access.
  Existing passwords cannot be viewed. Password changes revoke sessions and pending MFA checks;
  deletion revokes all panel access while keeping recorded history. Control prevents deleting
  the last enterprise administrator. Viewers see the list without mutation actions. On mobile,
  tenant sections open from a burger menu; desktop retains the tabs.
- **Deleting a client.** A client that was never provisioned is removed at once. A working client
  is deleted only after the operator types its slug: a final backup is taken, the client is
  suspended immediately, and its database and files are removed after a retention window during
  which an operator can restore it.
- **Suspend and resume.** An operator can suspend a client with a reason: its panel, bot and kiosk
  stop responding until resumed. Every operator action is kept in an audit log.

## Where it lives

Control panel: tenant list with status and modules; tenant card with modules, addresses, bot,
branding, jobs, audit; operators page. Tenant panel: the client's display name and logo in the
sign-in card and header; sections of disabled modules are hidden. Kiosk: the client's name in the
title; a notice when the kiosk module is off. Bot: the greeting uses the client's display name.

## Typical questions

In a client's **Branding** tab, an operator can change the display name, upload or remove a logo,
and choose or reset the accent colour. The preview updates before saving. Logos may be PNG, JPEG
or WebP up to 512 KB; their proportions are preserved. The logo is public. Reload a client page to
apply a saved brand. Light and dark themes adjust the accent for legibility without recolouring
warnings or operational statuses. Branding is independent for every tenant.

- "Can one company have several plants?" Yes: sites, units and zones stay inside one tenant.
- "Can two clients share a bot?" No: each tenant has its own bot.
- "What happens to the current customer?" It becomes the first tenant with no data migration and
  no visible change.

## Adding platform operators

A platform administrator with a verified two-factor session can add an operator from **Operators**:
enter their name, email and role, then create and copy the invitation link. Send it privately to the
operator. They choose their own password and complete the normal two-factor setup at first sign-in.
The platform does not send invitation emails.

An invitation can be used once and expires after the configured invitation period (seven days by
default). Before password setup, **New invitation** replaces a lost or expired link and invalidates
the old one. It cannot reset an already activated operator's password. Disabled operators cannot
accept invitations. If password setup succeeded but the connection failed, the recipient can try
**Sign in** with the password they chose.

## Instant managed-address onboarding

Spec: [012-instant-tenant-onboarding](../../specs/012-instant-tenant-onboarding/spec.md).
When the shared gateway is enabled, Create provisions the tenant database/defaults, checks HTTPS
for the managed panel/API/kiosk addresses, creates the administrator invitation and activates the
company automatically. No per-company DNS record, certificate request or provider registration is
required. A temporary gateway failure retries automatically, then remains visible and retryable.
Telegram token verification and webhook setup run as a separate job after activation, so Telegram
availability does not block the panel. Tasks continues to show missing bot setup even when core
provisioning is complete; after token save it shows the actual connection job. Duplicate tokens
remain refused. The operator shares the
existing welcome link; the administrator chooses a password. Public self-registration and customer
owned domains remain separate flows. Existing explicit platform and tenant addresses stay compatible.
Production enablement and measured creation evidence are tracked in the engineering memory.
