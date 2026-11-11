import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../mods/tty-agents/main.js", import.meta.url), "utf8");
const keys = JSON.parse(await readFile(new URL("../keys.json", import.meta.url), "utf8"));

function setup() {
  const calls = [], tasks = [];
  let command;
  const deps = {
    View: class {}, props: () => ({}),
    run: (...args) => calls.push(args),
    localStorage: { getItem: () => null, removeItem() {} },
    nextCommand: () => command ? Promise.resolve(command).then(value => { command = null; return value; }) : new Promise(() => {}),
  };
  const Agents = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const view = new Agents();
  const cx = { timer: { every() {} }, spawn(fn) { tasks.push(fn(cx)); } };
  return { view, calls, cx, send(value) { command = value; } };
}

test("focuses the first working agent in menu order, not the first idle agent", () => {
  const s = setup();
  s.view.navigationAgents = [
    { address: "idle", status: "idle" },
    { address: "minibox-one/t2", status: "working" },
    { address: "t3", status: "working" },
  ];
  s.view.focusWorking();
  assert.deepEqual(s.calls, [["agent.focus", { terminal: "minibox-one/t2" }]]);
});

test("falls back to the first menu agent when none are working", () => {
  const s = setup();
  s.view.navigationAgents = [{ address: "pinned", status: "done" }, { address: "blocked", status: "blocked" }];
  s.view.focusWorking();
  assert.deepEqual(s.calls, [["agent.focus", { terminal: "pinned" }]]);
});

test("does nothing for an empty or not-yet-rendered menu", () => {
  const s = setup(); s.view.focusWorking();
  s.view.navigationAgents = []; s.view.focusWorking();
  assert.deepEqual(s.calls, []);
});

test("Alt+Shift+A command reaches the menu's focus handler", async () => {
  const s = setup();
  assert.equal(keys.global["alt-shift-a"], "tty-agents.focus-working");
  assert.ok(source.includes("this.navigationAgents = list;"));
  s.view.navigationAgents = [{ address: "t1", status: "working" }];
  s.send("focus-working"); s.view.init({}, s.cx);
  await new Promise(setImmediate);
  assert.deepEqual(s.calls, [["agent.focus", { terminal: "t1" }]]);
});
