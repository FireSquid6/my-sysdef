#!/usr/bin/env bash

"$SCRIPTS_DIR"/tmux-startup.sh
hyprctl setcursor Google-DotBlack 24

hyprpaper &
"$SCRIPTS_DIR"/waybar.sh &
nm-applet &
trayscale &
dunst &
