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
      "yay": [
        "htop",
        "glances",
        "inxi",
        "plocate",
        "rsync",
        "wget",
        "tmux",
        "fish",
        "starship",
        "duf",
        "tldr",
        "pv",
        "sudo",
        "less",
        "which",
        "bash-completion",
        "diffutils",
        "direnv",
        "unrar",
        "unzip",
        "xclip",
        "wmctrl",
        "hwdetect",
        "hwinfo",
        "dmidecode",
        "ethtool",
        "hdparm",
        "lsscsi",
        "sg3_utils",
        "smartmontools",
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
        "reflector",
        "reflector-simple",
      ],
    }
  }
}

export default m;
