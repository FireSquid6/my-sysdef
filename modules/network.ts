import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "network",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "arch-official": [
        "tailscale",
        "openssh",
        "firewalld",
        "waypipe",
      ],
    }
  }
}

export default m;
