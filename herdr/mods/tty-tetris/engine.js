// Original, dependency-free Guideline-style engine. Coordinates increase downwards;
// rows 0..19 are hidden, 20..39 visible. cells() returns absolute {x,y} objects.
// act('softDrop') descends one cell; set game.softDropping for continuous 20x
// gravity via tick(). tick consumes at most 500ms per call (no long catch-up).
export const WIDTH = 10;
export const HEIGHT = 40;
export const VERSION = 1;
const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
const BASE = {
  I: [[0,1],[1,1],[2,1],[3,1]], J: [[0,0],[0,1],[1,1],[2,1]],
  L: [[2,0],[0,1],[1,1],[2,1]], O: [[1,0],[2,0],[1,1],[2,1]],
  S: [[1,0],[2,0],[0,1],[1,1]], T: [[1,0],[0,1],[1,1],[2,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]],
};
// SRS offsets use upward-positive y; converted when applied.
const JL = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const IK = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};
export function cells(piece) {
  return BASE[piece.type].map(([a,b]) => {
    let x = a, y = b;
    if (piece.type !== 'O') {
      const size = piece.type === 'I' ? 3 : 2;
      for (let i = 0; i < piece.rotation; i++) [x,y] = [size-y,x];
    }
    return {x: piece.x+x, y: piece.y+y};
  });
}
export function fits(game, piece) {
  return cells(piece).every(({x,y}) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && !game.board[y][x]);
}
const grounded = g => !fits(g, {...g.piece, y:g.piece.y+1});
function refill(g, random) {
  while (g.queue.length < 7) {
    const bag = [...TYPES];
    for (let i = 6; i > 0; i--) {
      const j = Math.min(i, Math.max(0, Math.floor(random()*(i+1))));
      [bag[i],bag[j]] = [bag[j],bag[i]];
    }
    g.queue.push(...bag);
  }
}
function spawn(g, random, type) {
  refill(g, random);
  g.piece = {type:type ?? g.queue.shift(), x:3, y:18, rotation:0};
  refill(g, random);
  g.lockElapsed = 0;
  g.lockResets = 0;
  g.gravityElapsed = 0;
  g.lastRotation = null;
  if (!fits(g, g.piece)) g.gameOver = true;
  else if (fits(g, {...g.piece,y:19})) g.piece.y++;
}
export function newGame(random = Math.random, startLevel = 1) {
  const level = Math.max(1, Math.floor(startLevel) || 1);
  const g = {version:VERSION, board:Array.from({length:HEIGHT}, () => Array(WIDTH).fill(null)),
    piece:null, queue:[], paused:false, gameOver:false, score:0, lines:0,
    level, startLevel:level, hold:null, canHold:true, lastClear:null,
    combo:-1, backToBack:false, lockElapsed:0, lockResets:0,
    gravityElapsed:0, lastRotation:null, softDropping:false};
  spawn(g, random);
  return g;
}
export function ghostY(g) {
  if (!g.piece) return null;
  let y = g.piece.y;
  while (fits(g, {...g.piece,y:y+1})) y++;
  return y;
}
function spin(g) {
  if (g.piece.type !== 'T' || !g.lastRotation) return null;
  const {x,y,rotation:r} = g.piece;
  const occupied = (a,b) => a < 0 || a >= WIDTH || b < 0 || b >= HEIGHT || !!g.board[b][a];
  const corners = [[x,y],[x+2,y],[x+2,y+2],[x,y+2]].map(([a,b]) => occupied(a,b));
  if (corners.filter(Boolean).length < 3) return null;
  const fronts = [[0,1],[1,2],[2,3],[3,0]][r];
  return (fronts.every(i => corners[i]) || g.lastRotation.kick === 4) ? 'full' : 'mini';
}
function lock(g, random) {
  const blocks = cells(g.piece);
  const kind = spin(g);
  for (const {x,y} of blocks) g.board[y][x] = g.piece.type;
  if (blocks.every(({y}) => y < 20)) { g.gameOver = true; return; }
  const remaining = g.board.filter(row => !row.every(Boolean));
  const n = HEIGHT-remaining.length;
  g.board = [...Array.from({length:n}, () => Array(WIDTH).fill(null)), ...remaining];
  const difficult = n > 0 && (n === 4 || kind !== null);
  const b2b = difficult && g.backToBack;
  let base = kind === 'full' ? [400,800,1200,1600][n] : kind === 'mini' ? [100,200,400][n] : [0,100,300,500,800][n];
  if (b2b) base *= 1.5;
  g.combo = n ? g.combo+1 : -1;
  const perfect = n > 0 && g.board.every(row => row.every(cell => !cell));
  const pc = perfect ? (n === 4 && b2b ? 3200 : [0,800,1200,1800,2000][n]) : 0;
  const points = (base + (n ? 50*g.combo : 0) + pc)*g.level;
  g.score += points;
  g.lastClear = {lines:n, spin:kind, difficult, backToBack:b2b, combo:g.combo, perfectClear:perfect, points};
  if (n) g.backToBack = difficult;
  g.lines += n;
  g.level = g.startLevel + Math.floor(g.lines/10);
  g.canHold = true;
  spawn(g, random);
}
function resetLock(g, wasGrounded) {
  if (wasGrounded && g.lockResets < 15) {
    g.lockResets++;
    g.lockElapsed = 0;
  }
}
export function act(g, action, random = Math.random) {
  if (g.paused || g.gameOver) return g;
  const wasGrounded = grounded(g);
  if (action === 'hold') {
    if (!g.canHold) return g;
    const old = g.hold;
    g.hold = g.piece.type;
    spawn(g, random, old ?? undefined);
    g.canHold = false;
  } else if (action === 'hardDrop') {
    const y = ghostY(g);
    g.score += (y-g.piece.y)*2;
    // Dropping does not erase the last rotation, including zero-distance drops.
    g.piece.y = y;
    lock(g, random);
  } else if (action === 'left' || action === 'right' || action === 'softDrop') {
    const p = {...g.piece};
    if (action === 'softDrop') p.y++;
    else p.x += action === 'left' ? -1 : 1;
    if (fits(g,p)) {
      g.piece = p;
      g.lastRotation = null;
      if (action === 'softDrop') g.score++;
      else resetLock(g, wasGrounded);
    }
  } else if (action === 'rotateCW' || action === 'rotateCCW') {
    if (g.piece.type === 'O') return g;
    const r = (g.piece.rotation+(action === 'rotateCW' ? 1 : 3))%4;
    const kicks = (g.piece.type === 'I' ? IK : JL)[`${g.piece.rotation}>${r}`];
    for (let i = 0; i < kicks.length; i++) {
      const [dx,dy] = kicks[i];
      const p = {...g.piece, x:g.piece.x+dx, y:g.piece.y-dy, rotation:r};
      if (fits(g,p)) {
        g.piece = p;
        g.lastRotation = {kick:i};
        resetLock(g, wasGrounded);
        break;
      }
    }
  }
  return g;
}
export function gravityInterval(level) {
  return Math.max(1000/1200, 1000*Math.pow(Math.max(0.001, 0.8-0.007*(level-1)), level-1));
}
export function tick(g, ms, random = Math.random) {
  if (g.paused || g.gameOver || !Number.isFinite(ms) || ms <= 0) return g;
  let remaining = Math.min(ms,500);
  while (remaining > 1e-9 && !g.gameOver) {
    if (grounded(g)) {
      const dt = Math.min(remaining, Math.max(0,500-g.lockElapsed));
      g.lockElapsed += dt;
      remaining -= dt;
      if (g.lockElapsed >= 500-1e-9) lock(g, random);
    } else {
      const interval = gravityInterval(g.level)/(g.softDropping ? 20 : 1);
      const dt = Math.min(remaining, Math.max(0,interval-g.gravityElapsed));
      g.gravityElapsed += dt;
      remaining -= dt;
      if (g.gravityElapsed >= interval-1e-9) {
        g.gravityElapsed = 0;
        g.piece.y++;
        if (g.softDropping) g.score++;
      }
    }
  }
  return g;
}
