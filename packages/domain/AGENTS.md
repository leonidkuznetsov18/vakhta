# Pure domain boundary

- No framework, React/store, database, queue or network dependencies. Keep calculations and transitions
  deterministic; pass time and context explicitly. The existing `./node` export isolates Node crypto
  helpers from the browser-facing root export. Do not pull Node APIs through `src/index.ts`.
- Preserve shift transition/error semantics and interval invariants. Test state-machine boundaries,
  forbidden transitions, timezones and property invariants; do not modify golden expectations to hide
  changed behavior. API/worker adapters own effects.
