#!/usr/bin/env bash

if tmux has-session -t home 2>/dev/null; then
  echo "already has a home session"
  exit 0
fi

tmux new-session -d -t home
tmux rename-window -t home:1 htop
tmux send-keys -t home:htop htop Enter

tmux new-window -t home -n scratchpad
tmux new-window -t home -n source
tmux new-window -t home -n notes -c ~/notes
tmux new-window -t home -n notes-terminal -c ~/notes

tmux select-window -t home:notes

tmux new-session -d -t local-sysdef -c "$SYSTEM_CONFIG_DIR"

tmux rename-window -t local-sysdef:1 editor

tmux new-window -t local-sysdef -n claude -c "$SYSTEM_CONFIG_DIR"
tmux new-window -t local-sysdef -n term3 -c "$SYSTEM_CONFIG_DIR"
tmux new-window -t local-sysdef -n term4 -c "$SYSTEM_CONFIG_DIR"

tmux select-window -t local-sysdef:claude
tmux send-keys -t local-sysdef "claude" Enter

tmux select-window -t local-sysdef:editor
tmux send-keys -t local-sysdef "nvim" Enter

