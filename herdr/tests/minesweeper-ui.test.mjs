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
  const deps = { reportContext() {}, View: class {}, div: element, v_flex: element, h_flex: element,
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

test("setup keyboard editing is isolated, bounded, cancellable and repeat-safe", () => {
  const h = harness(engine.newGame(16, 255)); h.press('f');
  const snapshot = structuredClone(h.view.game), writes = h.writes;
  h.press('r', true); assert.equal(h.view.confirmReset, false);
  h.view.press({ ...event('r'), modifiers: { control: true } }, h.cx);
  assert.equal(h.view.confirmReset, false);
  h.press('r'); assert.deepEqual(h.view.pending, { size: 16, mines: 255 });
  h.press('h'); assert.deepEqual(h.view.pending, { size: 15, mines: 224 });
  h.press('j'); h.press('h'); assert.equal(h.view.pending.mines, 223);
  h.press('k'); h.press('l'); assert.equal(h.view.pending.size, 16);
  h.press('y', true); h.press('enter', true); h.press('r', true);
  for (const modifier of ['control', 'platform', 'alt', 'shift']) h.view.press({ ...event('enter'), modifiers: { [modifier]: true } }, h.cx);
  assert.equal(h.view.confirmReset, true);
  assert.deepEqual(h.view.game, snapshot); assert.equal(h.writes, writes);
  h.press('n'); assert.deepEqual(h.view.game, snapshot); assert.equal(h.writes, writes);
  h.press('r'); assert.deepEqual(h.view.pending, { size: 16, mines: 255 });
  for (let i = 0; i < 30; i++) h.press('h');
  assert.equal(h.view.pending.size, 5); assert.equal(h.view.pending.mines, 24);
  h.press('j'); for (let i = 0; i < 30; i++) h.press('h');
  assert.equal(h.view.pending.mines, 1);
  h.press('l'); h.press('enter');
  assert.deepEqual(h.view.game, engine.newGame(5, 2));
  h.press('enter', true); assert.equal(h.view.game.status, 'ready');
  for (let i = 0; i < 20; i++) { h.press('right'); h.press('down'); }
  assert.equal(h.view.game.cursor, 24);
});

test("setup mouse buttons, presets and saved settings survive reopen", () => {
  const h = harness(); h.render(); h.click('minesweeper-restart'); h.render();
  h.click('minesweeper-size-plus'); h.click('minesweeper-size-minus');
  h.click('minesweeper-mines-plus'); h.click('minesweeper-mines-minus');
  assert.deepEqual(h.view.pending, { size: 9, mines: 10 });
  for (const [preset, size, mines] of [['beginner', 9, 10], ['intermediate', 12, 24], ['expert', 16, 40]]) {
    h.click(`minesweeper-preset-${preset}`); assert.deepEqual(h.view.pending, { size, mines });
  }
  h.click('minesweeper-cancel'); assert.deepEqual(h.view.game, engine.newGame());
  h.render(); h.click('minesweeper-restart'); h.render();
  h.click('minesweeper-preset-expert'); h.click('minesweeper-confirm');
  assert.deepEqual(h.state['minesweeper.game'], engine.newGame(16, 40));
  h.view.close();
  const reopened = harness(h.state['minesweeper.game']); reopened.press('r');
  assert.deepEqual(reopened.view.pending, { size: 16, mines: 40 });
  reopened.press('n'); reopened.render();
  reopened.click('minesweeper-cell-255', 'right');
  assert.equal(reopened.view.game.cells[255].flagged, true);
  reopened.click('minesweeper-cell-128', 'left');
  assert.ok(reopened.view.game.cells[128].revealed);
});

test("largest board fits the board area with compact readable pixel graphics and dynamic HUD", () => {
  const h = harness(engine.newGame(16, 40));
  h.view.game.cells[0].flagged = true;
  h.view.game.cells[1].revealed = true; h.view.game.cells[1].count = 8;
  h.render();
  const cells = h.nodes.filter(n => /^minesweeper-cell-/.test(n.nodeId));
  assert.equal(cells.length, 256);
  for (const cell of cells) {
    assert.equal(cell.styles.w[0], 15); assert.equal(cell.styles.h[0], 15);
    assert.ok(cell.styles.w[0] * 16 <= 252);
  }
  assert.ok(h.nodes.some(n => n.childNodes.includes('MINES 39/40 · FLAGS 1 · SAFE 1/216')));
  assert.ok(h.nodes.some(n => n.nodeId === 'minesweeper-number-8' && n.styles.text_size[0] === 12));
  assert.ok(h.nodes.some(n => n.styles.w?.[0] === 1 && n.styles.h?.[0] === 1 && n.styles.bg?.[0] === '#57e8ff'));
  h.press('r'); h.render(); assert.equal(h.nodes.filter(n => /^minesweeper-cell-/.test(n.nodeId)).length, 0);
});

test("closing during setup saves current game, not unconfirmed settings", () => {
  const h = harness(engine.newGame(12, 24)); h.press('f');
  const snapshot = structuredClone(h.view.game);
  h.press('r'); h.press('h'); h.press('j'); h.press('l'); h.press('escape');
  assert.deepEqual(h.state['minesweeper.game'], snapshot);
  assert.deepEqual(harness(h.state['minesweeper.game']).view.game, snapshot);
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
