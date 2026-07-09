import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "system-utilities",
    variables: {
      "HOME": "/home/firesquid"
    },
    files: {
      "{HOME}/.bashrc": "./dotfiles/bashrc",
      "{HOME}/.profile": "./dotfiles/profile",
      "{HOME}/.config/starship.toml": "./dotfiles/starship.toml",
      "{HOME}/.config/fish/config.fish": "./dotfiles/config.fish"
    },
    directories: {},
    packages: {
      "arch-official": [
        "htop",
        "wget",
        "tmux",
        "fish",
        "starship",
        "less",
        "which",
        "bash-completion",
        "diffutils",
        "direnv",
        "unrar",
        "7zip",
        "unzip",
        "xclip",
        "wmctrl",
        "hwdetect",
        "hwinfo",
        "dmidecode",
        "ethtool",
        "hdparm",
        "sysfsutils",
        "usbutils",
        "usb_modeswitch",
        "haveged",
        "ntp",
        "s-nail",
        "texinfo",
        "inetutils",
        "bind",
        "yay",
        "yazi",
        "downgrade",
        "pacman-contrib",
        "pkgfile",
        "rebuild-detector",
      ],
    }
  }
}

export default m;
