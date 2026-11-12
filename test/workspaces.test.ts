import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { allocation, DEFAULT_PREFERENCES, floatingGeometry, lua, modeOf, validatePreferences, WORKSPACES, type Client, type Monitor } from "../scripts/workspace-model";
import { Manager } from "../scripts/workspace-manager";

const monitor = (name: string, id = 0): Monitor => ({ name, id, x: id * 1920, y: 0, width: 1920, height: 1080, scale: 1, reserved: [0, 46, 0, 0], activeWorkspace: { name: id ? "1" : "S" } });
const client = (address = "0x123", floating = false, tags: string[] = []): Client => ({ address, stableId: address, pid: 123, floating, tags, monitor: 0, workspace: { name: "1" }, at: [100, 120], size: [800, 600] });
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true }); });
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-workspaces-")); dirs.push(dir);
  const snapshot = { monitors: [monitor("eDP-1"), monitor("DP-1", 1), monitor("HDMI-A-1", 2)], clients: [] as Client[], workspaces: WORKSPACES.map(name => ({ name, monitor: "eDP-1" })) };
  const calls: string[][] = [];
  const io = async (...args: string[]) => {
    calls.push(args);
    if (args[0] === "eval") return "ok";
    return JSON.stringify(args[1] === "activeworkspace" ? { name: "1" } : args[1] === "activewindow" ? snapshot.clients[0] ?? {} : snapshot[args[1] as keyof typeof snapshot]);
  };
  const manager = new Manager(io, path.join(dir, "preferences.json"), dir, "deisslaptop");
  const script = () => calls.filter(c => c[0] === "eval").map(c => c[1]).join("\n");
  return { manager, snapshot, calls, script, dir };
}

describe("workspace allocation", () => {
  test("host-aware primary, named workspaces on primary, evenly split numbers", () => {
    const monitors = [monitor("eDP-1"), monitor("DP-1", 1), monitor("HDMI-A-1", 2)];
    const laptop = allocation(monitors, DEFAULT_PREFERENCES, "deisslaptop.example");
    expect(laptop.primary).toBe("eDP-1");
    for (const n of ["S", "G", "R", "N"]) expect(laptop.placements[n]).toBe("eDP-1");
    expect(Object.values(laptop.placements).filter(n => n === "DP-1")).toHaveLength(5);
    expect(Object.values(laptop.placements).filter(n => n === "HDMI-A-1")).toHaveLength(4);
    expect(allocation(monitors, DEFAULT_PREFERENCES, "kotoko").primary).toBe("DP-1");
  });
  test("single-monitor fallback, saved choices and reconnection", () => {
    const prefs = { version: 1 as const, primary: "DP-1", assignments: { S: "HDMI-A-1", "1": "HDMI-A-1" } };
    expect(new Set(Object.values(allocation([monitor("eDP-1")], prefs, "deisslaptop").placements))).toEqual(new Set(["eDP-1"]));
    const restored = allocation([monitor("DP-1"), monitor("HDMI-A-1", 1)], prefs, "deisslaptop");
    expect(restored.primary).toBe("DP-1"); expect(restored.placements.S).toBe("HDMI-A-1"); expect(restored.placements[1]).toBe("HDMI-A-1");
    expect(prefs.assignments.S).toBe("HDMI-A-1");
  });
  test("numeric modes reset by default and named workspaces cannot float", () => {
    expect(modeOf("1", {})).toBe("floating");
    expect(modeOf("1", { "1": "tiling" })).toBe("tiling");
    for (const n of ["S", "G", "R", "N"]) expect(modeOf(n, { [n]: "floating" })).toBe("tiling");
  });
  test("invalid preference files fail instead of overwriting state", () => {
    expect(() => validatePreferences({})).toThrow();
    expect(() => validatePreferences({ version: 1, primary: null, assignments: { X: "DP-1" } })).toThrow();
    expect(() => validatePreferences({ version: 1, primary: 'DP-1";evil', assignments: {} })).toThrow();
  });
});

