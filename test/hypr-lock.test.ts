import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const root = path.resolve(import.meta.dir, "..");
const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");

describe("Hyprlock and hypridle", () => {
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
  test("uses opaque Tokyo Night styling and PAM, with no manual lock shortcut", () => {
    const lock = read("dotfiles/hypr/hyprlock.conf");
    expect(lock).toContain("color = rgb(1a1b26)");
    expect(lock).toContain("outer_color = rgb(bb9af7)");
    expect(lock).toContain("module = hyprlock");
    expect(lock).not.toContain("screenshot");
    expect(read("dotfiles/hypr/hyprland.lua")).not.toContain('hl.bind("SUPER + CTRL + L"');
    expect(read("dotfiles/hypr/hyprland.conf")).not.toContain("bind = $mainMod CONTROL, L,");
  });
  test("reloads only dedicated scene images over an opaque base, never the desktop", () => {
    const config = read("dotfiles/hypr/hyprlock.conf");
    expect(config).toContain("zindex = -2");
    expect(config).toContain("zindex = -1");
    expect(config).toContain("reload_time = 1");
    expect(config).toContain("hyprlock-background.sh");
    expect(config).toContain("enabled = false");
    expect(config).not.toContain("SIGUSR");
    const png = fs.readFileSync(path.join(root, "dotfiles/hypr/lock-background.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png[25]).toBe(2); // PNG RGB color type: no alpha channel.
  });
  test("lock image selection honors enabled mode, freshness, fallback and safe instance names", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-lock-image-"));
    const runtime = path.join(dir, "run with spaces"), state = path.join(dir, "state"), home = path.join(dir, "home");
    fs.mkdirSync(path.join(runtime, "sysdef-wallpaper-sysdef-test"), { recursive: true });
    fs.mkdirSync(path.join(state, "sysdef"), { recursive: true });
    const config = path.join(home, ".config");
    fs.mkdirSync(path.join(config, "hypr"), { recursive: true });
    const image = path.join(runtime, "sysdef-wallpaper-sysdef-test/frame.png"), fallback = path.join(config, "hypr/lock-background.png");
    fs.writeFileSync(fallback, "static fixture");
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: config, XDG_RUNTIME_DIR: runtime, XDG_STATE_HOME: state, SYSDEF_AGS_INSTANCE: "sysdef-test" };
    const select = async (overrides = {}) => {
      const child = Bun.spawn(["bash", path.join(root, "dotfiles/hypr/hyprlock-background.sh")], { env: { ...env, ...overrides }, stdout: "pipe", stderr: "pipe" });
      const result = (await new Response(child.stdout).text()).trim();
      expect(await child.exited).toBe(0); return result;
    };
    try {
      expect(await select()).toBe(fallback);
      fs.writeFileSync(image, "frame fixture");
      expect(await select()).toBe(image);
      fs.writeFileSync(path.join(state, "sysdef/wallpaper"), "hyprpaper\n");
      expect(await select()).toBe(fallback);
      fs.writeFileSync(path.join(state, "sysdef/wallpaper"), "animated\n");
      fs.utimesSync(image, new Date(0), new Date(0));
      expect(await select()).toBe(fallback);
      fs.utimesSync(image, new Date(), new Date());
      expect(await select({ SYSDEF_AGS_INSTANCE: "../unsafe" })).toBe(fallback);
      expect(await select({ XDG_RUNTIME_DIR: "" })).toBe(fallback);
      fs.unlinkSync(image); fs.unlinkSync(fallback);
      expect(await select()).toBe("");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
