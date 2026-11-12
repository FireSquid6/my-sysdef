#!/usr/bin/env bash
# Compatibility for older external shortcuts; all UI now belongs to AGS.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
case "${1:-}" in
  powermenu) menu=power ;;
  open-project) menu=projects ;;
  *) printf 'Unknown menu: %s\n' "${1:-}" >&2; exit 2 ;;
esac
exec bash "$root/ags/control.sh" "$menu"
