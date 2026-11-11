import os from "os";
import path from "path";
import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => ({
  name: "opencode",
  variables: {},
  files: {},
  directories: {
    [path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode")]: "./opencode",
  },
  packages: {},
});

export default m;
