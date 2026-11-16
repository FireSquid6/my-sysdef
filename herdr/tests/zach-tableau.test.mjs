import test from 'node:test';
import assert from 'node:assert/strict';
import * as shenzhen from '../mods/tty-zachtronics/shenzhen.js';
import * as kabufuda from '../mods/tty-zachtronics/kabufuda.js';
import * as cluj from '../mods/tty-zachtronics/cluj.js';
import * as sawayama from '../mods/tty-zachtronics/sawayama.js';

for (const engine of [shenzhen, kabufuda, cluj, sawayama]) {
  test(`${engine.title}: deterministic complete inventory, pure actions and restored saves`, () => {
    let state = engine.newGame(123);
    assert.deepEqual(state, engine.newGame(123));
    assert.deepEqual(engine.validateState(state), []);
    for (let turn = 0; turn < 80; turn++) {
      const before = JSON.stringify(state);
      const actions = engine.legalActions(state);
      assert.deepEqual(actions, engine.legalActions(state));
      assert.ok(engine.applyAction(state, {type: 'not-a-rule'}).error);
      assert.equal(JSON.stringify(state), before);
      if (!actions.length) break;
      const action = actions[(turn * 17) % actions.length];
      const result = engine.applyAction(state, action);
      assert.equal(result.error, undefined);
      assert.equal(JSON.stringify(state), before);
      state = JSON.parse(JSON.stringify(result.state));
      assert.deepEqual(engine.validateState(state), []);
      const zones = engine.view(state).zones.map(z => z.id);
      for (const a of engine.legalActions(state)) {
        if (a.from) assert.ok(zones.includes(a.from));
        if (a.to) assert.ok(zones.includes(a.to));
      }
    }
    assert.ok(engine.validateState({}).length);
    assert.ok(engine.validateState(null).length);
  });
}

// Fixtures always retain the complete native inventory in real board zones.
const copy = x => JSON.parse(JSON.stringify(x));
function takeInventory(s) {
  if (s.game === 'shenzhen') return s.columns.flat();
  if (s.game === 'sawayama') return [...s.tableau.flat(), ...s.stock];
  if (s.game === 'kabufuda') return s.tableau.flatMap(t => t.cards);
  return s.columns.flatMap(t => t.cards);
}
function fixture(engine, piles, profile = {}) {
  const s = engine.newGame(9, profile);
  const cards = takeInventory(s), byId = new Map(cards.map(c => [c.id, c]));
  const used = new Set(piles.flat());
  const filled = piles.map(p => p.map(id => {
    assert.ok(byId.has(id), `unknown fixture ID ${id}`); return byId.get(id);
  }));
  const rest = cards.filter(c => !used.has(c.id));
  if (s.game === 'kabufuda') {
    s.tableau.forEach((t,i) => t.cards = filled[i] || []);
    s.tableau[7].cards.push(...rest);
  } else if (s.game === 'cluj') {
    s.columns.forEach((t,i) => t.cards = filled[i] || []);
    s.columns[5].cards.push(...rest);
  } else if (s.game === 'shenzhen') {
    s.columns = Array.from({length: 8}, (_,i) => filled[i] || []);
    s.columns[7].push(...rest);
  } else {
    s.tableau = Array.from({length: 7}, (_,i) => filled[i] || []);
    s.stock = rest;
  }
  assert.deepEqual(engine.validateState(s), []);
  return s;
}
function play(engine, state, request) {
  const before = JSON.stringify(state);
  const result = engine.applyAction(state, request);
  assert.equal(JSON.stringify(state), before, 'must not mutate input');
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(engine.validateState(result.state), []);
  return result.state;
}
function reject(engine, s, a) {
  const before = JSON.stringify(s);
  assert.ok(engine.applyAction(s, a).error);
  assert.equal(JSON.stringify(s), before);
}
const move = (from,index,to) => ({type: 'move',from,index,to});
const S = (piles, profile = {}) => fixture(shenzhen,piles,{autoPolicy: 'off',...profile});
const W = piles => fixture(sawayama,piles,{autoPolicy: 'OFF'});
const K = (piles, difficulty = 'Expert') => fixture(kabufuda,piles,{difficulty});
const C = piles => fixture(cluj,piles);
const copies = type => [0,1,2,3].map(c => `${type}-${c}`);

