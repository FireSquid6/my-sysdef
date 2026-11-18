#!/usr/bin/env bash
# Refresh local package hashes without updating inputs or activating anything.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"
exec python3 scripts/regenerate-hashes.py "$@"
