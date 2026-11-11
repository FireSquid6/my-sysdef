import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Exercise the real navigation methods without GPUI or live user terminals.
async function load(name, dependencies = {}) {
  const source = await readFile(new URL(`../mods/${name}/main.js`, import.meta.url), "utf8");
  return new Function("View", ...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(class {}, ...Object.values(dependencies));
}
const Files = await load("tty-files"), Changes = await load("tty-changes");
const event = (key, modifiers = {}) => ({ key, modifiers });
const cx = { stop_propagation() {}, notify() {} };
function files() {
  const view = new Files();
  Object.assign(view, { visible: [{ path: "src", dir: true }, { path: "src/a.js", dir: false }, { path: "b.js", dir: false }],
    selected: "src", folders: new Set(["src"]), scroll: { scroll_to_item() {} }, handle: { focus() {} },
    toggle(path) { this.folders.has(path) ? this.folders.delete(path) : this.folders.add(path); },
    show(path) { this.file = path; } });
  return view;
}
test("files move, open preview, and return to tree", () => {
  const view = files();
  view.navigate(event("j"), cx); assert.equal(view.selected, "src/a.js");
  view.navigate(event("enter"), cx); assert.equal(view.file, "src/a.js");
  view.navigate(event("h"), cx); assert.equal(view.file, null);
  view.navigate(event("G"), cx); assert.equal(view.selected, "b.js");
  view.navigate(event("g"), cx); assert.equal(view.selected, "src");
});
test("files left collapses parent; right expands directory", () => {
  const view = files(); view.selected = "src/a.js";
  view.navigate(event("h"), cx); assert.equal(view.selected, "src"); assert.equal(view.folders.has("src"), false);
  view.navigate(event("l"), cx); assert.equal(view.folders.has("src"), true);
});
test("Alt shortcuts are not swallowed by panel navigation", () => {
  const view = files(); view.navigate(event("j", { alt: true }), cx);
  assert.equal(view.selected, "src");
});
test("right stays on an expanded empty directory", () => {
  const view = files();
  view.visible = [{ path: "src", dir: true }, { path: "sibling", dir: false }];
  view.navigate(event("l"), cx); assert.equal(view.selected, "src");
});
test("changes select, preview, scroll diff, and enter commit input", () => {
  const view = new Changes();
  Object.assign(view, { files: [{ path: "a" }, { path: "b" }], rows: [{}, {}, {}], selected: "a", diffAt: 0,
    scroll: { scroll_to_item() {} }, diffScroll: { scroll_to_item() {} }, input: { focus() {} },
    pick(path) { this.open = path; } });
  view.navigate(event("j"), cx); assert.equal(view.selected, "b");
  view.navigate(event("l"), cx); assert.equal(view.open, "b"); assert.equal(view.inDiff, true);
  view.navigate(event("G"), cx); assert.equal(view.diffAt, 2);
  view.navigate(event("h"), cx); assert.equal(view.inDiff, false);
  view.navigate(event("i"), cx); assert.equal(view.typing, true);
});
test("Changes Ctrl+Tab reaches every control; vim keys reverse and Shift+Tab is ignored", () => {
  const view = new Changes();
  Object.assign(view, { handle: { focus() {} }, input: { focus() {} } });
  const seen = [];
  for (let i = 0; i < 7; i++) { view.navigate(event("tab", { control: true }), cx); seen.push(view.focusArea); }
  assert.deepEqual(seen, ["preview", "message", "commit", "push", "pull", "diff", "files"]);
  view.navigate(event("tab", { shift: true }), cx); assert.equal(view.focusArea, "files");
  view.focusArea = "push"; view.navigate(event("h"), cx); assert.equal(view.focusArea, "commit");
  view.focusArea = "diff"; view.remoteDiff = true;
  view.navigate(event("tab", { control: true }), cx); assert.equal(view.focusArea, "close-diff");
});
test("Changes keyboard activates buttons and Escape closes upstream preview", () => {
  const view = new Changes(), calls = [];
  Object.assign(view, { sync: action => calls.push(action), commit: () => calls.push("commit"),
    handle: { focus() {} }, rows: [], diffAt: 0, refresh() {} });
  for (const action of ["push", "pull", "diff", "commit"]) {
    view.focusArea = action; view.navigate(event("enter"), cx);
  }
  assert.deepEqual(calls, ["push", "pull", "diff", "commit"]);
  view.focusArea = "push"; view.navigate(event("space"), cx); assert.equal(calls.at(-1), "push");
  view.remoteDiff = true; view.navigate(event("escape"), cx);
  assert.equal(view.remoteDiff, false); assert.equal(view.focusArea, "files");
});
test("panel commands reveal the panel and terminal return has cross-tab fallback", async () => {
  const calls = [], shared = [], commands = ["files", "changes", "repo", "terminal"];
  const Tabs = await load("tty-tabs", {
    QuickTerminal: class { hide() {} },
    ScrollHandle: { new() { return {}; } }, localStorage: { getItem() { return null; } },
    nextCommand: () => commands.length ? Promise.resolve(commands.shift()) : new Promise(() => {}),
    run: (command, args) => calls.push([command, args]), setShared: (key, value) => shared.push([key, value]),
    focused: () => ({ tab: "mod-only" }), panes: () => [{ tab: "terminal-tab", terminal: "t1" }],
  });
  new Tabs().init({}, { spawn(task) { task(cx); }, ...cx });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.deepEqual(calls, [
    ["layout.select", { stack: "panel-body", child: "files" }], ["layout.show", { id: "panel" }],
    ["layout.select", { stack: "panel-body", child: "changes" }], ["layout.show", { id: "panel" }],
    ["layout.select", { stack: "panel-body", child: "repo" }], ["layout.show", { id: "panel" }],
    ["tab.select", { id: "terminal-tab" }], ["pane.focus", { terminal: "t1" }],
  ]);
  assert.equal(shared[0][1].id, "files"); assert.equal(shared[1][1].id, "changes");
  assert.equal(shared[2][1].id, "repo"); assert.equal(shared[3][1], null);
});
test("numeric prefixes move Files by 10j and 4k and then reset", () => {
  const view = files();
  view.visible = Array.from({ length: 30 }, (_, i) => ({ path: `file-${i}`, dir: false }));
  view.selected = "file-0";
  for (const key of "10j4k") view.navigate(event(key), cx);
  assert.equal(view.selected, "file-6");
  view.navigate(event("j"), cx); assert.equal(view.selected, "file-7");
});
test("numeric prefixes move Changes list and diff, clamped to bounds", () => {
  const view = new Changes();
  Object.assign(view, { files: Array.from({ length: 30 }, (_, i) => ({ path: String(i) })),
    rows: Array.from({ length: 40 }, () => ({})), selected: "0", diffAt: 0,
    scroll: { scroll_to_item() {} }, diffScroll: { scroll_to_item() {} } });
  for (const key of "10j4k") view.navigate(event(key), cx);
  assert.equal(view.selected, "6");
  view.inDiff = true;
  for (const key of "10j4k") view.navigate(event(key), cx);
  assert.equal(view.diffAt, 6);
  for (const key of "99j") view.navigate(event(key), cx);
  assert.equal(view.diffAt, 39);
});
test("slash enters search and Escape returns to tree", () => {
  const view = files();
  let focused = false;
  view.searchInput = { focus() { focused = true; } };
  view.navigate(event("/"), cx);
  assert.equal(view.searching, true); assert.equal(focused, true);
  view.searchTyping = true;
  view.navigate(event("escape"), cx);
  assert.equal(view.searching, false); assert.equal(view.searchTyping, false);
});
test("fuzzy search ignores case and allows gaps but preserves character order", () => {
  const view = files(); view.query = "mJS";
  assert.equal(view.matches("main.javascript"), true);
  assert.equal(view.matches("MAIN.JS"), true);
  assert.equal(view.matches("json.simple"), false);
  view.query = "aa"; assert.equal(view.matches("a.js"), false);
  view.query = ""; assert.equal(view.matches("anything"), true);
});
test("search only filters listed entries, including directories and expanded children", async () => {
  const element = new Proxy({}, { get() { return () => element; } });
  const SearchFiles = await load("tty-files", {
    h_flex: () => element, div: () => element, svg: () => element,
  });
  const view = new SearchFiles();
  Object.assign(view, { searching: true, query: "mJS", marks: {}, root: "/project", visible: [],
    folders: new Set(["open"]), entries: new Map([
      ["", [{ name: "closed", dir: true }, { name: "open", dir: true }, { name: "myJS", dir: true }]],
      ["closed", [{ name: "main.js", dir: false }]],
      ["open", [{ name: "main.js", dir: false }, { name: "unrelated", dir: false }]],
    ]) });
  view.rows("", 0, [], {});
  assert.deepEqual(view.visible, [{ path: "open/main.js", dir: false }, { path: "myJS", dir: true }]);
  view.visible = []; view.searching = false; view.rows("", 0, [], {});
  assert.equal(view.visible.length, 5);
});
