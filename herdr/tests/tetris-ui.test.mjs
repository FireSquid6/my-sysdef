import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { newGame, cells, ghostY, act, tick } from "../mods/tty-tetris/engine.js";
import { DEFAULT_BINDINGS, ACTIONS, LABELS, bindings, actionFor, chord, rebind } from "../mods/tty-tetris/controls.js";
const source = await readFile(new URL("../mods/tty-tetris/main.js", import.meta.url), "utf8");
const event = (key, modifiers = {}, is_held = false) => ({ key, modifiers, is_held });
function harness(saved) {
  const state = { "tetris.game": saved }, timers = {}, clicks = {}, opened = [], nodes = [];
  let now = 1000, focused = true, cancelled = 0, dismissed = 0;
  const makeElement = kind => {
    const node = { kind, calls: [] }; nodes.push(node);
    let id;
    const element = new Proxy(node, { get: (_target, name) => (...args) => {
      node.calls.push([name, ...args]);
      if (name === "id") id = args[0];
      if (name === "on_click") clicks[id] = args[0];
      if (name === "when" && args[0]) args[1](element);
      return element;
    } });
    return element;
  };
  const cx = { notify() {}, stop_propagation() {}, spawn() {}, focus_handle: () => ({ focus() { focused = true; }, is_focused: () => focused }),
    timer: { after: (_ms, fn) => { timers.after = fn; }, every: (_ms, fn) => { timers.every = fn; return { cancel() { cancelled++; } }; } } };
  const deps = { View: class {}, div: () => makeElement("div"), v_flex: () => makeElement("v_flex"), h_flex: () => makeElement("h_flex"),
    openOverlay: options => opened.push(options), nextCommand: () => new Promise(() => {}), props: () => ({ overlay: "game" }), shared: key => state[key] ?? null,
    setShared: (key, value) => { state[key] = value; }, closeOverlay: id => { assert.equal(id, "game"); dismissed++; },
    newGame, cells, ghostY, act, tick, DEFAULT_BINDINGS, ACTIONS, LABELS, bindings, actionFor, chord, rebind,
    Date: { now: () => now } };
  const Tetris = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export function validSave", "function validSave").replace("export default class", "return class"))(...Object.values(deps));
  const view = new Tetris(); view.init({}, cx);
  return { view, cx, state, timers, clicks, opened, nodes, get cancelled() { return cancelled; }, get dismissed() { return dismissed; },
    advance(ms = 16) { now += ms; timers.every(cx); }, blur() { focused = false; } };
}
const styled = (node, method, value) => node.calls.some(([name, arg]) => name === method && arg === value);
test("arcade uses its own fixed palette, monospace and square chrome without a TTY theme", () => {
  assert.doesNotMatch(source, /\btheme\b/);
  for (const color of ["#10142b", "#fff1c1", "#57e8ff", "#394574", "#191f3d", "#293960", "#334273", "#9ca9cf"]) assert.ok(source.includes(color));
  const h = harness(); h.view.render(h.cx);
  const root = h.nodes.find(node => styled(node, "id", "tetris"));
  assert.ok(styled(root, "font_family", "monospace"));
  assert.ok(styled(root, "bg", "#10142b"));
  assert.ok(styled(root, "rounded_none", undefined));
  h.view.settings(h.cx);
  assert.doesNotThrow(() => h.view.render(h.cx)); // Also renders without any injected theme API.
});
test("board and hold/next are real block graphics with 20px/16px beveled pixel sprites", () => {
  const h = harness();
  h.view.game.piece = { type: "T", x: 3, y: 22, rotation: 0 };
  h.view.game.board[39][0] = "I";
  h.view.game.hold = "O";
  h.view.render(h.cx);
  const boardTiles = h.nodes.filter(node => styled(node, "w", 20) && styled(node, "h", 20));
  assert.equal(boardTiles.length, 200);
  assert.ok(boardTiles.some(node => styled(node, "border_color", "#57e8ff")), "ghost outline stays visible");
  assert.equal(h.nodes.filter(node => styled(node, "w", 16) && styled(node, "h", 16)).length, 48, "hold plus five next previews");
  assert.ok(h.nodes.filter(node => styled(node, "w", 3) && styled(node, "h", 3)).length >= 29, "inset highlight pixels for locked, active and preview pieces");
  h.nodes.length = 0;
  h.view.preview("T");
  assert.equal(h.nodes.filter(node => styled(node, "w", 16) && styled(node, "h", 16)).length, 8);
  assert.equal(h.nodes.filter(node => styled(node, "w", 3) && styled(node, "h", 3)).length, 4);
  assert.equal(h.nodes.filter(node => styled(node, "h", 2) && styled(node, "bg", "#fff1c1")).length, 4, "light top bevels");
  assert.equal(h.nodes.filter(node => styled(node, "h", 2) && styled(node, "bg", "#10142b")).length, 4, "dark bottom shadows");
});
test("defaults are vim-friendly, support arrows, and normalize modifier chords", () => {
  const keys = bindings(null);
  for (const [key, action] of [["h", "left"], ["l", "right"], ["j", "softDrop"], ["k", "rotateCW"], ["z", "rotateCCW"], ["space", "hardDrop"], ["c", "hold"]]) assert.equal(actionFor(event(key), keys), action);
  assert.equal(actionFor(event("left"), keys), "left");
  assert.equal(chord(event("h", { control: true, shift: true })), "ctrl-shift-h");
  assert.equal(chord(event("shift")), "");
});
test("bindings can be changed, reject conflicts/reserved keys, and malformed settings fall back", () => {
  const keys = bindings(); const value = rebind(keys, "left", "a").value;
  assert.equal(actionFor(event("a"), value), "left"); assert.equal(actionFor(event("h"), value), undefined);
  for (const key of ["escape", "f2", "ctrl-alt-t", "l"]) assert.ok(rebind(keys, "left", key).error);
  assert.deepEqual(bindings({ left: ["l"] }), keys);
  assert.deepEqual(bindings(false), keys);
});
test("close cancels timer, clears held keys, saves an independent paused snapshot, and reopen restores", () => {
  const h = harness(); h.view.press(event("j"), h.cx); assert.equal(h.view.game.softDropping, true);
  const position = h.view.game.piece.y; h.view.close();
  assert.equal(h.cancelled, 1); assert.equal(h.view.pressed.size, 0); assert.equal(h.state["tetris.game"].paused, true);
  assert.equal(h.state["tetris.game"].softDropping, false);
  h.view.close(); assert.equal(h.cancelled, 1); h.advance(1000); assert.equal(h.view.game.piece.y, position);
  const resumed = harness(h.state["tetris.game"]); assert.equal(resumed.view.game.paused, true);
  resumed.view.press(event("p"), resumed.cx); assert.equal(resumed.view.game.paused, false);
  assert.notEqual(resumed.view.game, h.state["tetris.game"]);
});
test("Escape closes from gameplay, settings and key capture; lifecycle save is idempotent", () => {
  for (const page of [false, true]) {
    const h = harness(); if (page) { h.view.press(event("s"), h.cx); h.view.press(event("enter"), h.cx); }
    h.view.press(event("escape"), h.cx); assert.equal(h.dismissed, 1); assert.equal(h.cancelled, 1); assert.equal(h.state["tetris.game"].paused, true);
  }
});
test("own DAS repeat ignores OS repeat, stops on release, and pause clears held keys", () => {
  const h = harness(); const x = h.view.game.piece.x;
  h.view.press(event("h"), h.cx); h.view.press(event("h", {}, true), h.cx); assert.equal(h.view.game.piece.x, x - 1);
  for (let i = 0; i < 11; i++) h.advance(); assert.equal(h.view.game.piece.x, x - 2);
  h.view.release(event("h")); for (let i = 0; i < 10; i++) h.advance(); assert.equal(h.view.game.piece.x, x - 2);
  h.view.press(event("j"), h.cx); h.view.press(event("p"), h.cx); assert.equal(h.view.pressed.size, 0); assert.equal(h.view.game.softDropping, false);
});
test("key-up without modifiers clears a held custom chord; focus loss pauses", () => {
  const h = harness(); h.view.keys = rebind(h.view.keys, "left", "ctrl-h").value;
  h.view.press(event("h", { control: true }), h.cx); assert.equal(h.view.pressed.size, 1);
  h.view.release(event("h")); assert.equal(h.view.pressed.size, 0);
  h.blur(); h.advance(); assert.equal(h.view.game.paused, true);
});
test("settings are keyboard-accessible, persist rebinding, and never use Shift+Tab", () => {
  const h = harness(); h.view.press(event("f2"), h.cx); assert.equal(h.view.page, "settings");
  assert.equal(h.view.game.paused, true);
  h.view.press(event("tab", { shift: true }), h.cx); assert.equal(h.view.selected, 0);
  h.view.press(event("tab", { control: true }), h.cx); assert.equal(h.view.selected, 1);
  h.view.press(event("k"), h.cx); assert.equal(h.view.selected, 0);
  h.view.press(event("enter"), h.cx); h.view.press(event("a"), h.cx);
  assert.deepEqual(h.state["tetris.settings"].left, ["a"]);
  h.view.press(event("d"), h.cx); assert.deepEqual(h.view.keys, bindings());
  h.view.press(event("q"), h.cx); assert.equal(h.view.page, null); assert.equal(h.view.game.paused, true);
});
test("Ctrl+Tab command cycles settings and starting level applies only to the next game", () => {
  const h = harness(); h.view.press(event("f2"), h.cx);
  h.view.command("cycle", h.cx); assert.equal(h.view.selected, 1);
  h.view.selected = ACTIONS.length;
  h.view.press(event("l"), h.cx); assert.equal(h.view.startLevel, 2); assert.equal(h.view.game.level, 1);
  assert.equal(h.state["tetris.startLevel"], 2);
  h.view.press(event("q"), h.cx); h.view.press(event("r"), h.cx); h.view.press(event("y"), h.cx);
  assert.equal(h.view.game.level, 2);
});

