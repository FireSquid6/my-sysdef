#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/.." && pwd)"
instance="${SYSDEF_AGS_INSTANCE:-sysdef}"
action="${1:-launcher}"
case "$action" in
  launcher|projects|power|sidebar|monitors|windows|calendar|network|notifications) command=toggle ;;
  close|status|reload-css|ping) command="$action"; action="" ;;
  *) printf 'Unknown AGS menu: %s\n' "$action" >&2; exit 2 ;;
esac
bash "$root/ags/start.sh"
exec ags request --instance "$instance" "$command" ${action:+"$action"}
