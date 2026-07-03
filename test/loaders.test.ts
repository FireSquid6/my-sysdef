import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { loadVariables, loadModules, loadProviders } from "../sysdef-src/loaders";

describe("loadVariables", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-loaders-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("seeds the store with global (config) variables", async () => {
    const store = await loadVariables(dir, { HOME: "/root", USER: "me" });
    expect(store.get("HOME")).toBe("/root");
    expect(store.get("USER")).toBe("me");
  });

  test("returns an empty store when there are no variables at all", async () => {
    const store = await loadVariables(dir);
    expect(store.has("HOME")).toBe(false);
  });

  test("a variables.ts file overrides global variables", async () => {
    fs.writeFileSync(
      path.join(dir, "variables.ts"),
      `export default () => ({ HOME: "/home/override" });\n`,
    );
    const store = await loadVariables(dir, { HOME: "/root", KEEP: "yes" });
    expect(store.get("HOME")).toBe("/home/override"); // overridden
    expect(store.get("KEEP")).toBe("yes"); // untouched base var
  });
});

describe("loadModules", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-mods-"));
    fs.mkdirSync(path.join(dir, "modules"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeModule = (name: string, body: string) =>
    fs.writeFileSync(path.join(dir, "modules", `${name}.ts`), body);

  const moduleBody = (name: string) =>
    `import type { ModuleGenerator } from ${JSON.stringify(path.resolve(import.meta.dir, "..", "sysdef-src", "sysdef.ts"))};
const m: ModuleGenerator = () => ({ name: ${JSON.stringify(name)}, variables: {}, files: {}, directories: {}, packages: {} });
export default m;
`;

  test("loads only the modules named in the config list", async () => {
    writeModule("wanted", moduleBody("wanted"));
    writeModule("skipped", moduleBody("skipped"));
    const modules = await loadModules(dir, true, ["wanted"]);
    expect(modules).toHaveLength(1);
    expect(modules[0]!.name).toBe("wanted");
  });

  test("ignores non-source files", async () => {
    writeModule("wanted", moduleBody("wanted"));
    fs.writeFileSync(path.join(dir, "modules", "notes.md"), "# not a module");
    const modules = await loadModules(dir, true, ["wanted", "notes"]);
    expect(modules.map((m) => m.name)).toEqual(["wanted"]);
  });
});

describe("loadProviders", () => {
  // The real providers/ dir ships with the package; load a subset by name.
  const rootDir = path.resolve(import.meta.dir, "..");

  test("loads only the providers named in the config list", async () => {
    const providers = await loadProviders(rootDir, true, ["apt", "cargo"]);
    const names = providers.map((p) => p.name).sort();
    expect(names).toEqual(["apt", "cargo"]);
  });

  test("loads no providers when the list is empty", async () => {
    const providers = await loadProviders(rootDir, true, []);
    expect(providers).toEqual([]);
  });
});
