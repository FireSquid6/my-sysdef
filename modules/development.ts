import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "development",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "yay": [
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
        "claude-code",
        "nano",
        "nano-syntax-highlighting",
        "perl",
      ],
    }
  }
}

export default m;
