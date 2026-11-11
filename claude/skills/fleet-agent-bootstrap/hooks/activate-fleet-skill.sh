#!/usr/bin/env bash
set -u
command -v fleet >/dev/null 2>&1 || exit 0
workspace="$(fleet agent-mcp --identify 2>/dev/null)" || exit 0
workspace="${workspace%$'\r'}"
workspace="${workspace%$'\n'}"
[[ "$workspace" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 0
cat <<EOF
MANDATORY: You are an agent working in a fleet workspace (${workspace}). Your first action MUST be to use the skill tool to activate the fleet-agent skill. Do not inspect files, run commands, plan, answer the user, or take any other action before activating it. After activation, follow every fleet-agent instruction for the entire session.
EOF
exit 0
