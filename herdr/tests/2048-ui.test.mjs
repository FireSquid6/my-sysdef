import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../mods/tty-2048/engine.js';
const source = await readFile(new URL('../mods/tty-2048/main.js', import.meta.url), 'utf8');
const helpSource = await readFile(new URL('../mods/tty-2048/help-context.js', import.meta.url), 'utf8');
function harness(saved, best, delayed = false) {
  const state = { '2048.game': saved, '2048.best': best }, nodes = new Map(), texts = [], styles = [], actions = [], timers = [];
  let focus = 0, writes = 0;
  function element() {
    const handlers = {}, style = {}; styles.push(style);
    const node = new Proxy({}, { get: (_t, name) => (...args) => {
      style[name] = args;
      if (name === 'id') nodes.set(args[0], handlers);
      if (name === 'on_click') handlers.click = args[0];
      if (name === 'child' && typeof args[0] === 'string') texts.push(args[0]);
      if (name === 'when' && args[0]) args[1](node);
      return node;
    } }); return node;
  }
  const deps = { ...engine, View: class {}, div: element, h_flex: element, v_flex: element,
    shared: key => state[key], setShared: (key, value) => { state[key] = value; writes++; },
    props: () => ({ overlay: 'test-2048' }), closeOverlay: id => actions.push(['close', id]),
    openOverlay: options => actions.push(['open', options]), focused() {}, panes: () => [] };
  const reportContext = new Function(...Object.keys(deps), helpSource.replace(/^import .*;$/gm, '').replace(/export /g, '') + '\nreturn reportContext;')(...Object.values(deps));
  const Class = new Function(...Object.keys(deps), 'reportContext', source.replace(/^import .*;$/gm, '').replace('export default class', 'return class'))(...Object.values(deps), reportContext);
  const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() { focus++; } }),
    timer: { after(_ms, fn) { if (delayed) timers.push(fn); else fn(); } } };
  const view = new Class(); view.init({}, cx);
  return { view, cx, state, nodes, texts, styles, actions, timers, get focus() { return focus; }, get writes() { return writes; },
    render() { nodes.clear(); texts.length = 0; view.render(cx); },
    key(key, extra = {}) { view.press({ key, ...extra }, cx); },
    click(id) { this.render(); assert.ok(nodes.has(`2048-${id}`), id); nodes.get(`2048-${id}`).click({}, cx); } };
}
const gameWith = board => ({ ...engine.newGame(42), board, undo: null });
const pair = () => gameWith([2,2,0,0, ...Array(12).fill(0)]);
test('render fixed arcade palette, beveled pixel tiles, score and full mouse controls', async () => {
  const h = harness(pair()); h.render();
  for (const id of ['left','right','up','down','undo','restart','arcade','close','board', ...Array.from({ length: 16 }, (_, i) => `tile-${i}`)]) assert.ok(h.nodes.has(`2048-${id}`));
  assert.ok(h.texts.includes('SCORE 0')); assert.ok(h.texts.includes('BEST 0'));
  assert.ok(h.styles.some(s => s.bg?.[0] === '#10142b'));
  assert.ok(h.styles.some(s => s.w?.[0] === 6 && s.h?.[0] === 6));
  assert.ok(h.styles.some(s => s.font_family?.[0] === 'monospace'));
  assert.doesNotMatch(source, /\btheme\b|\.rounded|\.svg|\.image/);
  const mod = JSON.parse(await readFile(new URL('../mods/tty-2048/mod.json', import.meta.url), 'utf8'));
  assert.equal(mod.focusable, true); assert.deepEqual(mod.overlay, { frame: 'none', kind: 'dialog', modal: true, width: 480, height: 580 });
});
test('pixel numbers scale to fit even the largest saved tiles', () => {
  const game = gameWith([2 ** 52, 2, ...Array(14).fill(0)]); game.won = true;
  const h = harness(game); h.render();
  assert.ok(h.styles.some(s => s.w?.[0] === 1 && s.h?.[0] === 1));
  assert.equal(engine.validSave(h.view.game), true);
});
test('keyboard aliases and mouse direction controls all move; no-op does not save or spawn', () => {
  for (const [key, direction] of Object.entries({ h: 'left', l: 'right', k: 'up', j: 'down', left: 'left', right: 'right', up: 'up', down: 'down' })) {
    const saved = gameWith([0,0,0,0,0,2,2,0,0,2,0,0,0,0,0,0]);
    const h = harness(saved), expected = structuredClone(saved); engine.move(expected, direction);
    h.key(key); assert.deepEqual(h.view.game, expected);
  }
  for (const direction of ['left','right','up','down']) {
    const saved = gameWith([0,0,0,0,0,2,2,0,0,2,0,0,0,0,0,0]);
    const h = harness(saved), expected = structuredClone(saved); engine.move(expected, direction);
    h.click(direction); assert.deepEqual(h.view.game, expected);
  }
  const h = harness(gameWith([2,4,0,0, ...Array(12).fill(0)])), before = structuredClone(h.view.game), writes = h.writes;
  h.key('h'); assert.deepEqual(h.view.game, before); assert.equal(h.writes, writes);
});
test('undo persists independent snapshots, best survives undo and restart, reopen clones', () => {
  const h = harness(pair(), 0); h.key('h'); assert.equal(h.view.game.score, 4); assert.equal(h.state['2048.best'], 4);
  const saved = h.state['2048.game']; h.click('undo'); assert.equal(h.view.game.score, 0); assert.equal(h.view.best, 4);
  assert.equal(saved.score, 4); h.key('l'); h.key('u'); assert.equal(h.view.game.score, 0);
  h.click('restart'); h.click('confirm'); assert.equal(h.view.game.moves, 0); assert.equal(h.view.best, 4);
  h.key('escape'); const reopened = harness(h.state['2048.game'], h.state['2048.best']);
  assert.deepEqual(reopened.view.game, h.view.game); assert.notEqual(reopened.view.game.board, h.state['2048.game'].board);
  assert.equal(reopened.view.best, 4);
});
test('restart needs confirmation, blocks play, supports cancel and Y/N buttons and keys', () => {
  const h = harness(pair()), original = h.view.game;
  h.key('r'); h.key('h'); h.click('left'); h.click('undo'); assert.equal(h.view.game, original); assert.equal(original.moves, 0);
  h.key('n'); assert.equal(h.view.game, original);
  h.click('restart'); h.click('cancel'); assert.equal(h.view.game, original);
  h.key('r'); h.key('y'); assert.notEqual(h.view.game, original); assert.equal(h.view.confirmReset, false);
  const next = h.view.game; h.click('restart'); h.click('confirm'); assert.notEqual(h.view.game, next);
  h.key('r'); h.key('escape'); assert.equal(h.actions[0][0], 'close');
});
test('win has visible continue control and C; continued play is never auto-blocked', () => {
  for (const action of [h => h.key('c'), h => h.click('continue')]) {
    const h = harness(gameWith([1024,1024,0,0, ...Array(12).fill(0)]));
    h.key('h'); h.render(); assert.ok(h.texts.some(t => t.includes('YOU WIN'))); assert.ok(h.nodes.has('2048-continue'));
    action(h); assert.equal(h.view.game.continued, true); assert.equal(h.state['2048.game'].continued, true);
    h.render(); assert.equal(h.nodes.has('2048-continue'), false); h.key('l'); assert.equal(h.view.game.moves, 2);
  }
  const h = harness(gameWith([1024,1024,0,0, ...Array(12).fill(0)])); h.key('h'); h.key('l'); assert.equal(h.view.game.moves, 2);
  h.view.game = gameWith([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]); h.render(); assert.ok(h.texts.some(t => t.includes('NO MOVES LEFT')));
});
test('all held and modifier keys are inert, including escape and confirmation', () => {
  const h = harness(pair());
  for (const extra of [{ is_held: true }, ...['control','platform','alt','shift','function'].map(key => ({ modifiers: { [key]: true } }))]) {
    const before = structuredClone(h.view.game), writes = h.writes;
    for (const key of ['h','j','k','l','left','up','right','down','r','u','c','escape','y','n']) h.key(key, extra);
    assert.deepEqual(h.view.game, before); assert.equal(h.writes, writes); assert.equal(h.view.confirmReset, false); assert.equal(h.actions.length, 0);
    h.key('r'); h.key('y', extra); h.key('n', extra); assert.equal(h.view.confirmReset, true); h.key('n');
  }
});
test('invalid saves and malformed best fall back to a normal two-tile game', () => {
  for (const saved of [undefined, {}, { ...pair(), board: [2048] }]) {
    const h = harness(saved, '9000'); assert.equal(engine.validSave(h.view.game), true);
    assert.equal(h.view.game.board.filter(Boolean).length, 2); assert.equal(h.view.game.score, 0); assert.equal(h.view.best, 0);
  }
});
test('Arcade saves, closes, then opens 480x340 exactly once; closed views are inert', () => {
  const h = harness(pair()); h.key('h'); h.click('arcade');
  assert.deepEqual(h.actions, [['close','test-2048'], ['open', { mod: 'tty-arcade', frame: 'none', kind: 'dialog', modal: true, width: 480, height: 340 }]]);
  assert.equal(engine.validSave(h.state['2048.game']), true);
  assert.deepEqual(h.state['help.contexts'], []);
  const saved = h.state['2048.game'], game = structuredClone(h.view.game), writes = h.writes;
  h.key('h'); h.key('escape'); h.click('restart'); h.click('arcade'); h.view.close();
  assert.deepEqual(h.view.game, game); assert.equal(h.state['2048.game'], saved); assert.equal(h.actions.length, 2);
  // reportContext may clear the help stack again, but cannot resave a closed game.
  assert.equal(h.state['2048.game'], saved); assert.ok(h.writes >= writes);
});
test('host close saves once, focus timer is safe after close, help context is registered', () => {
  const h = harness(pair(), 0, true); assert.deepEqual(h.state['help.contexts'], [{ name: 'tty-2048', overlay: 'test-2048' }]);
  assert.equal(h.focus, 0); h.view.close(); h.timers.forEach(fn => fn()); assert.equal(h.focus, 0);
  const saved = h.state['2048.game']; h.view.game.board[0] = 64; assert.equal(saved.board[0], 2);
  h.view.close(); assert.equal(h.state['2048.game'], saved); assert.equal(h.actions.length, 0);
  const open = harness(pair()); assert.equal(open.focus, 1); open.click('left'); assert.ok(open.focus > 1);
});
