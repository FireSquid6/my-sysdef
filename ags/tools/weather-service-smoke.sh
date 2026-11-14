#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/bin"
# This test never reaches the network: only the disposable process uses this curl.
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "request\n" >> "$SYSDEF_WEATHER_CALLS"' \
  'printf "%s\n" "$@" > "$SYSDEF_WEATHER_ARGS"' \
  'printf "%s\n" "$$" > "$SYSDEF_WEATHER_PID"' \
  'case "${SYSDEF_WEATHER_MODE:-good}" in' \
  'bad) printf "invalid json" ;;' \
  'slow) exec /usr/bin/sleep 60 ;;' \
  'good) printf '\''{"current_condition":[{"weatherCode":"296","cloudcover":"80","precipMM":"2","windspeedKmph":"24","winddirDegree":"270","temp_C":"12"}],"nearest_area":[{"latitude":"45"}]}'\'' ;;' \
  'esac' > "$tmp/bin/curl"
chmod +x "$tmp/bin/curl"
XDG_STATE_HOME="$tmp/state" SYSDEF_WEATHER_LOCATION="" \
  SYSDEF_WEATHER_CALLS="$tmp/calls" SYSDEF_WEATHER_ARGS="$tmp/args" SYSDEF_WEATHER_PID="$tmp/pid" \
  PATH="$tmp/bin:$PATH" timeout 15 ags run "$root/ags/tools/weather-service-smoke.ts" --gtk 4
