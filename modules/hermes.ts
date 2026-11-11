import fs from "fs";
import os from "os";
import path from "path";
import type { ModuleGenerator } from "../sysdef-src/sysdef";

const m: ModuleGenerator = () => {
  const home = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
  const aiheroSource = path.resolve(import.meta.dir, "../hermes/skills/aihero");
  const directories: Record<string, string> = {
    [path.join(home, "skills/creative/impeccable")]: "./hermes/skills/creative/impeccable",
  };

  // Link individual skills, not the skills root or its updater/curator metadata.
  for (const entry of fs.readdirSync(aiheroSource, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(aiheroSource, entry.name, "SKILL.md"))) {
      directories[path.join(home, "skills/aihero", entry.name)] = `./hermes/skills/aihero/${entry.name}`;
    }
  }

  return {
    name: "hermes",
    variables: {},
    files: {
      [path.join(home, "SOUL.md")]: "./hermes/SOUL.md",
      [path.join(home, "skills/aihero/AIHERO-LICENSE.txt")]: "./hermes/skills/aihero/AIHERO-LICENSE.txt",
    },
    directories,
    packages: {},
  };
};

export default m;
