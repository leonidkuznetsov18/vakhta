# Compact profile

## Owner request and specification — 2026-09-12

The profile used a full-width two-column grid. A single theme selector occupied a card as tall as
the identity form; enabled two-factor authentication occupied another mostly empty card. The owner
requested a compact, more usable profile while retaining its existing functions.

Use one reading panel, at most 768 px wide, with identity, appearance and security separated by simple
dividers. Keep save next to the name, reduce the avatar to 64 px, expose its upload affordance and
make photo removal available without hover. Theme is one labeled row. Security status uses both text
and an icon; its existing password → QR/backup codes → verification flow expands only when needed.

Preserve authentication endpoints, mutation semantics, roles/scopes, errors and all recovery codes.
Keep the incumbent auth component boundary; a layout refinement does not justify migrating the auth
architecture. Reuse Section, FormField, NativeSelect, IconButton and existing theme state.

Acceptance: unchanged names cannot save; changed names still save and surface errors; theme selection
works; photo removal remains named and reachable; enabled 2FA has no empty form; setup and verification
retain their inputs, QR and backup codes. At desktop and 320/390 px mobile widths, content wraps without
horizontal overflow and controls remain usable. Do not change account security in production for QA.

Lean recommendation: **Simplify**. Reduce unused containers and distance between a setting and its
control. No new operator input or configuration; productivity gains are not claimed without user tests.

## Verification

- Four focused tests cover enabled security and theme selection, name-save failure/retry, named photo
  removal, and the complete existing 2FA setup/invalid-code retry with QR and backup codes preserved.
- Frontend typecheck, scoped ESLint, formatting and production build passed. Existing upstream Zod
  comment and bundle-size warnings remain.
- Local preview screenshots inspected at 1440×900, 390×844 and 320×568. The enabled profile measures
  768×270 px on desktop and 358×334 px at 390 px; no horizontal document overflow. Mobile email and
  role labels remain available to assistive technology while their values use the full width.
- Theme changed through the actual select and applied `.dark`; dark mobile rendering was inspected,
  then light appearance and the viewport were restored. Save and select remain at least 40 px tall
  on mobile; the upload target is 64×64 px.
- Preview `?profile=setup` exposes the disabled-security/password state without changing an account.
  That form was inspected on desktop and 320 px; the password input uses the available 256 px.
  QR/backup-code verification is covered by component tests with mocked auth, not production requests.

No production security settings, credentials or profile data were changed during QA. Real upload/image
decoding, physical touch and screen-reader certification were not exercised in this layout batch.

Owner follow-up: removed the information icon below the avatar. The named upload control and visible
photo-removal action remain; appearance/security explanations are unchanged.
