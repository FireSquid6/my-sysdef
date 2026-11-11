import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as engine from "../mods/tty-minesweeper/engine.js";
const source = await readFile(new URL("../mods/tty-minesweeper/main.js", import.meta.url), "utf8");
const event = (key, is_held = false) => ({ key, is_held, modifiers: {} });

function harness(saved) {
  const state = { "minesweeper.game": saved }, nodes = [], lifecycle = [];
  let writes = 0, focused = 0;
  const element = () => {
    const node = { handlers: {}, styles: {}, childNodes: [] }; nodes.push(node);
    const proxy = new Proxy(node, { get(target, name) {
      if (name in target) return target[name];
      return (...args) => {
        target.styles[name] = args;
        if (name === "child") target.childNodes.push(args[0]);
        if (name === "children") target.childNodes.push(...args[0]);
        if (name === "id") target.nodeId = args[0];
        if (name === "on_click" || name === "on_key_down") target.handlers[name] = args[0];
        if (name === "on_mouse_down") target.handlers[args[0]] = args[1];
        if (name === "when" && args[0]) args[1](proxy);
        return proxy;
      };
    } });
    return proxy;
  };
  const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() { focused++; } }), timer: { after(_ms, fn) { fn(); } } };
  const deps = { View: class {}, div: element, v_flex: element, h_flex: element,
    props: () => ({ overlay: "game" }), shared: key => state[key],
    setShared: (key, value) => { writes++; state[key] = value; },
    closeOverlay: id => lifecycle.push(["close", id]), openOverlay: options => lifecycle.push(["open", options]), ...engine };
  const Minesweeper = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const view = new Minesweeper(); view.init({}, cx);
  return { view, cx, state, lifecycle, nodes, get writes() { return writes; }, get focused() { return focused; },
    render() { nodes.length = 0; view.render(cx); },
    click(id, button = "on_click") { const node = nodes.find(n => n.nodeId === id); assert.ok(node, id); assert.ok(node.handlers[button], button); node.handlers[button]({}, cx); },
    press(key, held = false) { view.press(event(key, held), cx); } };
}

test("UI renders and keyboard movement clamps edges; reveal and flag save", () => {
  const h = harness({ version: 99 }); h.render(); assert.equal(h.focused, 1);
  h.press("h"); h.press("up"); assert.equal(h.view.game.cursor, 0);
  h.press("l"); h.press("down"); assert.equal(h.view.game.cursor, 10);
  h.press("f"); assert.equal(h.state["minesweeper.game"].cells[10].flagged, true);
  h.press("space"); assert.equal(h.view.game.status, "ready");
  h.press("f", true); assert.equal(h.view.game.cells[10].flagged, true);
  h.press("f"); h.press("enter"); assert.equal(h.view.game.cells[10].revealed, true);
  h.press("k"); h.press("right"); assert.equal(h.view.game.cursor, 2);
  for (let i = 0; i < 12; i++) h.press("right"); assert.equal(h.view.game.cursor, 8);
  h.render();
});

test("mouse left reveals and right toggles flags; restart has mouse and keyboard confirmation", () => {
  const h = harness(); h.render(); h.click("minesweeper-cell-80", "right");
  assert.equal(h.view.game.cells[80].flagged, true); assert.equal(h.view.game.cursor, 80);
  h.click("minesweeper-cell-40", "left"); assert.ok(h.view.game.cells[40].revealed);
  const snapshot = structuredClone(h.view.game);
  h.press("r"); h.click("minesweeper-cell-0", "left"); assert.deepEqual(h.view.game, snapshot);
  h.press("n"); assert.deepEqual(h.view.game, snapshot);
  h.press("r"); h.render(); h.click("minesweeper-cancel"); assert.equal(h.view.confirmReset, false);
  h.render(); h.click("minesweeper-restart"); h.render(); h.click("minesweeper-confirm");
  assert.deepEqual(h.view.game, engine.newGame());
  h.press("f"); h.press("r"); h.press("y"); assert.deepEqual(h.state["minesweeper.game"], engine.newGame());
});

