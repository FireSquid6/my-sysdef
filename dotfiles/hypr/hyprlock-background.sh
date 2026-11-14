#!/usr/bin/env bash
# Cheap path lookup only: rendering never delays Hyprlock or touches its PAM UI.
set -euo pipefail
state="${XDG_STATE_HOME:-$HOME/.local/state}/sysdef/wallpaper"
instance="${SYSDEF_AGS_INSTANCE:-sysdef}"
mode=animated
if [[ -f "$state" ]]; then IFS= read -r mode < "$state" || true; fi
if [[ "$mode" == animated && "$instance" =~ ^[a-zA-Z0-9_-]+$ && -n "${XDG_RUNTIME_DIR:-}" ]]; then
  frame="$XDG_RUNTIME_DIR/sysdef-wallpaper-$instance/frame.png"
  if [[ -r "$frame" ]]; then
    # A crashed/disabled renderer must not leave an old picture looking live.
    modified="$(stat -c %Y -- "$frame" 2>/dev/null || printf 0)"
    if [[ "$modified" =~ ^[0-9]+$ ]]; then
      now="$(date +%s)"
      if (( now >= modified && now - modified < 10 )); then printf '%s\n' "$frame"; exit 0; fi
    fi
  fi
fi
# Preserve the original solid Tokyo Night background when animation is off.
# Never capture the desktop. If the static file is unavailable, an empty path
# leaves Hyprlock's opaque Tokyo Night base in place.
fallback="${XDG_CONFIG_HOME:-$HOME/.config}/hypr/lock-background.png"
if [[ -r "$fallback" ]]; then printf '%s\n' "$fallback"; else printf '\n'; fi
