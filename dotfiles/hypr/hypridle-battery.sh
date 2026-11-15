#!/usr/bin/env bash
# Gate automatic inactivity actions, NOT manual locking or suspend protection.
# Evaluate power at timeout time so plugging/unplugging needs no daemon restart.
set -euo pipefail
case "${1:-}" in
  lock|screens-off) ;;
  *) echo 'Usage: hypridle-battery.sh lock|screens-off' >&2; exit 2 ;;
esac

power_dir=${SYSDEF_POWER_SUPPLY_DIR:-/sys/class/power_supply}
on_battery=false
for supply in "$power_dir"/*; do
  [[ -r $supply/type ]] || continue
  type=$(<"$supply/type")
  # Ignore mouse/headset batteries; they do not power the computer.
  if [[ -r $supply/scope && $(<"$supply/scope") == Device ]]; then continue; fi
  if [[ $type == Battery ]]; then
    if [[ -r $supply/present && $(<"$supply/present") == 0 ]]; then continue; fi
    if [[ -r $supply/status && $(<"$supply/status") == Discharging ]]; then
      on_battery=true
    fi
  elif [[ -r $supply/online && $(<"$supply/online") == 1 ]]; then
    # External power wins even if battery status has not updated yet.
    exit 0
  fi
done
# Desktops, charging/full batteries, and unknown state do not idle-lock/blank.
$on_battery || exit 0
case "$1" in
  lock) exec loginctl lock-session ;;
  screens-off) exec hyprctl dispatch 'hl.dsp.dpms({ action = "disable" })' ;;
esac
