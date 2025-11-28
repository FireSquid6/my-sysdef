import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "applications",
    variables: {
      "HOME": "/home/firesquid"
    },
    files: {
      "{HOME}/.config/kitty/kitty.conf": "./dotfiles/kitty.conf",
      "{HOME}/.config/alacritty/alacritty.toml": "./dotfiles/alacritty.toml"
    },
    directories: {},
    packages: {
      "yay": [
        "chromium",
        "firefox", 
        "discord",
        "steam",
        "spotify-launcher",
        "spotify-player",
        "obsidian",
        "visual-studio-code-bin",
        "alacritty",
        "galculator",
        "mousepad",
        "ristretto",
        "parole",
        "proton-mail",
        "inkscape",
      ],
    }
  }
}

export default m;