test('Setup inventories, geometry, difficulty aliases, and hidden-stock privacy', () => {
  const sz = shenzhen.newGame(1,{autoPolicy: 'off'});
  assert.deepEqual(sz.columns.map(c => c.length), Array(8).fill(5));
  assert.equal(sz.columns.flat().filter(c => c.kind === 'dragon').length,12);
  for (const [difficulty, count] of [['Easy',4],['Normal',3],['Medium',3],['Hard',2],['Expert',1]]) {
    const s = kabufuda.newGame(1,{difficulty});
    assert.deepEqual(s.tableau.map(c => c.cards.length), Array(8).fill(5));
    assert.equal(s.upper.filter(c => c.kind === 'empty').length,count);
  }
  assert.deepEqual(cluj.newGame(1).columns.map(c => c.cards.length),Array(6).fill(6));
  const w = sawayama.newGame(1,{autoPolicy: 'OFF'});
  assert.deepEqual(w.tableau.map(c => c.length),[1,2,3,4,5,6,7]);
  assert.equal(w.stock.length,24);
  const stock = sawayama.view(w).zones.find(z => z.id === 'stock');
  assert.ok(stock.cards.every(c => c.hidden && c.label === 'Face-down' && !w.stock.some(real => real.id === c.id)));
});

test('Shenzhen: three-suit runs, splitting, malformed runs, arbitrary empty placement and no supermove limit', () => {
  const run = ['bamboo-7','dots-6','bamboo-5','characters-4','dots-3'];
  const s = S([run,['characters-8'],['bamboo-8'],['dots-5'],['bamboo-6'],['bamboo-9'],['dots-9']]);
  const n = play(shenzhen,s,move('t0',0,'t1'));
  assert.deepEqual(n.columns[1].map(c => c.id),['characters-8',...run]);
  reject(shenzhen,s,move('t0',0,'t2'));
  const g = S([['bamboo-7','dots-6','characters-4'],['dots-5']]);
  reject(shenzhen,g,move('t0',0,'t1'));
  play(shenzhen,g,move('t0',2,'t1'));
  play(shenzhen,g,move('t0',2,'t2'));
  const d = S([['dragon-red-0'],['bamboo-5']]);
  reject(shenzhen,d,move('t0',0,'t1'));
  play(shenzhen,d,move('t0',0,'t2'));
  reject(shenzhen,d,move('t1',0,'t0'));
});

test('Shenzhen: cells are singles, sealed cells cannot move, manual foundations are exposed-only and suit-bound', () => {
  let s = S([['bamboo-1'],['bamboo-2'],['bamboo-4'],['dots-1','characters-9']]);
  reject(shenzhen,s,{type:'foundation',from:'t0',index:0,to:'f-dots'});
  reject(shenzhen,s,{type:'foundation',from:'t3',index:0,to:'f-dots'});
  s = play(shenzhen,s,{type:'foundation',from:'t0',index:0,to:'f-bamboo'});
  s = play(shenzhen,s,{type:'foundation',from:'t1',index:0,to:'f-bamboo'});
  reject(shenzhen,s,{type:'foundation',from:'t2',index:0,to:'f-bamboo'});
  s = play(shenzhen,s,move('t2',0,'c0'));
  reject(shenzhen,s,move('t3',1,'c0'));
  s = play(shenzhen,s,move('c0',0,'c1'));
  assert.equal(s.cells[0].kind,'empty');
  reject(shenzhen,s,move('f-bamboo',1,'t0'));
});

test('Shenzhen: four exposed dragons, occupied matching destination, covered/no-destination rejection', () => {
  let s = S([['dragon-white-0'],['dragon-white-1'],['dragon-white-2'],['dragon-white-3'],['bamboo-8'],['dots-8']]);
  s = play(shenzhen,s,move('t0',0,'c0'));
  s = play(shenzhen,s,move('t4',0,'c1'));
  s = play(shenzhen,s,move('t5',0,'c2'));
  const strict = copy(s); strict.matchingDragonCellEligible = false;
  assert.ok(!shenzhen.legalActions(strict).some(a => a.type === 'collect' && a.dragonType === 'white'));
  s = play(shenzhen,s,{type:'collect',dragonType:'white',to:'c0'});
  assert.equal(s.cells[0].kind,'sealed');
  assert.equal(s.cells[0].cards.length,4);
  reject(shenzhen,s,move('c0',0,'t0'));
  reject(shenzhen,s,move('c1',0,'c0'));
  const covered = S([['dragon-white-0','bamboo-4'],['dragon-white-1'],['dragon-white-2'],['dragon-white-3']]);
  assert.ok(!shenzhen.legalActions(covered).some(a => a.type === 'collect' && a.dragonType === 'white'));
});

