import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

// Several failure paths in sysdef intentionally call errorOut() -> process.exit(1).
// We can't observe that in-process without killing the test runner, so we exercise
// them in a child bun process and assert on the exit code + output.

const SRC = path.resolve(import.meta.dir, "..", "sysdef-src");
const PROVIDERS = path.resolve(import.meta.dir, "..", "providers");

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-exit-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function runScript(script: string): { code: number; stdout: string; stderr: string } {
  const scriptPath = path.join(dir, "script.ts");
  fs.writeFileSync(scriptPath, script);
  const proc = Bun.spawnSync(["bun", "run", scriptPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("readConfig failure paths", () => {
  test("exits(1) when config.yaml is missing", () => {
    const result = runScript(`
      import { readConfig } from ${JSON.stringify(path.join(SRC, "configuration.ts"))};
      readConfig(${JSON.stringify(dir)});
      console.log("SHOULD_NOT_REACH");
    `);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Error reading the config file");
  });

  test("exits(1) when config.yaml is structurally invalid", () => {
    fs.writeFileSync(path.join(dir, "config.yaml"), "providers: not-a-list\nmodules: []\nvariables: {}\n");
    const result = runScript(`
      import { readConfig } from ${JSON.stringify(path.join(SRC, "configuration.ts"))};
      readConfig(${JSON.stringify(dir)});
      console.log("SHOULD_NOT_REACH");
    `);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
  });
});

describe("Lockfile.readFromFile failure path", () => {
  test("exits(1) when the lockfile does not match the schema", () => {
    const lockPath = path.join(dir, "sysdef-lock.json");
    // top-level values must be objects of string->string; a number is invalid
    fs.writeFileSync(lockPath, JSON.stringify({ apt: 5 }));
    const result = runScript(`
      import { Lockfile } from ${JSON.stringify(path.join(SRC, "lockfile.ts"))};
      const lf = new Lockfile();
      lf.readFromFile(${JSON.stringify(lockPath)});
      console.log("SHOULD_NOT_REACH");
    `);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to read lockfile");
  });
});

describe("getPackageList version-conflict path", () => {
  test("exits(1) when two modules request different versions of the same package", () => {
    const result = runScript(`
      import { getPackageList } from ${JSON.stringify(path.join(SRC, "sysdef.ts"))};
      import { Lockfile } from ${JSON.stringify(path.join(SRC, "lockfile.ts"))};
      const modules = [
        { name: "a", variables: {}, packages: { apt: ["vim:8.2"] }, directories: {}, files: {} },
        { name: "b", variables: {}, packages: { apt: ["vim:9.0"] }, directories: {}, files: {} },
      ];
      getPackageList(modules, new Lockfile());
      console.log("SHOULD_NOT_REACH");
    `);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Requested two different versions");
  });

  test("does NOT exit when the same version is requested twice", () => {
    const result = runScript(`
      import { getPackageList } from ${JSON.stringify(path.join(SRC, "sysdef.ts"))};
      import { Lockfile } from ${JSON.stringify(path.join(SRC, "lockfile.ts"))};
      const modules = [
        { name: "a", variables: {}, packages: { apt: ["vim:8.2"] }, directories: {}, files: {} },
        { name: "b", variables: {}, packages: { apt: ["vim:8.2"] }, directories: {}, files: {} },
      ];
      const list = getPackageList(modules, new Lockfile());
      console.log("OK:" + list.length);
    `);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("OK:2");
  });
});

describe("provider install failure path", () => {
  // Providers should fail fast (errorOut -> exit 1) with a clean message when a
  // package can't be installed, rather than swallowing the failure or leaking a
  // raw thrown-error stack trace. We simulate a failing package manager with a
  // shell that always returns a non-zero exit code.
  const failScript = (provider: string, file: string) => `
    import gen from ${JSON.stringify(path.join(PROVIDERS, file))};
    const failingShell = async () => ({ code: 1, stdout: "boom" });
    const p = gen(failingShell);
    await p.install([{ name: "does-not-exist", version: "_*_", provider: ${JSON.stringify(provider)} }]);
    console.log("SHOULD_NOT_REACH");
  `;

  test("bun install failure exits(1) with a clean message", () => {
    const result = runScript(failScript("bun", "bun.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to install");
  });

  test("apt install failure exits(1) with a clean message", () => {
    const result = runScript(failScript("apt", "apt.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to install");
  });

  test("cargo install failure exits(1) with a clean message", () => {
    const result = runScript(failScript("cargo", "cargo.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to install");
  });

  test("npm install failure exits(1) with a clean message", () => {
    const result = runScript(failScript("npm", "npm.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to install");
  });

  test("pipx install failure exits(1) with a clean message", () => {
    const result = runScript(failScript("pipx", "pipx.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to install");
  });

  test("go install failure exits(1) with a clean message", () => {
    const result = runScript(failScript("go", "go.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to install");
  });

  test("dnf install failure exits(1) with a clean message", () => {
    const result = runScript(failScript("dnf", "dnf.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to install");
  });
});

describe("version-pin rejection (pacman family)", () => {
  // arch-official and aur cannot install an arbitrary pinned version, so a pinned
  // request must abort cleanly rather than silently ignore the pin.
  const pinScript = (provider: string, file: string) => `
    import gen from ${JSON.stringify(path.join(PROVIDERS, file))};
    const okShell = async () => ({ code: 0, stdout: "" });
    const p = gen(okShell);
    await p.install([{ name: "vim", version: "9.0", provider: ${JSON.stringify(provider)} }]);
    console.log("SHOULD_NOT_REACH");
  `;

  test("arch-official rejects a pinned version", () => {
    const result = runScript(pinScript("arch-official", "arch-official.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("cannot install a specific version");
  });

  test("aur rejects a pinned version", () => {
    const result = runScript(pinScript("aur", "aur.ts"));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("cannot install a specific version");
  });
});

describe("provider uninstall / update failure paths", () => {
  // uninstall() and update() fail fast (errorOut -> exit 1) with a clean message
  // just like install(), rather than swallowing failures or leaking a raw stack.
  const opScript = (file: string, call: string) => `
    import gen from ${JSON.stringify(path.join(PROVIDERS, file))};
    const failingShell = async () => ({ code: 1, stdout: "boom" });
    const p = gen(failingShell);
    await p.${call};
    console.log("SHOULD_NOT_REACH");
  `;

  test("bun uninstall failure exits(1) with a clean message", () => {
    const result = runScript(opScript("bun.ts", `uninstall(["does-not-exist"])`));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to uninstall");
  });

  test("apt uninstall failure exits(1) with a clean message", () => {
    const result = runScript(opScript("apt.ts", `uninstall(["does-not-exist"])`));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to uninstall");
  });

  test("bun update failure exits(1) with a clean message", () => {
    const result = runScript(opScript("bun.ts", `update(["does-not-exist"])`));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to update");
  });

  test("cargo update failure exits(1) with a clean message", () => {
    const result = runScript(opScript("cargo.ts", `update(["does-not-exist"])`));
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("SHOULD_NOT_REACH");
    expect(result.stdout).toContain("Failed to update");
  });
});
