#!/usr/bin/env bash

# Launch hypridle for screen idle management (lock, DPMS off, etc.)
hypridle &

"$SCRIPTS_DIR"/tmux-startup.sh
hyprctl setcursor Google-DotBlack 24

hyprpaper &
bash "$SCRIPTS_DIR/../ags/start.sh" >>"$XDG_RUNTIME_DIR/sysdef-ags-start.log" 2>&1 &
nm-applet &
trayscale &
