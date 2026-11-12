import os from "node:os";
import path from "node:path";
import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => ({
  name: "ags",
  variables: {},
  files: {},
  directories: {
    [path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "ags")]: "./ags",
  },
  packages: {
    // AGS's package pulls matching Astal GTK4/IO libraries; don't mix GTK generations.
    aur: ["aylurs-gtk-shell"],
    "arch-official": ["gjs", "gtk4", "gtk4-layer-shell", "gobject-introspection", "npm", "bun", "libnotify", "pamixer", "networkmanager", "nm-connection-editor", "pavucontrol", "tailscale", "util-linux", "coreutils"],
  },
});
export default m;
