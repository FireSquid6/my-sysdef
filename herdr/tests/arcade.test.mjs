import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../mods/tty-arcade/main.js", import.meta.url), "utf8");
function harness() {
  const opened = [], closed = [];
  let focused = false;
  const backgrounds = [], widths = [], rowHeights = [], clicks = new Map();
  let currentId;
  const element = new Proxy({}, { get: (_target, name) => (...args) => {
    if (name === "id") currentId = args[0];
    if (name === "on_click") clicks.set(currentId, args[0]);
    if (name === "h" && currentId?.startsWith("arcade-tty-") && args[0] === 42) rowHeights.push(args[0]);
    if (name === "bg") backgrounds.push(args[0]);
    if (name === "w") widths.push(args[0]);
    if (name === "when" && args[0]) args[1](element);
    return element;
  } });
  const deps = { reportContext() {}, View: class {}, div: () => element, v_flex: () => element, h_flex: () => element,
    theme: () => ({}), props: () => ({ overlay: "arcade" }), closeOverlay: id => closed.push(id), openOverlay: options => opened.push(options) };
  const Arcade = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const cx = { focus_handle: () => ({ focus() { focused = true; } }), timer: { after: (_ms, fn) => fn() }, notify() {}, stop_propagation() {} };
  const view = new Arcade(); view.init({}, cx);
  return { view, cx, opened, closed, backgrounds, widths, rowHeights, clicks, get focused() { return focused; }, press(key, modifiers = {}) { view.press({ key, modifiers }, cx); } };
}
test("arcade shortcut replaces Tetris, leaving new tab untouched", async () => {
  const keys = JSON.parse(await readFile(new URL("../keys.json", import.meta.url), "utf8"));
  assert.equal(keys.global["ctrl-alt-t"], "mod.open:tty-arcade");
  assert.equal(keys.global["ctrl-shift-t"], "tab.new");
  const mod = JSON.parse(await readFile(new URL("../mods/tty-arcade/mod.json", import.meta.url), "utf8"));
  assert.equal(mod.overlay.modal, true);
});
test("keyboard chooser wraps, focuses, renders, and launches all five games", () => {
  const h = harness(); assert.equal(h.focused, true);
  assert.doesNotThrow(() => h.view.render(h.cx));
  h.press("up"); assert.equal(h.view.selected, 4);
  h.press("j"); assert.equal(h.view.selected, 0);
  h.press("down"); h.press("enter");
  assert.equal(h.opened[0].mod, "tty-minesweeper");
  for (const [key, mod] of [["1", "tty-tetris"], ["2", "tty-minesweeper"], ["3", "tty-solitaire"], ["4", "tty-2048"], ["5", "tty-breakout"]]) {
    const h = harness(); h.press(key);
    assert.deepEqual(h.closed, ["arcade"]); assert.equal(h.opened[0].mod, mod); assert.equal(h.opened[0].modal, true);
  }
});
test("all arcade destinations have focusable modal manifests and entrypoints", async () => {
  for (const key of ["1", "2", "3", "4", "5"]) {
    const h = harness(); h.press(key);
    const { mod, width, height } = h.opened[0];
    const manifest = JSON.parse(await readFile(new URL(`../mods/${mod}/mod.json`, import.meta.url), "utf8"));
    assert.equal(manifest.focusable, true);
    assert.equal(manifest.overlay.modal, true);
    assert.ok(width > 0 && height > 0);
    assert.equal(width, manifest.overlay.width); assert.equal(height, manifest.overlay.height);
    const main = await readFile(new URL(`../mods/${mod}/main.js`, import.meta.url), "utf8");
    assert.match(main, /export default class/);
  }
});
test("arcade has its own palette, pixel marquee and game sprites", () => {
  const h = harness(); h.view.render(h.cx);
  assert.doesNotMatch(source, /\btheme\s*\(/);
  assert.doesNotMatch(source, /import[^;]*\btheme\b/);
  assert.ok(h.backgrounds.includes("#10142b"));
  assert.ok(h.backgrounds.includes("#ffe477"));
  assert.ok(h.backgrounds.includes("#57e8ff"));
  assert.ok(h.widths.filter(width => width === 3).length > 100, "marquee uses individually drawn pixels");
  assert.ok(h.widths.filter(width => width === 2).length >= 720, "five compact game sprites use individually drawn pixels");
});
test("arcade games are not permanently embedded in the TTY sidebar", async () => {
  const layout = JSON.parse(await readFile(new URL("../layouts/tty.json", import.meta.url), "utf8"));
  const visit = node => {
    assert.ok(!/^tty-(arcade|tetris|minesweeper|solitaire|2048|breakout)$/.test(node.content?.mod ?? ""));
    (node.children ?? []).forEach(visit);
  };
  visit(layout);
});
test("five compact rows fit the unchanged launcher and new games support mouse launch", async () => {
  const manifest = JSON.parse(await readFile(new URL("../mods/tty-arcade/mod.json", import.meta.url), "utf8"));
  assert.equal(manifest.overlay.width, 480); assert.equal(manifest.overlay.height, 340);
  const h = harness(); h.view.render(h.cx);
  assert.deepEqual(h.rowHeights, [42, 42, 42, 42, 42]);
  for (const mod of ["tty-2048", "tty-breakout"]) {
    const h = harness(); h.view.render(h.cx); h.clicks.get(`arcade-${mod}`)();
    assert.equal(h.opened[0].mod, mod); assert.deepEqual(h.closed, ["arcade"]);
    h.view.launch(0); assert.equal(h.opened.length, 1, "closed launcher cannot open a second game");
  }
});
test("invalid digits, held and modified keys cannot launch games", () => {
  const h = harness();
  for (const key of ["0", "6", "9"]) h.press(key);
  h.view.press({ key: "4", is_held: true }, h.cx);
  for (const modifier of ["control", "platform", "alt", "shift"]) h.press("5", { [modifier]: true });
  assert.equal(h.opened.length, 0);
});
test("escape only closes; modified keys do not launch games", () => {
  const h = harness(); h.press("1", { control: true }); assert.equal(h.opened.length, 0);
  h.press("escape"); assert.deepEqual(h.closed, ["arcade"]); assert.equal(h.opened.length, 0);
});
