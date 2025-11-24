#!/usr/bin/env bash


# get the last part of the file path
dir=$(basename "$(pwd)")
pipe="$HOME/.pipes/$dir/socket.pipe"
mkdir -p "$(dirname "$pipe")"

nvim --listen "$pipe"
