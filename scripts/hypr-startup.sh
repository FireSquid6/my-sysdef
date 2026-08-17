#!/usr/bin/env bash

# Launch hypridle for screen idle management (lock, DPMS off, etc.)
hypridle &

"$SCRIPTS_DIR"/tmux-startup.sh
hyprctl setcursor Google-DotBlack 24

hyprpaper &
"$SCRIPTS_DIR"/waybar.sh &
nm-applet &
trayscale &
dunst &
