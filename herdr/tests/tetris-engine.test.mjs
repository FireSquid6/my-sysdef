import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame, cells, fits, ghostY, act, tick, gravityInterval} from '../mods/tty-tetris/engine.js';

const rng = () => 0.37;
const fresh = (level = 1) => newGame(rng, level);
function piece(g, type, x, y, rotation = 0) {
  g.piece = {type,x,y,rotation};
  g.lockElapsed = 0; g.lockResets = 0; g.gravityElapsed = 0; g.lastRotation = null;
}
function clearBoard(g) { g.board = Array.from({length:40}, () => Array(10).fill(null)); }
function four(g, perfect = false) {
  clearBoard(g);
  for (let y = 36; y < 40; y++) g.board[y] = Array.from({length:10}, (_,x) => x === 4 ? null : 'J');
  if (!perfect) g.board[30][0] = 'J';
  piece(g, 'I', 2, 36, 1);
  tick(g,500,rng);
}
function single(g) {
  clearBoard(g);
  g.board[39].fill('J'); g.board[39][4] = null; g.board[39][5] = null;
  g.board[30][0] = 'J';
  piece(g,'O',3,38);
  tick(g,500,rng);
}

test('serializable versioned 40x10 state, centered spawn, immediate fall, queue', () => {
  const g = fresh();
  assert.equal(g.version,1);
  assert.equal(g.board.length,40);
  assert.ok(g.board.every(row => row.length === 10));
  assert.ok(g.queue.length >= 5);
  assert.equal(g.piece.x,3);
  assert.equal(g.piece.y,19);
  assert.equal(g.paused,false);
  assert.deepEqual(JSON.parse(JSON.stringify(g)),g);
  assert.deepEqual(cells({type:'I',x:3,y:18,rotation:0}), [3,4,5,6].map(x => ({x,y:19})));
});

test('successive seven bags are permutations and deterministic', () => {
  function collect(random) {
    const g = newGame(random); const types = [];
    for (let i=0;i<70;i++) {
      types.push(g.piece.type);
      clearBoard(g); act(g,'hardDrop',random);
      assert.ok(g.queue.length >= 5);
    }
    return types;
  }
  const a = collect(rng);
  assert.deepEqual(a,collect(rng));
  for (let i=0;i<a.length;i+=7) assert.equal(new Set(a.slice(i,i+7)).size,7);
  assert.notDeepEqual(a,collect(() => 0.9));
});

test('SRS orientations and distinct JLSTZ/I wall kicks', () => {
  const g = fresh();
  piece(g,'T',-1,25,1);
  assert.ok(fits(g,g.piece));
  act(g,'rotateCCW',rng);
  assert.deepEqual(g.piece,{type:'T',x:0,y:25,rotation:0});
  assert.equal(g.lastRotation.kick,1);
  piece(g,'I',-2,25,1);
  assert.ok(fits(g,g.piece));
  act(g,'rotateCCW',rng);
  assert.deepEqual(g.piece,{type:'I',x:0,y:25,rotation:0});
  assert.equal(g.lastRotation.kick,1);
  piece(g,'T',3,38);
  act(g,'rotateCW',rng);
  assert.deepEqual(g.piece,{type:'T',x:2,y:37,rotation:1});
  assert.equal(g.lastRotation.kick,2);
  piece(g,'I',3,38);
  act(g,'rotateCW',rng);
  assert.deepEqual(g.piece,{type:'I',x:4,y:36,rotation:1});
  assert.equal(g.lastRotation.kick,4);
});

test('four rotations restore shapes, O stays fixed, failed moves do not reset', () => {
  const g = fresh();
  for (const type of ['I','J','L','O','S','T','Z']) {
    piece(g,type,3,25);
    const before = cells(g.piece);
    for (let i=0;i<4;i++) act(g,'rotateCW',rng);
    assert.deepEqual(cells(g.piece),before);
    for (let i=0;i<4;i++) act(g,'rotateCCW',rng);
    assert.deepEqual(cells(g.piece),before);
  }
  piece(g,'O',-1,38); g.lockElapsed = 400;
  act(g,'left',rng);
  assert.equal(g.lockElapsed,400);
});

test('hold once per lock, swap resets orientation and location', () => {
  const g = fresh(); const first = g.piece.type; const next = g.queue[0];
  act(g,'hold',rng);
  assert.equal(g.hold,first); assert.equal(g.piece.type,next); assert.equal(g.canHold,false);
  const saved = JSON.stringify(g); act(g,'hold',rng); assert.equal(JSON.stringify(g),saved);
  act(g,'hardDrop',rng); assert.equal(g.canHold,true);
  const current = g.piece.type; const queue = [...g.queue];
  act(g,'hold',rng);
  assert.equal(g.piece.type,first); assert.equal(g.hold,current);
  assert.equal(g.piece.rotation,0); assert.equal(g.piece.y,19);
  assert.deepEqual(g.queue,queue);
});