test('Shenzhen: flower cascade, conservative rank-1/2 automation and honest win guard', () => {
  let s = S([['bamboo-1','flower','dots-9']]);
  s.autoPolicy = 'conservative';
  s = play(shenzhen,s,move('t0',2,'c0'));
  assert.ok(s.flowerHome);
  assert.ok(s.foundationHeight.bamboo >= 1);
  assert.ok(!s.columns.flat().some(c => c.id === 'flower'));
  // A complete save counts implicit foundations plus all twelve sealed dragons.
  let w = shenzhen.newGame(2,{autoPolicy:'off'});
  const inv = takeInventory(w);
  w.columns = Array.from({length:8},()=>[]);
  w.foundationHeight = {bamboo:9,characters:9,dots:9}; w.flowerHome = true;
  w.cells = ['red','green','white'].map(dragonType => ({kind:'sealed',dragonType,cards:inv.filter(c => c.dragonType === dragonType)}));
  assert.deepEqual(shenzhen.validateState(w),[]); assert.equal(shenzhen.status(w),'won');
  w.foundationHeight.bamboo = 8;
  w.columns[0] = [inv.find(c => c.id === 'bamboo-9')];
  assert.notEqual(shenzhen.status(w),'won');
});

test('Kabufuda: homogeneous suffixes split freely; mismatch and mixed runs reject', () => {
  const s = K([['2-0','1-0','1-1'],['3-0','1-2']]);
  const n = play(kabufuda,s,move('t0',1,'t1'));
  assert.deepEqual(n.tableau[1].cards.map(c => c.id),['3-0','1-2','1-0','1-1']);
  assert.equal(n.tableau[1].kind,'active');
  reject(kabufuda,s,move('t0',0,'t2'));
  reject(kabufuda,s,move('t0',1,'t7'));
  play(kabufuda,s,move('t0',2,'t1'));
  play(kabufuda,s,move('t0',1,'t2'));
  reject(kabufuda,s,move('t0',1,'u0'));
  reject(kabufuda,s,move('t0',1,'u1'));
});

test('Kabufuda: rooted versus covered sets; upper seal versus tableau unlock; seals permanent', () => {
  const s = K([['2-0',...copies(1)]]);
  assert.equal(s.tableau[0].kind,'active');
  let n = play(kabufuda,s,move('t0',1,'t1'));
  assert.equal(n.tableau[1].kind,'sealed');
  assert.deepEqual(n.upper.map(c => c.kind),['empty','empty','unavailable','unavailable']);
  reject(kabufuda,n,move('t1',0,'u0'));
  reject(kabufuda,n,move('t0',0,'t1'));
  const saved = JSON.stringify(n); kabufuda.view(n); kabufuda.legalActions(n);
  assert.equal(JSON.stringify(n),saved,'reload/view must not unlock again');
  n = play(kabufuda,s,move('t0',1,'u0'));
  assert.equal(n.upper[0].kind,'sealed');
  assert.equal(n.upper[1].kind,'unavailable');
  assert.equal(n.tableau[0].kind,'active');
});

test('Kabufuda: uncovering source seals, 3+1 upper fallback, singles return and Easy has no unlock reward', () => {
  let s = K([[...copies(1),'2-0']]);
  s = play(kabufuda,s,move('t0',4,'u0'));
  assert.equal(s.tableau[0].kind,'sealed'); assert.equal(s.upper[1].kind,'empty');
  s = K([['2-0','1-0','1-1','1-2'],['1-3']]);
  s = play(kabufuda,s,move('t1',0,'u0'));
  reject(kabufuda,s,move('t0',1,'u0'));
  s = play(kabufuda,s,move('u0',0,'t0'));
  assert.equal(s.upper[0].kind,'empty'); assert.equal(s.tableau[0].cards.length,5);
  let easy = K([['2-0',...copies(1)]],'Easy');
  easy = play(kabufuda,easy,move('t0',1,'t1'));
  assert.deepEqual(easy.upper.map(c => c.kind),Array(4).fill('empty'));
});

