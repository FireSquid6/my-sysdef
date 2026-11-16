#!/usr/bin/env bash
set -euo pipefail

# Session-local, explicit screen-off mode; never terminate the compositor.
case "${1:-toggle}" in
  toggle|resume) action=${1:-toggle} ;;
  *) echo 'Usage: monitor-power.sh [toggle|resume]' >&2; exit 2 ;;
esac
: "${XDG_RUNTIME_DIR:?}" "${HYPRLAND_INSTANCE_SIGNATURE:?}"
session=${HYPRLAND_INSTANCE_SIGNATURE//[^a-zA-Z0-9_-]/_}
state="$XDG_RUNTIME_DIR/sysdef-monitor-power-$session"
umask 077
exec 9>"$state.lock"
flock 9
uid=$(id -u)
idle_running() { pgrep -u "$uid" -x hypridle >/dev/null; }
restore_idle() {
  if [[ "$1" == restart ]] && ! idle_running; then
    # The daemon must not inherit the controller lock or its IPC pipes.
    hypridle </dev/null >>"$XDG_RUNTIME_DIR/sysdef-hypridle.log" 2>&1 9>&- &
  fi
}

if [[ "$action" == resume ]]; then
  # Serialize with toggles, including callbacks already queued at shutdown.
  if [[ ! -f "$state" ]]; then
    hyprctl dispatch 'hl.dsp.dpms({ action = "enable" })'
  fi
elif [[ -f "$state" ]]; then
  previous=$(<"$state")
  hyprctl dispatch 'hl.dsp.dpms({ action = "enable" })'
  rm -- "$state"
  restore_idle "$previous"
else
  previous=stopped
  if idle_running; then previous=restart; fi
  printf '%s\n' "$previous" >"$state"
  if [[ "$previous" == restart ]]; then
    pkill -TERM -u "$uid" -x hypridle || true
    for ((i=0; i<100; i++)); do
      idle_running || break
      sleep 0.02
    done
    if idle_running; then
      rm -- "$state"
      echo 'hypridle did not stop; leaving screens on' >&2
      exit 1
    fi
  fi
  if ! hyprctl dispatch 'hl.dsp.dpms({ action = "disable" })'; then
    rm -- "$state"
    restore_idle "$previous"
    exit 1
  fi
fi
