# Implementation Plan: Photo object dictionary

**Change**: 007-photo-object-dictionary | **Date**: 2026-09-14 | **Spec**: [spec.md](spec.md)
**Baseline**: 5c0ac044 | **Checkout**: master | **Engineering memory**: [photo-inspection-dataset](../../docs/engineering/features/photo-inspection-dataset.md)

## Summary

Add a free Wikidata-backed dictionary inside the existing checklist photo-rule feature. A small reviewed multilingual seed vocabulary handles common physical meanings and spelling normalization; live Wikidata extends search and details. New catalog objects use canonical English names. Persist optional dictionary snapshots inside existing rule JSON and carry them through the existing analysis snapshot to Gemma. No SQL migration or vision-provider replacement is needed.

## Technical Context

NestJS 11/Fastify API, React 19/Vite panel, TanStack Query 5, Zod 4 contracts, existing `photo_objects`, JSONB `checklist_photo_rules.rules`, worker Gemma analyzer. Existing `photoObjectKey`, `rulesDraftState`, QueryFeedback, LoadingState, cmdk Command primitives, mutation APIs and versioned saves are reuse candidates. The existing audience-search delay is domain-independent; extract it to shared asynchronous utilities and reuse it without a React effect.

## Constitution Check

All five principles apply: immutable history and role guards stay; FSD ownership remains in `features/checklist-photo-rules`, infrastructure utilities are domain-independent; external input is validated; Query owns server data and local useState owns transient input; no forbidden hooks; all copy is trilingual. One writer/index owner. Recovery/API boundary receives an independent review. No new database schema or transaction design; add persistence invariants to the existing integration suite. Existing legacy components are composed, not migrated wholesale.

## DESIGN: Ownership and Behavior

### Dictionary contract and source

`packages/contracts/src/photo-object-dictionary.ts` defines strict bounded queries, canonical English concepts, localized names/definitions, aliases, available subtypes, source IDs and coverage. `PhotoRule.dictionary` is optional and preserves legacy output when absent. Included and explicitly excluded variants are stored as disjoint sets in the snapshot; exclusions apply only to that checklist rule and are sent to AI as subtype exceptions. Operational `note` is independent and keeps its 300-character limit. Do not add encyclopedia descriptions as operational exceptions.

API endpoints under `/admin/photo-objects/dictionary`: search by query/locale and details by validated QID/locale. Existing authorized review roles may call them. A service-owned bounded cache and in-flight deduplication avoid repeat upstream calls. Fetches have fixed allowed origins, identifying User-Agent, timeouts, response size limits and explicit HTTP/API-error checks. Respect Retry-After with a service cooldown. No dynamic user URL or raw search-language execution. An abortable debounce in the Query fetch cancels superseded browser work before contacting the API. Upstream requests are bounded and shared independently of a single disconnected consumer.

Search ranks verified seed labels/aliases with normalized apostrophes/case/spacing and conservative edit distance. Live `wbsearchentities` extends unknown input; hydrate English/localized labels through `wbgetentities`. Reject missing English labels and obvious non-object/disambiguation results. Require positive P279 ancestry to physical object Q223557 within five levels, 80 entities, 40 entities per batch and an eight-second ancestry budget. A visited set bounds graph traversal; uncertain or deeper categories use manual entry. Validate full hydrated entities before caching so malformed data cannot poison recovery. Remote search is advisory and always requires selection, never promises typo completeness. Seed results remain useful during upstream failure, with reviewed provenance. No photos, notes or employee identifiers leave Vakhta.

Details use `wbgetentities` and bounded direct-subclass search via `action=query&list=search&srsearch=haswbstatement:P279=QID`. This avoids mandatory SPARQL dependency. Hydrate at most 40 subtype entries; return an explicit limited coverage marker when more exist or lookup fails. Curated common meanings use reviewed subtype names to avoid known ontology noise (sporting ball versus hamster enclosure). Show provenance and coverage; never describe a finite returned list as exhaustive. If an English name is missing, require manual correction instead of inventing it.

### Panel interaction and data flow