test('Kabufuda: tenth seal, dual source/destination normalization and all IDs retained', () => {
  let s = kabufuda.newGame(1,{difficulty:'Easy'});
  const byType = type => takeInventory(s).filter(c => c.type === type);
  const sets = Array.from({length:10},(_,i)=>byType(i+1));
  s.tableau = Array.from({length:8},(_,i) => i < 7 ? {kind:'sealed',cards:sets[i]} : {kind:'active',cards:[...sets[8],...sets[9]]});
  s.upper = [{kind:'sealed',cards:sets[7]}, ...Array.from({length:3},()=>({kind:'empty',cards:[]}))];
  assert.deepEqual(kabufuda.validateState(s),[]); assert.notEqual(kabufuda.status(s),'won');
  s = play(kabufuda,s,move('t7',4,'u1'));
  assert.equal(kabufuda.status(s),'won');
  assert.equal(s.tableau[7].kind,'sealed'); assert.equal(s.upper[1].kind,'sealed');
  assert.equal(kabufuda.legalActions(s).length,0);
});

test('Cluj: suit-independent descending runs, splitting, gap rejection, and arbitrary empty rank', () => {
  const s = C([['clubs-V','hearts-10','spades-9'],['diamonds-D'],['clubs-10','diamonds-8']]);
  play(cluj,s,move('t0',0,'t1'));
  play(cluj,s,move('t0',2,'t3'));
  reject(cluj,s,move('t2',0,'t3'));
  reject(cluj,s,move('t0',1,'t1'));
  reject(cluj,s,move('t0',0,'t0'));
});

test('Cluj: cheat alongside normal actions; no covering, multi-card cheat, re-cheat, or global cheat cap', () => {
  let s = C([['clubs-9','clubs-8'],['hearts-6'],['hearts-10'],['diamonds-9'],['spades-D']]);
  reject(cluj,s,{type:'cheat',from:'t0',index:0,to:'t1'});
  s = play(cluj,s,{type:'cheat',from:'t0',index:1,to:'t1'});
  assert.equal(s.columns[1].cheatedExposedId,'clubs-8');
  reject(cluj,s,{type:'cheat',from:'t1',index:1,to:'t4'});
  reject(cluj,s,move('t3',0,'t1'));
  s = play(cluj,s,{type:'cheat',from:'t3',index:0,to:'t4'});
  assert.equal(s.columns.filter(c => c.cheatedExposedId).length,2);
  s = play(cluj,s,move('t1',1,'t0'));
  assert.equal(s.columns[1].cheatedExposedId,null);
});

test('Cluj: rooted full runs collapse, suffixes over unrelated cards do not; marked cover recovery normalizes source', () => {
  const run = ['T','K','D','V','10','9','8','7','6'].map(r => `clubs-${r}`);
  let s = C([['hearts-8',...run]]);
  s = play(cluj,s,move('t0',1,'t1'));
  assert.ok(s.columns[1].locked);
  reject(cluj,s,move('t1',0,'t2'));
  reject(cluj,s,move('t0',0,'t1'));
  let covered = C([[...run,'hearts-9'],['diamonds-10']]);
  covered.columns[0].cheatedExposedId = 'hearts-9';
  covered = play(cluj,covered,move('t0',9,'t1'));
  assert.ok(covered.columns[0].locked);
  let w = cluj.newGame(3);
  const all = takeInventory(w);
  w.columns = ['clubs','diamonds','hearts','spades'].map(suit=>({cards:['T','K','D','V','10','9','8','7','6'].map(r=>all.find(c=>c.id===`${suit}-${r}`)),locked:true,cheatedExposedId:null}));
  w.columns.push(...Array.from({length:2},()=>({cards:[],locked:false,cheatedExposedId:null})));
  assert.deepEqual(cluj.validateState(w),[]); assert.equal(cluj.status(w),'won');
});

test('Sawayama: alternating color suffixes, arbitrary empty ranks and no supermove capacity', () => {
  const s = W([['clubs-8','hearts-7','spades-6'],['spades-8'],['diamonds-8'],['clubs-4','spades-3']]);
  play(sawayama,s,move('t0',1,'t1'));
  reject(sawayama,s,move('t0',1,'t2'));
  reject(sawayama,s,move('t3',0,'t4'));
  play(sawayama,s,move('t3',1,'t4'));
  reject(sawayama,s,move('t0',1,'cell'));
  reject(sawayama,s,move('t0',2,'cell'));
});

