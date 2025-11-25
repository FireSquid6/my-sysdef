import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "endeavouros",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "yay": [
        "endeavouros-branding",
        "endeavouros-keyring",
        "endeavouros-mirrorlist",
        "endeavouros-xfce4-terminal-colors",
        "eos-apps-info",
        "eos-hooks",
        "eos-lightdm-slick-theme",
        "eos-log-tool",
        "eos-packagelist",
        "eos-qogir-icons",
        "eos-quickstart",
        "eos-rankmirrors",
        "eos-settings-xfce4",
        "arc-gtk-theme-eos",
        "welcome",
        "decman",
      ],
    }
  }
}

export default m;
