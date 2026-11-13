#!/usr/bin/env bash
set -euo pipefail

exec "$SCRIPTS_DIR/sandbox.sh" --bind ~/.copilot -- copilot "$@"
