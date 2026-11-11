// Integration coverage lives alongside render/interaction tests in solitaire-ui.test.mjs.
// Keep engine independent of the GPUI host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, draw, move, validSave } from "../mods/tty-solitaire/engine.js";
test("reachable games remain valid across draws and all legal moves", () => {
  const game = newGame(() => 0.37);
  for (let round = 0; round < 40; round++) {
    draw(game);
    const sources = [{ area: "waste" }, ...game.tableau.flatMap((pile, index) => pile.flatMap((c, card) => c.faceUp ? [{ area: "tableau", index, card }] : []))];
    const destinations = [...game.tableau.map((_, index) => ({ area: "tableau", index })), ...game.foundations.map((_, index) => ({ area: "foundations", index }))];
    for (const source of sources) {
      if (destinations.some(dest => move(game, source, dest))) break;
    }
    assert.equal(validSave(game), true);
    assert.equal(validSave(JSON.parse(JSON.stringify(game))), true);
  }
});