test('ghost, nonlocking soft drop and hard drop scores', () => {
  const g = fresh(); piece(g,'O',3,19);
  assert.equal(ghostY(g),38);
  act(g,'softDrop',rng); assert.equal(g.score,1); assert.equal(g.piece.y,20);
  act(g,'hardDrop',rng); assert.equal(g.score,37);
  assert.equal(g.board[39][4],'O');
  clearBoard(g); piece(g,'O',3,38);
  for (let i=0;i<30;i++) act(g,'softDrop',rng);
  assert.equal(g.piece.y,38); assert.equal(g.score,37);
  assert.ok(g.board.every(row => row.every(v => !v)));
});

test('gravity, 20x continuous soft drop and maximum 20G', () => {
  const g = fresh(); piece(g,'O',3,20);
  tick(g,500,rng); assert.equal(g.piece.y,20);
  tick(g,500,rng); assert.equal(g.piece.y,21);
  g.softDropping = true;
  tick(g,100,rng); assert.equal(g.piece.y,23); assert.equal(g.score,2);
  assert.equal(gravityInterval(100),1000/1200);
});

test('500ms lock delay, landing only charges grounded portion, bounded catchup', () => {
  const g = fresh(); piece(g,'O',3,37); g.gravityElapsed = 750;
  tick(g,500,rng);
  assert.equal(g.piece.y,38); assert.equal(g.lockElapsed,250);
  tick(g,249,rng); assert.equal(g.lockElapsed,499);
  tick(g,1,rng); assert.equal(g.board[39][4],'O');
  clearBoard(g); piece(g,'O',3,20);
  tick(g,100000,rng); assert.equal(g.piece.y,20); assert.equal(g.gravityElapsed,500);
});

test('15 extended resets maximum, successful rotations count', () => {
  const g = fresh(); piece(g,'T',3,38);
  for (let i=0;i<15;i++) {
    tick(g,400,rng); act(g,i%2 ? 'left' : 'right',rng);
    assert.equal(g.lockElapsed,0); assert.equal(g.lockResets,i+1);
  }
  tick(g,400,rng); act(g,'left',rng);
  assert.equal(g.lockElapsed,400); assert.equal(g.lockResets,15);
  tick(g,100,rng); assert.equal(g.board[39].filter(Boolean).length,3);
  clearBoard(g); piece(g,'T',3,38); tick(g,200,rng); act(g,'rotateCW',rng);
  assert.equal(g.lockResets,1); assert.equal(g.lockElapsed,0);
});

test('airtime never replenishes the reset budget or erases accrued lock time', () => {
  const g = fresh(); piece(g,'O',3,36); g.board[38][4] = 'J';
  g.lockResets = 15; g.lockElapsed = 400;
  act(g,'right',rng);
  assert.equal(g.lockElapsed,400); assert.equal(g.lockResets,15);
  tick(g,500,rng); assert.equal(g.lockElapsed,400);
  tick(g,500,rng); tick(g,500,rng); tick(g,500,rng);
  assert.equal(g.piece.y,38); assert.equal(g.lockElapsed,400);
  tick(g,100,rng); assert.equal(g.board[39][5],'O');
});

test('normal clears, combo, difficult back-to-back and level progression', () => {
  const g = fresh();
  four(g); assert.equal(g.score,800); assert.equal(g.backToBack,true);
  four(g); assert.equal(g.lastClear.points,1250); assert.equal(g.lastClear.backToBack,true);
  single(g); assert.equal(g.lastClear.points,200); assert.equal(g.backToBack,false);
  single(g); assert.equal(g.lines,10); assert.equal(g.level,2); assert.equal(g.lastClear.points,250);
  single(g); assert.equal(g.lastClear.points,600);
  clearBoard(g); piece(g,'O',3,38); tick(g,500,rng);
  assert.equal(g.combo,-1);
  const h = fresh(3); single(h); assert.equal(h.score,300); assert.equal(h.level,3);
});

