# Research: Photo object dictionary

**Feature:** 007-photo-object-dictionary

**Research date:** 2026-09-14

**Decision authority:** The owner requests open sources without subscriptions, multilingual input, automatic refinements and variants, and English canonical names for newly created objects.

**Related artifacts:** [Specification](spec.md), [implementation plan](plan.md)

## Decision and evidence boundary

Use Wikidata as the external dictionary, supplemented by a small reviewed vocabulary of common physical objects. The reviewed vocabulary provides reliable multilingual entry points and common spelling corrections; Wikidata broadens coverage. Store the selected English meaning and accepted enrichment as a snapshot of the checklist rule. Keep operational exceptions separate from dictionary information.

This recommendation follows primary documentation and live, read-only endpoint probes. It does not establish improved photo recognition. A dictionary identifies concepts and names; it is neither an inventory of the vision model's capabilities nor a guarantee that an object will be visible, recognized or correctly localized.

The owner's phrase “all variations” must mean relevant available variations within declared bounds. No evaluated source offers a complete, unambiguous inventory of every physical variation in Ukrainian, Russian and English. Automatically copying every graph neighbor would increase semantic errors. The interface should automatically prepare a useful draft, explain coverage, and let the reviewer remove unsuitable suggestions before the ordinary save action.

## Existing integration and the problem to solve

Repository recon recorded in the specification identifies the existing Administration checklist photo-rule editor, global `photo_objects` catalog, optional 300-character operational note, versioned rule saves and immutable analysis snapshots. The worker currently sends the object's name and note to the existing analyzer. The new feature must connect dictionary selection to this entire path, rather than only improve the visible input.

Three distinct tasks are involved: recognizing what the reviewer intended to type, choosing the correct meaning, and describing the selected category to the analyzer. Spelling normalization can help the first task. A stable concept identifier and explanatory label help the second. Reviewed English names, synonyms and selected subtypes support the third. They should not be represented as one uncontrolled string.

The operational note remains prescriptive: for example, a placement restriction or an allowed exception. Dictionary information is descriptive. Replacing a hand-written exception with an encyclopedia description would lose intent even if the substituted text were linguistically correct.

## Candidate comparison

| Candidate                              | Useful capability                                                                                    | Limitation for this feature                                                                                   | Decision                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Wikidata Action API and subclass graph | Multilingual labels and aliases, stable identifiers, retrievable entity data and typed relationships | General encyclopedia search; uneven language coverage; ambiguous aliases and noisy subtype trees              | Primary external source with reviewed seeds and bounded results  |
| Open English WordNet                   | Downloadable English synsets and lexical relationships distinguish word senses                       | Requires local import/indexing and multilingual concept mapping; not a Ukrainian/Russian autocomplete service | Potential later enrichment, unnecessary first-release dependency |
| ConceptNet                             | Multilingual terms, synonym and semantic relationship APIs                                           | Association is not equivalence; `IsA` includes instances; public endpoints failed the live probes             | Exclude from the initial runtime path                            |
| Datamuse                               | Hosted autocomplete, spelling assistance and English lexical relations                               | English-only relationship queries; observed mixing of meanings; hosted-service policy dependency              | Exclude as the primary dictionary                                |
| Open Images                            | Downloadable hierarchy aligned with visual annotation categories                                     | Finite label inventory; does not supply multilingual spelling correction or universal variants                | Reference for future evaluation or catalog curation              |

Wikibase provides label/alias search and retrieval of structured entities.[1] Open English WordNet offers versioned downloadable resources; a local index would need no request quota, but would add a separate data pipeline.[7] ConceptNet has useful typed edges, although its `IsA` relation explicitly includes both subtypes and specific instances.[9] Datamuse documents autocomplete and lexical constraints, with those relations available only for English.[11] Open Images documents 600 boxable classes and their downloadable hierarchy.[12]

## Live endpoint probes

Probes used ordinary HTTPS requests with certificate verification and an identifying research User-Agent. Calls were sequential and limited in number. Reported durations are individual observations from this development environment, not latency benchmarks or service guarantees. An initial Python request failed because its local certificate trust configuration was incomplete; curl succeeded without disabling verification. That local failure is not evidence of a provider outage.

