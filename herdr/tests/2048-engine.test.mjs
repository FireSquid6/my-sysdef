import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, mergeLine, move, undo, won, lost, spawn, validSave } from '../mods/tty-2048/engine.js';
const fixture = board => ({ ...newGame(1), board, undo: null });
test('compression and single-merge rules, including gaps and triples', () => {
  for (const [input, output, score] of [
    [[2,2,2,2], [4,4,0,0], 8], [[2,2,4,0], [4,4,0,0], 4],
    [[2,0,2,2], [4,2,0,0], 4], [[4,4,8,8], [8,16,0,0], 24],
    [[0,0,0,2], [2,0,0,0], 0], [[2,4,8,16], [2,4,8,16], 0],
  ]) {
    const before = input.slice(); assert.deepEqual(mergeLine(input), { line: output, score }); assert.deepEqual(input, before);
  }
});
test('four directions merge toward the requested edge and spawn exactly one tile', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    const board = Array(16).fill(0), vertical = ['up','down'].includes(direction);
    board[0] = 2; board[vertical ? 4 : 1] = 2;
    const game = fixture(board);
    assert.equal(move(game, direction), true);
    const target = { left: 0, right: 3, up: 0, down: 12 }[direction];
    assert.equal(game.board[target], 4); assert.equal(game.score, 4); assert.equal(game.moves, 1);
    assert.equal(game.board.filter(Boolean).length, 2);
    assert.equal(validSave(game), true);
  }
});
test('no-op and invalid direction consume no entropy, score, or undo', () => {
  const game = fixture([2,4,0,0, ...Array(12).fill(0)]), before = structuredClone(game);
  assert.equal(move(game, 'left'), false); assert.equal(move(game, 'invalid'), false);
  assert.deepEqual(game, before);
  move(game, 'right');
  game.board = [2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
  const after = structuredClone(game);
  assert.equal(move(game, 'up'), false); assert.deepEqual(game, after);
});
test('seeded spawning is deterministic, picks empty cells and produces 2 and 4', () => {
  assert.deepEqual(newGame(17), newGame(17));
  const values = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const game = newGame(seed); assert.equal(game.board.filter(Boolean).length, 2);
    game.board.filter(Boolean).forEach(v => values.add(v)); assert.equal(validSave(game), true);
  }
  assert.deepEqual([...values].sort(), [2,4]);
  const full = fixture(Array(16).fill(2)), rng = full.rng;
  assert.equal(spawn(full), false); assert.equal(full.rng, rng);
});
test('undo restores board, score, flags and RNG; repeating move reproduces spawn; only one undo', () => {
  const game = fixture([1024,1024,0,0, ...Array(12).fill(0)]), before = structuredClone(game);
  move(game, 'left'); const after = structuredClone(game);
  assert.equal(won(game), true); assert.equal(game.score, 2048);
  game.continued = true; assert.equal(undo(game), true); assert.deepEqual(game, before);
  assert.equal(undo(game), false); move(game, 'left'); assert.deepEqual(game, after);
  const snapshot = game.undo; game.board[0] = 4; assert.equal(snapshot.board[0], 1024);
});
test('2048 is a milestone, never a movement lock; loss checks horizontal and vertical adjacency', () => {
  const game = fixture([1024,1024,0,0, ...Array(12).fill(0)]);
  move(game, 'left'); assert.equal(won(game), true); assert.equal(lost(game), false);
  assert.equal(move(game, 'right'), true); assert.equal(won(game), true);
  const dead = fixture([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]);
  assert.equal(lost(dead), true);
  for (const direction of ['left','right','up','down']) assert.equal(move(dead, direction), false);
  dead.board[1] = 2; assert.equal(lost(dead), false);
  dead.board[1] = 4; dead.board[4] = 2; assert.equal(lost(dead), false);
  dead.board[4] = 0; assert.equal(lost(dead), false);
});
test('strict saves reject malformed fields and snapshots without throwing', () => {
  const good = newGame(18); move(good, 'right'); assert.equal(validSave(good), true);
  for (const bad of [null, [], {}, { ...good, extra: 1 }, { ...good, version: 2 },
    ...['score','moves','rng'].flatMap(key => [-1, NaN, Infinity, '2', 0.5].map(value => ({ ...good, [key]: value }))),
    { ...good, board: [] }, { ...good, board: Array(16).fill(3) }, { ...good, board: Array(16).fill(1) },
    { ...good, board: Array(16).fill(0) }, { ...good, board: Array(16) }, { ...good, board: Array(16).fill(null) },
    { ...good, won: true }, { ...good, continued: true }, { ...good, undo: {} }, { ...good, undo: good },
    { ...good, undo: { ...good.undo, score: -4 } }, { ...good, undo: { ...good.undo, moves: 900 } },
  ]) assert.equal(validSave(bad), false);
});
test('move counter overflow is rejected atomically', () => {
  const game = fixture([2,2,0,0, ...Array(12).fill(0)]); game.moves = Number.MAX_SAFE_INTEGER;
  assert.equal(validSave(game), true);
  const before = structuredClone(game);
  assert.equal(move(game, 'left'), false); assert.deepEqual(game, before);
});
test('reachable games and JSON snapshots stay valid across moves and undo', () => {
  const game = newGame(231);
  for (let i = 0; i < 500; i++) {
    move(game, ['left','up','right','down'][i % 4]);
    if (i % 17 === 0) undo(game);
    assert.equal(validSave(game), true); assert.equal(validSave(JSON.parse(JSON.stringify(game))), true);
  }
});
