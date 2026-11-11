// Pure rules: all entropy lives in the game, so undo also restores the next spawn.
export const DIRECTIONS = ['left', 'right', 'up', 'down'];
const copy = value => JSON.parse(JSON.stringify(value));
const fields = ['board', 'score', 'moves', 'rng', 'won', 'continued'];
const snapshot = game => Object.fromEntries(fields.map(key => [key, copy(game[key])]));
function random(game) {
  game.rng = (Math.imul(game.rng, 1664525) + 1013904223) >>> 0;
  return game.rng / 4294967296;
}
export function spawn(game) {
  const empty = game.board.flatMap((value, i) => value === 0 ? [i] : []);
  if (!empty.length) return false;
  const index = empty[Math.floor(random(game) * empty.length)];
  game.board[index] = random(game) < 0.9 ? 2 : 4;
  return true;
}
export function newGame(seed = Math.floor(Math.random() * 4294967296)) {
  const game = { version: 1, board: Array(16).fill(0), score: 0, moves: 0, rng: seed >>> 0, won: false, continued: false, undo: null };
  spawn(game); spawn(game);
  return game;
}
export function mergeLine(line) {
  const compact = line.filter(Boolean), result = [];
  let score = 0;
  for (let i = 0; i < compact.length; i++) {
    if (compact[i] === compact[i + 1]) { const value = compact[i] * 2; result.push(value); score += value; i++; }
    else result.push(compact[i]);
  }
  while (result.length < line.length) result.push(0);
  return { line: result, score };
}
function indices(direction, line) {
  return Array.from({ length: 4 }, (_, i) => {
    const n = direction === 'right' || direction === 'down' ? 3 - i : i;
    return direction === 'left' || direction === 'right' ? line * 4 + n : n * 4 + line;
  });
}
export function move(game, direction) {
  if (!DIRECTIONS.includes(direction) || !Number.isSafeInteger(game.moves + 1)) return false;
  const board = game.board.slice(); let score = game.score;
  for (let n = 0; n < 4; n++) {
    const cells = indices(direction, n), merged = mergeLine(cells.map(i => game.board[i]));
    cells.forEach((index, i) => { board[index] = merged.line[i]; }); score += merged.score;
  }
  if (board.every((v, i) => v === game.board[i]) || !Number.isSafeInteger(score) || board.some(v => v > 2 ** 52)) return false;
  game.undo = snapshot(game);
  game.board = board; game.score = score; game.moves++;
  game.won ||= board.some(value => value >= 2048);
  spawn(game);
  return true;
}
export function undo(game) {
  if (!game.undo) return false;
  const previous = copy(game.undo);
  Object.assign(game, previous, { undo: null });
  return true;
}
export const won = game => game.won;
export function lost(game) {
  return game.board.every(Boolean) && game.board.every((value, i, board) =>
    (i % 4 === 3 || value !== board[i + 1]) && (i >= 12 || value !== board[i + 4]));
}
function exact(value, keys) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function validSnapshot(value) {
  return exact(value, fields) && Array.isArray(value.board) && value.board.length === 16 &&
    Array.from(value.board).every(v => Number.isSafeInteger(v) && v >= 0 && (v === 0 || (v >= 2 && v <= 2 ** 52 && 2 ** Math.round(Math.log2(v)) === v))) &&
    value.board.filter(Boolean).length >= 2 && Number.isSafeInteger(value.score) && value.score >= 0 && value.score % 4 === 0 &&
    Number.isSafeInteger(value.moves) && value.moves >= 0 && Number.isInteger(value.rng) && value.rng >= 0 && value.rng <= 4294967295 &&
    typeof value.won === 'boolean' && value.won === value.board.some(v => v >= 2048) &&
    typeof value.continued === 'boolean' && (!value.continued || value.won);
}
export function validSave(game) {
  return exact(game, ['version', ...fields, 'undo']) && game.version === 1 && validSnapshot(snapshotSafe(game)) &&
    (game.undo === null || (validSnapshot(game.undo) && game.undo.moves + 1 === game.moves && game.undo.score <= game.score));
}
function snapshotSafe(game) { return Object.fromEntries(fields.map(key => [key, game[key]])); }
