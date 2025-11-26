#!/usr/bin/env bash


cd "$(dirname "$0")" || exit
MENU="$1"


if [[ "$MENU" == "powermenu" ]]; then
  ./powermenu.ts
  exit 0
fi


if [[ "$MENU" == "open-project" ]]; then
  ./open-project.ts
  exit 0
fi

notify-send "Could not find menu $MENU"