test("host close saves once, snapshots are independent, and reopen resumes", () => {
  const h = harness(); h.press("f"); h.press("l"); h.press("space");
  const before = h.writes; h.view.close(); h.view.close(); assert.equal(h.writes, before + 1);
  const saved = structuredClone(h.state["minesweeper.game"]);
  h.press("r"); h.view.play(0, true, h.cx); assert.deepEqual(h.state["minesweeper.game"], saved);
  const reopened = harness(saved); assert.deepEqual(reopened.view.game, saved);
  reopened.view.game.cells[0].flagged = false; assert.equal(saved.cells[0].flagged, true);
  h.view.game.cells[0].flagged = false; assert.equal(h.state["minesweeper.game"].cells[0].flagged, true);
});

test("Escape saves and closes even during confirmation; Back closes before opening arcade", () => {
  for (const confirmation of [false, true]) {
    const h = harness(); if (confirmation) h.press("r"); h.press("escape");
    assert.deepEqual(h.lifecycle, [["close", "game"]]); assert.ok(engine.validSave(h.state["minesweeper.game"]));
  }
  const h = harness(); h.render(); h.click("minesweeper-back");
  assert.deepEqual(h.lifecycle, [["close", "game"], ["open", { mod: "tty-arcade", frame: "none", kind: "dialog", modal: true, width: 480, height: 340 }]]);
  assert.ok(engine.validSave(h.state["minesweeper.game"]));
});

test("pixel board uses a fixed retro palette, sprites and colored numbers without a theme", () => {
  assert.doesNotMatch(source, /\btheme\b|\.rounded|\.svg|\.image/);
  const h = harness();
  h.view.game.cells[0].flagged = true;
  h.view.game.cells[1].revealed = true; h.view.game.cells[1].count = 2;
  h.render();
  assert.ok(h.nodes.some(n => n.nodeId === 'minesweeper-sprite-flag'));
  assert.ok(h.nodes.some(n => n.nodeId === 'minesweeper-number-2' && n.styles.text_color[0] === '#80efac'));
  const root = h.nodes.find(n => n.nodeId === 'minesweeper');
  assert.deepEqual(root.styles.font_family, ['monospace']);
  assert.deepEqual(root.styles.bg, ['#10142b']);
  assert.equal(h.nodes.filter(n => /^minesweeper-cell-/.test(n.nodeId)).length, 81);
  h.view.game.status = 'lost'; h.view.game.cells[2].mine = true; h.render();
  assert.ok(h.nodes.some(n => n.nodeId === 'minesweeper-sprite-mine'));
  assert.ok(h.nodes.some(n => n.nodeId === 'minesweeper-sprite-wrong'));
  const sprite = h.nodes.find(n => n.nodeId === 'minesweeper-sprite-mine');
  assert.equal(sprite.childNodes.length, 7);
  assert.ok(h.nodes.some(n => n.styles.w?.[0] === 2 && n.styles.h?.[0] === 2 && n.styles.bg?.[0] === '#ff788e'));
});

test("terminal boards render and modal manifest matches arcade dimensions", async () => {
  for (const status of ["won", "lost"]) {
    const game = engine.newGame(); engine.reveal(game, 0, () => 0.999999);
    if (status === "won") game.cells.forEach((cell, i) => { if (!cell.mine) engine.reveal(game, i); });
    else engine.reveal(game, game.cells.findIndex(c => c.mine));
    const h = harness(game); assert.equal(h.view.game.status, status); assert.doesNotThrow(() => h.render());
  }
  const mod = JSON.parse(await readFile(new URL("../mods/tty-minesweeper/mod.json", import.meta.url), "utf8"));
  assert.equal(mod.focusable, true); assert.deepEqual(mod.overlay, { frame: "none", kind: "dialog", modal: true, width: 480, height: 520 });
});
