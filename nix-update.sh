#!/usr/bin/env bash
# Update this host's Nix applications and user configuration.
# Optional build flags: ./nix-update.sh --max-jobs 2 --cores 20
# Apply local fixes using existing pinned inputs: ./nix-update.sh --no-refresh
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"

configuration=
case "$(hostname -s)" in
  kotoko) profile=kotoko-apps ;;
  deisslaptop) profile=deisslaptop-apps ;;
  minibox-one) configuration=firesquid@minibox-one ;;
  *) echo "No profile for $(hostname -s); review nix/hosts.nix." >&2; exit 1 ;;
esac

if [[ ${1:-} == --no-refresh ]]; then
  shift
else
  nix flake update
fi
if [[ -n "$configuration" ]]; then
  nix build --no-link "$@" ".#homeConfigurations.\"$configuration\".activationPackage"
  nix run "$@" .#home-manager -- switch --flake ".#$configuration" "$@"
else
  nix build --no-link "$@" ".#$profile"
  nix profile upgrade "$@" "$profile"
fi

if [[ -d "$HOME/.local/share/applications" ]] && command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications"
fi

echo "Nix update complete. Reopen apps normally to use the new builds."
echo "Services and the compositor keep running their current code until intentionally restarted."
