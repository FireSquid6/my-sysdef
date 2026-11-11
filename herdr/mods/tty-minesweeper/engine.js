export const SIZE = 9;
export const MINES = 10;
const TOTAL = SIZE * SIZE;
const indexOK = i => Number.isInteger(i) && i >= 0 && i < TOTAL;

export function neighbors(index) {
  const result = [], x = index % SIZE, y = Math.floor(index / SIZE);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && x + dx >= 0 && x + dx < SIZE && y + dy >= 0 && y + dy < SIZE) result.push((y + dy) * SIZE + x + dx);
  }
  return result;
}

export function newGame() {
  return { version: 1, status: "ready", cursor: 0, cells: Array.from({ length: TOTAL }, () => ({ mine: false, count: 0, revealed: false, flagged: false })) };
}

function plant(game, safe, rng) {
  const candidates = Array.from({ length: TOTAL }, (_, i) => i).filter(i => i !== safe);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const i of candidates.slice(0, MINES)) game.cells[i].mine = true;
  game.cells.forEach((cell, i) => { cell.count = neighbors(i).filter(n => game.cells[n].mine).length; });
  game.status = "playing";
}

// These dependency-free operations mutate only the supplied game. RNG is used
// only on the first reveal, so saved boards never need a random seed.
export function reveal(game, index, rng = Math.random) {
  if (!indexOK(index) || !["ready", "playing"].includes(game.status)) return false;
  const cell = game.cells[index];
  if (cell.revealed || cell.flagged) return false;
  if (game.status === "ready") plant(game, index, rng);
  if (cell.mine) { cell.revealed = true; game.status = "lost"; return true; }
  const pending = [index];
  while (pending.length) {
    const i = pending.pop(), next = game.cells[i];
    if (next.revealed || next.flagged || next.mine) continue;
    next.revealed = true;
    if (next.count === 0) pending.push(...neighbors(i));
  }
  if (game.cells.every(c => c.mine || c.revealed)) game.status = "won";
  return true;
}

export function toggleFlag(game, index) {
  if (!indexOK(index) || !["ready", "playing"].includes(game.status) || game.cells[index].revealed) return false;
  game.cells[index].flagged = !game.cells[index].flagged;
  return true;
}

export function validSave(game) {
  if (!game || game.version !== 1 || !indexOK(game.cursor) || !["ready", "playing", "won", "lost"].includes(game.status) || !Array.isArray(game.cells) || game.cells.length !== TOTAL) return false;
  const cells = Array.from(game.cells);
  if (!cells.every(c => c && typeof c.mine === "boolean" && typeof c.revealed === "boolean" && typeof c.flagged === "boolean" && Number.isInteger(c.count) && c.count >= 0 && c.count <= 8 && !(c.revealed && c.flagged))) return false;
  if (game.status === "ready") return cells.every(c => !c.mine && !c.revealed && c.count === 0);
  if (cells.filter(c => c.mine).length !== MINES || !cells.some(c => c.revealed && !c.mine)) return false;
  if (!cells.every((c, i) => c.count === neighbors(i).filter(n => cells[n].mine).length)) return false;
  const hits = cells.filter(c => c.mine && c.revealed).length;
  const complete = cells.every(c => c.mine || c.revealed);
  if (game.status === "lost") return hits === 1 && !complete;
  return hits === 0 && (game.status === "won" ? complete : !complete);
}

export function restoreGame(saved) {
  // Copy known fields only: neither caller nor shared storage owns live state.
  if (!validSave(saved)) return newGame();
  return { version: 1, status: saved.status, cursor: saved.cursor, cells: saved.cells.map(({ mine, count, revealed, flagged }) => ({ mine, count, revealed, flagged })) };
}
