import os from "os";
import path from "path";
import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => {
  const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");

  return {
    name: "pi",
    variables: {},
    files: {
      [path.join(agentDir, "settings.json")]: "./pi/settings.json",
    },
    directories: {
      [path.join(agentDir, "extensions")]: "./pi/extensions",
      [path.join(agentDir, "themes")]: "./pi/themes",
    },
    packages: {},
  };
};

export default m;
