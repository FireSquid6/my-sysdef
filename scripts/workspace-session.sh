#!/usr/bin/env bash
set -euo pipefail
scripts="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# The controller is started on every config load; login startup waits for readiness.
for attempt in {1..100}; do
  if bun "$scripts/workspace-manager.ts" status >/dev/null 2>&1; then
    exec bun "$scripts/workspace-manager.ts" startup
  fi
  sleep 0.1
done
notify-send -u critical 'Workspace startup' 'Workspace controller did not become ready. Check its log in $XDG_RUNTIME_DIR/sysdef-workspace-manager.log.'
exit 1
