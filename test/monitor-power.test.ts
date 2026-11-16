import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = path.resolve(import.meta.dir, "../dotfiles/hypr/monitor-power.sh");

test("explicit screen-off stops idle, blocks resume and restores idle on the next toggle (mock commands)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-monitor-power-"));
  const calls = path.join(dir, "calls"), running = path.join(dir, "running");
  const state = path.join(dir, "sysdef-monitor-power-test-session");
  const mocks = {
    pgrep: 'test -f "$TEST_RUNNING"',
    pkill: 'echo stop >> "$TEST_CALLS"; rm -f "$TEST_RUNNING"',
    hypridle: 'echo start >> "$TEST_CALLS"; touch "$TEST_RUNNING"',
    hyprctl: 'echo "$*" >> "$TEST_CALLS"; test "${TEST_DPMS_FAIL:-0}" != 1',
  };
  for (const [name, body] of Object.entries(mocks)) {
    fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, XDG_RUNTIME_DIR: dir,
    HYPRLAND_INSTANCE_SIGNATURE: "test-session", TEST_CALLS: calls, TEST_RUNNING: running };
  async function run(action: string, overrides = {}) {
    const child = Bun.spawn(["bash", script, action], { env: { ...env, ...overrides }, stdout: "pipe", stderr: "pipe" });
    return await child.exited;
  }
  const log = () => fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "";
  try {
    fs.writeFileSync(running, "");
    expect(await run("toggle")).toBe(0);
    expect(log()).toBe('stop\ndispatch hl.dsp.dpms({ action = "disable" })\n');
    expect(fs.existsSync(running)).toBe(false);
    expect(fs.statSync(state).mode & 0o777).toBe(0o600);
    expect(await run("resume")).toBe(0);
    expect(log()).not.toContain('action = "enable"');
    expect(await run("toggle")).toBe(0);
    for (let i = 0; i < 100 && !fs.existsSync(running); i++) await Bun.sleep(5);
    expect(fs.existsSync(state)).toBe(false);
    expect(fs.existsSync(running)).toBe(true);
    expect(log()).toEndWith('dispatch hl.dsp.dpms({ action = "enable" })\nstart\n');
    expect(await run("resume")).toBe(0);
    expect(log()).toEndWith('dispatch hl.dsp.dpms({ action = "enable" })\n');

    // Don't enable a daemon that was already disabled before the shortcut.
    fs.rmSync(running);
    fs.writeFileSync(calls, "");
    expect(await run("toggle")).toBe(0);
    expect(await run("toggle")).toBe(0);
    expect(log()).not.toMatch(/stop|start/);

    // A failed power-off restores normal idle; failed power-on remains retryable.
    fs.writeFileSync(running, "");
    expect(await run("toggle", { TEST_DPMS_FAIL: "1" })).toBe(1);
    for (let i = 0; i < 100 && !fs.existsSync(running); i++) await Bun.sleep(5);
    expect(fs.existsSync(state)).toBe(false);
    expect(fs.existsSync(running)).toBe(true);
    expect(await run("toggle")).toBe(0);
    expect(await run("toggle", { TEST_DPMS_FAIL: "1" })).toBe(1);
    expect(fs.existsSync(state)).toBe(true);
    expect(fs.existsSync(running)).toBe(false);
    expect(await run("toggle")).toBe(0);
    for (let i = 0; i < 100 && !fs.existsSync(running); i++) await Bun.sleep(5);
    expect(fs.existsSync(running)).toBe(true);
    expect(await run("invalid")).toBe(2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
