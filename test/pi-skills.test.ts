import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import pi from "../modules/pi";
import { normalFilesystem } from "../sysdef-src/connections";
import { dryShell, syncFiles, VariableStore } from "../sysdef-src/sysdef";

describe("Pi Herdr orchestration skill", () => {
  test("links the individual skill under the default agent directory", async () => {
    const previous = process.env.PI_CODING_AGENT_DIR;
    try {
      delete process.env.PI_CODING_AGENT_DIR;
      const mod = await pi(dryShell);
      expect(mod.files[path.join(os.homedir(), ".pi/agent/AGENTS.md")]).toBe("./pi/AGENTS.md");
      expect(mod.directories[path.join(os.homedir(), ".pi/agent/skills/herdr-orchestration")])
        .toBe("./pi/skills/herdr-orchestration");
      expect(mod.directories[path.join(os.homedir(), ".pi/agent/skills")]).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
    }
  });

  test("respects the agent-directory override and preserves unrelated skills on repeat sync", async () => {
    const previous = process.env.PI_CODING_AGENT_DIR;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-pi-skills-"));
    try {
      process.env.PI_CODING_AGENT_DIR = home;
      fs.mkdirSync(path.join(home, "skills/local-only"), { recursive: true });
      const local = path.join(home, "skills/local-only/SKILL.md");
      fs.writeFileSync(local, "local skill");
      const mod = await pi(dryShell);
      const root = path.resolve(import.meta.dir, "..");
      const destination = path.join(home, "skills/herdr-orchestration");
      for (let pass = 0; pass < 2; pass++) {
        await syncFiles([mod], new VariableStore(), normalFilesystem, root);
        expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(destination)).toBe(path.join(root, "pi/skills/herdr-orchestration"));
        expect(fs.readFileSync(local, "utf8")).toBe("local skill");
        const instructions = path.join(home, "AGENTS.md");
        expect(fs.lstatSync(instructions).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(instructions)).toBe(path.join(root, "pi/AGENTS.md"));
        expect(fs.readFileSync(instructions, "utf8")).toBe(fs.readFileSync(path.join(root, "pi/AGENTS.md"), "utf8"));
      }
      const content = fs.readFileSync(path.join(destination, "SKILL.md"), "utf8");
      expect(content).toMatch(/^---\nname: herdr-orchestration\ndescription: .+\n/);
      expect(content).toContain("hc --skill");
      expect(content).toContain("hc send --if idle");
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
