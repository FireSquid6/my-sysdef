#!/bin/bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: sandbox [OPTIONS] [-- COMMAND...]

Launch a sandboxed shell (or command) with read-write access to the current
directory, read-only system paths, and nothing else.

Options:
  --mem LIMIT        Memory limit (default: 1G)
  --tasks LIMIT      Max processes (default: 100)
  --cpu PERCENT      CPU quota (default: 100%)
  --no-net           Disable network access (enabled by default)
  --ro-bind PATH     Additional read-only bind mount (repeatable)
  --rw-bind PATH     Additional read-write bind mount (repeatable)
  --env KEY=VALUE    Pass an environment variable (repeatable)
  --no-cgroup        Skip systemd-run cgroup wrapper
  -h, --help         Show this help

If no COMMAND is given, starts an interactive bash shell.

Examples:
  sandbox
  sandbox -- claude --dangerously-skip-permissions
  sandbox --no-net -- python main.py
  sandbox --ro-bind /opt/data --env API_URL=http://localhost:8080 -- python main.py
EOF
  exit 0
}

MEM="1G"
TASKS="100"
CPU="100%"
NET=1
NO_CGROUP=0
EXTRA_RO=()
EXTRA_RW=()
EXTRA_ENV=()
CMD=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mem)       MEM="$2"; shift 2 ;;
    --tasks)     TASKS="$2"; shift 2 ;;
    --cpu)       CPU="$2"; shift 2 ;;
    --no-net)    NET=0; shift ;;
    --ro-bind)   EXTRA_RO+=("$2"); shift 2 ;;
    --rw-bind)   EXTRA_RW+=("$2"); shift 2 ;;
    --env)       EXTRA_ENV+=("$2"); shift 2 ;;
    --no-cgroup) NO_CGROUP=1; shift ;;
    -h|--help)   usage ;;
    --)          shift; CMD=("$@"); break ;;
    *)           CMD=("$@"); break ;;
  esac
done

[[ ${#CMD[@]} -eq 0 ]] && CMD=(bash)

SANDBOX_DIR="$(pwd)"

BWRAP_ARGS=(
  --ro-bind /usr /usr
  --ro-bind /bin /bin
  --ro-bind /sbin /sbin
  --ro-bind /etc /etc
  --proc /proc
  --dev /dev
  --tmpfs /tmp
  --bind "$SANDBOX_DIR" "$SANDBOX_DIR"
  --unshare-pid
  --clearenv
  --setenv PATH /usr/bin:/bin:/usr/local/bin
  --setenv HOME "$SANDBOX_DIR"
  --setenv TMPDIR /tmp
  --setenv TERM "${TERM:-xterm}"
  --die-with-parent
  --chdir "$SANDBOX_DIR"
)

[[ -d /lib ]]   && BWRAP_ARGS+=(--ro-bind /lib /lib)
[[ -d /lib64 ]] && BWRAP_ARGS+=(--ro-bind /lib64 /lib64)

[[ $NET -eq 0 ]] && BWRAP_ARGS+=(--unshare-net)

for p in "${EXTRA_RO[@]}"; do BWRAP_ARGS+=(--ro-bind "$p" "$p"); done
for p in "${EXTRA_RW[@]}"; do BWRAP_ARGS+=(--bind "$p" "$p"); done
for e in "${EXTRA_ENV[@]}"; do BWRAP_ARGS+=(--setenv "${e%%=*}" "${e#*=}"); done

if [[ $NO_CGROUP -eq 1 ]]; then
  exec bwrap "${BWRAP_ARGS[@]}" -- "${CMD[@]}"
else
  exec systemd-run --user --scope -q \
    -p MemoryMax="$MEM" \
    -p TasksMax="$TASKS" \
    -p CPUQuota="$CPU" \
    -- \
  bwrap "${BWRAP_ARGS[@]}" -- "${CMD[@]}"
fi
