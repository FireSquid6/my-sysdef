import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "development",
    variables: {
      "HOME": "/home/firesquid"
    },
    files: {
      "{HOME}/.config/lazygit/config.yml": "./dotfiles/lazygit.yml",
      "{HOME}/.gitconfig": "./dotfiles/gitconfig",
      "{HOME}/.tmux.conf": "./dotfiles/tmux.conf"
    },
    directories: {
      "{HOME}/.config/nvim": "./neovim"
    },
    packages: {
      "arch-official": [
        "git",
        "github-cli",
        "go",
        "python",
        "python-defusedxml",
        "python-packaging",
        "python-pyqt6",
        "neovim",
        "vim",
        "vi",
        "meld",
        "cloc",
        "lazygit",
        "lazydocker",
        "nano",
        "nano-syntax-highlighting",
        "perl",
        "npm",
      ],
      "bun": [
        "@tailwindcss/cli",
        "typescript:5.9.3",
      ],
    }
  }
}

export default m;
