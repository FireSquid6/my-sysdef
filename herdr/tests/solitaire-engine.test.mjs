import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, draw, move, won, validSave, SUITS, canAutoComplete, autoComplete } from "../mods/tty-solitaire/engine.js";
import { exposedGame } from "./solitaire-fixtures.mjs";
const card = (rank, suit = "clubs", faceUp = true) => ({ rank, suit, faceUp });
const empty = () => ({ version: 1, moves: 0, stock: [], waste: [], tableau: Array.from({ length: 7 }, () => []), foundations: Array.from({ length: 4 }, () => []) });
const tab = (index, card) => ({ area: "tableau", index, ...(card === undefined ? {} : { card }) });
const foundation = index => ({ area: "foundations", index });
const waste = { area: "waste" };
test("deal has 52 unique shuffled cards, 24 stock and seven correctly exposed columns", () => {
  const g = newGame(() => 0.5);
  assert.equal(g.stock.length, 24); assert.equal(validSave(g), true);
  assert.deepEqual(g.tableau.map(p => p.length), [1, 2, 3, 4, 5, 6, 7]);
  g.tableau.forEach(p => assert.deepEqual(p.map(c => c.faceUp), p.map((_, i) => i === p.length - 1)));
  assert.notDeepEqual(newGame(() => 0), newGame(() => 0.9));
});
test("draw one and recycle preserve exact order and visibility over multiple passes", () => {
  const g = newGame(), original = structuredClone(g.stock);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 23; i >= 0; i--) {
      assert.equal(draw(g), true); assert.deepEqual(g.waste.at(-1), { ...original[i], faceUp: true });
      assert.equal(validSave(g), true);
    }
    assert.equal(draw(g), true); assert.deepEqual(g.stock, original); assert.equal(g.waste.length, 0);
  }
  assert.equal(draw(empty()), false);
});
test("tableau accepts alternating descending stacks, flips exposed card, rejects illegal moves atomically", () => {
  const g = empty(); g.tableau[0] = [card(4, "hearts", false), card(12, "clubs"), card(11, "hearts")];
  g.tableau[1] = [card(13, "diamonds")];
  const before = structuredClone(g);
  for (const [source, dest] of [[tab(0, 0), tab(1)], [tab(0, 2), tab(1)], [tab(0, 1), tab(2)], [tab(0, 1), tab(0)], [tab(9), tab(0)], [tab(0, 1), waste]]) {
    assert.equal(move(g, source, dest), false); assert.deepEqual(g, before);
  }
  assert.equal(move(g, tab(0, 1), tab(1)), true);
  assert.equal(g.tableau[0][0].faceUp, true); assert.equal(g.tableau[1].length, 3);
  assert.equal(move(g, tab(1, 0), tab(2)), true);
  g.waste = [card(10, "spades")]; assert.equal(move(g, waste, tab(2)), true);
  g.waste = [card(9, "clubs")]; assert.equal(move(g, waste, tab(2)), false);
});
test("foundations accept only single cards ascending in suit; foundation cards can return to tableau", () => {
  const g = empty(); g.waste = [card(2), card(1)];
  assert.equal(move(g, { ...waste, card: 0 }, foundation(0)), false);
  assert.equal(move(g, waste, foundation(0)), true);
  assert.equal(move(g, waste, foundation(0)), true);
  g.waste = [card(3, "hearts")]; assert.equal(move(g, waste, foundation(0)), false);
  assert.equal(move(g, waste, foundation(1)), false);
  g.tableau[0] = [card(3, "hearts")]; assert.equal(move(g, foundation(0), tab(0)), true);
  g.tableau[1] = [card(2, "spades"), card(1, "hearts")]; assert.equal(move(g, tab(1, 0), foundation(1)), false);
});
test("win is detected after the final king and won games cannot change", () => {
  const g = empty();
  g.foundations = SUITS.map(s => Array.from({ length: 13 }, (_, i) => card(i + 1, s)));
  g.waste = [g.foundations[3].pop()]; assert.equal(won(g), false); assert.equal(validSave(g), true);
  assert.equal(move(g, waste, foundation(3)), true); assert.equal(won(g), true); assert.equal(validSave(g), true);
  assert.equal(draw(g), false); assert.equal(move(g, foundation(0), tab(0)), false);
});
test("autocomplete legally finishes fully exposed tableaux with empty or partial foundations", () => {
  for (const rank of [0, 5, 12]) {
    const g = exposedGame(rank), before = g.moves;
    assert.equal(validSave(g), true); assert.equal(canAutoComplete(g), true);
    assert.equal(autoComplete(g), 52 - rank * 4);
    assert.equal(g.moves, before + 52 - rank * 4);
    assert.equal(won(g), true); assert.equal(validSave(g), true);
    assert.ok(g.tableau.every(pile => pile.length === 0));
    assert.equal(canAutoComplete(g), false);
    const snapshot = structuredClone(g);
    assert.equal(autoComplete(g), 0); assert.deepEqual(g, snapshot);
  }
});
test("autocomplete respects shuffled foundation slots and differently advanced suits", () => {
  const g = exposedGame(6);
  // Advance two accessible sevens manually, then reorder the foundation slots.
  for (const index of [0, 2]) {
    const suit = g.tableau[index].at(-1).suit;
    assert.equal(move(g, tab(index), foundation(g.foundations.findIndex(pile => pile[0].suit === suit))), true);
  }
  g.foundations.reverse();
  assert.equal(validSave(g), true); assert.equal(canAutoComplete(g), true);
  assert.equal(autoComplete(g), 26);
  assert.equal(won(g), true); assert.equal(validSave(g), true);
});
test("autocomplete never reveals hidden cards or drains the stock/waste, and rejects malformed games", () => {
  const hidden = exposedGame(); hidden.tableau[0][0].faceUp = false;
  assert.equal(validSave(hidden), true);
  const wasteGame = exposedGame(); wasteGame.waste.push(wasteGame.tableau[0].pop());
  assert.equal(validSave(wasteGame), true);
  const stockGame = exposedGame(); stockGame.stock.push(stockGame.tableau[0].pop()); stockGame.stock[0].faceUp = false;
  assert.equal(validSave(stockGame), true);
  const invalid = exposedGame(); invalid.tableau[0].pop();
  for (const g of [newGame(), hidden, wasteGame, stockGame, invalid, null, {}]) {
    const snapshot = structuredClone(g);
    assert.equal(canAutoComplete(g), false); assert.equal(autoComplete(g), 0);
    assert.deepEqual(g, snapshot);
  }
});
test("validation rejects malformed saves, duplicates, impossible exposure and illegal sequences", () => {
  for (const bad of [null, false, {}, { version: 1 }, { ...newGame(), tableau: null }]) assert.equal(validSave(bad), false);
  const mutations = [g => { g.stock[0] = g.stock[1]; }, g => { g.stock.pop(); }, g => { g.stock[0].rank = 14; },
    g => { g.stock[0].faceUp = true; }, g => { g.moves = -1; }, g => { g.tableau[1][0].faceUp = true; },
    g => { g.tableau[0][0].faceUp = false; }, g => { g.stock[0] = null; }, g => { g.foundations[0] = [g.stock.pop()]; }];
  for (const mutate of mutations) { const g = newGame(() => 0.5); mutate(g); assert.equal(validSave(g), false); }
});
