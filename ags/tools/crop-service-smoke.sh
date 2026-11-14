#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
SYSDEF_CROP_TEST=1 XDG_STATE_HOME="$tmp" timeout 15 ags run "$root/ags/tools/crop-service-smoke.ts" --gtk 4
