import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "desktop",
    variables: {
      "HOME": "/home/firesquid"
    },
    files: {
      "{HOME}/.config/dunst/dunstrc": "./dotfiles/dunstrc",
      "{HOME}/.config/i3/config": "./dotfiles/i3",
      "{HOME}/.config/picom/picom.conf": "./dotfiles/picom.conf",
      "{HOME}/.config/polybar/config.ini": "./dotfiles/polybar.ini",
      "{HOME}/.config/rofi/config.rasi": "./dotfiles/rofi.rasi",
      "{HOME}/.config/waybar/config.jsonc": "./dotfiles/waybar.jsonc",
      "{HOME}/.config/waybar/style.css": "./dotfiles/waybar.css",
      "{HOME}/.config/fuzzel/fuzzel.ini": "./dotfiles/fuzzel.ini",
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
        "hyprpicker",
        "hyprpaper",
        "hyprshot",
        "waybar",
        "fuzzel",
        "dunst",
        "rofi",
        "wofi",
        "xdg-desktop-portal-hyprland",
        "sddm",
      ],
    }
  }
}

export default m;