test("restart requires confirmation; invalid saved data starts safely; score detail render works", () => {
  const h = harness({ version: 1 }); h.view.game.score = 123;
  h.view.press(event("r"), h.cx); h.view.press(event("n"), h.cx); assert.equal(h.view.game.score, 123);
  h.view.press(event("r"), h.cx); h.view.press(event("y"), h.cx); assert.equal(h.view.game.score, 0);
  h.view.game.lastClear = { points: 1200, lines: 2, spin: "full", backToBack: true, combo: 1 };
  assert.doesNotThrow(() => h.view.render(h.cx));
});
test("Arcade button pauses and saves Tetris before returning to the menu", () => {
  const h = harness(); h.view.render(h.cx);
  h.clicks["tetris-arcade"]({}, h.cx);
  assert.equal(h.cancelled, 1); assert.equal(h.dismissed, 1);
  assert.equal(h.state["tetris.game"].paused, true);
  assert.equal(h.opened[0].mod, "tty-arcade");
});
test("portable global shortcut opens the personal modal popup", async () => {
  const keys = JSON.parse(await readFile(new URL("../keys.json", import.meta.url), "utf8"));
  const mod = JSON.parse(await readFile(new URL("../mods/tty-tetris/mod.json", import.meta.url), "utf8"));
  assert.equal(keys.global["ctrl-alt-t"], "mod.open:tty-arcade");
  assert.equal(keys.global["ctrl-shift-t"], "tab.new");
  assert.equal(keys["mod:tty-tetris"]["ctrl-tab"], "tty-tetris.cycle");
  assert.equal(mod.overlay.kind, "dialog"); assert.equal(mod.overlay.modal, true);
});
