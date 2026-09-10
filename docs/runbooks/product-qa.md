# Product QA and 1Password

Use the dedicated `dev@vakhta.xyz` account. Verify the exact origin before filling credentials.
The panel uses account authentication; the kiosk uses its own device-pairing flow. Do not assume an
email/password login exists on the kiosk or replace an active production device's pairing.

## 1Password setup

Install the official CLI (`brew install 1password-cli` on this Mac), enable the desktop application's
CLI integration and unlock it using the account owner's authentication. Run `op signin` and
`op whoami` to check access. Unlocking the desktop application alone may not sign in the CLI.
If multiple accounts are configured, use `op account list` to choose the account that contains the
development entry, then `op signin --account <account>`; set `OP_ACCOUNT` in the invoking environment
when a persistent explicit selection is needed. Do not put an account password or session token there.
Use the dedicated development login entry; never substitute another administrator's identity.

For a test process that reads credentials from its environment:

1. Copy `.env.e2e.example` to the ignored `.env.e2e`.
2. Replace the placeholder password URI with the field reference copied from 1Password. Prefer vault
   and item IDs to names. Keep only secret references, never resolved values, in this file.
3. Run `pnpm qa:with-secrets <command> [args...]`. This invokes the official `op run` and makes secrets
   available only to the child process. The command must read `VAKHTA_QA_EMAIL` and `VAKHTA_QA_PASSWORD`.

This launcher provides credentials; it is not a browser E2E test suite. Do not claim visual E2E
coverage from running it. Never print the environment, disable secret masking or include passwords,
QR values, tokens, session storage or authentication state in logs, screenshots, reports or commits.
Use browser 1Password autofill for interactive testing when available. Keep authentication artifacts
in ignored `.auth/`; test output belongs in ignored `test-results/` or `playwright-report/`.

[Official CLI setup](https://developer.1password.com/docs/cli/get-started/),
[desktop integration](https://developer.1password.com/docs/cli/app-integration/),
[secret references and op run](https://developer.1password.com/docs/cli/secrets-environment-variables/).

## Required product verification

For product changes, always inspect authenticated panel and kiosk behavior and the relevant worker
bot journey. Test the changed behavior locally, then inspect the deployed environment separately;
a production screenshot does not demonstrate an undeployed local change.

- Panel: confirm the development identity and role; inspect the changed screen, loading/empty/error
  states, keyboard navigation, narrow mobile layout and long localized text. Check browser errors.
- Kiosk: inspect unpaired/paired status and the intended QA terminal. Use a dedicated QA pairing to
  test QR renewal, expiration, connectivity and scans; avoid capturing QR values in shared artifacts.
  If no isolated QA terminal exists, report pairing/scanning as blocked and request its identifier.
- Telegram: use the configured worker bot (`@vakhta_worker_bot`, verify current configuration) and an
  approved development Telegram identity. Inspect actual text, button labels, keyboard size and the
  next action on mobile. Exercise linking, help, retries and the changed shift flow in isolated test
  data. Unit tests of handlers do not verify Telegram appearance. Never impersonate a worker or start,
  close or modify a real employee's shift as a smoke test.
- Verify the existing shift FSM, cleaning checklist and permitted closure paths. Measure confusing
  choices and unnecessary interactions; ensure failures explain how to recover without stress.

Run suitable unit/integration/E2E tests and `pnpm check`. Record date, commit, environment, viewport,
identity/role, steps, actual outcome and limitations in the relevant engineering feature document.
When access, pairing or a Telegram test identity is unavailable, finish independent checks and state
exactly what is blocked. Never report a login screen or API response as authenticated end-to-end proof.
