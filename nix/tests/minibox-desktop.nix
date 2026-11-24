{ pkgs, home }:
let
  dwm = pkgs.lib.findFirst (p: (p.pname or "") == "dwm") null home.home.packages;
  launcher = pkgs.lib.findFirst (p: p.name == "start-minibox-desktop") null home.home.packages;
in
assert dwm != null;
assert home.xsession.enable;
assert home.fonts.fontconfig.enable;
assert home.programs.alacritty.enable;
pkgs.runCommand "minibox-desktop-smoke"
  {
    nativeBuildInputs = [
      pkgs.xorg.xorgserver
      pkgs.xorg.xmessage
      pkgs.xorg.xwininfo
      pkgs.xorg.xprop
      pkgs.xdotool
      home.programs.alacritty.package
    ];
    FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.nerd-fonts.jetbrains-mono ]; };
  }
  ''
    export HOME="$TMPDIR/home" DISPLAY=:99
    mkdir -p "$HOME"
    if ${launcher}/bin/start-minibox-desktop >launcher.log 2>&1; then exit 1; fi
    grep -q 'local Linux TTY' launcher.log
    Xvfb :99 -screen 0 800x600x24 >xvfb.log 2>&1 &
    server=$!
    trap 'kill "$server" "''${wm:-}" "''${client:-}" 2>/dev/null || true' EXIT
    for attempt in $(seq 1 100); do
      if xdotool getdisplaygeometry >/dev/null 2>&1; then break; fi
      sleep 0.1
    done
    ${dwm}/bin/dwm >dwm.log 2>&1 &
    wm=$!
    for attempt in $(seq 1 100); do
      if xprop -root _NET_SUPPORTING_WM_CHECK | grep -q 'window id'; then break; fi
      sleep 0.1
    done
    xprop -root _NET_SUPPORTING_WM_CHECK | grep -q 'window id'
    kill -0 "$wm"
    xmessage -name sysdef-test hello >client.log 2>&1 &
    client=$!
    window=$(timeout 10 xdotool search --sync --name sysdef-test | head -n1)
    xdotool windowactivate --sync "$window"
    xdotool key --clearmodifiers super+ctrl+2
    for attempt in $(seq 1 100); do
      if xwininfo -id "$window" | grep -Eq 'Absolute upper-left X: +-'; then break; fi
      sleep 0.1
    done
    xwininfo -id "$window" | grep -Eq 'Absolute upper-left X: +-'
    xdotool key --clearmodifiers super+2
    for attempt in $(seq 1 100); do
      if xwininfo -id "$window" | grep -Eq 'Absolute upper-left X: +[0-9]'; then break; fi
      sleep 0.1
    done
    xwininfo -id "$window" | grep -Eq 'Absolute upper-left X: +[0-9]'
    xdotool key --clearmodifiers super+shift+3
    sleep 0.2
    xwininfo -id "$window" | grep -Eq 'Absolute upper-left X: +[0-9]'
    xdotool key --clearmodifiers super+2
    sleep 0.2
    xwininfo -id "$window" | grep -Eq 'Absolute upper-left X: +-'
    xdotool key --clearmodifiers super+3
    sleep 0.2
    xdotool key --clearmodifiers super+shift+q
    timeout 10 tail --pid="$client" -f /dev/null
    xdotool key --clearmodifiers super+shift+t
    terminal=$(timeout 20 xdotool search --sync --class Alacritty | head -n1)
    xdotool windowactivate --sync "$terminal"
    xdotool key --clearmodifiers super+shift+q
    touch "$out"
  ''
