import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAMES } from "../mods/tty-zachtronics/registry.js";
import { Session, clone } from "../mods/tty-zachtronics/session.js";
const art = await readFile(new URL("../mods/tty-zachtronics/art.js", import.meta.url), "utf8");
const { P, faceColor, shortLabel } = new Function(art.replace(/^import .*;$/gm, "").replace(/export /g, "") + "\nreturn { P, faceColor, shortLabel };")();

const source = await readFile(new URL("../mods/tty-zachtronics/main.js", import.meta.url), "utf8");
function harness(saved = {}) {
  const clicks = new Map(), texts = [], backgrounds = [], closed = [], opened = [], scrolled = [];
  let focused = false;
  function element() {
    let id;
    const el = new Proxy({}, { get: (_target, name) => (...args) => {
      if (name === "id") id = args[0];
      if (name === "on_click") clicks.set(id, args[0]);
      if (name === "child" && typeof args[0] === "string") texts.push(args[0]);
      if (name === "bg") backgrounds.push(args[0]);
      if (name === "when" && args[0]) args[1](el);
      return el;
    } });
    return el;
  }
  const deps = { reportContext() {}, View: class {}, div: element, h_flex: element, v_flex: element,
    ScrollHandle: { new: () => ({ scroll_to_item: i => scrolled.push(i) }) },
    shared: k => clone(saved[k] ?? null), setShared: (k, v) => { saved[k] = clone(v); },
    props: () => ({ overlay: "collection" }), closeOverlay: id => closed.push(id), openOverlay: options => opened.push(options),
    GAMES, Session, P, faceColor, shortLabel, pixels: element, cardIcon: () => "star" };
  const Collection = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const cx = { focus_handle: () => ({ focus() { focused = true; } }), timer: { after: (_ms, fn) => fn() }, notify() {}, stop_propagation() {} };
  const view = new Collection(); view.init({}, cx);
  return { view, cx, saved, clicks, texts, backgrounds, closed, opened, scrolled,
    get focused() { return focused; }, render() { return view.render(cx); },
    press(key, extra = {}) { view.press({ key, ...extra }, cx); }, click(id) { clicks.get(`zach-${id}`)({}, cx); } };
}

for (const { id, engine } of GAMES) {
  test(`${id}: seeded deals, legal traces, exact undo/redo, save replay and restart`, () => {
    assert.deepEqual(engine.newGame(12345), engine.newGame(12345));
    for (let seed = 1; seed <= 5; seed++) {
      const session = new Session(id, engine, seed), initial = clone(session.state);
      for (let step = 0; step < 30; step++) {
        assert.deepEqual(engine.validateState(session.state), []);
        const model = engine.view(session.state), zones = new Set(model.zones.map(z => z.id));
        for (const zone of model.zones) {
          assert.ok(Array.isArray(zone.cards));
          for (const card of zone.cards) assert.equal(typeof card.label, "string");
        }
        const actions = engine.legalActions(session.state);
        for (const action of actions) {
          assert.equal(typeof action.label, "string");
          if (action.from) assert.ok(zones.has(action.from), `${id} missing source ${action.from}`);
          if (action.to) assert.ok(zones.has(action.to), `${id} missing destination ${action.to}`);
        }
        if (!actions.length) break;
        const before = clone(session.state), action = actions[(step * 17 + seed * 7) % actions.length];
        assert.ok(!session.apply(action).error);
        const after = clone(session.state);
        assert.ok(session.undo()); assert.deepEqual(session.state, before);
        if (id === "fortune") {
          assert.equal(session.undo(), false); assert.equal(session.redo(), false);
          assert.ok(!session.apply(action).error);
        } else { assert.ok(session.redo()); assert.deepEqual(session.state, after); }
        const serialized = session.serialize(), restored = Session.restore(id, engine, serialized);
        assert.ok(restored, `${id} save should restore`); assert.deepEqual(restored.state, session.state);
        const digest = JSON.stringify(session.serialize());
        assert.ok(session.apply({ type: "not-a-move" }).error);
        assert.equal(JSON.stringify(session.serialize()), digest);
      }
      session.restart(); assert.deepEqual(session.state, initial); assert.equal(session.undo(), false);
    }
  });
}

test("save rejects corruption, stale revisions, incompatible policies and replay tampering", () => {
  const { id, engine } = GAMES[0], session = new Session(id, engine, 22);
  const action = engine.legalActions(session.state)[0], revision = session.revision;
  assert.ok(!session.apply(action, revision).error);
  assert.ok(session.undo());
  assert.equal(session.apply(action, revision).error, "STALE_REVISION");
  assert.ok(session.redo());
  const saved = session.serialize();
  for (const mutate of [s => { s.schema = 9; }, s => { s.gameId = "other"; },
    s => { s.current = {}; }, s => { s.initial = {}; }, s => { s.commands[0].type = "fake"; },
    s => { s.policies = ["fake"]; }, s => { s.cursor = -1; }, s => { s.mirrorAvailable = null; }]) {
    const corrupt = clone(saved); mutate(corrupt); assert.equal(Session.restore(id, engine, corrupt), null);
  }
});

