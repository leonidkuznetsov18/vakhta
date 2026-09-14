# Feature Specification: Photo object dictionary

**Change**: 007-photo-object-dictionary | **Created**: 2026-09-14 | **Status**: Accepted
**Baseline**: 5c0ac044ea0128335764eea6e57a900ab90d94e7 | **Checkout**: master
**Authority**: Owner requests detailed research, all six Spec Kit stages including GitHub issues and implementation, open sources without subscriptions, and English canonical storage for Ukrainian/Russian input.
**Product document**: [Photo inspection](../../docs/features/photo-inspection.md)
**Engineering memory**: [Photo inspection dataset](../../docs/engineering/features/photo-inspection-dataset.md)

## RECON: Current Behavior

Administration embeds `features/checklist-photo-rules` in checklist details. A reviewer selects global `photo_objects` records or creates a free-text name. Rules contain `objectId` and an optional 300-character `note`. The note expresses appearance, placement and allowed exceptions. It is not a synonym list. The catalog deduplicates spelling families with `photoObjectKey`; that heuristic is not a translation or semantic dictionary.

`ChecklistPhotoRulesService` persists rule JSON with optimistic versions and audit history. `PhotoInspectionService` snapshots resolved rules when admitting a run. `apps/worker/src/photo-inspection/gemma.ts` sends one object per tiled inference request to the existing model. The current prompt includes the name and note only. Historical annotations retain stable object IDs. No external dictionary integration exists.

## SPEC: Outcome and Boundaries

Help a reviewer configure objects that must not appear in a checklist photo with correct names, explicit meanings and useful subtypes. Typing in Ukrainian, Russian or English offers dictionary suggestions. Choosing a meaning populates its localized explanation, English canonical identity, synonyms and available relevant varieties; the reviewer can inspect and remove unsuitable variants before saving. The dictionary explanation and variants are separate from the editable operational note. Existing notes are never overwritten by asynchronous suggestions.

New dictionary-created catalog records store English names. The form displays the localized dictionary name and makes its English equivalent visible. Existing catalog IDs/names and historical records are preserved; applying dictionary enrichment to an existing rule stores its English meaning in that rule's snapshot without globally renaming legacy objects. Dictionary data must reach AI, not merely appear in UI.

Scope is this Administration rule editor, its dictionary API, saved rule snapshots and existing AI prompt integration. No paid subscription, automatic employee decisions, new vision model, model training, operational analysis requests for QA, catalog-wide migration or unrelated UI redesign.

Assumptions: “all variations” means available relevant dictionary subtypes within explicit service/prompt limits, not an exhaustive inventory of physical reality. An open ontology is not a detection capability list. Correcting arbitrary misspellings or translating every shop-specific name cannot be guaranteed. Unknown names retain a manual path with an explicit English name; the system never invents a translation. External services receive only the search term/concept ID, never photos, notes or employee data.

## User Scenarios and Testing

### US1: Find and choose the intended object (Priority: P1)

**Acceptance scenarios**:

- **AC-001**: A reviewer types Ukrainian/Russian/English names, including apostrophe variants of м'яч and door/дверь/двері, and can choose the intended object with a localized name and English equivalent.
- **AC-002**: A supported misspelling offers a correction without silently selecting a meaning or creating a catalog entry. Ambiguous suggestions include an explanation.
- **AC-003**: A new dictionary selection creates/reuses one English catalog object, populates dictionary details and adds one draft rule. It does not create one rule per synonym/subtype.
- **AC-004**: Unknown input, no matches and external failure are distinct states. Manual English entry remains usable and recoverable errors provide retry.

### US2: Review enrichment and preserve intent (Priority: P1)

**Acceptance scenarios**:

- **AC-005**: Selected object details show an automatically filled explanation, aliases and available variants, their source and bounded coverage. A reviewer can exclude variants; exclusions survive save/reload and are passed to AI as explicit exceptions to the broader category.
- **AC-006**: Selecting/enriching a rule preserves the user's operational note, other rules and any existing stable object ID. A late response for an older input cannot replace the current selection.
- **AC-007**: Saving, reverting, removing/re-adding, conflicts and rule limits retain existing behavior. Enrichment counts as one changed rule; fully reverting disables Save.
- **AC-008**: Old rules without enrichment load and save unchanged. Read-only viewers see saved details without editing controls.