| Request or input                                           | Observed result                                                             | Implication                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Wikidata `wbsearchentities`, `language=uk`, `мяч`, limit 5 | Places and people, including Мячин; no sporting ball                        | Missing apostrophe requires local handling; first result is unsafe to accept automatically |
| Same API, `м’яч` and `м'яч`                                | Correct ball concept `Q18545`; other results include a football rule        | Apostrophe forms work, but physical meaning still needs selection                          |
| Same API, `мяяч`                                           | Empty results                                                               | Arbitrary typo correction is not provided reliably                                         |
| Same API, English `ball`, limit 8                          | Surname, anatomy, poetry and locations; sporting ball absent                | Even an exact English word is not a dependable raw top result                              |
| `wbgetentities`, `Q18545`, three languages                 | English `ball`, Ukrainian `м'яч`, Russian `мяч`; no Ukrainian description   | English canonical identity is available; localized descriptions may require fallback       |
| SPARQL direct subclasses of `Q18545`, limit 30             | Success in 1.51 seconds; sporting balls mixed with other meanings           | Hierarchy retrieval works but needs filtering and bounded coverage                         |
| SPARQL subclasses at depth one or two, limit 41            | Success in 1.07 seconds; 41 records, including missing English labels       | A depth limit does not make a list complete or uniformly usable                            |
| Action API search `haswbstatement:P279=Q18545`, limit 40   | Success in 0.75 seconds; 66 total hits and continuation                     | Direct-child retrieval can avoid mandatory SPARQL dependency                               |
| `wbsearchentities` with the same structured-search string  | Returned the parent concept                                                 | Structured search belongs in `query/list=search`, not `wbsearchentities`                   |
| Datamuse `rel_gen=ball`, limit 30                          | Sporting balls mixed with promenade, cotillion, masked ball, clot and bolus | Word-level expansion mixes senses without a concept boundary                               |
| ConceptNet English ball children and Ukrainian ball lookup | Both returned HTTP 502                                                      | This environment did not establish a working runtime dependency                            |

The ball hierarchy included branded equipment, snowball, hamster ball and rubber-band ball. Some entries had the same English label as the parent, while others lacked an English label. The correct sporting category cannot be produced by accepting all returned descendants. The sources below include reproducible probe links.[14–19]

## Verified seed meanings and multilingual ambiguity

The following identifiers and English labels were verified through Wikidata search/entity retrieval. They are suitable starting identities, subject to reviewed product wording.

| Family         | Wikidata identity | Verified English label | Translation or meaning issue                                    |
| -------------- | ----------------- | ---------------------- | --------------------------------------------------------------- |
| Ball           | `Q18545`          | ball                   | Ukrainian apostrophe normalization is needed                    |
| Disposable cup | `Q16639345`       | disposable cup         | Ukrainian label absent in the probe                             |
| Bottle         | `Q80228`          | bottle                 | Available as пляшка / бутылка                                   |
| Bag            | `Q1323314`        | bag                    | Ukrainian label мішок is narrower than many uses of English bag |
| Tool           | `Q39546`          | physical tool          | English alias tool is available; broad aliases need review      |
| Cable          | `Q188447`         | electrical cable       | Does not cover every meaning of mechanical cable                |
| Hose           | `Q176440`         | hose                   | Broad aliases such as tube should not redefine the category     |
| Glove          | `Q169031`         | glove                  | Available as рукавичка / перчатка                               |
| Broom          | `Q172833`         | broom                  | Physical cleaning tool, distinct from plants and surnames       |
| Bucket         | `Q47107`          | bucket                 | Available as відро / ведро                                      |
| Box            | `Q188075`         | box                    | Available as коробка; broader container is a different identity |
| Door           | `Q36794`          | door                   | Available as двері / дверь, with Russian alias двери            |
| Rag            | `Q1567420`        | rag                    | Used textiles cut into pieces as raw material                   |
| Cleaning cloth | `Q1409430`        | floor cleaning cloth   | Specifically cloth used for damp-cleaning floors                |

Ukrainian `ганчірка` and Russian `тряпка` returned both rag and floor-cleaning-cloth meanings. English Wikipedia's “Rag” title resolved to a disambiguation item, so matching an article title is not a safe substitute for selecting the intended concept. Ball's Russian aliases included `шар` and `шарик`, which can broaden the meaning beyond sporting equipment. These are reasons to review seed aliases, not merely collect more of them.

English storage should follow selected meaning: `мяч` becomes `ball`, and `дверь` becomes `door`. Preserve the QID alongside the English name because labels alone can collide or change. Missing English labels must not become raw QIDs or invented translations. Unknown shop-specific terms retain manual entry with an explicitly requested English name. A Latin-character validation rule alone cannot prove that an arbitrary name is English.

