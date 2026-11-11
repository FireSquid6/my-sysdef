import { test } from "node:test";
import assert from "node:assert/strict";
import { MINES, newGame, neighbors, reveal, toggleFlag, validSave, restoreGame } from "../mods/tty-minesweeper/engine.js";

function rng(seed = 123) { return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32); }
const copy = value => JSON.parse(JSON.stringify(value));

test("9x9 board defers ten mines until a safe first reveal at every position", () => {
  for (let first = 0; first < 81; first++) {
    const game = newGame();
    assert.equal(game.cells.length, 81); assert.ok(validSave(game));
    assert.ok(game.cells.every(c => !c.mine && !c.revealed));
    assert.equal(reveal(game, first, rng(first)), true);
    assert.equal(game.cells[first].mine, false); assert.equal(game.cells[first].revealed, true);
    assert.equal(game.cells.filter(c => c.mine).length, MINES);
    for (let i = 0; i < 81; i++) assert.equal(game.cells[i].count, neighbors(i).filter(n => game.cells[n].mine).length);
    assert.ok(validSave(game));
  }
});

test("deterministic RNG and neighbors do not wrap at board edges", () => {
  const a = newGame(), b = newGame(); reveal(a, 40, rng()); reveal(b, 40, rng()); assert.deepEqual(a, b);
  assert.deepEqual(neighbors(0), [1, 9, 10]); assert.equal(neighbors(40).length, 8); assert.equal(neighbors(8).length, 3);
});

test("flags block reveal, survive first placement and cannot change revealed squares", () => {
  const game = newGame(); toggleFlag(game, 0);
  assert.equal(reveal(game, 0, () => { throw new Error("must not plant"); }), false);
  assert.equal(game.status, "ready"); assert.ok(validSave(game));
  reveal(game, 40, rng()); assert.equal(game.cells[0].flagged, true); assert.equal(game.cells[0].revealed, false);
  assert.equal(toggleFlag(game, 40), false);
  assert.equal(toggleFlag(game, 0), true); assert.equal(game.cells[0].flagged, false);
  for (const index of [-1, 81, 0.5, NaN, undefined]) {
    assert.equal(reveal(game, index), false); assert.equal(toggleFlag(game, index), false);
  }
});

test("flood fill opens connected zeroes and numbered boundaries, but respects flags", () => {
  const game = newGame();
  // A constant near-one RNG leaves candidates ordered: mines occupy 1..10.
  toggleFlag(game, 80); reveal(game, 0, () => 0.999999);
  assert.equal(game.cells[0].revealed, true);
  reveal(game, 79);
  assert.ok(game.cells.slice(18, 80).every(c => c.revealed));
  assert.equal(game.cells[80].revealed, false); assert.equal(game.status, "playing");
  assert.ok(game.cells[11].revealed); assert.ok(game.cells[11].count > 0);
  toggleFlag(game, 80); reveal(game, 80); assert.equal(game.status, "won"); assert.ok(validSave(game));
});

test("all safe cells wins without flags, hitting a mine loses, terminal games freeze", () => {
  for (const outcome of ["won", "lost"]) {
    const game = newGame(); reveal(game, 40, rng());
    if (outcome === "won") game.cells.forEach((c, i) => { if (!c.mine) reveal(game, i); });
    else reveal(game, game.cells.findIndex(c => c.mine));
    assert.equal(game.status, outcome); assert.ok(validSave(game));
    const snapshot = copy(game);
    assert.equal(reveal(game, 0), false); assert.equal(toggleFlag(game, 1), false); assert.deepEqual(game, snapshot);
  }
});

test("persistence restores independent snapshots of ready, active, won and lost games", () => {
  const ready = newGame(); toggleFlag(ready, 4);
  const active = newGame(); reveal(active, 40, rng());
  const lost = copy(active); reveal(lost, lost.cells.findIndex(c => c.mine));
  const won = copy(active); won.cells.forEach((c, i) => { if (!c.mine) reveal(won, i); });
  for (const game of [ready, active, won, lost]) {
    const restored = restoreGame(game); assert.deepEqual(restored, game);
    restored.cells[4].flagged = !restored.cells[4].flagged;
    assert.notEqual(restored.cells[4].flagged, game.cells[4].flagged);
  }
});

test("validation rejects malformed, inconsistent and impossible persistence", () => {
  const active = newGame(); reveal(active, 40, rng());
  const invalid = [null, false, [], {}, { ...newGame(), cells: Array(81) }];
  for (const change of [
    g => { g.version = 2; }, g => { g.cursor = 81; }, g => { g.cursor = 0.1; },
    g => { g.status = "nope"; }, g => { g.cells.pop(); }, g => { g.cells[0] = null; },
    g => { g.cells[0].mine = "false"; }, g => { g.cells[0].count = 9; },
    g => { g.cells[40].flagged = true; }, g => { g.cells[0].count = (g.cells[0].count + 1) % 9; },
    g => { g.cells.find(c => c.mine).mine = false; }, g => { g.status = "ready"; },
    g => { g.status = "won"; }, g => { g.status = "lost"; },
    g => { g.cells.forEach(c => { c.revealed = false; }); },
    g => { g.cells.find(c => c.mine).revealed = true; },
  ]) { const value = copy(active); change(value); invalid.push(value); }
  for (const value of invalid) { assert.equal(validSave(value), false); assert.deepEqual(restoreGame(value), newGame()); }
});
