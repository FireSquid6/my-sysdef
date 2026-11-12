#!/usr/bin/env bash
set -euo pipefail
scripts="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${XDG_RUNTIME_DIR:?Run Waybar inside the desktop session}"
: "${HYPRLAND_INSTANCE_SIGNATURE:?Run Waybar inside Hyprland}"
config="$(bun "$scripts/workspace-manager.ts" runtime)/waybar.json"
for attempt in {1..100}; do
  if bun "$scripts/workspace-manager.ts" status >/dev/null 2>&1 && [[ -f "$config" ]]; then
    # A separate config per output provides individually clickable, mode-aware workspace buttons.
    pkill -u "$(id -u)" -x waybar || true
    exec waybar --config "$config" --style "$scripts/../dotfiles/waybar.css"
  fi
  sleep 0.1
done
notify-send -u critical 'Waybar startup' 'Workspace controller did not become ready; refusing to show stale workspace assignments.'
exit 1
