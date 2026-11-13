#!/usr/bin/env bash
set -euo pipefail
here="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd)"
case "${1:-all}" in
  ui) ags run "$here/tools/ui-smoke.tsx" --gtk 4 ;;
  services)
    # Avoid sharing the user's accessibility/GVFS sockets with the private test bus.
    SYSDEF_AGS_TEST_BUS=1 GTK_A11Y=none NO_AT_BRIDGE=1 GIO_USE_VFS=local GTK_USE_PORTAL=0 timeout 20 dbus-run-session -- ags run "$here/tools/services-smoke.ts" --gtk 4 ;;
  resources) ags run "$here/tools/resources-smoke.ts" --gtk 4 ;;
  caffeine) timeout 15 ags run "$here/tools/caffeine-smoke.ts" --gtk 4 ;;
  layout) ags run "$here/tools/sidebar-layout-smoke.tsx" --gtk 4 ;;
  all) bash "$here/check.sh" ui; bash "$here/check.sh" services; bash "$here/check.sh" resources ;;
  *) echo 'Usage: check.sh [ui|services|resources|caffeine|layout|all]' >&2; exit 2 ;;
esac
