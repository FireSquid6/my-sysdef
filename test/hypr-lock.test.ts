import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import desktop from "../modules/desktop";
const root = path.resolve(import.meta.dir, "..");
const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");

describe("Hyprlock and hypridle", () => {
  test("desktop owns both stable packages and the shared Hypr config directory", () => {
    const config = desktop({} as never);
    expect(config.packages?.["arch-official"]).toContain("hyprlock");
    expect(config.packages?.["arch-official"]).toContain("hypridle");
    expect(config.packages?.["arch-official"]).toContain("util-linux");
    expect(config.directories?.["{HOME}/.config/hypr"]).toBe("./dotfiles/hypr");
  });
  test("locks before sleep and preserves idle timings without automatic suspend or unlock", () => {
    const idle = read("dotfiles/hypr/hypridle.conf");
    expect(idle).toContain("lock_cmd = bash ~/.config/hypr/hyprlock.sh");
    expect(idle).toContain("before_sleep_cmd = loginctl lock-session");
    expect(idle).toContain("inhibit_sleep = 3");
    expect(idle).toContain("timeout = 300");
    expect(idle).toContain("timeout = 500");
    expect(idle).toContain('hl.dsp.dpms({ action = "enable" })');
    expect(idle).toContain('hl.dsp.dpms({ action = "disable" })');
    expect(idle).not.toContain("swaylock");
    expect(idle).not.toMatch(/(?:on-timeout|unlock_cmd)\s*=.*(?:suspend|unlock-session)/);
  });
  test("uses opaque Tokyo Night styling and PAM, with a manual binding in both configs", () => {
    const lock = read("dotfiles/hypr/hyprlock.conf");
    expect(lock).toContain("color = rgb(1a1b26)");
    expect(lock).toContain("outer_color = rgb(bb9af7)");
    expect(lock).toContain("module = hyprlock");
    expect(lock).not.toContain("screenshot");
    expect(read("dotfiles/hypr/hyprland.lua")).toContain('hl.bind("SUPER + CTRL + L", hl.dsp.exec_cmd("bash ~/.config/hypr/hyprlock.sh"))');
    expect(read("dotfiles/hypr/hyprland.conf")).toContain("bind = $mainMod CONTROL, L, exec, bash ~/.config/hypr/hyprlock.sh");
  });
  test("serializes lock requests and requires authentication immediately (mock locker only)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-hyprlock-test-"));
    const calls = path.join(dir, "calls");
    const release = path.join(dir, "release");
    fs.writeFileSync(path.join(dir, "hyprlock"), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$TEST_CALLS"\nfor ((i=0; i<100; i++)); do test -e "$TEST_RELEASE" && break; sleep 0.02; done\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, XDG_RUNTIME_DIR: dir, TEST_CALLS: calls, TEST_RELEASE: release };
    const first = Bun.spawn(["bash", path.join(root, "dotfiles/hypr/hyprlock.sh")], { env, stdout: "pipe", stderr: "pipe" });
    try {
      for (let i = 0; i < 100 && !fs.existsSync(calls); i++) await Bun.sleep(10);
      expect(fs.existsSync(calls)).toBe(true);
      const second = Bun.spawn(["bash", path.join(root, "dotfiles/hypr/hyprlock.sh")], { env, stdout: "pipe", stderr: "pipe" });
      expect(await second.exited).toBe(0);
      expect(fs.readFileSync(calls, "utf8")).toBe("--grace 0 --no-fade-in\n");
      expect(fs.statSync(path.join(dir, "sysdef-hyprlock.lock")).mode & 0o777).toBe(0o600);
    } finally {
      fs.writeFileSync(release, "");
      await first.exited;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
