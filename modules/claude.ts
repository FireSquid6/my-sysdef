import os from "os";
import path from "path";
import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");

  return {
    name: "claude",
    variables: {},
    files: {
      [path.join(configDir, "settings.json")]: "./claude/settings.json",
    },
    directories: {
      [path.join(configDir, "agents")]: "./claude/agents",
      [path.join(configDir, "skills")]: "./claude/skills",
      [path.join(configDir, "output-styles")]: "./claude/output-styles",
    },
    packages: {},
  };
};

export default m;
