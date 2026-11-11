import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("./main.js", import.meta.url), "utf8");
const paths = await readFile(new URL("./paths.js", import.meta.url), "utf8");
const helpers = await import("data:text/javascript," + encodeURIComponent(paths));

function setup(overrides = {}) {
  const tasks = [];
  const cx = { notify() {}, focus_handle() { return {}; }, timer: { after() {} }, spawn(fn) { tasks.push(fn(cx)); } };
  const dependencies = {
    reportContext() {}, View: class {}, ...helpers, home: () => "/home/local", spaces: () => [], machines: () => [{ name: null }, { name: "remote" }],
    ScrollHandle: { new: () => ({ scroll_to_item() {} }) },
    InputState: { new: options => ({ text: options.value, handlers: {}, on(event, fn) { this.handlers[event] = fn; }, focus() {}, value() { return this.text; }, set_value(value) { this.text = value; } }) },
    readdir: async () => [{ name: "local-project", isDirectory: () => true }],
    exec: async (_cmd, args) => ({ code: 0, stdout: args[1].includes("$HOME") ? "/srv/remote-home" : "remote-project\0" }),
    run() {}, props: () => ({ overlay: "source-picker" }), closeOverlay() {},
    nextCommand: () => new Promise(() => {}), ...overrides,
  };
  const Picker = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(dependencies));
  const view = new Picker();
  // Command listeners intentionally never finish; mocked IO settles by next tick.
  const settle = async () => { await new Promise(setImmediate); };
  return { view, cx, settle, tasks };
}

test("Enter submits the exact typed path even with a highlighted child", async () => {
  const { view, cx, settle } = setup();
  view.init({}, cx); await settle();
  view.input.set_value("~/source/");
  view.directories = ["unwanted-child"]; view.at = 0;
  const opened = []; view.open = value => opened.push(value);
  view.input.handlers.submit({}, cx);
  assert.deepEqual(opened, ["~/source/"]);
  view.input.set_value("~/source/nonmatching");
  view.loading = true; view.pathError = true;
  view.input.handlers.submit({}, cx);
  assert.equal(opened[1], "~/source/nonmatching");
});

test("Tab keybinding sends a completion command even when the input owns focus", async () => {
  const keys = JSON.parse(await readFile(new URL("../../keys.json", import.meta.url), "utf8"));
  assert.equal(keys["mod:source-picker"].tab, "source-picker.complete");
  let deliver;
  const { view, cx, settle } = setup({
    nextCommand: () => new Promise(resolve => { deliver = resolve; }),
  });
  view.init({}, cx); await settle();
  view.directories = ["first-match", "second-match"]; view.at = 1;
  deliver("complete"); await settle();
  assert.equal(view.input.value(), "~/source/first-match/");
  assert.equal(view.folder, "/home/local/source/first-match");
  assert.equal(view.opening, false);
  // No matches: Tab leaves the input unchanged, without creating a workspace.
  view.directories = [];
  deliver("complete"); await settle();
  assert.equal(view.input.value(), "~/source/first-match/");
});

for (const machine of ["", "remote"]) test(`${machine || "local"} exact path reuses a workspace only on the same machine`, async () => {
  const calls = [], checked = [], closed = [];
  const { view, cx, settle } = setup({
    spaces: () => [
      { id: "outside-home", machine, folder: "/archive/unrelated" },
      { id: "wrong-machine", machine: machine ? "" : "remote", folder: "/home/user/projects/example" },
      { id: "existing", machine, folder: "/home/user/projects/example/" },
    ],
    exec: async (cmd, args, options) => {
      assert.equal(cmd, "sh"); assert.equal(options.on ?? "", machine);
      assert.equal(args[1], '[ -d "$1" ]'); checked.push(args[3]);
      return { code: 0, stdout: "" };
    },
    run: (...args) => calls.push(args), closeOverlay: id => closed.push(id),
  });
  Object.assign(view, { machine, homes: new Map([[machine, "/home/user"]]) });
  view.open("/home/user/projects/example", cx); await settle();
  assert.deepEqual(checked, ["/home/user/projects/example"]);
  assert.deepEqual(calls, [["space.select", { id: "existing" }]]);
  assert.deepEqual(closed, ["source-picker"]);
  assert.equal(view.opening, false);
});

for (const machine of ["", "remote"]) test(`${machine || "local"} nonexistent paths and files do not open suggestions`, async () => {
  for (const missing of [false, true]) {
    const calls = [];
    const { view, cx, settle } = setup({
      exec: async (cmd, args, options) => {
        calls.push(cmd); assert.equal(options.on ?? "", machine);
        assert.equal(args[3], missing ? "/home/user/projects/missing" : "/home/user/projects/file");
        return { code: 1, stdout: "" };
      },
      run: () => calls.push("run"), closeOverlay: () => calls.push("close"),
    });
    Object.assign(view, { machine, homes: new Map([[machine, "/home/user"]]), directories: ["suggestion"], input: { value: () => "" }, scroll: { scroll_to_item() {} } });
    // Avoid directory refresh IO in this focused validation test.
    view.updatePath = () => {};
    view.open(missing ? "/home/user/projects/missing" : "/home/user/projects/file", cx); await settle();
    assert.match(view.error, /Could not open project/);
    assert.equal(view.opening, false);
    assert.deepEqual(calls, ["sh"]);
  }
});

for (const machine of ["", "remote"]) test(`${machine || "local"} Enter refuses paths outside that machine's home before opening`, async () => {
  const calls = [];
  const { view, cx, settle } = setup({
    exec: async () => { calls.push("exec"); return { code: 0, stdout: "" }; },
    run: () => calls.push("run"), closeOverlay: () => calls.push("close"),
  });
  Object.assign(view, { machine, homes: new Map([[machine, "/home/user"]]) });
  view.updatePath = () => {};
  for (const value of ["/etc", "~/../other", "/home/user-other/project"]) {
    view.open(value, cx); await settle();
    assert.match(view.error, /inside your home/);
    assert.equal(view.opening, false);
  }
  assert.deepEqual(calls, []);
});

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
  const calls = [];
  const { view, cx, settle } = setup({ exec: async (command, args) => {
    if (command === "sh") return { code: 0, stdout: "" };
    assert.equal(command, "herdr-app");
    calls.push([args[1], JSON.parse(args[2])]);
    return { code: 0, stdout: JSON.stringify({ space: "remote/sp1", tab: "remote/tb1" }) };
  } });
  Object.assign(view, { machine, homes: new Map([[machine, "/srv/user"]]), folder: "/srv/user/source", loading: false, pathError: false });
  view.open("/srv/user/source/project", cx); await settle();
  assert.equal(calls.length, 4);
  assert.equal(calls[0][1].machine, machine);
  assert.equal(calls[0][1].tab, "agent");
  assert.deepEqual(calls.map(([, args]) => args.name), ["project", "editor", "term1", "term2"]);
  assert.deepEqual(calls.map(([, args]) => args.argv), [["pi"], ["nvim"], undefined, undefined]);
  for (const [, args] of calls) assert.equal(args.folder, "/srv/user/source/project");
  for (const [, args] of calls.slice(1)) assert.equal(args.space, "remote/sp1");
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
