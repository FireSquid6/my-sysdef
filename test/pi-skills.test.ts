import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Vendored Pi skills", () => {
  test("Herdr skill documents safe orchestration", () => {
    const content = read("pi/skills/herdr-orchestration/SKILL.md");
    expect(content).toMatch(/^---\nname: herdr-orchestration\ndescription: .+\n/);
    expect(content).toContain("hc --skill");
    expect(content).toContain("hc send --if idle");
  });
  test("AGS skill includes its versioned API references", () => {
    const content = read("pi/skills/ags/SKILL.md");
    expect(content).toMatch(/^---\nname: ags\ndescription: .+\n/);
    expect(content).toContain("references/current-api.md");
    expect(content).toContain("ags --version");
    expect(content).toContain("GJS");
    expect(read("pi/skills/ags/references/current-api.md")).toContain("https://aylur.github.io/ags/");
  });
});
