#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/.." && pwd)"
export SYSDEF_ROOT_DIR="$root"
: "${XDG_RUNTIME_DIR:?Run AGS inside the desktop session}"
: "${HYPRLAND_INSTANCE_SIGNATURE:?Run AGS inside Hyprland}"
: "${WAYLAND_DISPLAY:?Run AGS inside Wayland}"
export GDK_BACKEND=wayland
instance="${SYSDEF_AGS_INSTANCE:-sysdef}"
for tool in ags bun gjs hyprctl flock setsid pamixer nmcli; do
  command -v "$tool" >/dev/null || { printf 'AGS requires missing command: %s\n' "$tool" >&2; exit 1; }
done
exec 9>"$XDG_RUNTIME_DIR/sysdef-ags-start.lock"
flock 9
# All configured controller startup paths pass through this lock, even if AGS
# is already running, so config reload also recovers a stopped controller.
# Ensure policy and its current-session snapshot exist before constructing widgets.
bun "$root/scripts/workspace-manager.ts" daemon >>"$XDG_RUNTIME_DIR/sysdef-workspace-manager.log" 2>&1 9>&- &
ready=false
for ((i=0; i<100; i++)); do
  runtime="$(bun "$root/scripts/workspace-manager.ts" runtime)"
  if [[ -s "$runtime/desktop.json" ]] && bun "$root/scripts/workspace-manager.ts" status >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then printf 'Workspace controller failed to start; inspect %s/sysdef-workspace-manager.log\n' "$XDG_RUNTIME_DIR" >&2; exit 1; fi
if timeout 3 ags request --instance "$instance" ping 2>/dev/null | grep -q '"pong"'; then exit 0; fi
setsid ags run "$root/ags/app.tsx" --gtk 4 >"$XDG_RUNTIME_DIR/sysdef-ags.log" 2>&1 9>&- < /dev/null &
pid=$!
for ((i=0; i<100; i++)); do
  if timeout 3 ags request --instance "$instance" ping 2>/dev/null | grep -q '"pong"'; then exit 0; fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 0.1
done
printf 'AGS failed to start; inspect %s/sysdef-ags.log\n' "$XDG_RUNTIME_DIR" >&2
kill -TERM -- "-$pid" 2>/dev/null || true
exit 1
