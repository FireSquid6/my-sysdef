import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../mods/tty-tabs/quick-terminal.js", import.meta.url), "utf8");

function setup(customExec, machineNames = ["remote"]) {
  const state = new Map(), calls = [], overlays = [], closed = [], errors = [], tasks = [];
  let focus = { terminal: "core-terminal" }, sequence = 0;
  const dependencies = {
    home: () => "/home/test", machines: () => [{ name: null }, ...machineNames.map(name => ({ name }))], focused: () => focus,
    shared: key => state.get(key), setShared: (key, value) => state.set(key, value),
    exec: async (command, args) => {
      calls.push([command, args]);
      if (command === "sh" && args[1] === "hostname") return { code: 0, stdout: "deisslaptop\n" };
      if (customExec) return customExec(command, args);
      return { code: 0, stdout: JSON.stringify(args[0] === "get" ? { state: "live" } : { address: args.includes("--on") ? "remote/t2" : "t1" }) };
    },
    run: (command, args) => calls.push([command, args]), notify: error => errors.push(error),
    openOverlay: spec => { overlays.push(spec); return `overlay-${++sequence}`; }, closeOverlay: id => closed.push(id),
  };
  const Quick = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export class", "return class"))(...Object.values(dependencies));
  const controller = new Quick();
  const cx = { notify() {}, spawn(fn) { tasks.push(fn(cx)); } };
  const settle = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  return { controller, cx, settle, state, calls, overlays, closed, errors, focus: terminal => { focus = { terminal }; } };
}

test("Alt+S creates the user's default shell in home; hiding and reopening reuses it", async () => {
  const s = setup(); s.controller.toggle(s.cx); await s.settle();
  const launch = s.calls.find(([, args]) => args[0] === "run")[1];
  assert.equal(launch[launch.indexOf("--cwd") + 1], "/home/test");
  assert.equal(launch.at(-1), "/home/test");
  assert.equal(launch.includes("--"), false); assert.equal(launch.includes("--on"), false);
  assert.equal(s.overlays[0].frame, "none");
  assert.equal(s.overlays[0].kind, "dialog");
  s.controller.toggle(s.cx); assert.deepEqual(s.closed, ["overlay-1"]);
  s.controller.toggle(s.cx); await s.settle();
  assert.equal(s.calls.filter(([, args]) => args[0] === "run").length, 1);
  assert.equal(s.overlays.length, 2);
});

test("Ctrl+Tab switches machines, using remote home, then reuses local shell", async () => {
  const s = setup(); s.controller.toggle(s.cx); await s.settle();
  s.controller.cycle(s.cx); await s.settle();
  const launch = s.calls.filter(([, args]) => args[0] === "run")[1][1];
  assert.equal(launch[launch.indexOf("--on") + 1], "remote"); assert.equal(launch.includes("--cwd"), false);
  assert.equal(launch.at(-1), "remote"); assert.equal(launch.includes("--"), false);
  assert.equal(s.state.get("quick.window").machine, "remote");
  s.focus("remote/t2"); s.controller.cycle(s.cx); await s.settle();
  assert.equal(s.state.get("quick.window").terminal, "t1");
  assert.equal(s.calls.filter(([, args]) => args[0] === "run").length, 2);
});

test("scratchpad border follows the selected machine through a full Ctrl+Tab cycle", async () => {
  const s = setup(undefined, ["minibox-one", "desktop", "unknown"]);
  s.controller.toggle(s.cx); await s.settle();
  assert.equal(s.overlays.at(-1).layout.border.color, "#bb9af7");
  for (const color of ["#9ece6a", "#f7768e", "accent", "#bb9af7"]) {
    s.controller.cycle(s.cx); await s.settle();
    assert.equal(s.overlays.at(-1).layout.border.color, color);
  }
});

test("outside popup Ctrl+Tab is forwarded to the focused terminal", async () => {
  const s = setup(); s.controller.cycle(s.cx); await s.settle();
  assert.deepEqual(s.calls, [["hc", ["keys", "core-terminal", "ctrl+tab"]]]);
});

test("Alt+S cancels a pending opening without killing the shell", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const s = setup(() => pending);
  s.controller.toggle(s.cx); s.controller.toggle(s.cx);
  release({ code: 0, stdout: '{"address":"t1"}' }); await s.settle();
  assert.equal(s.overlays.length, 0); assert.equal(s.state.get("quick.terminals")[""], "t1");
});
test("returning to core terminal cancels a pending launch", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const s = setup(() => pending);
  s.controller.toggle(s.cx); s.controller.hide();
  release({ code: 0, stdout: '{"address":"t1"}' }); await s.settle();
  assert.equal(s.overlays.length, 0);
});
test("dismissing a popup cancels a pending machine switch", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const s = setup((_command, args) => args.includes("--on") ? pending : { code: 0, stdout: '{"address":"t1"}' });
  s.controller.toggle(s.cx); await s.settle();
  s.controller.cycle(s.cx);
  s.state.set("quick.window", null); // The header's close hook after click-outside.
  release({ code: 0, stdout: '{"address":"remote/t2"}' }); await s.settle();
  assert.equal(s.overlays.length, 1); assert.equal(s.state.get("quick.window"), null);
});

test("failed remote switching preserves the open local popup", async () => {
  const s = setup((_command, args) => args.includes("--on")
    ? { code: 1, stderr: "offline" } : { code: 0, stdout: '{"address":"t1"}' });
  s.controller.toggle(s.cx); await s.settle(); s.focus("t1");
  s.controller.cycle(s.cx); await s.settle();
  assert.equal(s.state.get("quick.window").terminal, "t1"); assert.equal(s.errors.length, 1);
});
