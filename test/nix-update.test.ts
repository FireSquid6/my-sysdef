import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = path.resolve(import.meta.dir, "../nix-update.sh");

function update(fail = "", host = "kotoko", refresh = true) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nix-update-test-"));
  try {
    const bin = path.join(home, ".nix-profile/bin");
    const calls = path.join(home, "calls");
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, "nix"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CALLS"
if [[ "\${1:-}" == "$FAIL" ]]; then exit 7; fi
`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "hostname"), '#!/usr/bin/env bash\nprintf "%s\\n" "$TEST_HOST"\n', { mode: 0o755 });
    const child = Bun.spawnSync(["bash", script, ...(refresh ? [] : ["--no-refresh"]), "--max-jobs", "2", "--cores", "20"], {
      cwd: home,
      env: { ...process.env, HOME: home, CALLS: calls, FAIL: fail, TEST_HOST: host },
    });
    return { code: child.exitCode, calls: fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [] };
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
  test("applies a local fix without refreshing locked inputs", () => {
    expect(update("", "kotoko", false)).toEqual({ code: 0, calls: [
      "build --no-link --max-jobs 2 --cores 20 .#kotoko-apps",
      "profile upgrade --max-jobs 2 --cores 20 kotoko-apps",
    ] });
  });
  test("selects the same shared configuration through the laptop profile", () => {
    expect(update("", "deisslaptop").calls).toEqual([
      "flake update",
      "build --no-link --max-jobs 2 --cores 20 .#deisslaptop-apps",
      "profile upgrade --max-jobs 2 --cores 20 deisslaptop-apps",
    ]);
  });
  test("builds and switches the minibox Home Manager configuration", () => {
    expect(update("", "minibox-one")).toEqual({ code: 0, calls: [
      "flake update",
      'build --no-link --max-jobs 2 --cores 20 .#homeConfigurations."firesquid@minibox-one".activationPackage',
      "run --max-jobs 2 --cores 20 .#home-manager -- switch --flake .#firesquid@minibox-one --max-jobs 2 --cores 20",
    ] });
  });
  test("minibox can switch without refreshing inputs", () => {
    const result = update("", "minibox-one", false);
    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(2);
    expect(result.calls[0]).toStartWith("build ");
    expect(result.calls[1]).toStartWith("run ");
  });
  test("a failed minibox build never switches the configuration", () => {
    const result = update("build", "minibox-one");
    expect(result.code).toBe(7);
    expect(result.calls).toHaveLength(2);
  });
  test("does not guess a profile on an unknown host", () => {
    expect(update("", "other-host")).toEqual({ code: 1, calls: [] });
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
