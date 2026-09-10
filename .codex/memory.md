# Handoff decisions

Append decisions and unresolved questions only, with date, commit, owner and links. Do not duplicate
`AGENTS.md`, store secrets or maintain a commentary log. Limit this active file to 120 lines / 12 KiB.
At the cap, archive the whole file unchanged under `docs/engineering/handoffs/`, start a new active
file linking the archive and current decisions, and preserve all historical entries. One integration
owner appends after merging work; parallel agents return proposed entries instead of editing this file.

## 2026-09-10 — Recon and setup

- Baseline `08979de`; setup owner: Architect/Planner. Scope is audit/configuration only.
- Preserve Nest modules, pure domain and vanilla kiosk; frontend FSD is incremental. RSC is not an
  instruction to replace the current Vite runtime.
- Product Lean advisor and delivery Lean/Process Expert are distinct roles. See
  `docs/engineering/agent-operating-model.md` and `docs/audits/2026-09-10/README.md`.
- Unresolved: GitHub required checks and Codex Automatic Reviews need an owner-applied settings change;
  hosted Cloud Docker availability needs verification before full integration tests can be promised.
