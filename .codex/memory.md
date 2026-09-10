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

## 2026-09-10 — Owner supersedes PR/worktree proposal

- Owner decision: work only in the current Vakhta checkout on `master`; no PRs, topic branches or new
  worktrees. Push verified task-owned commits directly, without force. Serialize writers/index use.
- Audit commit `37bc0c7` was copied into current master as `d219cdd`; its temporary audit worktree was
  removed after preserving the committed result. The audit's PR/protection/worktree proposals are historical.
- Preserve GitHub release → existing changelog bot → private "Вахта Dev" group. A published version's
  announcement does not prove all deployments completed. Do not send duplicate/manual announcements.
- Map and verify GitHub, Cloudflare, Railway and Namecheap access, logs and runtime ownership in
  `docs/runbooks/platform-operations.md`; report access gaps explicitly and use 1Password for secrets.
