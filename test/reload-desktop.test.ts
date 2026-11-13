import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

let dir: string, bin: string, script: string, log: string, state: string;
const executable = (file: string, content: string) => { fs.writeFileSync(file, `#!/usr/bin/env bash\nset -eu\n${content}\n`, { mode: 0o755 }); };
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "reload-desktop-"));
  bin = path.join(dir, "bin"); log = path.join(dir, "commands"); state = path.join(dir, "instances");
  fs.mkdirSync(bin); fs.mkdirSync(path.join(dir, "scripts")); fs.mkdirSync(path.join(dir, "ags")); fs.mkdirSync(path.join(dir, "run"));
  script = path.join(dir, "scripts/reload-desktop.sh");
  fs.copyFileSync(path.resolve("scripts/reload-desktop.sh"), script);
  fs.writeFileSync(state, "unrelated\nsysdef\n");
  executable(path.join(bin, "hyprctl"), 'printf "hyprctl %s\\n" "$*" >> "$MOCK_LOG"; exit "${MOCK_HYPR_EXIT:-0}"');
  executable(path.join(bin, "ags"), `
case "$1" in
  list) /usr/bin/cat "$MOCK_STATE" ;;
  quit)
    printf 'ags %s\\n' "$*" >> "$MOCK_LOG"
    if [[ "\${MOCK_QUIT_FAIL:-0}" == 1 ]]; then exit 1; fi
    if [[ "\${MOCK_STUCK:-0}" != 1 ]]; then
      grep -Fxv -- "$3" "$MOCK_STATE" > "$MOCK_STATE.next" || true
      mv "$MOCK_STATE.next" "$MOCK_STATE"
    fi ;;
  *) exit 2 ;;
esac`);
  // All real desktop actions are mocked. Keep actual flock to check that the
  // reload script released the startup lock before invoking the helper.
  for (const tool of ["bun", "gjs", "setsid", "pamixer", "nmcli", "sleep"]) executable(path.join(bin, tool), "exit 0");
  executable(path.join(dir, "ags/start.sh"), `
flock -n "$XDG_RUNTIME_DIR/sysdef-ags-start.lock" -c true
printf 'start %s\\n' "\${SYSDEF_AGS_INSTANCE:-sysdef}" >> "$MOCK_LOG"
exit "\${MOCK_START_EXIT:-0}"`);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
function run(extra: Record<string, string> = {}) {
  return spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, XDG_RUNTIME_DIR: path.join(dir, "run"),
    HYPRLAND_INSTANCE_SIGNATURE: "test", WAYLAND_DISPLAY: "test", SYSDEF_AGS_INSTANCE: "", MOCK_LOG: log, MOCK_STATE: state, ...extra } });
}
const commands = () => fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];

test("reloads Hyprland then restarts only sysdef via the existing startup helper", () => {
  const result = run();
  expect(result.status).toBe(0);
  expect(commands()).toEqual(["hyprctl reload", "ags quit --instance sysdef", "start sysdef"]);
  expect(fs.readFileSync(state, "utf8")).toBe("unrelated\n");
  expect(result.stdout).toContain("is ready");
});
test("honors a custom AGS instance", () => {
  fs.writeFileSync(state, "sysdef\ncustom\n");
  expect(run({ SYSDEF_AGS_INSTANCE: "custom" }).status).toBe(0);
  expect(commands()).toEqual(["hyprctl reload", "ags quit --instance custom", "start custom"]);
  expect(fs.readFileSync(state, "utf8")).toBe("sysdef\n");
});
test("starts AGS when the selected instance was not running", () => {
  fs.writeFileSync(state, "unrelated\n");
  expect(run().status).toBe(0);
  expect(commands()).toEqual(["hyprctl reload", "start sysdef"]);
});
test("a failed Hyprland reload leaves AGS alone", () => {
  expect(run({ MOCK_HYPR_EXIT: "1" }).status).not.toBe(0);
  expect(commands()).toEqual(["hyprctl reload"]);
});
test("quit failure or an instance that never exits is not reported as a successful restart", () => {
  expect(run({ MOCK_QUIT_FAIL: "1" }).status).not.toBe(0);
  expect(commands()).not.toContain("start sysdef");
  const result = run({ MOCK_STUCK: "1" });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("did not exit");
  expect(commands()).not.toContain("start sysdef");
});
test("startup failure is propagated without a success message", () => {
  const result = run({ MOCK_START_EXIT: "1" });
  expect(result.status).not.toBe(0);
  expect(result.stdout).not.toContain("is ready");
});
test("fails outside the desktop session before invoking desktop commands", () => {
  expect(run({ HYPRLAND_INSTANCE_SIGNATURE: "" }).status).not.toBe(0);
  expect(commands()).toEqual([]);
});
