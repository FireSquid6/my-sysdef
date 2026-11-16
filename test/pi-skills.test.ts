import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Vendored Pi skills", () => {
  test("Matt Pocock skills are local rather than package-managed", () => {
    const settings = JSON.parse(read("pi/settings.json"));
    expect(settings.packages).not.toContain("npm:pi-matt-pocock-skills");
    for (const name of [
      "code-review", "domain-modeling", "grilling", "implement", "prototype",
      "research", "setup-matt-pocock-skills", "tdd", "to-spec", "to-tickets", "wayfinder",
    ]) {
      expect(read(`pi/skills/${name}/SKILL.md`)).toContain(`name: ${name}\n`);
    }
    expect(read("pi/skills/MATT-POCOCK-LICENSE")).toContain("MIT");
    expect(read("pi/skills/MATT-POCOCK-NOTICE")).toContain("mattpocock/skills");
    expect(read("pi/skills/tdd/tests.md")).not.toBeEmpty();
    expect(read("pi/skills/prototype/UI.md")).not.toBeEmpty();
    expect(read("pi/skills/domain-modeling/ADR-FORMAT.md")).not.toBeEmpty();
    expect(read("pi/skills/grilling/SKILL.md")).toContain("Ask up to 5 questions at once");
    expect(read("pi/skills/wayfinder/SKILL.md")).not.toContain("one question at a time");
  });
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
