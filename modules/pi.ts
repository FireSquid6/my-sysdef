import os from "os";
import path from "path";
import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => {
  const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");

  return {
    name: "pi",
    variables: {},
    files: {
      [path.join(agentDir, "AGENTS.md")]: "./pi/AGENTS.md",
      [path.join(agentDir, "settings.json")]: "./pi/settings.json",
      [path.join(agentDir, "subagents.json")]: "./pi/subagents.json",
      [path.join(agentDir, "agent-tool-description.md")]: "./pi/agent-tool-description.md",
    },
    directories: {
      [path.join(agentDir, "extensions")]: "./pi/extensions",
      [path.join(agentDir, "themes")]: "./pi/themes",
      [path.join(agentDir, "skills/herdr-orchestration")]: "./pi/skills/herdr-orchestration",
    },
    packages: {},
  };
};

export default m;
