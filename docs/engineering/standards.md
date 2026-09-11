# Engineering standards

Status: accepted project-owner requirements, 2026-09-10.

## Product outcome

Vakhta helps workers, masters and administrators understand shifts, obtain help and reduce avoidable
production time loss. Optimize for an understandable, dependable workflow under real shop-floor
conditions. Activity records alone do not prove equipment downtime, low productivity or employee fault.
Preserve the MVP boundaries and shift invariants in `AGENTS.md`.

## React and presentation

Use the installed React 19 capabilities where they solve a concrete need: React Compiler, Suspense
with supported data sources, transitions, Actions and form APIs, and callback refs when appropriate.
Check the installed minor version and official documentation before using an API. Do not add every API
merely because it exists. Client-side Vite applications do not become Server Component applications
without an explicit architecture decision.

`useEffect`, `useMemo`, `useRef` and `useCallback` are forbidden in new or changed application-owned
React code. React 19 still supports them; this is our architecture policy, not a claim of deprecation.
React Compiler handles supported memoization; it does not own subscriptions or replace cleanup.
Do not disguise the forbidden hooks behind wrappers, imports, class lifecycles or disabled lint rules.
If a required integration cannot follow this rule correctly, explain the specific limitation and ask
for an explicit exception before implementing it. Do not silently modify third-party internals.

Components select prepared view models, connect named actions and render semantic markup. Keep
business decisions, sorting, grouping, date calculations, permissions, validation, request construction
and orchestration outside JSX. Ordinary presentation mapping and conditional markup remain readable.
Do not create a class per component merely to move code. Use pure functions for calculations, model
modules for state and actions, and classes only for meaningful behavior or resource ownership. Keep
`packages/domain` pure: no React, stores, requests or framework dependencies.

TanStack Query owns remote data, query keys, fetches, polling, mutations and invalidation. Reuse the
existing QueryClient and key factories. Never mirror query results into Zustand. Zustand owns client
workflow state through focused selectors and actions. Avoid unstable selector results and broad store
subscriptions. Remote persistence stays in mutations; model actions coordinate it when needed.

Use TanStack Table, Virtual and Router for their respective needs. Check compatibility with the
installed versions and React Compiler. Table row models and virtualization are separate concerns.
Do not introduce a router or virtualizer to a screen that has no corresponding requirement.

## Feature-Sliced Design and reuse

The frontend dependency direction is `app -> pages -> widgets -> features -> entities -> shared`.
Use only layers a feature needs. A slice exposes a deliberate public API; imports must not reach into
another slice's internals or a peer slice. `app` and `shared` use segments rather than business slices.
Keep business-specific concepts out of `shared`. Tests sit beside the model or feature they protect.

Apply feature ownership consistently across apps. Backend Nest modules, workers and pure domain
packages retain their appropriate architecture; do not insert UI layers into backend services. The
vanilla kiosk can adopt feature boundaries without a React rewrite. New frontend work uses FSD;
when touching legacy code, migrate the coherent affected slice without unrelated bulk moves. Record
remaining boundary debt and approved third-party integration exceptions in feature memory.

First search existing primitives, model functions, contracts, query keys and stores. Then consult
maintained libraries and primary documentation. Record a custom solution's missing capability or
constraint. DRY means sharing the same rule, not combining unrelated workflows because they look alike.

## TypeScript

Preserve strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unknown catch values
and existing ESM import conventions. Model state with discriminated unions and exhaustive handling.
Validate untrusted input at boundaries with shared Zod contracts. Prefer inference and `satisfies`;
use `unknown` with narrowing rather than `any`, unsafe assertions or non-null assertions. Reuse domain
and API types. Avoid boolean flag combinations that represent impossible states, mutable shared
objects and swallowed errors. Document public contracts, invariants and non-obvious tradeoffs, not
self-evident lines of code. Do not weaken type or lint settings to make a check pass.

## Interface and verification

Use Tailwind and shadcn/ui, existing design tokens and localization catalogs. Preserve keyboard and
screen-reader access. Mobile is a primary workflow: check narrow viewports, touch controls, readable
status, inline errors, the on-screen keyboard and long translated text. Keep the primary action obvious;
do not make tooltips the only way to understand an essential control.
Do not duplicate explanatory text in both a tooltip and its surrounding card or form. Keep the
explanation in the tooltip; retain concise field labels and distinct actionable validation messages.

Test business rules, state transitions, query invalidation, permissions and error recovery at the
appropriate unit/integration level. E2E covers authentication and complete critical journeys across
panel, kiosk and bot, including failures and retries. Avoid tests that merely mirror implementation.
A changed journey needs proportionate documentation and evidence. Follow the risk-based mandatory
checks in `testing-baseline.md`; do not run a full local `pnpm check` or all-surface live QA by default.
Record only relevant browser/bot scenarios and blocked checks. Existing API E2E tests are not
evidence of browser or Telegram visual coverage.

## Sources

- [React Compiler](https://react.dev/learn/react-compiler/introduction)
- [React hooks](https://react.dev/reference/react/hooks)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Zustand](https://zustand.docs.pmnd.rs/getting-started/introduction)
- [FSD layers](https://fsd.how/docs/reference/layers/)
- [TypeScript strict checks](https://www.typescriptlang.org/tsconfig/strict.html)
