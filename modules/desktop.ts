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
      "{HOME}/.config/hypr": "./dotfiles/hypr"
    },
    packages: {
      "yay": [
        "hyprland",
        "hypridle", 
        "hyprpicker",
        "hyprpaper",
        "hyprshot",
        "waybar",
        "fuzzel",
        "dunst",
        "rofi",
        "wofi",
        "lightdm",
        "lightdm-slick-greeter",
        "xfce4-appfinder",
        "xfce4-battery-plugin",
        "xfce4-datetime-plugin",
        "xfce4-mount-plugin",
        "xfce4-netload-plugin",
        "xfce4-notifyd",
        "xfce4-panel",
        "xfce4-power-manager",
        "xfce4-pulseaudio-plugin",
        "xfce4-screensaver",
        "xfce4-screenshooter",
        "xfce4-session",
        "xfce4-settings",
        "xfce4-taskmanager",
        "xfce4-terminal",
        "xfce4-wavelan-plugin",
        "xfce4-weather-plugin",
        "xfce4-whiskermenu-plugin",
        "xfce4-xkb-plugin",
        "xfconf",
        "xfdesktop",
        "xfwm4",
        "xfwm4-themes",
        "xorg-server",
        "xorg-xdpyinfo",
        "xorg-xinit", 
        "xorg-xinput",
        "xorg-xkill",
        "xorg-xrandr",
        "xterm",
        "xdg-desktop-portal-hyprland",
        "xdg-user-dirs",
        "xdg-user-dirs-gtk",
        "xdg-utils",
      ],
    }
  }
}

export default m;
