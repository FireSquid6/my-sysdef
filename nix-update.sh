#!/usr/bin/env bash
# Update this workstation's shared Nix desktop, applications and user tools.
# Optional build flags: ./nix-update.sh --max-jobs 2 --cores 20
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"

case "$(hostname -s)" in
  kotoko) profile=kotoko-apps ;;
  deisslaptop) profile=deisslaptop-apps ;;
  *) echo "No workstation profile for $(hostname -s); review nix/hosts.nix." >&2; exit 1 ;;
esac

nix flake update
nix build --no-link "$@" ".#$profile"
nix profile upgrade "$@" "$profile"

if [[ -d "$HOME/.local/share/applications" ]]; then
  update-desktop-database "$HOME/.local/share/applications"
fi

echo "Nix packages updated. Reopen apps normally to use the new builds."
echo "Services and the compositor keep running their current code until intentionally restarted."
