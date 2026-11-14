#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
instance="sysdef-renderer-test-$$"
cleanup() {
  ags quit -i "$instance-wallpaper" >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
  if [[ -n "${XDG_RUNTIME_DIR:-}" ]]; then rm -rf -- "$XDG_RUNTIME_DIR/sysdef-wallpaper-$instance"; fi
}
trap cleanup EXIT
SYSDEF_WALLPAPER_HEADLESS=1 SYSDEF_ROOT_DIR="$root" SYSDEF_AGS_INSTANCE="$instance" XDG_STATE_HOME="$tmp" timeout 20 ags run "$root/ags/tools/wallpaper-renderer-smoke.ts" --gtk 4