Compose a dictionary picker from existing Command primitives within the current feature. Search input has localized labels, correction/meaning suggestions, loading/offline/empty/error feedback and manual English entry. A deliberate choice loads details before adding. Changing input clears selection; Query keys isolate late results. The selected concept shows localized label/definition, canonical English and synonyms/variants. Adding creates/reuses one English catalog object using the existing catalog API, then enriches one draft rule; existing equivalent catalog entries can be reused without global rename. Preserve a selected existing object's ID and note when enriching.

RuleField displays dictionary details and allows removing individual variants. Existing `rulesDraft`/dirty counting carries optional snapshots; comparisons normalize notes and use deterministic snapshot content. Save/reload/conflict/discard paths retain complete snapshots. Read-only summaries show descriptions and included variants. Manual input explicitly requests an English name and does not pretend to translate unknown text. New English catalog names can be displayed localized from saved rule metadata within this form.

### Analysis and compatibility

The existing JSONB save/load pipeline retains the optional dictionary object. Analysis admission snapshots it through `InspectionRules`; no external lookup occurs during analysis. The worker uses `dictionary.englishName` as the target when present, includes aliases and chosen variants as descriptive data, explicit excluded variants as per-rule exceptions, and keeps `note` separate. One parent remains one target regardless of subtype count. Bump the prompt version to identify changed semantics; keep old runs readable and follow existing obsolete-pending-run behavior. Legacy rules use their current names and unchanged instructions.

## Project Structure and Allowed Files

- `packages/contracts/src/{photo-object-dictionary,checklist-photo-rules,index}.ts` and focused tests.
- `apps/api/src/photo-inspection/photo-object-dictionary*.ts`, existing controller/module, existing photo-inspection integration tests.
- `apps/admin-web/src/features/checklist-photo-rules/{api,model,ui}/` and focused tests.
- `apps/admin-web/src/shared/lib/search-delay.ts`, existing audience-search caller/test if extracting shared delay.
- `packages/i18n/src/` three catalogs; `apps/worker/src/photo-inspection/gemma.ts`, prompt-version constant and focused tests.
- Existing preview fixture only for deterministic UI evidence, clearly separated from live provider evidence.
- This spec directory, existing product and engineering feature documents.

Root Codex owns all writes and index operations. Preserve unrelated `.claude/launch.json`.

## Lean Review

Proceed with one deliberate meaning selection and automatic editable enrichment. Removes repeated translation/variant typing, avoids one rule per synonym and preserves local exceptions. Do not force a reviewer to browse an encyclopedia or wait for a provider to use manual input. Measure successful meaning selection and manual corrections separately from photo detection recall. Record final review in existing feature memory.

## IMPLEMENT: Ordered Delivery

Contracts → dictionary provider and endpoint → picker/draft integration → immutable AI snapshot integration → focused tests/visual QA → documentation/convergence/review → one coherent master delivery. Task issues are created before implementation and reconciled with evidence afterward. No branches, PRs or worktrees.

## VERIFY and HARDEN

- Contract tests: bounds, English requirement, snapshot preservation, legacy compatibility.
- Provider tests: supported spelling corrections, exact meanings, malformed responses, unavailable/throttled service, cooldown, bounded subtypes, duplicate data and cache behavior.
- Draft/component tests: selection/late response, note preservation, variant exclusion, dirty/revert, English manual path, readonly and keyboard.
- Existing API DB integration: rule snapshot save/load and analysis admission, version conflicts and unchanged authorization.
- Worker unit assertions: English name/aliases/selected variants as data, note separate, one target and legacy compatibility.
- Build changed exported packages; affected typechecks and targeted lint/format. Existing CI supplies full integration coverage.
- Capture and inspect changed desktop/mobile states with existing browser QA/preview; distinguish fixtures from live dictionary and authenticated persistence evidence. Do not invoke AI on production photos.

## REPORT and Documentation

Update current product behavior and the existing feature memory once. Include source comparison/live probes, local checks, screenshot evidence, independent review, convergence counts, GitHub issue links and CI/release/announcement/deployed status. Detection accuracy remains unproven without a separate paired dataset experiment.

## Open Decisions

None blocking. Open-source-only choice is explicit. Unknown or untranslated concepts require manual English entry; exhaustive universal variants and guaranteed model recall are not claimed.
