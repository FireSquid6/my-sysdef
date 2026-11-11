import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bindings, rebind } from "../mods/tty-tetris/controls.js";
const load = async (path, deps, exports) => new Function(...Object.keys(deps), (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^import .*;$/gm, "").replace(/export /g, "") + `\nreturn {${exports}};`)(...Object.values(deps));

test("catalogue covers custom interfaces and merges effective bindings by section", async () => {
  const state = { layout: "tty", "tetris.help": [["v", "Hold / swap"]] };
  const api = await load("../mods/tty-help/catalogue.js", { shared: k => state[k], keys: () => [
    { section: "global", keys: "alt-f", action: "old" }, { section: "layout:tty", keys: "alt-f", action: "new" },
    { section: "terminal", keys: "alt-f", action: "terminal" }, { section: "layout:other", keys: "x", action: "wrong" },
  ] }, "TABS, rowsFor");
  assert.equal(api.TABS.length, 19);
  assert.deepEqual(api.rowsFor("general"), [["alt-f", "new (layout:tty)"]]);
  assert.equal(api.rowsFor("terminal").at(-1)[1], "terminal (terminal)");
  assert.ok(api.rowsFor("tty-tetris").some(r => r[0] === "v"));
});

test("context follows actual panel/input focus, nests overlays and toggles help", async () => {
  const state = {}, timers = [], after = [], closed = [], opened = [];
  let p = {}, terminal = "t1";
  const deps = { shared: k => state[k], setShared: (k,v) => state[k] = v, props: () => p,
    focused: () => ({ terminal }), panes: () => [], openOverlay: spec => { opened.push(spec); return "help"; }, closeOverlay: id => closed.push(id) };
  const api = await load("../mods/tty-help/context.js", deps, "reportContext, origin, openHelp");
  const cx = { timer: { after: (_ms, fn) => after.push(fn), every: (_ms, fn) => timers.push(fn) } };
  let focus = false, saved = 0;
  const handlers = {};
  const panel = { handle: { is_focused: () => focus }, input: { on: (event, fn) => handlers[event] = fn } };
  api.reportContext(panel, "tty-files", cx); after.splice(0).forEach(fn => fn());
  assert.equal(api.origin(), "terminal"); focus = true; timers.forEach(fn => fn()); assert.equal(api.origin(), "tty-files");
  focus = false; handlers.focus(); timers.forEach(fn => fn()); assert.equal(api.origin(), "tty-files");
  handlers.blur(); timers.forEach(fn => fn()); assert.equal(api.origin(), "terminal");
  p = { overlay: "menu" }; const menu = { close() { saved++; } }; api.reportContext(menu, "tty-menu", cx);
  p = { overlay: "prompt" }; const prompt = {}; api.reportContext(prompt, "tty-prompt", cx);
  assert.equal(api.origin(), "tty-prompt"); prompt.close(); assert.equal(api.origin(), "tty-menu");
  api.openHelp(); assert.equal(opened[0].props.context, "tty-menu"); api.openHelp(); assert.deepEqual(closed, ["help"]);
  menu.close(); assert.equal(saved, 1); assert.equal(api.origin(), "terminal");
});

test("help-local bracket routing is ahead of text entry and help capture is reserved", async () => {
  const keys = JSON.parse(await readFile(new URL("../keys.json", import.meta.url), "utf8"));
  assert.equal(keys["mod:tty-help"]["["], "tty-help.prev");
  assert.equal(keys["mod:tty-help"]["]"], "tty-help.next");
  assert.equal(keys["layout:tty"]["ctrl-alt-h"], "tty-tabs.help");
  assert.ok(rebind(bindings(), "hold", "ctrl-alt-h").error);
  assert.deepEqual(bindings({ hold: ["ctrl-alt-h"] }), bindings());
});

test("sandbox-local context modules match the maintained helper", async () => {
  const source = await readFile(new URL("../mods/tty-help/context.js", import.meta.url), "utf8");
  for (const name of ["tty-tabs", "tty-files", "tty-changes", "tty-repo", "source-picker", "tty-picker", "tty-menu", "tty-new-menu", "tty-prompt", "tty-confirm", "tty-machine-add", "tty-worktree", "tty-arcade", "tty-minesweeper", "tty-solitaire", "tty-tetris"]) {
    assert.equal(await readFile(new URL(`../mods/${name}/help-context.js`, import.meta.url), "utf8"), source, name);
  }
});
