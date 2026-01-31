#!/usr/bin/env bash

PROJECT=$1
TYPE=$2

if [ -z "$PROJECT" ]; then
  echo "Usage: proj.sh <project> [action]"
  exit 1
fi

# check if the project exists
if [ ! -d ~/source/"$PROJECT" ]; then
  echo "Creating project directory"
  mkdir ~/source/"$PROJECT"
fi

tmux has-session -t "$PROJECT" 2>/dev/null

if [ $? -ne 0 ]; then
  tmux new-session -d -t "$PROJECT" -c ~/source/"$PROJECT"

  tmux rename-window -t "$PROJECT":1 editor

  # Only create claude window if .noclaude file doesn't exist
  if [ ! -f ~/source/"$PROJECT"/.noclaude ]; then
    tmux new-window -t "$PROJECT" -n claude -c ~/source/"$PROJECT"
  fi

  tmux new-window -t "$PROJECT" -n term3 -c ~/source/"$PROJECT"
  tmux new-window -t "$PROJECT" -n term4 -c ~/source/"$PROJECT"


  # Only start claude if .noclaude file doesn't exist
  if [ ! -f ~/source/"$PROJECT"/.noclaude ]; then
    tmux select-window -t "$PROJECT":claude
    tmux send-keys -t "$PROJECT" "claude" Enter
  fi

  tmux select-window -t "$PROJECT":editor
  tmux send-keys -t "$PROJECT" "nvim" Enter
fi


if [[ "$TYPE" == "window" ]]; then
  alacritty --command tmux attach-session -t "$PROJECT" &
fi

if [[ "$TYPE" == "attach" ]]; then
  tmux attach-session-t "$PROJECT"
fi