## Descriptions, synonyms and subtypes

Wikidata descriptions are short disambiguating phrases. Its guidance explicitly separates descriptions from definitions and advises checking statements when distinguishing concepts.[2] Accordingly, fields called “definition” in the implementation contract should be understood as explanatory dictionary text, not a formal definition or verified visual instruction. User-facing copy should avoid presenting imported descriptions as authoritative appearance criteria.

Maintain separate concepts:

- A localized label helps the reviewer select a meaning.
- An English canonical name identifies the analyzer target.
- A synonym expresses the same selected meaning using another name.
- A subtype describes a narrower class whose members belong to the parent.
- An operational note defines context, placement or exceptions for this checklist.

Wikidata `P279` expresses subclass membership; `P31` represents an instance, and `P361` a part.[3] A hose connector is not a hose merely because it is associated with or part of one. Similarly, an object's common color, material or condition is not automatically another synonym. The initial feature should not synthesize unrestricted combinations of color, size, material and subtype.

The selected parent remains a single rule and a single analyzer target. Listing its accepted variants should not multiply requests or findings into one target per spelling. Any recognition benefit remains a hypothesis until measured on images.

## Licensing and provider operations

Wikidata structured data is available under CC0; surrounding documentation has different licensing.[4] Store entity URLs and retrieval metadata for traceability even where attribution is not required. Open English WordNet requires attribution to both its contributors and the underlying Princeton WordNet resource.[8] ConceptNet exposes edge licenses and requires ShareAlike compliance when reusing the resource as a whole.[10] Open Images annotations use CC BY 4.0; image rights are separate and images are unnecessary for this integration.[12]

Datamuse currently documents up to 100,000 daily requests without a key and announces mandatory API keys from January 1, 2027. It also asks customer-facing applications to contact the operator.[11] Free access should not be confused with an open, self-hostable data pipeline or a stable support commitment.

Wikimedia recommends an informative User-Agent with contact details, serial requests and grouped entity retrieval.[5] WDQS documents a 60-second query deadline, processing quotas, HTTP 429 throttling and Retry-After handling.[6] The first release should use the Action API direct-child query verified above, with fixed origins and bounded responses. This is simpler than making SPARQL a required interactive dependency. Neither approach warrants an availability guarantee.

## Proposed architecture and failure behavior

Keep frontend ownership inside `features/checklist-photo-rules`, backend orchestration in the existing photo-inspection module, and strict public schemas in contracts. Reuse existing catalog creation, rule versions, audit handling and admission snapshots. The planned optional dictionary object in existing rule JSON avoids a catalog-wide rename or new SQL migration.

Search should rank normalized reviewed seeds first, with conservative fuzzy suggestions, then supplement coverage through remote search. Matching is advisory: the reviewer chooses the meaning. Hydrate remote results to obtain real English labels and reject obvious non-object/disambiguation entries. A denylist is a practical filter, not proof that every remaining entity is a valid physical category.

On selection, load bounded details and populate a visible draft. Preserve manually entered notes and existing rule IDs. Use reviewed subtype names for common seeds to prevent known hierarchy noise. For other concepts, hydrate at most 40 direct children as planned, normalize duplicates, exclude the parent and mark limitations. The depth-two probe establishes technical feasibility only; it is not a requirement to traverse two levels in the initial implementation.

Persist source, identity, explanatory text and accepted variants with the rule. Saved and historical snapshots must remain stable when Wikidata changes. Excluding a variant changes the checklist draft; it should not mutate the global dictionary. Existing objects retain IDs and names, while enrichment supplies English meaning within the rule. New dictionary-created catalog records use the canonical English name through existing create/reuse behavior.

TanStack Query should own search/detail requests with input-, locale- and identity-specific keys. An abortable delay avoids requests for abandoned prefixes; late results must never populate a different selection. Server caching and in-flight deduplication are shared independently of any one browser request. Bound cache size, request duration, response size and upstream work. A service cooldown should honor provider throttling without retrying every keystroke.

Distinguish successful empty search, missing localization, partial subtype coverage, provider error and offline state. Reviewed seeds can remain available during external failure, but the interface must show degraded coverage. Manual entry remains possible. Do not convert malformed responses or timeouts into “no matches,” and do not overwrite cached data or unsaved input on failure.

