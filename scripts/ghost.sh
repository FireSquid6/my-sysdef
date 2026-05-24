#!/usr/bin/env bash

# Ghost mode: turn off monitor, RGB, and keyboard lighting.
# Exits and restores on any keypress.

RGB_BACKUP=/tmp/openrgb-ghost-backup.orp

enter_ghost() {
  echo "Entering ghost mode..."
  # openrgb --noautoconnect --save-profile "$RGB_BACKUP"
  kontroll set-rgb-all -c "#000000"
  # GPU (0) and motherboard (1) support Off mode; NZXT strips (2) do not
  # openrgb --noautoconnect -d 0 -m Off
  # openrgb --noautoconnect -d 1 -m Off
  # openrgb --noautoconnect -d 2 -c 000000
  hyprctl dispatch dpms off
}

exit_ghost() {
  echo "Exiting ghost mode..."
  hyprctl dispatch dpms on
  kontroll set-rgb-all -c "#FFFFFF"
  # if [[ -f "$RGB_BACKUP" ]]; then
  #   openrgb --noautoconnect -p "$RGB_BACKUP"
  #   rm -f "$RGB_BACKUP"
  # fi
}

trap exit_ghost EXIT

enter_ghost

# Wait for any keypress
read -r -s -n 1
