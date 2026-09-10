#!/usr/bin/env bash
# Draft Codex Cloud setup/maintenance entry point. No production services or secrets are used.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 22 || minor < 12) {
  console.error("Select Node 22.12+ (major 22) in the environment before setup.");
  process.exit(1);
}
'

pinned_pnpm="$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')"
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare "pnpm@$pinned_pnpm" --activate
  else
    # Setup network and permission to install environment tools are required.
    npm install --global "pnpm@$pinned_pnpm"
  fi
fi
if [[ "$(pnpm --version)" != "$pinned_pnpm" ]]; then
  echo "Expected pnpm $pinned_pnpm; configure the environment toolchain and rerun." >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm build

# Opt in only when the Cloud image exposes a working Docker-compatible daemon.
# This preloads the current suite's images for an agent phase without internet access.
if [[ "${VAKHTA_SETUP_CONTAINERS:-0}" == "1" ]]; then
  command -v docker >/dev/null 2>&1 || { echo 'Docker CLI is required.' >&2; exit 1; }
  docker info >/dev/null
  docker pull postgres:16-alpine
  docker pull redis:7-alpine
  docker pull testcontainers/ryuk:0.14.0
else
  echo 'Container preloading skipped. Full API/worker tests still require Docker and cached images.'
fi

echo 'Setup complete. Run pnpm check; use turbo --force only when fresh test execution is required.'
