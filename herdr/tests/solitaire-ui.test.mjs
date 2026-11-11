import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { newGame, draw, move, won, validSave, red, SUITS } from "../mods/tty-solitaire/engine.js";
const source = await readFile(new URL("../mods/tty-solitaire/main.js", import.meta.url), "utf8");
function harness(saved) {
  const state = { "solitaire.game": saved }, nodes = new Map(), actions = [], texts = [], elements = [];
  function element() {
    let id;
    const handlers = {}, styles = {};
    elements.push(styles);
    const node = new Proxy({}, { get: (_target, name) => (...args) => {
      styles[name] = args;
      if (name === "id") { id = args[0]; nodes.set(id, handlers); }
      if (name === "on_click") handlers.click = args[0];
      if (name === "child" && typeof args[0] === "string") texts.push(args[0]);
      if (name === "when" && args[0]) args[1](node);
      return node;
    } });
    return node;
  }
  const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {} }), timer: { after: (_ms, fn) => fn() } };
  const deps = { View: class {}, div: element, h_flex: element, v_flex: element,
    shared: key => state[key], setShared: (key, value) => { state[key] = value; }, props: () => ({ overlay: "solitaire" }),
    closeOverlay: id => actions.push(["close", id]), openOverlay: options => actions.push(["open", options]),
    newGame, draw, move, won, validSave, red };
  const Solitaire = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const view = new Solitaire(); view.init({}, cx);
  return { view, cx, state, nodes, actions, texts, elements, key(key) { view.press({ key }, cx); }, click(id) { view.render(cx); assert.ok(nodes.has(id), id); nodes.get(id).click({}, cx); } };
}
test("invalid saves fall back; close saves once; reopening clones a validated snapshot", () => {
  const h = harness({ version: 1 }); assert.equal(validSave(h.view.game), true);
  h.key("d"); assert.equal(h.state["solitaire.game"].waste.length, 1);
  h.key("escape"); assert.deepEqual(h.actions, [["close", "solitaire"]]);
  const saved = h.state["solitaire.game"]; h.view.close(); assert.equal(h.state["solitaire.game"], saved);
  const reopened = harness(saved); assert.deepEqual(reopened.view.game, saved); assert.notEqual(reopened.view.game, saved);
  reopened.key("d"); assert.equal(saved.waste.length, 1);
});
test("keyboard traverses stock, waste, foundations, tableau and every face-up card", () => {
  const h = harness();
  h.key("right"); assert.equal(h.view.cursor.area, "waste");
  for (let i = 0; i < 4; i++) h.key("l");
  assert.deepEqual(h.view.cursor, { area: "foundations", index: 3 });
  h.key("j"); assert.equal(h.view.cursor.index, 6); assert.equal(h.view.cursor.area, "tableau");
  h.view.game.tableau[6] = [{ rank: 13, suit: "clubs", faceUp: true }, { rank: 12, suit: "hearts", faceUp: true }, { rank: 11, suit: "clubs", faceUp: true }];
  h.view.cursor.card = 2;
  h.key("up"); assert.equal(h.view.cursor.card, 1);
  h.key("k"); assert.equal(h.view.cursor.card, 0);
  h.key("space"); assert.equal(h.view.selected.card, 0);
  h.key("k"); assert.equal(h.view.cursor.area, "foundations");
  h.key("down"); assert.equal(h.view.cursor.card, 0);
  h.key("down"); assert.equal(h.view.cursor.card, 1);
  h.key("left"); assert.equal(h.view.cursor.index, 5);
});
test("mouse and keyboard can move a face-up stack; illegal moves preserve selection", () => {
  const h = harness();
  h.view.game.tableau[0] = [{ rank: 13, suit: "clubs", faceUp: true }, { rank: 12, suit: "hearts", faceUp: true }];
  h.view.game.tableau[1] = []; h.view.game.tableau[2] = [];
  h.click("solitaire-tableau-0-1"); assert.equal(h.view.selected.card, 1);
  h.click("solitaire-tableau-1--1"); assert.ok(h.view.selected); assert.match(h.view.message, /Illegal/);
  h.click("solitaire-tableau-0-1"); assert.equal(h.view.selected, null);
  h.click("solitaire-tableau-0-0"); assert.equal(h.view.selected.card, 0);
  h.key("right"); h.key("enter"); assert.equal(h.view.game.tableau[1].length, 2); assert.equal(h.view.selected, null);
  h.click("solitaire-stock-0-top"); assert.equal(h.view.game.waste.length, 1);
  assert.doesNotThrow(() => h.view.render(h.cx));
});
test("restart requires explicit confirmation, blocks moves, and offers mouse confirmation", () => {
  const h = harness(); h.key("d"); const old = h.view.game;
  h.key("r"); h.key("d"); assert.equal(h.view.game.waste.length, 1);
  h.key("n"); assert.equal(h.view.game, old);
  h.click("solitaire-restart"); h.click("solitaire-cancel"); assert.equal(h.view.game, old);
  h.key("r"); h.click("solitaire-confirm"); assert.notEqual(h.view.game, old); assert.equal(h.state["solitaire.game"].moves, 0);
  h.key("r"); h.key("escape"); assert.equal(h.actions[0][0], "close");
});
test("Arcade header saves and closes before opening the requested modal", () => {
  const h = harness(); h.click("solitaire-arcade");
  assert.equal(validSave(h.state["solitaire.game"]), true);
  assert.deepEqual(h.actions, [["close", "solitaire"], ["open", { mod: "tty-arcade", frame: "none", kind: "dialog", modal: true, width: 480, height: 340 }]]);
});
test("host close saves an independent valid snapshot, and closed views ignore input", () => {
  const h = harness(); h.key("d"); h.view.close();
  const snapshot = h.state["solitaire.game"];
  assert.equal(validSave(snapshot), true); assert.equal(h.actions.length, 0);
  h.key("d"); assert.equal(h.view.game.moves, 1);
  h.view.game.moves = 99; assert.equal(snapshot.moves, 1);
  h.view.close(); assert.equal(h.state["solitaire.game"], snapshot);
});
test("waste selection can be cancelled and hidden cards cannot be selected by mouse", () => {
  const h = harness(); h.key("d"); h.click("solitaire-waste-0-top");
  assert.equal(h.view.selected.area, "waste");
  h.click("solitaire-waste-0-top"); assert.equal(h.view.selected, null);
  h.click("solitaire-tableau-6-0"); assert.equal(h.view.selected, null);
});
test("render includes selected stack markers, empty targets, confirmation and victory", () => {
  const h = harness();
  h.click("solitaire-tableau-0-0"); h.view.render(h.cx);
  assert.ok(h.elements.some(el => el.border_color?.[0] === '#ffbd69'));
  assert.ok(h.elements.some(el => el.bg?.[0] === '#ffbd69'));
  assert.ok(h.texts.includes('K') || h.texts.some(text => /^(A|[2-9]|10|J|Q)$/.test(text)));
  h.view.game.foundations = SUITS.map(suit => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1, faceUp: true })));
  h.view.game.tableau = Array.from({ length: 7 }, () => []); h.view.game.stock = []; h.view.game.waste = [];
  h.view.selected = null; h.view.render(h.cx);
  assert.ok(h.texts.includes("YOU WIN! · r: new game"));
  assert.ok(h.texts.some(text => text.includes("King only")));
  h.key("r"); h.view.render(h.cx); assert.ok(h.texts.includes("Restart? y: new deal · n: keep game"));
});
test("modified keys are left to application shortcuts", () => {
  const h = harness();
  const cursor = structuredClone(h.view.cursor);
  for (const key of ["d", "right", "r"]) h.view.press({ key, modifiers: { control: true } }, h.cx);
  assert.deepEqual(h.view.cursor, cursor);
  assert.equal(h.view.game.moves, 0);
  assert.equal(h.view.confirmReset, undefined);
});
test("cream cards render all four pixel suits, compact ranks and patterned stock independently of theme", () => {
  assert.doesNotMatch(source, /\btheme\b|\.rounded|\.svg|\.image/);
  const h = harness();
  SUITS.forEach((suit, index) => { h.view.game.tableau[index] = [{ suit, rank: index + 10, faceUp: true }]; });
  h.view.game.tableau[0].push({ suit: "diamonds", rank: 9, faceUp: true });
  h.view.render(h.cx);
  for (const suit of SUITS) assert.ok(h.nodes.has(`solitaire-suit-${suit}`));
  assert.ok(h.nodes.has('solitaire-card-back'));
  assert.ok(h.elements.some(el => el.font_family?.[0] === 'monospace'));
  assert.ok(h.elements.some(el => el.bg?.[0] === '#fff1c1'));
  assert.ok(h.elements.some(el => el.bg?.[0] === '#10142b'));
  for (const color of ['#c32f50', '#191f3d']) {
    assert.ok(h.elements.some(el => el.text_color?.[0] === color));
    assert.ok(h.elements.some(el => el.bg?.[0] === color));
  }
  for (const rank of ['10', 'J', 'Q', 'K']) assert.ok(h.texts.includes(rank));
  const compact = h.elements.filter(el => /^solitaire-tableau-/.test(el.id?.[0]));
  assert.ok(compact.length >= 7);
  assert.ok(compact.every(el => [20, 64].includes(el.h[0]) && el.w[0] === 90));
  assert.ok(compact.some(el => el.h[0] === 20), "covered cards retain compact strips");
  assert.equal(compact.filter(el => el.h[0] === 64).length, 7, "bottom cards display full pixel artwork");
  assert.ok(h.elements.some(el => el.items_start), "tableau columns align at the top");
  assert.ok(h.elements.some(el => el.w?.[0] === 1 && el.h?.[0] === 1));
});

test("overlay uses a focusable, appropriately sized modal", async () => {
  const mod = JSON.parse(await readFile(new URL("../mods/tty-solitaire/mod.json", import.meta.url), "utf8"));
  assert.equal(mod.focusable, true); assert.equal(mod.overlay.frame, "none"); assert.equal(mod.overlay.modal, true);
  assert.equal(mod.overlay.width, 900); assert.equal(mod.overlay.height, 720);
});