test("collection has eight mouse/keyboard choices, original pixel palette and playable renders", () => {
  const h = harness(); assert.ok(h.focused); h.render();
  h.press("up"); assert.equal(h.view.menuIndex, 7);
  h.press("down"); assert.equal(h.view.menuIndex, 0);
  for (let i = 0; i < GAMES.length; i++) {
    const h = harness(); h.render(); h.click(`game-${GAMES[i].id}`); h.render();
    assert.equal(h.view.game.id, GAMES[i].id);
    assert.ok(h.backgrounds.includes("#10142b")); assert.ok(h.backgrounds.includes("#fff1c1"));
    h.click("rules"); h.render();
    for (const policy of GAMES[i].engine.policies) assert.ok(h.texts.includes(policy));
    h.press("b"); assert.equal(h.view.session, null);
    h.press(String(i + 1)); assert.equal(h.view.game.id, GAMES[i].id);
  }
});

test("Kabufuda difficulty changes require confirmation and persist across new deals", () => {
  const h = harness(); h.press("4"); h.render();
  const initial = clone(h.view.session.state);
  h.click("difficulty"); assert.deepEqual(h.view.session.state, initial);
  h.press("n"); h.press("n"); h.press("y");
  assert.equal(h.view.session.state.difficulty, "Normal", "cancel does not leak pending difficulty");
  h.render(); h.click("difficulty"); h.press("y");
  assert.equal(h.view.session.state.difficulty, "Hard");
  h.press("n"); h.press("y"); assert.equal(h.view.session.state.difficulty, "Hard");
});

test("Fortune mirror remains consumed after save and restore", () => {
  const h = harness(); h.press("8"); h.press("enter"); h.press("enter"); h.press("u");
  const saved = h.view.session.serialize();
  const restored = Session.restore("fortune", GAMES[7].engine, saved);
  assert.ok(restored); assert.equal(restored.undo(), false); assert.equal(restored.redo(), false);
});

test("Sigmar mouse pairing works in either selection order", () => {
  for (const reverse of [false, true]) {
    const h = harness(); h.press("2");
    const action = h.view.actions().find(a => a.type === "pair"), initial = clone(h.view.session.state);
    h.view.select(reverse ? action.to : action.from, 0, h.cx);
    assert.ok(h.view.actions().some(a => a.from === action.from && a.to === action.to));
    h.view.select(reverse ? action.from : action.to, 0, h.cx);
    assert.equal(h.view.session.state.removed.length, initial.removed.length + 2);
  }
});

test("UI applies legal moves, saves, closes once, and restores after reopening", () => {
  const h = harness(); h.press("1"); const before = clone(h.view.session.state);
  h.render(); h.click("action-0"); assert.notDeepEqual(h.view.session.state, before);
  const after = clone(h.view.session.state);
  h.press("u"); assert.deepEqual(h.view.session.state, before);
  h.press("y"); assert.deepEqual(h.view.session.state, after);
  h.press("escape"); h.press("enter"); assert.deepEqual(h.closed, ["collection"]);
  const reopened = harness(h.saved); reopened.press("1"); assert.deepEqual(reopened.view.session.state, after);
  reopened.view.close(); assert.ok(reopened.saved["zachtronics.shenzhen"]);
});

test("confirmation, modifier/held suppression, selection filtering and stale click handling", () => {
  const h = harness(); h.press("1", { modifiers: { control: true } }); assert.equal(h.view.session, undefined);
  h.press("1"); const initial = clone(h.view.session.state); h.render();
  const stale = h.clicks.get("zach-action-0");
  h.press("enter", { is_held: true }); assert.deepEqual(h.view.session.state, initial);
  h.press("r"); h.press("enter"); assert.deepEqual(h.view.session.state, initial);
  h.press("escape"); assert.equal(h.view.confirm, null); assert.equal(h.closed.length, 0);
  h.press("enter"); const after = clone(h.view.session.state);
  stale({}, h.cx); assert.deepEqual(h.view.session.state, after); assert.equal(h.view.message, "STALE_REVISION");
  const action = h.view.actions().find(a => a.from);
  if (action) {
    h.view.select(action.from, action.index, h.cx);
    assert.ok(h.view.actions().every(a => a.from === action.from));
    h.press("backspace"); assert.equal(h.view.selected, null);
  }
  h.press("r"); h.press("y"); assert.deepEqual(h.view.session.state, initial);
  h.render(); h.click("arcade"); assert.equal(h.opened[0].mod, "tty-arcade");
});