Send only search text or concept identifiers externally. Notes, photos and employee data are unnecessary. Validate external strings and IDs, render text without HTML interpretation, and treat dictionary content as descriptive data in the analyzer prompt. Keep authorization and version-conflict handling identical to existing rule operations.

## Evaluation, acceptance and Lean implications

Separate delivery checks from a future recognition experiment. Delivery tests should demonstrate supported multilingual corrections, deliberate meaning selection, canonical English persistence, variant exclusion, note preservation, legacy compatibility, stale-response isolation and explicit degraded states. Integration tests should establish that admitted analysis snapshots and worker prompts contain the saved English enrichment while retaining one target and the original object ID. Desktop and mobile evidence should cover keyboard selection, bounded long text, loading, errors and editable/read-only behavior.

A later recognition evaluation needs a fixed, reviewed photo set with expected object instances and difficult negatives. Compare the current name/note prompt with the enriched prompt using the same model, settings and photos. Record recall, false positives, localization quality, duplicate findings, abstentions and runtime/cost. Include partially occluded objects, small objects, unusual variants and visually similar allowed objects. Report category-level outcomes; an average gain must not hide regressions in a sensitive category. Do not generate production employee actions or paid analysis runs merely to obtain smoke-test evidence.

Lean value comes from reducing repeated translation and variant typing while preventing correction work later. One deliberate meaning selection followed by automatic editable enrichment is preferable to encyclopedia browsing. Preserve local exceptions and make changes reviewable in the existing save flow. Useful product measures include selection success, manual corrections, time to a valid rule, provider failure frequency and excluded irrelevant variants. These measure configuration quality; they must not be reported as detection accuracy.

## Implementation validation addendum

The implemented adapter was exercised against live Wikidata with Ukrainian `драбина`. Initial
results included physical ladder Q168639 and mathematical ladder graph/Möbius ladder. Requiring a
bounded positive P279 path to physical object Q223557 removed the mathematical matches; the final
probe returned only Q168639. This conservative filter can omit valid objects whose ancestry is too
deep or incomplete. It does not establish that every remaining subtype is operationally relevant.
A reviewer still chooses the meaning and can exclude subtypes. Exclusions are stored explicitly and
sent to AI as per-rule exceptions. The regression suite separately covers malformed hydration recovery,
provider cooldown, local vocabulary, immutable English snapshots and preserved local notes.

## Sources

1. [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API).
2. [Wikidata description guidelines](https://www.wikidata.org/wiki/Help:Description).
3. [Wikidata membership properties](https://www.wikidata.org/wiki/Help:Basic_membership_properties).
4. [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing).
5. [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).
6. [Wikidata Query Service limits](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits).
7. [Open English WordNet repository and releases](https://github.com/globalwordnet/english-wordnet).
8. [Open English WordNet license](https://github.com/globalwordnet/english-wordnet/blob/main/LICENSE.md).
9. [ConceptNet relationship definitions](https://github.com/commonsense/conceptnet5/wiki/Relations).
10. [ConceptNet API, licenses and rate limits](https://github.com/commonsense/conceptnet5/wiki/API).
11. [Datamuse API documentation and service policy](https://www.datamuse.com/api/).
12. [Open Images classes, hierarchy and licenses](https://storage.googleapis.com/openimages/web/factsfigures.html).
13. [Wikibase CirrusSearch structured query syntax](https://www.mediawiki.org/wiki/Help:Extension:WikibaseCirrusSearch).
14. [Probe: Ukrainian ball search](https://www.wikidata.org/w/api.php?action=wbsearchentities&search=%D0%BC%27%D1%8F%D1%87&language=uk&uselang=uk&type=item&limit=5&format=json).
15. [Probe: ball labels and aliases](https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q18545&props=labels%7Cdescriptions%7Caliases&languages=uk%7Cru%7Cen&format=json).
16. [Probe: direct ball subclasses](https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=haswbstatement%3AP279%3DQ18545&srnamespace=0&srlimit=40&format=json).
17. [Probe: Datamuse ball expansion](https://api.datamuse.com/words?rel_gen=ball&max=30).
18. [Probe: ConceptNet English ball subclasses](https://api.conceptnet.io/query?end=%2Fc%2Fen%2Fball&rel=%2Fr%2FIsA&limit=20).
19. [Probe: ConceptNet Ukrainian ball](https://api.conceptnet.io/c/uk/%D0%BC%27%D1%8F%D1%87?limit=5).

All sources were inspected during this research. Provider policies, labels, relationships and responses can change; the observations above describe this session rather than a permanent guarantee.
