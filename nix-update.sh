#!/usr/bin/env bash
# Update the Nix-managed applications installed on kotoko.
# Optional build flags: ./nix-update.sh --max-jobs 2 --cores 20
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"

nix flake update
nix build --no-link "$@" .#kotoko-apps
nix profile upgrade "$@" kotoko-apps

echo "Nix packages updated. Reopen apps normally to use the new builds."
echo "Services keep running their current code until restarted."
