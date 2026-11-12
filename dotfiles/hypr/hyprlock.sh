#!/usr/bin/env bash
set -euo pipefail
umask 077
# Keep the lock for the locker's entire lifetime; concurrent requests are harmless.
# XDG_RUNTIME_DIR is private to this login user and never stored in the repository.
exec flock --nonblock --conflict-exit-code 0 \
  "${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is required}/sysdef-hyprlock.lock" \
  hyprlock --grace 0 --no-fade-in