test('Sawayama: draw-three persistent order, only waste top, stock exhaustion unlocks cell and never recycles', () => {
  let s = W([]);
  const expected = s.stock.slice(0,6).map(c=>c.id);
  s = play(sawayama,s,{type:'draw',to:'waste'});
  assert.deepEqual(s.waste.map(c=>c.id),expected.slice(0,3));
  reject(sawayama,s,move('waste',0,'t0'));
  s = play(sawayama,s,{type:'draw',to:'waste'});
  assert.deepEqual(s.waste.map(c=>c.id),expected);
  while(s.stock.length) s = play(sawayama,s,{type:'draw',to:'waste'});
  reject(sawayama,s,{type:'draw',to:'waste'});
  s = play(sawayama,s,move('waste',s.waste.length-1,'cell'));
  assert.equal(s.cell.length,1); assert.ok(s.waste.length);
  reject(sawayama,s,move('waste',s.waste.length-1,'cell'));
  s = play(sawayama,s,move('cell',0,'t0'));
  assert.equal(s.cell.length,0); assert.equal(s.stock.length,0);
});

test('Sawayama: imported short draw, exposed-only suited foundation, no withdrawal and exact win', () => {
  let s = W([['spades-1','hearts-9'],['spades-2'],['clubs-1']]);
  reject(sawayama,s,{type:'foundation',from:'t0',index:0,to:'f-spades'});
  reject(sawayama,s,{type:'foundation',from:'t2',index:0,to:'f-spades'});
  reject(sawayama,s,{type:'foundation',from:'t1',index:0,to:'f-spades'});
  s = play(sawayama,s,{type:'foundation',from:'t2',index:0,to:'f-clubs'});
  reject(sawayama,s,move('f-clubs',0,'t2'));
  s.tableau[6].push(...s.stock.splice(0,s.stock.length-2));
  const final = s.stock.map(c=>c.id);
  s = play(sawayama,s,{type:'draw',to:'waste'});
  assert.deepEqual(s.waste.map(c=>c.id),final); assert.equal(s.stock.length,0);
  let w = sawayama.newGame(1,{autoPolicy:'OFF'});
  const king = takeInventory(w).find(c=>c.id==='spades-13');
  w.tableau = Array.from({length:7},()=>[]); w.tableau[0]=[king]; w.stock=[]; w.waste=[];
  w.foundationHeight = {clubs:13,diamonds:13,hearts:13,spades:12};
  assert.deepEqual(sawayama.validateState(w),[]); assert.notEqual(sawayama.status(w),'won');
  w = play(sawayama,w,{type:'foundation',from:'t0',index:0,to:'f-spades'});
  assert.equal(sawayama.status(w),'won');
});

test('Sawayama: opposite-colors-cleared auto threshold, manual force, and cascade', () => {
  let s = W([['clubs-3'],['hearts-2'],['diamonds-3']]);
  const heights = {clubs:2,spades:2,hearts:1,diamonds:2};
  // Move the foundation prefix from stock into implicit homes.
  s.stock = s.stock.filter(c=>c.rank > heights[c.suit]); s.foundationHeight=heights;
  s.autoPolicy = 'OPPOSITE_COLORS_CLEARED';
  assert.deepEqual(sawayama.validateState(s),[]);
  assert.ok(sawayama.legalActions(s).some(a=>a.from==='t0'&&a.type==='foundation'));
  const forced = play(sawayama,s,{type:'foundation',from:'t0',index:0,to:'f-clubs'});
  assert.ok(forced.foundationHeight.clubs>=3);
  const cascade = play(sawayama,s,{type:'foundation',from:'t1',index:0,to:'f-hearts'});
  assert.ok(cascade.foundationHeight.clubs>=3);
});

for (const engine of [shenzhen,kabufuda,cluj,sawayama]) {
  test(`${engine.title}: rejects corrupt restored inventories, profiles, capacities and stale commands`, () => {
    const s = engine.newGame(42);
    let corrupt = copy(s); corrupt.initialPermutation[0]=corrupt.initialPermutation[1];
    assert.ok(engine.validateState(corrupt).length);
    corrupt=copy(s); corrupt.revision=-1; assert.ok(engine.validateState(corrupt).length);
    corrupt=copy(s);
    const pile = corrupt.game==='kabufuda' ? corrupt.tableau[0].cards : corrupt.game==='cluj' ? corrupt.columns[0].cards : corrupt.game==='shenzhen' ? corrupt.columns[0] : corrupt.tableau[0];
    pile.push(copy(pile[0])); assert.ok(engine.validateState(corrupt).length);
    assert.ok(engine.applyAction(corrupt,engine.legalActions(s)[0]).error);
    const a = engine.legalActions(s)[0];
    const n = play(engine,s,a);
    reject(engine,n,a);
    reject(engine,s,{...a,index:-1});
  });
}

