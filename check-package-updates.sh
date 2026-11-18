#!/usr/bin/env bash
# Report custom package updates without modifying the checkout.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"
exec python3 scripts/check-package-updates.py "$@"
