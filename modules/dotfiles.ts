

import type { ModuleGenerator } from "../sysdef-src/sysdef";



const m: ModuleGenerator = () => {
  return {
    name: "dotfiles",
    variables: {
      "HOME": "/home/firesquid"
    },
    files: {
      "{HOME}/.vimrc": "./dotfiles/vimrc",
      "{HOME}/.bashrc": "./dotfiles/bashrc",
      "{HOME}/.config/betterlockscreen/betterlockscreenrc": "./dotfiles/betterlockscreenrc",
      "{HOME}/.config/dunst/dunstrc": "./dotfiles/dunstrc",
      "{HOME}/.config/i3/config": "./dotfiles/i3",
      "{HOME}/.config/kitty/kitty.conf": "./dotfiles/kitty.conf",
      "{HOME}/.config/lazygit/config.yml": "./dotfiles/lazygit.yml",
      "{HOME}/.config/picom/picom.conf": "./dotfiles/picom.conf",
      "{HOME}/.config/polybar/config.ini": "./dotfiles/polybar.ini",
      "{HOME}/.profile": "./dotfiles/profile",
      "{HOME}/.config/rofi/config.rasi": "./dotfiles/rofi.rasi",
      "{HOME}/.config/starship.toml": "./dotfiles/starship.toml",
      "{HOME}/.config/waybar/config.jsonc": "./dotfiles/waybar.jsonc",
      "{HOME}/.config/waybar/style.css": "./dotfiles/waybar.css",
      "{HOME}/.config/fish/config.fish": "./dotfiles/config.fish",
      "{HOME}/.config/alacritty/alacritty.toml": "./dotfiles/alacritty.toml",
      "{HOME}/.gitconfig": "./dotfiles/gitconfig",
      "{HOME}/.tmux.conf": "./dotfiles/tmux.conf",
      "/etc/environment": "./dotfiles/globalenv",
    },
    directories: {},
    packages: {
      // we can define the packages per provider in this
      "bun": [
        "@tailwindcss/cli",
        // the colon indicates a specific version. This will
        // force typescript version 5.9.3
        "typescript:5.9.3",
      ],
    }
  }

}


export default m;