test('Shenzhen: unlimited run with all three cells sealed and every column occupied; manual high foundation override', () => {
  let s = S([['bamboo-7','dots-6','bamboo-5','characters-4','dots-3'],['characters-8'],['bamboo-8'],['dots-8'],['characters-9'],['bamboo-9'],['dots-9']]);
  const dragons = s.columns[7].filter(c=>c.kind==='dragon');
  s.columns[7] = s.columns[7].filter(c=>c.kind!=='dragon');
  s.cells = ['red','green','white'].map(dragonType=>({kind:'sealed',dragonType,cards:dragons.filter(c=>c.dragonType===dragonType)}));
  assert.deepEqual(shenzhen.validateState(s),[]);
  play(shenzhen,s,move('t0',0,'t1'));
  let high = S([['bamboo-6']]);
  high.foundationHeight = {bamboo:5,characters:2,dots:2};
  high.columns[7] = high.columns[7].filter(c=>c.kind!=='number'||c.rank>high.foundationHeight[c.suit]);
  high.autoPolicy='conservative';
  high = play(shenzhen,high,{type:'foundation',from:'t0',index:0,to:'f-bamboo'});
  assert.ok(high.foundationHeight.bamboo>=6);
});

test('Kabufuda: each new source and destination seal unlocks at most one unavailable cell; upper alone never rewards', () => {
  const s = K([[...copies(1),...copies(2)]]);
  const n = play(kabufuda,s,move('t0',4,'t1'));
  assert.equal(n.tableau[0].kind,'sealed'); assert.equal(n.tableau[1].kind,'sealed');
  assert.deepEqual(n.upper.map(c=>c.kind),['empty','empty','empty','unavailable']);
  const upper = play(kabufuda,s,move('t0',4,'u0'));
  assert.equal(upper.tableau[0].kind,'sealed');
  assert.deepEqual(upper.upper.map(c=>c.kind),['sealed','empty','unavailable','unavailable']);
});

test('Cluj: marked card recovers into empty column, then accepts a normal build', () => {
  let s = C([['clubs-9'],['hearts-6'],['spades-8']]);
  s = play(cluj,s,{type:'cheat',from:'t0',index:0,to:'t1'});
  reject(cluj,s,move('t2',0,'t1'));
  s = play(cluj,s,move('t1',1,'t3'));
  assert.equal(s.columns[3].cheatedExposedId,null);
  s = play(cluj,s,move('t2',0,'t3'));
  assert.deepEqual(s.columns[3].cards.map(c=>c.rank),['9','8']);
});

test('Restored-save structural invariants reject un-normalized seals, marker abuse and premature reserves', () => {
  let s = K([['2-0',...copies(1)]]);
  s.tableau[0].kind='sealed'; assert.ok(kabufuda.validateState(s).length);
  s=K([['2-0',...copies(1)]]);
  s.tableau[0].cards.shift(); s.tableau[1].cards.push({id:'2-0',type:2,copy:0});
  assert.ok(kabufuda.validateState(s).length,'un-normalized rooted set');
  let c=C([['clubs-8','clubs-7']]); c.columns[0].cheatedExposedId='clubs-8';
  assert.ok(cluj.validateState(c).length,'buried marker');
  c=C([['clubs-8','clubs-7']]); c.columns[0].cheatedExposedId='clubs-7';
  assert.ok(cluj.validateState(c).length,'marked normal adjacency');
  let w=W([['clubs-8']]); w.cell.push(w.tableau[0].pop());
  assert.ok(sawayama.validateState(w).length,'cell cannot be occupied while stock exists');
  w=W([]); w.foundationHeight.clubs=14; assert.ok(sawayama.validateState(w).length);
  const z=S([]); z.cells[0]={kind:'sealed',dragonType:'red',cards:z.columns[7].splice(0,4)};
  assert.ok(shenzhen.validateState(z).length,'invalid dragon bundle');
});

test('Seed 123 deal fingerprints are versioned replay contracts, not publisher deal numbers', () => {
  for (const [engine, expected] of [
    [shenzhen,['dots-1','characters-7','characters-8','flower','dots-8','dots-7','bamboo-5','dragon-green-0']],
    [kabufuda,['5-2','4-3','5-0','10-3','7-1','7-0','2-0','8-3']],
    [cluj,['spades-10','hearts-D','diamonds-10','clubs-10','hearts-K','hearts-V','clubs-9','spades-7']],
    [sawayama,['diamonds-2','hearts-10','spades-13','spades-10','hearts-9','clubs-10','spades-9','hearts-5']],
  ]) assert.deepEqual(engine.newGame(123).initialPermutation.slice(0,8),expected);
});
