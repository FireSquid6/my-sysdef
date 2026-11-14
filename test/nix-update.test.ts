import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = path.resolve(import.meta.dir, "../nix-update.sh");

function update(fail = "") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nix-update-test-"));
  try {
    const bin = path.join(home, ".nix-profile/bin");
    const calls = path.join(home, "calls");
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, "nix"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CALLS"
if [[ "\${1:-}" == "$FAIL" ]]; then exit 7; fi
`, { mode: 0o755 });
    const child = Bun.spawnSync(["bash", script, "--max-jobs", "2", "--cores", "20"], {
      cwd: home,
      env: { ...process.env, HOME: home, CALLS: calls, FAIL: fail },
    });
    return { code: child.exitCode, calls: fs.readFileSync(calls, "utf8").trim().split("\n") };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

describe("Nix update script (mock Nix only)", () => {
  test("updates inputs, builds then upgrades the installed bundle", () => {
    const result = update();
    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "flake update",
      "build --no-link --max-jobs 2 --cores 20 .#kotoko-apps",
      "profile upgrade --max-jobs 2 --cores 20 kotoko-apps",
    ]);
  });
  test("an input-update failure prevents building or upgrading", () => {
    expect(update("flake")).toEqual({ code: 7, calls: ["flake update"] });
  });
  test("a failed build never upgrades the profile", () => {
    const result = update("build");
    expect(result.code).toBe(7);
    expect(result.calls).toHaveLength(2);
  });
});
