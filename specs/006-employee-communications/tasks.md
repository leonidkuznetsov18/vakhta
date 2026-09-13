# Tasks: employee communications workspace

Active feature: `specs/006-employee-communications`. Baseline `ee965b8`.
Status: implementation and focused local verification complete; live rollout acceptance remains separate. Single writer/index owner:
Codex. Dependencies are sequential; review is read-only. Do not mark proposals as delivered behavior.

- [x] T01 — Inspect global composer, Operations caller, contracts, scoped endpoint, outbox, media
      schema and bot handlers; inspect current visual surface. Evidence: spec RECON and feature memory.
- [x] T02 — Write common specification, proposed interaction, acceptance criteria and implementation
      dependencies before application edits. Evidence: spec.md and plan.md.
- [x] T03 — Owner confirmed outbound-only messaging and multi-question questionnaires with free-text
      answers. Spec C31–C36 and plan define named responses, routing and author-only result visibility.
- [x] T04 — Finalize UX direction and technical media/audience limits; capture the scoped Impeccable
      product/surface context from confirmed requirements. Review C01–C36 for contradictions and gaps.
- [x] T05 — Add communication Zod contracts and normalization with boundary tests (C06–C19, C22).
      Paths: packages/contracts/src/communications.ts, communications.test.ts, index.ts.
- [x] T06 — Add additive schema/migration and transaction constraints; verify rollback-safe schema
      compatibility in disposable PostgreSQL (C14–C25). Paths: packages/db/src/schema/communications.ts,
      schema/index.ts and generated migration/journal. No changes to append-only event permissions.
- [x] T07 — Implement scoped audience lookup, reviewed batch submission, idempotency and authorized
      history/detail queries with HTTP/service invariants (C06–C09, C20–C25).
      Paths: apps/api/src/communications/*, API module registration and scoped tests.
- [x] T08 — Implement private upload admission/finalization, actual-file validation, ownership and
      cleanup; verify stale completion and storage failures (C10–C14, C25).
      Paths: communications media service/controller/tests; existing ObjectStorage only where needed.
- [x] T09 — Implement backward-compatible ordered outbox parts, binding checks, progress and retries;
      test 429, blocked chat, partial success, worker crash and old notification payloads (C14, C21–C24).
      Paths: apps/worker/src/communications/* and focused existing worker tests. Existing relay and bot handlers remain unchanged.
- [x] T10 — Implement the selected survey model end to end, durable HTTP answer handling, eligible
      respondents, aggregate views and closure recovery (C15–C19). Include durable drafts, previous/next navigation, explicit final review, submission and closure
      serialization; protect operational bot forms (C31–C36).
      Paths: communication API/domain schema as selected; questionnaire API/authentication tests and dedicated worker web entry.
- [x] T11 — Implement actor-bound draft/upload model and query layer with navigation, stale-response,
      logout and duplicate-submit regressions (C03–C13, C25, C29).
      Paths: apps/admin-web/src/features/employee-communications/{model,api} and colocated tests.
- [x] T12 — Replace the dialog with the global dock/mobile workspace; add reviewed audience,
      attachments, surveys and history; connect existing contextual entry points (C01–C36).
      Paths: employee-communications/{ui,index.ts}, App.tsx, legacy composer/callers, i18n catalogs.
- [x] T13 — Run focused contracts/API/worker/panel checks, relevant type/lint checks and one independent
      review for access/transactions/recovery; fix demonstrated defects without repeating valid checks.
- [x] T14 — Inspect affected desktop/mobile screenshots and keyboard behavior, plus synthetic bot
      journey. Record true evidence and blocked live checks; complete Lean review.
- [x] T15 — Update docs/features/employee-communications.md with actual delivered behavior, update
      feature memory and task acceptance evidence. Delivery verification is tracked separately below. No manual employee messages.

- [ ] T16 — Verify the source commit, master push, CI/release/announcement and deployed API/worker/panel revision. Record final run evidence in the delivery report.
- [ ] T17 — Owner-authorized live Telegram Mini App launch, private storage delivery and physical phone keyboard QA. Local synthetic screenshots do not establish these outcomes.
- [x] T18 — Owner refinement: editable employee autocomplete with cancelable server suggestions,
      keyboard multi-selection and removable selected chips; one 640px desktop width and Close (X).
      Outside-close retains the draft; no backdrop. Focused interaction tests, typecheck, lint and
      production build passed; inspected screenshots at 1280x720 and 360x800 before publishing.
