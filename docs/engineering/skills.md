# Engineering skills

Owner decision, 2026-09-17: choose expertise by the work being done. Lean is a high-level process
assessment requested by the owner, not a general development methodology or completion gate.
Use one primary skill for the current stage and add complementary skills only for an actual concern.
A role does not require spawning an agent. Follow the existing single-writer operating model.

## Selection by responsibility

Project skills live in `.agents/skills/<name>/SKILL.md`. Read only the relevant entrypoint and the
references needed for the task. Prefer these tracked copies over an identically named global skill.

| Responsibility                                  | Primary skill                                  | Add only when needed                                                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend development                            | `vercel-react-best-practices`                  | `vercel-composition-patterns` for component APIs and composition                                                                                                    |
| Backend development                             | `nestjs-best-practices`                        | `architecture-patterns` for module boundaries; `supabase-postgres-best-practices` for SQL/schema work                                                               |
| UI/UX design and implementation                 | `frontend-design`                              | Existing `impeccable` or `web-design-guidelines` for a focused design/accessibility review                                                                          |
| Architecture                                    | `architecture-patterns`                        | `architecture-decision-records` for significant decisions; existing `codebase-design` for frontend/module interfaces                                                |
| QA and automated testing                        | `javascript-testing-patterns`                  | `webapp-testing` for rendered browser journeys, screenshots and browser logs                                                                                        |
| Database engineering                            | `supabase-postgres-best-practices`             | Existing transaction/recovery tests and the backend skill where application behavior changes                                                                        |
| Specification and planning                      | Existing project `speckit-*` skills            | Only the stages warranted by the bounded task under `spec-kit.md`                                                                                                   |
| Debugging, review, security, CI/CD and delivery | Existing installed specialist for that concern | `debugging-and-error-recovery`, `code-review-and-quality`, `security-and-hardening`, `ci-cd-and-automation` or `shipping-and-launch`, when available and applicable |
| Lean expertise                                  | `vakhta-lean-review`, only on request          | Delivery-process role only for a requested Lean assessment of engineering flow                                                                                      |

The existing global Addy Osmani and Matt Pocock skills remain available in this environment; they
are not vendored or guaranteed on another machine. Check the active skill catalog before using them.
All five core engineering responsibilities above have a project-local primary skill. Do not load the
whole catalog, execute every lifecycle phase or install an entire agent framework for a small change.

Examples: a React data-loading fix uses frontend guidance and focused QA; a Nest endpoint uses backend
guidance and contract/integration checks; a panel redesign uses UI/UX and frontend skills followed by
affected desktop/mobile verification. None of these invokes Lean. A request to assess shift handover
using Lean, value-stream analysis or standardized work does invoke the Lean advisor.

## Project rules override upstream examples

The imported entrypoints begin with a local compatibility note. `AGENTS.md`, `standards.md` and
`testing-baseline.md` remain authoritative. Upstream examples are references, not migration requests.

- **Frontend:** keep Vite, React Compiler, FSD public APIs, TanStack Query/Router/Table and Zustand.
  Skip Next.js/RSC/server-action instructions. Do not introduce SWR, prohibited hooks or deep imports
  that bypass slice APIs to follow a performance example. Optimize demonstrated costs.
- **Backend:** preserve Nest/Fastify feature modules, Drizzle, shared Zod contracts, DomainError mapping,
  pure domain functions and transaction boundaries. TypeORM, Prisma, class-validator, Express and Jest
  examples do not authorize replacements. In-memory events do not replace durable required effects.
  Worker and pure-domain code remain independent of Nest; use only relevant backend principles there.
- **UI/UX:** follow the actual operational brief, existing semantic colors and localized catalogs.
  Do not invent a client's rejected designs, add a marketing hero or change visual identity because
  an upstream studio example assumes one. Keep accessible controls, shared loading states and
  inspected desktop/mobile screenshots.
