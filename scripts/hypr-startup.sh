#!/usr/bin/env bash

# The compositor owns idle startup; don't also enable hypridle.service.
if ! pgrep -u "$(id -u)" -x hypridle >/dev/null; then
  hypridle &
fi

"$SCRIPTS_DIR"/tmux-startup.sh
hyprctl setcursor GoogleDot-Black 24

# AGS owns wallpaper selection and the Hyprpaper process (power-menu toggle).
bash "$SCRIPTS_DIR/../ags/start.sh" >>"$XDG_RUNTIME_DIR/sysdef-ags-start.log" 2>&1 &
nm-applet &
