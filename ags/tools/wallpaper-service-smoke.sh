#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/state"
printf '%s\n' '#!/usr/bin/env bash' \
  'if [[ "${SYSDEF_WALLPAPER_FAIL:-}" == 1 ]]; then exit 1; fi' \
  'exec -a hyprpaper /usr/bin/sleep 60' > "$tmp/bin/hyprpaper"
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "smoke: /tmp/wallpaper.png\\n"' > "$tmp/bin/hyprctl"
chmod +x "$tmp/bin/hyprpaper" "$tmp/bin/hyprctl"
SYSDEF_WALLPAPER_TEST=1 XDG_STATE_HOME="$tmp/state" \
  HYPRLAND_INSTANCE_SIGNATURE="wallpaper-test-$$" WAYLAND_DISPLAY="wallpaper-test-$$" \
  PATH="$tmp/bin:$PATH" timeout 20 ags run "$root/ags/tools/wallpaper-service-smoke.ts" --gtk 4