test('normal single/double/triple scores and perfect-clear bonuses', () => {
  for (const [n,type,x,y,r] of [[1,'I',3,38,0],[2,'O',3,38,0],[3,'L',3,37,1]]) {
    for (const perfect of [false,true]) {
      const g = fresh(); piece(g,type,x,y,r);
      for (let row=40-n;row<40;row++) g.board[row].fill('J');
      for (const cell of cells(g.piece)) g.board[cell.y][cell.x] = null;
      if (!perfect) g.board[25][0] = 'J';
      tick(g,500,rng);
      assert.equal(g.lastClear.lines,n);
      assert.equal(g.lastClear.perfectClear,perfect);
      assert.equal(g.lastClear.points,[0,100,300,500][n]+(perfect ? [0,800,1200,1800][n] : 0));
    }
  }
});

test('perfect clears including back-to-back four-line bonus', () => {
  const g = fresh(); four(g,true);
  assert.equal(g.lastClear.perfectClear,true); assert.equal(g.score,2800);
  four(g,true); assert.equal(g.lastClear.points,4450);
});

function spinFixture(g, mini = false, kick = 0) {
  clearBoard(g); piece(g,'T',3,37);
  g.board[37][3] = 'J';
  g.board[39][3] = 'J';
  g.board[mini ? 39 : 37][5] = 'J';
  g.lastRotation = {kick};
}
test('three-corner front-corner T-spin, mini, fifth-kick upgrade, movement cancellation', () => {
  const g = fresh(); spinFixture(g); tick(g,500,rng);
  assert.equal(g.lastClear.spin,'full'); assert.equal(g.lastClear.points,400);
  spinFixture(g,true); tick(g,500,rng);
  assert.equal(g.lastClear.spin,'mini'); assert.equal(g.lastClear.points,100);
  spinFixture(g,true,4); tick(g,500,rng);
  assert.equal(g.lastClear.spin,'full'); assert.equal(g.lastClear.points,400);
  spinFixture(g); g.lastRotation = null; tick(g,500,rng);
  assert.equal(g.lastClear.spin,null); assert.equal(g.lastClear.points,0);
});

test('T-spin line scoring and no-clear preserves B2B but ends combo', () => {
  const g = fresh(); four(g);
  spinFixture(g); tick(g,500,rng);
  assert.equal(g.backToBack,true); assert.equal(g.combo,-1);
  spinFixture(g);
  g.board[38].fill('J'); for (const x of [3,4,5]) g.board[38][x] = null;
  tick(g,500,rng);
  assert.equal(g.lastClear.lines,1); assert.equal(g.lastClear.spin,'full');
  assert.equal(g.lastClear.points,1200);
});

test('full T-spin double/triple and mini single/double scoring', () => {
  for (const [n,mini,expected] of [[2,false,1200],[3,false,1600],[1,true,200],[2,true,400]]) {
    const g = fresh(); piece(g,'T',3,36,1);
    g.board[25][0] = 'J';
    for (let y=39-n;y<=38;y++) g.board[y].fill('J');
    for (const {x,y} of cells(g.piece)) g.board[y][x] = null;
    g.board[36][3] = 'J';
    g.board[38][3] = 'J';
    g.board[38][5] = 'J';
    g.board[36][5] = mini ? null : 'J';
    g.lastRotation = {kick:0};
    tick(g,500,rng);
    assert.equal(g.lastClear.lines,n);
    assert.equal(g.lastClear.spin,mini ? 'mini' : 'full');
    assert.equal(g.lastClear.points,expected);
  }
});

test('topout on blocked spawn or lock wholly above visible, partial lock survives', () => {
  const g = fresh(); clearBoard(g); piece(g,'O',3,38);
  g.queue[0] = 'T'; g.board[18][4] = 'J'; tick(g,500,rng);
  assert.equal(g.gameOver,true);
  const h = fresh(); piece(h,'O',3,16); h.board[18][4] = 'J'; tick(h,500,rng);
  assert.equal(h.gameOver,true);
  const j = fresh(); piece(j,'O',0,19); j.board[21][1] = 'J'; tick(j,500,rng);
  assert.equal(j.gameOver,false);
});

test('pause/gameover blocks all actions and time; JSON resumes deterministically', () => {
  const g = fresh(); g.paused = true;
  const saved = JSON.stringify(g);
  for (const a of ['left','right','rotateCW','rotateCCW','softDrop','hardDrop','hold']) act(g,a,rng);
  tick(g,500,rng); assert.equal(JSON.stringify(g),saved);
  g.paused = false;
  const h = JSON.parse(JSON.stringify(g));
  for (const state of [g,h]) { act(state,'rotateCW',rng); tick(state,500,rng); act(state,'hardDrop',rng); }
  assert.deepEqual(h,g);
  g.gameOver = true; const ended = JSON.stringify(g);
  act(g,'hardDrop',rng); tick(g,500,rng); assert.equal(JSON.stringify(g),ended);
});
