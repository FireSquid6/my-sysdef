#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/.." && pwd)"
instance="${SYSDEF_AGS_INSTANCE:-sysdef}"
: "${XDG_RUNTIME_DIR:?Run reload-desktop.sh inside the desktop session}"
: "${HYPRLAND_INSTANCE_SIGNATURE:?Run reload-desktop.sh inside Hyprland}"
: "${WAYLAND_DISPLAY:?Run reload-desktop.sh inside Wayland}"
for tool in hyprctl ags bun gjs flock setsid pamixer nmcli timeout grep; do
  command -v "$tool" >/dev/null || { printf 'reload-desktop.sh requires missing command: %s\n' "$tool" >&2; exit 1; }
done

# Config reload also invokes ags/start.sh. Hold its startup lock while stopping
# the old instance, so that automatic startup cannot race with shutdown.
umask 077
exec 8>"$XDG_RUNTIME_DIR/sysdef-ags-start.lock"
flock 8
printf 'Reloading Hyprland…\n'
hyprctl reload
instances="$(timeout 5 ags list)"
if grep -Fxq -- "$instance" <<<"$instances"; then
  printf 'Restarting AGS instance %s…\n' "$instance"
  timeout 5 ags quit --instance "$instance"
  stopped=false
  for ((i=0; i<50; i++)); do
    instances="$(timeout 5 ags list)"
    if ! grep -Fxq -- "$instance" <<<"$instances"; then stopped=true; break; fi
    sleep 0.1
  done
  if [[ "$stopped" != true ]]; then
    printf 'AGS instance %s did not exit; refusing to report a successful restart.\n' "$instance" >&2
    exit 1
  fi
fi
# Release before calling the shared helper, which acquires this same lock and
# verifies startup with ping. Any config-triggered startup uses that lock too.
flock -u 8
exec 8>&-
bash "$root/ags/start.sh"
printf 'Hyprland reloaded; AGS instance %s is ready.\n' "$instance"
