import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "kotoko",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "arch-official": [
        "os-prober",
        "intel-ucode",
        "python-jinja",
        "ttf-dejavu",
        "grub",
      ],
    }
  }
}

export default m;
