#!/usr/bin/env bash

ARG=$1


PIPE="$HOME/.pipes/$(pwd)/socket.pipe"
mkdir -p "$(dirname "$PIPE")"


nvim --listen "$PIPE" "$ARG"