### US3: Use English meanings in analysis (Priority: P1)

**Acceptance scenarios**:

- **AC-009**: Saved dictionary enrichment survives server load and immutable analysis snapshots. The worker receives the English canonical name, approved English aliases/variants and the original note as separate data.
- **AC-010**: One category with several variants remains one model target and keeps its original object ID. Historical runs remain readable; future dictionary changes do not rewrite saved rules or runs.
- **AC-011**: English catalog records and localized names remain comprehensible in the affected Administration form. An unknown non-English term cannot be silently stored as an allegedly translated English name.

### Edge Cases

Missing localized labels fall back visibly to English. Missing English labels cannot yield a dictionary-backed canonical object. Duplicate aliases/subtypes are normalized; the parent is not its own subtype. Empty/oversized/malformed responses and provider throttling do not become successful empty results. Search and details have bounded duration and cache size. Switching input during details loading, fast typing, Escape, Enter/IME, keyboard selection, mobile touch and unsaved drafts are covered. No infinite subtype recursion. Limit/truncation/failed subtype lookup cannot claim completeness. Existing maximum 30 rules and 300-character operational notes remain.

## Requirements

### Functional Requirements

- **FR-001**: Offer localized dictionary autocomplete with canonical English names and supported typo/apostrophe matching (AC-001/002).
- **FR-002**: Require deliberate meaning selection; create/reuse one canonical English catalog entry for a new dictionary-backed rule (AC-003/011).
- **FR-003**: Automatically populate structured explanatory data and available subtypes without replacing operational notes; permit subtype exclusions (AC-005/006).
- **FR-004**: Use only open sources without subscriptions and identify source and limits (AC-004/005).
- **FR-005**: Provide cancellation/stale-response isolation, bounded requests, explicit loading/offline/error/empty states and manual recovery (AC-004/006).
- **FR-006**: Preserve authorization, audit/version checks, stable object IDs, legacy rule compatibility and meaningful dirty state (AC-007/008).
- **FR-007**: Persist enrichment and snapshot English meaning plus accepted variants for the existing analyzer (AC-009/010).
- **FR-008**: Support Ukrainian, Russian and English interface copy, accessible keyboard use, bounded text and desktop/mobile layouts (AC-001–008).
- **FR-009**: Demonstrate dictionary functionality separately from model accuracy; do not claim improved detection without paired image evaluation (AC-009/010).

### Key Entities

Existing catalog object and checklist rule retain their identity. A dictionary concept has a stable external identifier, localized labels/explanation, English canonical name and aliases. A dictionary snapshot records source/retrieval metadata and bounded available subtypes, with the reviewer-selected subtype set. Dictionary meaning is descriptive; operational notes and deliberately excluded subtypes carry the reviewer’s exceptions/context.

## Success Criteria

- **SC-001**: The ball and door multilingual journeys produce English stored identities without manual retyping; supported spelling mistakes lead to selectable corrections.
- **SC-002**: A reviewer can inspect auto-filled information and exclude a variant without losing their own note; save/reload preserves the result.
- **SC-003**: Provider failure does not block manual configuration; stale responses never change another draft's meaning.
- **SC-004**: Deterministic tests prove the analyzer receives persisted English enrichment with stable object identity. Improved detection recall remains an evaluation hypothesis.

## Verification Scope

Behavior plus external failure recovery and existing transaction integration: focused contract, dictionary-provider, draft/component, API persistence and worker prompt regressions; affected type/lint/build checks and one independent review. Desktop/mobile screenshots of the changed Administration surface, keyboard and failure scenarios. Read-only deployed dictionary smoke and existing CI/release/announcement verification. Never create production employee actions or billable AI runs as smoke tests. Record evidence and blocked checks in feature memory.
