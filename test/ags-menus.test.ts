import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { filterItems, moveSelection, projectName, focusWindowArgs, confirmPower, powerArgs, POWER_ACTIONS, POWER_LABELS, cycleAssignment, savedConnections } from "../ags/menu-model";

describe("AGS menu model", () => {
  test("search matches all words across title and detail without interpreting markup", () => {
    const items = [{ title: "Terminal", detail: "Alacritty" }, { title: "<Firefox>", detail: "Web browser" }];
    expect(filterItems(items, " WEB  fire ")).toEqual([items[1]!]);
    expect(filterItems(items, "")).toEqual(items);
  });
  test("selection wraps and empty lists have no selection", () => {
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });
  test("projects must be single safe directory names", () => {
    for (const name of ["", ".", "..", "../escape", "/tmp/x", "x/y", "x\0y", "-option", "x\ny"]) expect(() => projectName(name)).toThrow();
    expect(projectName("my project;literal")).toBe("my project;literal");
  });
  test("window focus only accepts hex addresses and uses argument arrays", () => {
    expect(focusWindowArgs("0x123AbC")).toEqual(["hyprctl", "eval", 'local r = hl.dispatch(hl.dsp.focus({ window = "address:0x123AbC" })); if r and not r.ok then error(r.message or "Focus failed") end']);
    for (const address of ["", "0x", "123", "0x123; exit", "0x12\n"]) expect(() => focusWindowArgs(address)).toThrow();
  });
  test("destructive power actions require a repeated explicit choice", () => {
    expect(confirmPower(null, "shutdown")).toEqual({ pending: "shutdown", execute: false });
    expect(confirmPower("shutdown", "reboot")).toEqual({ pending: "reboot", execute: false });
    expect(confirmPower("shutdown", "shutdown")).toEqual({ pending: null, execute: true });
    expect(confirmPower(null, "suspend")).toEqual({ pending: null, execute: true });
    expect(confirmPower(null, "logout")).toEqual({ pending: "logout", execute: false });
    expect(confirmPower("logout", "logout")).toEqual({ pending: null, execute: true });
    expect(powerArgs("logout")).toEqual(["hyprctl", "eval", "hl.dispatch(hl.dsp.exit())"]);
  });
  test("power menus share Lock and Log out, and locking needs no confirmation", () => {
    expect(POWER_ACTIONS).toEqual(["lock", "suspend", "logout", "reboot", "shutdown"]);
    expect(POWER_LABELS.lock).toBe("Lock");
    expect(POWER_LABELS.logout).toBe("Log out");
    expect(confirmPower(null, "lock")).toEqual({ pending: null, execute: true });
    expect(confirmPower("shutdown", "lock")).toEqual({ pending: null, execute: true });
    expect(powerArgs("lock")).toEqual(["bash", "-c", 'exec bash "${XDG_CONFIG_HOME:-$HOME/.config}/hypr/hyprlock.sh"']);
  });
  test("Lock resolves the config path safely, including spaces and shell characters (mock locker only)", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-menu-lock-"));
    try {
      for (const configHome of ["", path.join(home, "config with spaces; literal")]) {
        const config = configHome || path.join(home, ".config");
        fs.mkdirSync(path.join(config, "hypr"), { recursive: true });
        fs.writeFileSync(path.join(config, "hypr/hyprlock.sh"), 'printf "mock lock invoked"');
        const proc = Bun.spawn(powerArgs("lock"), { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: configHome }, stdout: "pipe", stderr: "pipe" });
        expect(await new Response(proc.stdout).text()).toBe("mock lock invoked");
        expect(await proc.exited).toBe(0);
      }
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
  test("monitor cycling includes Automatic and tolerates unplugged assignments", () => {
    expect(cycleAssignment(null, ["DP-1"], 1)).toBe("DP-1");
    expect(cycleAssignment("DP-1", ["DP-1"], 1)).toBe(null);
    expect(cycleAssignment("missing", ["DP-1"], -1)).toBe("DP-1");
  });
  test("saved connections parse escaped nmcli names without treating names as commands", () => {
    expect(savedConnections("abc:Home\\: wifi:802-11-wireless\ndef:Ethernet:802-3-ethernet\n")).toEqual([
      { uuid: "abc", name: "Home: wifi", type: "802-11-wireless" },
      { uuid: "def", name: "Ethernet", type: "802-3-ethernet" },
    ]);
  });
});
