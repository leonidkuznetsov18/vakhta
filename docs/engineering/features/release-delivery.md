# Feature: source-bound release versions

## Problem and outcome

On 2026-09-10, GitHub emitted two push workflows for source `f9a437c`. The first published v0.70.9
on its semantic-release child commit. The second checked out the original source. The old unpublished
fallback, `git describe --tags --abbrev=0`, could only find the previous ancestor release v0.70.8.
The duplicate was canceled before release/Pages; no displayed-version regression was observed.
The duplicate dispatch cause was not established. Railway subsequently deployed successfully with
its existing CI gate enabled; no gate settings were changed.

## Design and reuse

Reuse Git metadata, the configured semantic-release tag/message format and the existing Node ESM
release-script convention. No package dependency, deployment destination or announcement path changes.
`scripts/release/resolve-source-version.mjs` takes an explicit full source SHA. It selects a stable
tag on that commit, otherwise a tagged single-parent child whose subject exactly matches the
configured semantic-release message, otherwise the nearest stable ancestor tag. A valid untagged
history returns 0.0.0; invalid source/repository operations fail the step.

Annotated and lightweight tags are both supported. Unrelated children, merge commits and later
descendant releases cannot masquerade as the source release. Full tag history remains a requirement;
the workflow already checks out full history and semantic-release fetches tags. This resolves the
version of the requested source; it does not change which source an operator chooses to redeploy.

The helper is used only in the unpublished fallback. Newly published versions still come from
semantic-release, and the existing published flag still controls the Telegram announcement.

Sources: [Git describe](https://git-scm.com/docs/git-describe) and
[Git reference enumeration](https://git-scm.com/docs/git-for-each-ref), consulted 2026-09-10.

## Verification

- The original fallback failed three of four initial real-Git regressions, including the child-tag
  rerun case. The replacement passed all four.
- Six final temporary-repository tests passed: rerun with later/unrelated releases, direct/ancestor
  resolution, prerelease exclusion, no stable release, invalid source, selected lightweight tags
  and rejection of a tagged merge disguised as a release child.
- Tests create synthetic Git repositories outside the checkout and remove them on completion.
  They do not create a project branch/worktree or change production history.
- Independent review approved the helper, workflow, test wiring and documentation with no blockers;
  the requested explicit lightweight-tag coverage was added.
- Integrated `pnpm build` passed eight tasks (API fresh, seven cached). `pnpm check` passed:
  six release regressions executed fresh, the 483 application/package tests were cache evidence,
  and typecheck, lint and formatting passed. `pnpm test:release` runs before Turbo in `pnpm test`.
- Against Vakhta's actual Git history, source `f9a437c` resolved to 0.70.9 after its child release
  tag was fetched.
- CI `34483329441` succeeded at `3824f13` with resolver change `1681a76`. The release step reported
  no relevant changes and published no release; the Pages build used `VITE_APP_VERSION: 0.70.10`.
  Announcement was correctly skipped. API and worker images were unchanged at `e17b431`. This verifies
  the deployed no-release fallback; the release-child rerun branch is covered by real-Git tests and
  the source-history probe, not a claim that a production rerun was performed.

## Lean recommendation

Proceed. A reliable displayed version reduces diagnosis and rechecking when a delivery is retried.
Keep the existing release flow and employee experience. No claim of measured production-time savings
is made. The regression criterion is that the same source resolves to the same release despite later
tags; observe the actual subsequent CI result before calling the deployment verified.

## 2026-09-10 — Release every successful master delivery

Owner decision: each new successful master push must publish a version, including maintenance-only
changes. The prior configuration explicitly suppressed docs/CI/chore/test/style, and custom type
rules could hide breaking-change defaults. The actual commit-analyzer now selects explicit breaking
major, feat minor, and a header fallback patch; the highest matching rule wins. Maintenance and build
entries are visible in release notes. Conventional Commits remain required for meaningful changelogs.
The tagged metadata commit remains `[skip ci]`; no new commits on rerun means no new version.

The existing check → version/tag/GitHub release/changelog → images/Pages and Telegram announcement
path is retained. Failed checks still block publishing. No manual release, token change or duplicate
Telegram message is introduced. Existing source-bound version recovery remains covered.

Verification: the installed analyzer and notes generator cover every supported type, unstructured
fallback, breaking `!`/footer precedence, mixed deliveries, no commits and maintenance note visibility.
The six existing Git-history resolver regressions are retained. Before this policy change, CI
34501472459 completed successfully and published v0.71.1; previous failed/canceled runs were separate
reasons a release did not appear. Live verification of this policy is recorded after its next CI run.

Source: [commit-analyzer release rules](https://github.com/semantic-release/commit-analyzer#releaserules).
Lean: Proceed. Predictable versioning reduces manual release diagnosis without adding worker actions.
