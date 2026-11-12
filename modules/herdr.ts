import os from "os";
import path from "path";
import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => ({
  name: "herdr",
  variables: {},
  files: {},
  directories: {
    [process.env.HERDR_APP_HOME || path.join(os.homedir(), ".config", "herdr-app")]: "./herdr",
  },
  packages: { "arch-official": ["bun", "libnotify"] },
});

export default m;
