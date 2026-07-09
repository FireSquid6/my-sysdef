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
      "{HOME}/.tmux.conf": "./dotfiles/tmux.conf",
      "{HOME}/.config/zellij/config.kdl": "./dotfiles/zellij.kdl",
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
        "meld",
        "cloc",
        "lazygit",
        "lazydocker",
        "nano",
        "nano-syntax-highlighting",
        "perl",
        "npm",
        "docker",
        "docker-compose",
        "jdk25-openjdk",
        "maven",
      ],
      "bun": [
        "@tailwindcss/cli",
        "typescript:5.9.3",
      ],
    }
  }
}

export default m;
