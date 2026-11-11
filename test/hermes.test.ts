import { afterEach, describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import hermes from "../modules/hermes";
import { normalFilesystem } from "../sysdef-src/connections";
import { dryShell, syncFiles, VariableStore } from "../sysdef-src/sysdef";

const originalHome = process.env.HERMES_HOME;
const temporaryHomes: string[] = [];
afterEach(() => {
  if (originalHome === undefined) delete process.env.HERMES_HOME;
  else process.env.HERMES_HOME = originalHome;
  for (const home of temporaryHomes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

const getModule = () => hermes(dryShell);

describe("Hermes shared configuration", () => {
  test("defaults to ~/.hermes and manages only persona, license, and selected skills", async () => {
    delete process.env.HERMES_HOME;
    const mod = await getModule();
    const home = path.join(os.homedir(), ".hermes");
    expect(Object.keys(mod.files).sort()).toEqual([
      path.join(home, "SOUL.md"),
      path.join(home, "skills/aihero/AIHERO-LICENSE.txt"),
    ].sort());
    expect(mod.packages).toEqual({});
    expect(Object.keys(mod.directories)).toHaveLength(28);
    expect(mod.directories[path.join(home, "skills")]).toBeUndefined();
    for (const source of Object.values(mod.directories)) {
      expect(fs.existsSync(path.resolve(import.meta.dir, "..", source, "SKILL.md"))).toBe(true);
    }
  });

  test("syncs all vendored skills into an explicit home without disturbing local state", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-hermes-"));
    temporaryHomes.push(home);
    process.env.HERMES_HOME = home;
    fs.mkdirSync(path.join(home, "skills/local-only"), { recursive: true });
    const localFiles = ["config.yaml", ".env", "auth.json", "state.db", "skills/.bundled_manifest", "skills/local-only/SKILL.md"];
    for (const file of localFiles) fs.writeFileSync(path.join(home, file), "local state");
    const mod = await getModule();
    const root = path.resolve(import.meta.dir, "..");
    for (let pass = 0; pass < 2; pass++) {
      await syncFiles([mod], new VariableStore(), normalFilesystem, root);
      for (const [destination, source] of Object.entries({ ...mod.files, ...mod.directories })) {
        expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
        expect(fs.readlinkSync(destination)).toBe(path.resolve(root, source as string));
      }
      for (const file of localFiles) expect(fs.readFileSync(path.join(home, file), "utf8")).toBe("local state");
    }
  });
});
