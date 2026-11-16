import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("sandbox exposes the resolved Nix profile read-only after hiding home", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-sandbox-"));
  try {
    const home = path.join(root, "home"), bin = path.join(root, "bin"), profile = path.join(root, "profile");
    fs.mkdirSync(home); fs.mkdirSync(bin); fs.mkdirSync(path.join(profile, "bin"), { recursive: true });
    fs.symlinkSync(profile, path.join(home, ".nix-profile"));
    const capture = path.join(root, "args");
    fs.writeFileSync(path.join(bin, "bwrap"), '#!/bin/bash\nprintf "%s\\0" "$@" > "$CAPTURE"\n', { mode: 0o755 });
    const result = Bun.spawnSync(["bash", path.resolve(import.meta.dir, "../scripts/sandbox.sh"), "--no-cgroup", "--", "pi", "--version"], {
      cwd: root, env: { ...process.env, HOME: home, CAPTURE: capture, PATH: `${bin}:/usr/bin:/bin` },
    });
    expect(result.exitCode).toBe(0);
    const args = fs.readFileSync(capture, "utf8").split("\0").slice(0, -1);
    const mount = args.findIndex((arg, i) => arg === "--ro-bind" && args[i + 1] === profile && args[i + 2] === path.join(home, ".nix-profile"));
    const hideHome = args.findIndex((arg, i) => arg === "--tmpfs" && args[i + 1] === home);
    expect(hideHome).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(hideHome);
    const pathIndex = args.findIndex((arg, i) => arg === "--setenv" && args[i + 1] === "PATH");
    expect(args[pathIndex + 2]!.split(":")).toContain(path.join(home, ".nix-profile/bin"));
    expect(args.slice(-3)).toEqual(["--", "pi", "--version"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