describe("workspace controller", () => {
  test("startup launches desktop applications once per session, silently on letter workspaces", async () => {
    const { manager, snapshot, calls, script } = setup();
    manager.which = () => "/usr/bin/mock-app";
    manager.notify = () => {};
    await manager.command("startup");
    expect(script().match(/hl\.exec_cmd\(/g)).toHaveLength(5);
    expect(script()).toContain('"hermes desktop"');
    expect(script()).toContain('["workspace"]="name:G silent"');
    expect(script()).toContain('["no_initial_focus"]=true');
    expect(manager.session.startup?.pending).toBe(true);
    calls.length = 0;
    await manager.command("startup");
    expect(script()).toBe("");
    const herdr = { ...client(), class: "herdr-app", workspace: { name: "S" } };
    snapshot.clients = [herdr];
    await manager.refresh();
    expect(script()).toContain('focus({["workspace"]="name:S"})');
    expect(script()).toContain('focus({["window"]="address:0x123"})');
    expect(manager.session.startup?.pending).toBe(false);
  });
  test("missing required launcher blocks startup before marking the session started", async () => {
    const { manager, script } = setup();
    manager.which = name => name === "hermes" ? null : "/usr/bin/mock-app";
    manager.notify = () => {};
    await expect(manager.command("startup")).rejects.toThrow("hermes desktop");
    expect(manager.session.startup).toBeUndefined();
    expect(script()).toBe("");
  });
  test("tiling-only letter workspaces ignore mode toggles", async () => {
    const { manager, script } = setup();
    for (const name of ["S", "G", "R", "N"]) await manager.command("toggle", [name]);
    expect(manager.session.modes).toEqual({});
    expect(script()).toBe("");
  });
  test("default floating is tagged, while native popups and rule-floated windows are exempt", async () => {
    const { manager, snapshot, script } = setup();
    snapshot.clients = [client(), client("0x456", true), client("0x789", true, ["sysdef-explicit-float"])];
    await manager.reconcile(snapshot);
    expect(script()).toContain('+sysdef-mode-float'); expect(script()).toContain('["action"]="enable"');
    expect(script()).not.toContain("address:0x456"); expect(script()).not.toContain("address:0x789");
    expect(manager.session.windows["0x456"].exempt).toBe(true);
  });
  test("whole-workspace toggle preserves exemptions and restores geometry", async () => {
    const { manager, snapshot, calls, script } = setup();
    snapshot.clients = [client("0x123", true, ["sysdef-mode-float"]), client("0x456", true)];
    await manager.command("toggle");
    expect(modeOf("1", manager.session.modes)).toBe("tiling");
    expect(script()).toContain('["action"]="disable"'); expect(script()).not.toContain("address:0x456");
    expect(manager.session.windows["0x123"].geometry).toEqual({ x: 100, y: 120, width: 800, height: 600 });
    snapshot.clients[0].floating = false; snapshot.clients[0].tags = []; calls.length = 0;
    await manager.command("toggle");
    expect(modeOf("1", manager.session.modes)).toBe("floating");
    expect(script()).toContain('["x"]=800'); expect(script()).toContain('["y"]=600');
    expect(script()).toContain('["x"]=100'); expect(script()).toContain('["y"]=120');
  });
  test("new windows in tiled mode stay tiled; windows moved out of floating mode adopt target", async () => {
    const { manager, snapshot, script } = setup();
    manager.session.modes["1"] = "tiling";
    snapshot.clients = [client()]; await manager.reconcile(snapshot);
    expect(script()).toBe("");
    snapshot.clients[0].workspace.name = "2"; await manager.reconcile(snapshot);
    expect(script()).toContain('["action"]="enable"');
    snapshot.clients[0].floating = true; snapshot.clients[0].tags = ["sysdef-mode-float"];
    snapshot.clients[0].workspace.name = "S"; await manager.reconcile(snapshot);
    expect(script()).toContain('["action"]="disable"');
  });
  test("manual floating claims a default-floated window and survives workspace toggle", async () => {
    const { manager, snapshot, calls, script } = setup();
    snapshot.clients = [client("0x123", true, ["sysdef-mode-float"])];
    await manager.reconcile(snapshot); await manager.command("manual-float");
    expect(script()).toContain("+sysdef-explicit-float");
    snapshot.clients[0].tags = ["sysdef-explicit-float"]; calls.length = 0;
    await manager.command("toggle");
    expect(script()).not.toContain("window.float");
  });
  test("address reuse does not inherit an old window's exemption or geometry", async () => {
    const { manager, snapshot, script } = setup();
    snapshot.clients = [client("0x123", true)]; await manager.reconcile(snapshot);
    snapshot.clients = [{ ...client(), pid: 456, stableId: "new" }]; await manager.reconcile(snapshot);
    expect(manager.session.windows["0x123"].exempt).toBe(false);
    expect(script()).toContain('+sysdef-mode-float');
  });
  test("manual assignments persist, Automatic clears them, and invalid targets cannot overwrite preferences", async () => {
    const { manager, dir } = setup();
    await manager.command("assign", ["S", "DP-1"]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "preferences.json"), "utf8")).assignments.S).toBe("DP-1");
    await manager.command("assign", ["S", "auto"]);
    expect(manager.preferences.assignments.S).toBeUndefined();
    await expect(manager.command("assign", ["S", "missing"])).rejects.toThrow();
    expect(manager.preferences.assignments.S).toBeUndefined();
  });
  test("primary change keeps numeric locations while moving automatic letter workspaces", async () => {
    const { manager, snapshot, script } = setup();
    manager.preferences.assignments.R = "HDMI-A-1";
    snapshot.workspaces.find(w => w.name === "R")!.monitor = "HDMI-A-1";
    await manager.command("primary", ["DP-1"]);
    expect(manager.session.temporary["1"]).toBe("eDP-1");
    expect(script()).toContain('["workspace"]="name:S",["monitor"]="DP-1"');
    expect(script()).not.toContain('workspace.move({["workspace"]="1"');
    expect(manager.preferences.assignments.R).toBe("HDMI-A-1");
  });
  test("temporary keyboard placement survives ordinary refresh without saving preferences", async () => {
    const { manager, snapshot, calls } = setup();
    manager.initial = false;
    manager.topology = snapshot.monitors.map(m => `${m.name}:${m.x}:${m.y}:${m.width}:${m.height}:${m.scale}`).sort().join("|");
    manager.previousPlacements["1"] = "DP-1";
    await manager.refresh();
    expect(manager.session.temporary["1"]).toBe("eDP-1");
    expect(manager.preferences.assignments["1"]).toBeUndefined();
    expect(calls.filter(c => c[0] === "eval")).toHaveLength(0);
  });
  test("failed reconciliation retries untouched windows rather than committing stale memory", async () => {
    const { manager, snapshot, script } = setup();
    snapshot.clients = [client()];
    const original = manager.io;
    let fail = true;
    manager.io = async (...args) => { if (args[0] === "eval" && fail) throw new Error("window disappeared"); return original(...args); };
    await expect(manager.reconcile(snapshot)).rejects.toThrow("window disappeared");
    expect(manager.session.windows["0x123"]).toBeUndefined();
    fail = false;
    await manager.reconcile(snapshot);
    expect(script()).toContain("+sysdef-mode-float");
    expect(script()).toContain('if hl.get_window("address:0x123")');
  });
  test("disconnected explicit numeric assignment survives primary change and reconnect", async () => {
    const { manager, snapshot, calls, script } = setup();
    manager.preferences.assignments["1"] = "HDMI-A-1";
    snapshot.monitors = snapshot.monitors.filter(m => m.name !== "HDMI-A-1");
    await manager.command("primary", ["DP-1"]);
    expect(manager.session.temporary["1"]).toBeUndefined();
    snapshot.monitors.push(monitor("HDMI-A-1", 2)); calls.length = 0;
    await manager.applyPlacement(snapshot, "topology");
    expect(script()).toContain('workspace.move({["workspace"]="1",["monitor"]="HDMI-A-1"})');
  });
  test("assignment commands capture a temporary move before overwriting expected placement", async () => {
    const { manager, snapshot, calls, script } = setup();
    manager.previousPlacements["1"] = "DP-1";
    await manager.command("assign", ["S", "DP-1"]);
    expect(manager.session.temporary["1"]).toBe("eDP-1");
    calls.length = 0;
    await manager.applyPlacement(snapshot, "topology");
    expect(script()).not.toContain('workspace.move({["workspace"]="1",["monitor"]="DP-1"})');
  });
  test("publishes UI-neutral workspace state, ordered keys, icons and actual locations", async () => {
    const { manager, snapshot, dir } = setup();
    snapshot.clients = [client()];
    await manager.writeDesktop(snapshot);
    const filename = path.join(dir, "desktop.json");
    const status = JSON.parse(fs.readFileSync(filename, "utf8"));
    expect(status.version).toBe(1);
    expect(status.workspaces.map((w: {name: string}) => w.name)).toEqual(WORKSPACES);
    expect(status.workspaces.find((w: {name: string}) => w.name === "N")).toMatchObject({ icon: "󰠮", mode: "tiling", monitor: "eDP-1", occupied: false });
    expect(status.workspaces.find((w: {name: string}) => w.name === "1")).toMatchObject({ mode: "floating", occupied: true });
    expect(status.workspaces[0].active).toBe(true);
    expect(status.clients[0].address).toBe("0x123");
    expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
    const before = fs.statSync(filename).ino;
    await manager.writeDesktop(snapshot);
    expect(fs.statSync(filename).ino).toBe(before);
    snapshot.workspaces[0].monitor = "DP-1";
    await manager.writeDesktop(snapshot);
    expect(JSON.parse(fs.readFileSync(filename, "utf8")).workspaces[0].monitor).toBe("DP-1");
    expect(fs.existsSync(path.join(dir, "waybar.json"))).toBe(false);
  });
});

test("restored geometry clamps to usable monitor area, accounting for scale and rotation", () => {
  const m = { ...monitor("small"), width: 800, height: 600, scale: 1 };
  const geo = floatingGeometry(m, { x: 9000, y: -500, width: 1200, height: 1000 });
  expect(geo.width).toBeLessThan(800); expect(geo.height).toBeLessThan(554);
  expect(geo.y).toBeGreaterThanOrEqual(46); expect(geo.x + geo.width).toBeLessThanOrEqual(800);
  const rotated = floatingGeometry({ ...m, transform: 1 });
  expect(rotated.width).toBeLessThan(600);
});
test("Lua encoding keeps code-looking strings as literal values", () => {
  expect(lua('a"\\\n')).toBe('"a\\"\\\\\\n"');
  expect(lua({ window: "address:0x123", action: "enable" })).toBe('{["window"]="address:0x123",["action"]="enable"}');
});
