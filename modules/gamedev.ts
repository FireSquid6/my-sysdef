import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => {
  return {
    name: "gamedev",
    packages: {
      "arch-official": [
        "godot",
        "libresprite",
        "prismlauncher"
      ],
    },
  }
}
