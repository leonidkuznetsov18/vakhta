# API boundary

- Nest dependency-injection constructor classes must remain value imports where decorator metadata
  requires them; this is why the root ESLint config exempts API consistent-type-imports.
- Validate HTTP/queue/Telegram inputs at their boundary. Enforce role and data scope on server queries;
  hiding a panel control is not authorization. Preserve stable DomainError codes for localization.
- Keep the transition transaction, row locks, expectedVersion and idempotency response together.
  `settle` / after-commit effects are separate failure domains; do not pretend Redis enqueue is part
  of the PostgreSQL transaction. Include failure/retry evidence for changes to these paths.
- Do not put worker-facing screens into pure domain. New module boundaries should reduce the existing
  coupling between shift orchestration and Telegram formatting instead of spreading it.
