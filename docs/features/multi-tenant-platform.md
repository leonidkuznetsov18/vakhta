# Multi-tenant platform and control panel

Status: **planned feature; not implemented**. Owner: product owner. Recorded: 2026-09-21.
Authority: the owner asked for an architecture where every client plant has its own database, bot,
kiosk and branded interface, created and managed from a platform control panel that assigns
modules. This document describes the intended behavior; nothing here is available yet.

**Support boundary:** do not tell employees, masters or administrators that these capabilities
exist. Current behavior stays as documented in the other feature files. Specification, plan and
evidence: [specs/011-multi-tenant-control-plane](../../specs/011-multi-tenant-control-plane/spec.md)
and the [engineering memory](../engineering/features/multi-tenant-platform.md).

## What it is

A **tenant** is one client company: a plant or a group of plants. Everything a tenant records (its
employees, shifts, incidents, photos, reports, panel users) lives in that tenant's own database.
A tenant has its own Telegram worker bot, its own panel address (for example `zavoda.vakhta.xyz`),
its own kiosk address (`kiosk.zavoda.vakhta.xyz`) and its own display name and logo on those
surfaces. Tenants never see each other's data.

The **control panel** ("Vakhta Control", `control.vakhta.xyz`) is used only by Vakhta platform
operators, not by client staff. Operators sign in with e-mail, password and a mandatory
authenticator code.

## How it works

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
  reserve the storage folder, register the addresses, connect the bot, and invite the first
  administrator. Each step shows done, failed or "needs your action" with instructions (for
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

- "Can one company have several plants?" Yes: sites, units and zones stay inside one tenant.
- "Can two clients share a bot?" No: each tenant has its own bot.
- "What happens to the current customer?" It becomes the first tenant with no data migration and
  no visible change.
