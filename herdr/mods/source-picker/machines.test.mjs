import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { launchProject } from "./project-launch.js";
const source = await readFile(new URL("./main.js", import.meta.url), "utf8");
import { parsePath, matchingDirectories } from "./paths.js";
const helpers = { parsePath, matchingDirectories };

function setup(overrides = {}) {
  const tasks = [];
  const cx = { notify() {}, focus_handle() { return {}; }, timer: { after() {} }, spawn(fn) { tasks.push(fn(cx)); } };
  const dependencies = {
    launchProject, reportContext() {}, View: class {}, ...helpers, home: () => "/home/local", spaces: () => [], machines: () => [{ name: null }, { name: "remote" }],
    ScrollHandle: { new: () => ({ scroll_to_item() {} }) },
    InputState: { new: options => ({ text: options.value, on() {}, focus() {}, value() { return this.text; }, set_value(value) { this.text = value; } }) },
    readdir: async () => [{ name: "local-project", isDirectory: () => true }],
    exec: async (_cmd, args) => ({ code: 0, stdout: args[1].includes("$HOME") ? "/srv/remote-home" : "remote-project\0" }),
    run() {}, props: () => ({ overlay: "source-picker" }), closeOverlay() {}, ...overrides,
    nextCommand: () => new Promise(() => {}),
  };
  const Picker = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(dependencies));
  const view = new Picker();
  // Command listeners intentionally never finish; mocked IO settles by next tick.
  const settle = async () => { await new Promise(setImmediate); };
  return { view, cx, settle, tasks };
}

test("project picker border follows Ctrl+Tab machines, including the local hostname", async () => {
  const { view, cx, settle } = setup({
    machines: () => [{ name: null }, { name: "minibox-one" }, { name: "desktop" }, { name: "unknown" }],
    exec: async (_cmd, args) => ({ code: 0, stdout: args[1] === "hostname" ? "deisslaptop.example.net\n" : args[1].includes("$HOME") ? "/srv/home" : "project\0" }),
  });
  view.init({}, cx); await settle();
  assert.equal(view.machineColor("border"), "#bb9af7");
  for (const color of ["#9ece6a", "#f7768e", "border", "#bb9af7"]) {
    view.cycleMachine(cx); await settle();
    assert.equal(view.machineColor("border"), color);
  }
  assert.ok(source.includes("border_color(this.machineColor(t.border))"));
});

test("defaults to current space's machine and resolves that machine's ~/source", async () => {
  const { view, cx, settle } = setup({ spaces: () => [{ active: true, machine: "remote" }] });
  view.init({}, cx); await settle();
  assert.equal(view.machine, "remote");
  assert.equal(view.folder, "/srv/remote-home/source");
  assert.deepEqual(view.rows(), ["remote-project"]);
});

test("cycling resets path, excludes temporary machines, and wraps back to local", async () => {
  const { view, cx, settle } = setup({ machines: () => [{ name: null }, { name: "remote" }, { name: "sandbox", temporary: true }] });
  view.init({}, cx); await settle();
  view.input.set_value("~/Documents/");
  view.cycleMachine(cx); await settle();
  assert.equal(view.machine, "remote"); assert.equal(view.input.value(), "~/source/");
  assert.equal(view.folder, "/srv/remote-home/source");
  view.cycleMachine(cx); await settle();
  assert.equal(view.machine, ""); assert.equal(view.folder, "/home/local/source");
  assert.deepEqual(view.rows(), ["local-project"]);
});

for (const machine of ["", "remote"]) test(`${machine || "local"} project opens agent, editor, and two blank terminals`, async () => {
  const calls = [], selections = [], closed = [];
  const { view, cx, settle } = setup({
    run: (...args) => selections.push(args), closeOverlay: id => closed.push(id),
    exec: async (command, args) => {
    assert.equal(command, "herdr-app");
    calls.push([args[1], JSON.parse(args[2])]);
    return { code: 0, stdout: JSON.stringify({ space: "remote/sp1", tab: "remote/tb1" }) };
  } });
  Object.assign(view, { machine, folder: "/srv/user/source", loading: false, pathError: false });
  view.open("project", cx); await settle();
  assert.equal(calls.length, 4);
  assert.deepEqual(selections, [["tab.select", { id: "remote/tb1" }]]);
  assert.deepEqual(closed, ["source-picker"]);
  assert.equal(calls[0][1].machine, machine);
  assert.equal(calls[0][1].tab, "agent");
  assert.deepEqual(calls.map(([, args]) => args.name), ["project", "editor", "term1", "term2"]);
  const shell = machine ? "fish" : "/usr/bin/fish";
  assert.deepEqual(calls.map(([, args]) => args.argv), [["pi"], ["nvim"], [shell], [shell]]);
  for (const [, args] of calls) assert.equal(args.folder, "/srv/user/source/project");
  for (const [, args] of calls.slice(1)) assert.equal(args.space, "remote/sp1");
});

test("picker delegates project setup to the shared launcher", async () => {
  const calls = [];
  const { view, cx, settle } = setup({ launchProject: async (...args) => calls.push(args) });
  Object.assign(view, { machine: "remote", folder: "/srv/source", loading: false });
  view.open("project", cx); await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], { name: "project", folder: "/srv/source/project", machine: "remote", agentArgv: ["pi"] });
  assert.equal(typeof calls[0][1].exec, "function");
  assert.equal(typeof calls[0][1].selectTab, "function");
});

test("picker leaves overlay open and reports retained resources when shared launch fails", async () => {
  const { view, cx, settle } = setup({
    launchProject: async () => { throw new Error("Space remote/sp1 retained; term1 failed: offline"); },
    run() { assert.fail("must not select on failure"); },
    closeOverlay() { assert.fail("must not close on failure"); },
  });
  view.init({}, cx); await settle();
  view.open("local-project", cx); await settle();
  assert.equal(view.opening, false);
  assert.match(view.error, /remote\/sp1 retained; term1 failed: offline/);
});

test("a slow previous machine cannot overwrite the newly selected machine", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { view, cx, settle } = setup({ spaces: () => [{ active: true, machine: "remote" }], exec: () => pending });
  view.init({}, cx);
  view.cycleMachine(cx);
  release({ code: 0, stdout: "/remote/home" });
  await settle();
  assert.equal(view.machine, ""); assert.equal(view.folder, "/home/local/source");
  assert.deepEqual(view.rows(), ["local-project"]);
});
