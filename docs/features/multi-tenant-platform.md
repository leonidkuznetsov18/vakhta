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

- **Creating a client.** The operator enters the client name, a short slug (letters, digits and
  hyphens; it becomes part of the addresses and never changes), the default language, the plant
  time zone, the display name and optionally a logo and accent colour, and picks the modules.
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
- **First administrator.** The job produces a one-time invitation link for the client's panel. The
  administrator opens it, sets a password and gets the "ADMIN" role for the whole client; from
  there they add employees, terminals and schedules exactly as today.
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
