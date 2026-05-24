#!/bin/bash
set -euo pipefail

exec "$SCRIPTS_DIR/sandbox.sh" --bind ~/.claude -- claude --dangerously-skip-permissions "$@"