- **Architecture:** evaluate existing boundaries and the smallest useful seam before adding layers,
  repositories, classes or services. In-memory adapters cannot prove PostgreSQL constraints, locking
  or recovery; retain real database invariant tests where required. ADRs use existing `docs/adr/`
  conventions; no ADR is required for routine implementation choices.
- **QA:** reuse Vitest, Testing Library, MSW, fast-check, testcontainers and existing TypeScript
  Playwright projects. Do not add Jest, a Python browser runner, a coverage threshold or another server
  harness just because a sample uses one. Prefer locator assertions and explicit readiness over
  fixed sleeps or `networkidle`, which can stall on polling. Reuse authenticated browser sessions
  for authorized live QA; keep local fixtures separate from production actions.
- **PostgreSQL:** use only applicable PostgreSQL guidance for Drizzle and the actual deployed engine.
  Supabase hosting, auth, RLS helpers, extensions and queue products are not existing project choices.
  Preserve append-only records and the current task engine; do not add policies or extensions incidentally.

Skills do not authorize external messages, production mutations, new infrastructure or wider scope.
Bundled scripts are optional upstream resources: inspect a script before executing it, use only known
arguments and prefer the existing project runner. No imported script runs on installation.

## GitHub selection evidence

Checked through the GitHub API on 2026-09-17 before installation. Stars measure repository popularity,
not the quality or adoption of an individual skill. This is a compared shortlist, not a claim to have
ranked every repository on GitHub. Full commit pins and local adaptation records are in
[the source lock](../../.agents/skills/upstream-lock.json).

| Repository                                                                      | Stars at inspection | Decision                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [obra/superpowers](https://github.com/obra/superpowers)                         |             288,036 | Considered; do not add a competing end-to-end workflow over Spec Kit and the current delivery policy.                                               |
| [mattpocock/skills](https://github.com/mattpocock/skills)                       |             264,294 | Relevant global skills already available; avoid duplicate installation.                                                                             |
| [anthropics/skills](https://github.com/anthropics/skills)                       |             176,859 | Install `frontend-design` and `webapp-testing`.                                                                                                     |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)           |              96,014 | Existing global engineering specialists cover review, security, debugging and delivery.                                                             |
| [wshobson/agents](https://github.com/wshobson/agents)                           |              39,758 | Install architecture patterns, ADRs and JavaScript testing; no plugin-wide agents/hooks.                                                            |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)         |              31,280 | Install React best practices and composition patterns; UI review skill already available globally.                                                  |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) |              26,073 | Considered; current backend skill requires a broad interview/fork tree, and QA scaffolding assumes Jest/Next.js. Prefer narrower compatible skills. |
| [supabase/agent-skills](https://github.com/supabase/agent-skills)               |               2,626 | Install portable PostgreSQL guidance from the database vendor.                                                                                      |
| [Kadajett/agent-nestjs-skills](https://github.com/Kadajett/agent-nestjs-skills) |                 276 | Smaller community source selected for direct NestJS fit; not an official NestJS skill.                                                              |

## Maintenance

Nine skills are vendored at exact Git revisions using the Codex skill-installer helper with an
explicit `.agents/skills` destination. Keep upstream references and license notices. The local changes
are limited to the leading compatibility notes; source-license copies are recorded in the lock.
The lock's tree digests cover file names and bytes, with files sorted by relative POSIX path and
each path followed by NUL, its bytes and NUL. They are integrity evidence, not a security audit.

For an update, inspect upstream changes and licenses first, install the exact revision into a
temporary directory, compare it with the tracked copy, preserve the local compatibility notes and
update the lock. Validate frontmatter, referenced files and relevant helper behavior. Never overwrite
an installed directory blindly or run an unpinned package installer. Imported trees are excluded from
Prettier to avoid rewriting upstream material; authored project guidance remains format-checked.

Lean's invocation policy disables implicit selection. Its explicit skill invocation remains available;
an owner request for Lean expertise can also be handled by deliberately reading its entrypoint.
Historical Lean assessments stay as historical evidence. New plans and feature memories do not need
an empty Lean section or a fabricated recommendation.
