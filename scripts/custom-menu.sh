#!/usr/bin/env bash

NAME=$1
if [ -z "$NAME" ]; then
    echo "Usage: $0 <name>"
    exit 1
fi

rofi -show script -modes "script:$SYSTEM_CONFIG_DIR/rofi-menus/$1.ts"
