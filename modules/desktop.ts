import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "desktop",
    variables: {
      "HOME": "/home/firesquid"
    },
    files: {
      "{HOME}/.config/i3/config": "./dotfiles/i3",
      "{HOME}/.config/picom/picom.conf": "./dotfiles/picom.conf",
      "{HOME}/.config/polybar/config.ini": "./dotfiles/polybar.ini",
      "{HOME}/.config/swaylock/config": "./dotfiles/swaylock/config",
      "{HOME}/.config/betterlockscreen/betterlockscreenrc": "./dotfiles/betterlockscreenrc"
    },
    directories: {
      "{HOME}/.config/hypr": "./dotfiles/hypr",
      "{HOME}/wallpapers": "./dotfiles/wallpapers",
    },
    packages: {
      "arch-official": [
        "hyprland",
        "hypridle",
        "hyprlock",
        "util-linux",
        "hyprpicker",
        "hyprpaper",
        "hyprshot",
        "bun",
        "libnotify",
        "procps-ng",
        "xdg-desktop-portal-hyprland",
        "sddm",
        "qt6-declarative",
        "qt6-svg",
        "qt6-virtualkeyboard",
        "qt6-multimedia-ffmpeg",
        "qt6-5compat",
        "ttf-jetbrains-mono-nerd",
      ],
      "aur": ["sddm-astronaut-theme"],
    }
  }
}

export default m;
