import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "hardware",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "arch-official": [
        "bluez",
        "bluez-utils",
        "blueman",
        "brightnessctl",
        "xf86-video-amdgpu",
        "xf86-video-ati",
        "xf86-input-libinput",
        "mesa-utils",
        "upower",
        "power-profiles-daemon",
        "b43-fwcutter",
        "accountsservice",
        "aspell",
        "libwnck3",
        "lsb-release",
      ],
    }
  }
}

export default m;
