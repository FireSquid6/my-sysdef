import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "../mods/tty-zachtronics/session.js";
import * as cluj from "../mods/tty-zachtronics/cluj.js";
import * as cribbage from "../mods/tty-zachtronics/cribbage.js";

test("restore uses saved initial board without calling the current generator", () => {
  const session = new Session("cluj", cluj, "example-seed");
  session.apply(cluj.legalActions(session.state)[0]);
  const restored = Session.restore("cluj", { ...cluj, newGame() { throw new Error("Generator unavailable"); } }, session.serialize());
  assert.ok(restored); assert.deepEqual(restored.state, session.state);
  restored.restart(); assert.deepEqual(restored.state, session.initial);
});

test("Cribbage restore rejects a voluntary count-one retirement even with correct score and inventory", () => {
  const state = cribbage.newGame(1), i = state.columns.findIndex(c => c.some(x => x.rank === 1));
  const ace = state.columns[i].splice(state.columns[i].findIndex(c => c.rank === 1), 1)[0];
  state.retired = [[ace]]; state.playedFrom = [i];
  assert.ok(cribbage.validateState(state).includes("Illegal voluntary stack reset"));
});

test("Cribbage full-deck traces validate retirement exposure history", () => {
  for (let seed = 1; seed <= 10; seed++) {
    let state = cribbage.newGame(seed);
    while (cribbage.legalActions(state).length) {
      const actions = cribbage.legalActions(state), result = cribbage.applyAction(state, actions[seed % actions.length]);
      assert.ok(!result.error, result.error); state = result.state;
      assert.deepEqual(cribbage.validateState(state), []);
    }
    assert.equal(state.playedFrom.length, 52);
  }
});
