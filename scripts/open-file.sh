#!/usr/bin/env bash

PROJECT=$1
FILE=$2
PIPE=""

PIPE="$HOME/.pipes/$PROJECT/socket.pipe"

nvim --server "$PIPE" --remote-send "<CMD>e $FILE<CR>"
