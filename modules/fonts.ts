import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "fonts",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "yay": [
        "ttf-jetbrains-mono-nerd",
        "ttf-liberation",
        "ttf-opensans", 
        "ttf-bitstream-vera",
        "noto-fonts",
        "noto-fonts-cjk",
        "noto-fonts-emoji",
        "noto-fonts-extra",
        "cantarell-fonts",
      ],
    }
  }
}

export default m;
