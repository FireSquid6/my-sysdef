import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../mods/tty-breakout/engine.js';
const source=await readFile(new URL('../mods/tty-breakout/main.js',import.meta.url),'utf8');
const helper=await readFile(new URL('../mods/tty-breakout/help-context.js',import.meta.url),'utf8');
const event=(key,modifiers={},is_held=false)=>({key,modifiers,is_held});
function harness(saved,best) {
  const state={'breakout.game':saved,'breakout.best':best}, writes=[], timers={}, nodes=[], clicks={}, opened=[];
  let now=1000, focused=true, cancelled=0, focusCancelled=0, dismissed=0, focusCalls=0;
  const make=kind=>{
    const node={kind,calls:[]}; nodes.push(node); let id;
    const el=new Proxy(node,{get:(_t,name)=>(...args)=>{
      node.calls.push([name,...args]); if(name==='id') id=args[0]; if(name==='on_click') clicks[id]=args[0];
      if(name==='when'&&args[0]) args[1](el); return el;
    }}); return el;
  };
  const cx={notify(){},stop_propagation(){},spawn(){},focus_handle:()=>({focus(){focused=true;focusCalls++;},is_focused:()=>focused}),
    timer:{after:(_ms,fn)=>{timers.after=fn;return {cancel(){focusCancelled++;}};},every:(_ms,fn)=>{timers.every=fn;return {cancel(){cancelled++;}};}}};
  const deps={...engine,View:class {},div:()=>make('div'),v_flex:()=>make('v_flex'),h_flex:()=>make('h_flex'),
    shared:key=>state[key]??null,setShared:(key,value)=>{writes.push(key);state[key]=value;},props:()=>({overlay:'breakout-overlay'}),
    focused:()=>null,panes:()=>[],openOverlay:options=>opened.push(options),closeOverlay:id=>{assert.equal(id,'breakout-overlay');dismissed++;},
    nextCommand:()=>new Promise(()=>{}),Date:{now:()=>now}};
  deps.reportContext=new Function(...Object.keys(deps),helper.replace(/^import .*;$/gm,'').replaceAll('export function','function')+'\nreturn reportContext;')(...Object.values(deps));
  const Breakout=new Function(...Object.keys(deps),source.replace(/^import .*;$/gm,'').replace('export default class','return class'))(...Object.values(deps));
  const view=new Breakout();view.init({},cx);
  return {view,cx,state,writes,timers,nodes,clicks,opened,get cancelled(){return cancelled;},get focusCancelled(){return focusCancelled;},get focusCalls(){return focusCalls;},get dismissed(){return dismissed;},
    advance(ms=16){now+=ms;timers.every(cx);},blur(){focused=false;},focus(){focused=true;}};
}
const styled=(node,method,value)=>node.calls.some(([name,arg])=>name===method&&arg===value);
test('manifest is modal-only 620x600, helper matches Tetris, and help lifecycle is reported',async()=>{
  const mod=JSON.parse(await readFile(new URL('../mods/tty-breakout/mod.json',import.meta.url),'utf8'));
  assert.equal(mod.place,'none'); assert.deepEqual(mod.overlay,{frame:'none',kind:'dialog',modal:true,width:620,height:600});
  assert.equal(helper,await readFile(new URL('../mods/tty-tetris/help-context.js',import.meta.url),'utf8'));
  const h=harness();assert.deepEqual(h.state['help.contexts'],[{name:'tty-breakout',overlay:'breakout-overlay'}]);
  h.view.close();assert.deepEqual(h.state['help.contexts'],[]);
});
test('fresh and reopened game are paused, restored state is independent and malformed saves/best fall back',()=>{
  const h=harness();assert.equal(h.view.game.paused,true);assert.equal(h.view.game.ready,true);
  h.view.press(event('space'),h.cx);h.advance();h.view.game.score=500;h.view.close();
  assert.equal(h.state['breakout.game'].paused,true);assert.equal(h.state['breakout.best'],500);
  assert.notEqual(h.state['breakout.game'].ball,h.view.game.ball);h.view.game.ball.x=100;assert.notEqual(h.state['breakout.game'].ball.x,100);
  const reopen=harness(h.state['breakout.game'],500);assert.equal(reopen.view.game.paused,true);assert.notEqual(reopen.view.game.bricks,h.state['breakout.game'].bricks);
  reopen.view.press(event('p'),reopen.cx);assert.equal(reopen.view.game.paused,false);
  for(const bad of [{version:1},{...engine.newGame(),ball:{x:Infinity}},false]) {
    const fallback=harness(bad,Infinity);assert.ok(engine.validSave(fallback.view.game));assert.equal(fallback.view.best,0);
  }
});
test('own continuous held movement ignores OS repeats, supports arrows/h/l and last-key fallback',()=>{
  const h=harness();h.view.press(event('space'),h.cx);const x=h.view.game.paddle.x;
  h.view.press(event('h'),h.cx);h.view.press(event('h',{},true),h.cx);assert.equal(h.view.pressed.size,1);assert.equal(h.view.game.paddle.x,x);
  h.advance(32);assert.ok(h.view.game.paddle.x<x);
  h.view.press(event('right'),h.cx);const left=h.view.game.paddle.x;h.advance(32);assert.ok(h.view.game.paddle.x>left);
  h.view.release(event('right',{control:true}));assert.equal(h.view.pressed.size,1);const right=h.view.game.paddle.x;h.advance(32);assert.ok(h.view.game.paddle.x<right);
  h.view.release(event('h'));const stop=h.view.game.paddle.x;h.advance(32);assert.equal(h.view.game.paddle.x,stop);
  for(const key of ['left','l','arrowleft','arrowright']){h.view.press(event(key),h.cx);assert.equal(h.view.pressed.size,1);h.view.release(event(key));}
});
test('modified keys never activate gameplay, toggles or restart, and held toggle repeats are ignored',()=>{
  const h=harness();
  for(const modifiers of [{control:true},{alt:true},{shift:true},{platform:true}])for(const key of ['space','p','r','h','right','escape'])h.view.press(event(key,modifiers),h.cx);
  assert.equal(h.view.game.paused,true);assert.equal(h.view.confirmReset,false);assert.equal(h.view.pressed.size,0);assert.equal(h.dismissed,0);
  h.view.press(event('p'),h.cx);assert.equal(h.view.game.paused,false);h.view.press(event('p',{},true),h.cx);assert.equal(h.view.game.paused,false);
  h.view.press(event('h'),h.cx);h.view.press(event('p'),h.cx);assert.equal(h.view.game.paused,true);assert.equal(h.view.pressed.size,0);
});
test('focus loss auto-pauses and clears holds even when already paused; regain never resumes automatically',()=>{
  const h=harness();h.view.press(event('space'),h.cx);h.view.press(event('h'),h.cx);h.blur();const ball=engine.clone(h.view.game.ball);h.advance();
  assert.equal(h.view.game.paused,true);assert.equal(h.view.pressed.size,0);assert.deepEqual(h.view.game.ball,ball);assert.equal(h.state['breakout.game'].paused,true);
  h.focus();h.advance();assert.deepEqual(h.view.game.ball,ball);assert.equal(h.view.game.paused,true);
  h.view.pressed.set('h',-1);h.blur();h.advance();assert.equal(h.view.pressed.size,0);
});
test('pause and delayed frames never catch up huge wall-clock gaps',()=>{
  const h=harness();h.view.press(event('space'),h.cx);const expected=engine.clone(h.view.game);engine.tick(expected,64);
  h.advance(60000);assert.deepEqual(h.view.game,expected);
  h.view.press(event('p'),h.cx);const frozen=engine.clone(h.view.game);h.advance(100000);assert.deepEqual(h.view.game,frozen);
  h.view.press(event('p'),h.cx);h.advance(16);assert.ok(h.view.game.ball.y<frozen.ball.y);
});
test('ready frames do not rewrite shared state at animation frequency',()=>{
  const h=harness(); h.view.press(event('p'),h.cx);
  const writes=h.writes.length;
  for(let i=0;i<120;i++) h.advance(16);
  assert.equal(h.view.game.ready,true); assert.equal(h.writes.length,writes);
  for(let i=0;i<200;i++) h.advance(16);
  assert.ok(h.writes.length>writes, 'periodic checkpoint still saves ready paddle state');
});
test('restart requires Y/N, preserves best, and all outcomes stay paused',()=>{
  const h=harness();h.view.game.score=321;h.view.press(event('r'),h.cx);assert.equal(h.view.confirmReset,true);
  h.view.press(event('space'),h.cx);assert.equal(h.view.confirmReset,true);h.view.press(event('n'),h.cx);assert.equal(h.view.game.score,321);assert.equal(h.view.game.paused,true);
  h.view.press(event('r'),h.cx);h.view.press(event('y',{control:true}),h.cx);assert.equal(h.view.confirmReset,true);
  h.view.press(event('y'),h.cx);assert.equal(h.view.confirmReset,false);assert.equal(h.view.game.score,0);assert.equal(h.view.game.lives,3);assert.equal(h.view.game.paused,true);assert.equal(h.state['breakout.best'],321);
});
test('idempotent close cancels timers, clears holds, saves deep state and rejects all late callbacks',()=>{
  const h=harness();h.view.press(event('space'),h.cx);h.view.press(event('h'),h.cx);h.view.close();
  assert.equal(h.cancelled,1);assert.equal(h.focusCancelled,1);assert.equal(h.view.pressed.size,0);assert.equal(h.state['breakout.game'].paused,true);
  const writes=h.writes.length, snapshot=engine.clone(h.state),focus=h.focusCalls;
  h.view.close();h.advance(1000);h.timers.after();h.view.command('focus',h.cx);h.view.press(event('p'),h.cx);h.view.release(event('h'));
  assert.equal(h.cancelled,1);assert.equal(h.writes.length,writes);assert.deepEqual(h.state,snapshot);assert.equal(h.focusCalls,focus);
});
test('Escape saves/closes during confirmation; Arcade saves/closes then opens 480x340 menu',()=>{
  const h=harness();h.view.press(event('r'),h.cx);h.view.press(event('escape'),h.cx);assert.equal(h.dismissed,1);assert.equal(h.cancelled,1);
  const a=harness();a.view.press(event('space'),a.cx);a.view.render(a.cx);a.clicks['breakout-arcade']({},a.cx);
  assert.equal(a.dismissed,1);assert.equal(a.state['breakout.game'].paused,true);assert.deepEqual(a.opened,[{mod:'tty-arcade',frame:'none',kind:'dialog',modal:true,width:480,height:340}]);
  const writes=a.writes.length;a.clicks['breakout-close']({},a.cx);a.clicks['breakout-arcade']({},a.cx);assert.equal(a.writes.length,writes);assert.equal(a.opened.length,1);
});
test('render draws 40 colorful beveled bricks, ball, paddle with absolute positions and independent arcade palette',()=>{
  const h=harness();h.view.render(h.cx);const root=h.nodes.find(n=>styled(n,'id','breakout'));
  assert.ok(styled(root,'bg','#10142b'));assert.ok(styled(root,'font_family','monospace'));assert.ok(styled(root,'rounded_none',undefined));
  const bricks=h.nodes.filter(n=>n.calls.some(([m,id])=>m==='id'&&/^brick-/.test(id)));assert.equal(bricks.length,40);
  for(const color of ['#ff597e','#ff9a3d','#ffe052','#79ef68','#c87bff'])assert.ok(bricks.some(n=>styled(n,'bg',color)));
  for(const b of h.view.game.bricks){const node=bricks.find(n=>styled(n,'id',`brick-${b.id}`));assert.ok(styled(node,'absolute',undefined));assert.ok(styled(node,'left',b.x));assert.ok(styled(node,'top',b.y));}
  for(const id of ['breakout-paddle','breakout-ball'])assert.ok(h.nodes.some(n=>styled(n,'id',id)&&styled(n,'absolute',undefined)));
  assert.ok(h.nodes.filter(n=>styled(n,'h',2)&&styled(n,'bg','#fff1c1')).length>=42);
  assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm,''),/\btheme\b|canvas|setTimeout|Math\.random/);
  h.nodes.length=0;h.view.game.bricks[0].alive=false;h.view.confirmReset=true;assert.doesNotThrow(()=>h.view.render(h.cx));
  assert.ok(!h.nodes.some(n=>styled(n,'id','brick-0')));
});
