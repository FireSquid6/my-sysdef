#!/usr/bin/env bash

"$SCRIPTS_DIR"/tmux-startup.sh

hyprpaper &
"$SCRIPTS_DIR"/waybar.sh &
nm-applet &

hyprctl setcursor Google-DotBlack 24

trayscale &
