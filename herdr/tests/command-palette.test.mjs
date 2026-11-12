import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { paletteRows } from "../mods/tty-command-palette/model.js";

const catalog = [
  { name: "space.new", about: "Create a space", args: [] },
  { name: "app.palette", about: "Native command palette", args: [] },
  { name: "space.rename", about: "Rename a space", args: [{ name: "name", required: true }] },
];
const bindings = [
  { section: "global", keys: "ctrl-shift-p", action: "app.palette" },
  { section: "layout:tty", keys: "ctrl-shift-p", action: "mod.open:tty-command-palette" },
  { section: "global", keys: "ctrl-shift-n", action: "space.new" },
];

test("palette retains native commands and adds searchable agent views with current selection", () => {
  const rows = paletteRows(catalog, bindings, undefined, "");
  assert.deepEqual(rows.filter(row => row.command).map(row => row.command), catalog.map(command => command.name));
  assert.equal(rows.find(row => row.sort === "priority").selected, true);
  assert.equal(rows.find(row => row.command === "space.new").shortcut, "ctrl-shift-n");
  assert.equal(rows.find(row => row.command === "app.palette").shortcut, "", "overridden key must not advertise the native palette");
  const grouped = paletteRows(catalog, bindings, "grouped", " AGENTS  SPACE ");
  assert.equal(grouped.length, 1); assert.equal(grouped[0].sort, "grouped"); assert.equal(grouped[0].selected, true);
  assert.equal(paletteRows(catalog, bindings, "priority", "no-matching-command").length, 0);
});

test("palette changes the existing shared agent preference and delegates native commands without dropping prompts", async () => {
  const code = await readFile(new URL("../mods/tty-command-palette/main.js", import.meta.url), "utf8");
  const state = new Map(), calls = [], closed = [], scrolls = [];
  const input = { on() {}, focus() {}, value() { return ""; } };
  const deps = { View: class {}, InputState: { new: () => input }, ScrollHandle: { new: () => ({ scroll_to_item(i) { scrolls.push(i); } }) },
    commands: () => catalog, keys: () => bindings, shared: key => state.get(key), setShared: (key, value) => state.set(key, value),
    props: () => ({ overlay: "palette" }), closeOverlay: id => closed.push(id), run: command => calls.push(command), paletteRows };
  const Palette = new Function(...Object.keys(deps), code.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const view = new Palette(); view.init({}, { focus_handle() { return {}; } });
  view.choose(view.rows().find(row => row.sort === "grouped"));
  assert.equal(state.get("agents.sort"), "grouped");
  view.choose(view.rows().find(row => row.sort === "priority"));
  assert.equal(state.get("agents.sort"), "priority");
  view.choose(view.rows().find(row => row.command === "space.rename"));
  assert.deepEqual(calls, ["space.rename"]);
  assert.equal(closed.length, 3);
  const cx = { notify() {}, stop_propagation() {} };
  view.navigate({ key: "up" }, cx); assert.equal(view.at, view.rows().length - 1);
  view.navigate({ key: "down" }, cx); assert.equal(view.at, 0);
  view.query = "no-matching-command"; view.navigate({ key: "down" }, cx); assert.equal(view.at, 0);
  view.choose(undefined); assert.equal(closed.length, 3);
  view.navigate({ key: "escape" }, cx); assert.equal(closed.length, 4);
});

test("TTY uses the extended Ctrl+Shift+P palette while other layouts retain the native palette", async () => {
  const keys = JSON.parse(await readFile(new URL("../keys.json", import.meta.url), "utf8"));
  assert.equal(keys.global["ctrl-shift-p"], "app.palette");
  assert.equal(keys["layout:tty"]["ctrl-shift-p"], "mod.open:tty-command-palette");
  const manifest = JSON.parse(await readFile(new URL("../mods/tty-command-palette/mod.json", import.meta.url), "utf8"));
  assert.equal(manifest.place, "none");
});
