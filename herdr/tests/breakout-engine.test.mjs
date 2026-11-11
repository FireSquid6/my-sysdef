import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, launch, pause, tick, validSave, clone, speed, STEP, WIDTH, HEIGHT, RADIUS, PADDLE_Y, PADDLE_WIDTH } from '../mods/tty-breakout/engine.js';
const active = () => launch(newGame());
function velocity(g, vx, sign = 1) { g.ball.vx = vx; g.ball.vy = sign*Math.sqrt(speed(g.level)**2-vx**2); }
test('new game is legal, paused and docked; launch and pause are deterministic', () => {
  const g = newGame(); assert.ok(validSave(g)); assert.equal(g.lives,3);
  const snapshot = clone(g); tick(g,1000,1); assert.deepEqual(g,snapshot);
  launch(g); assert.equal(g.paused,false); assert.equal(g.ready,false); assert.ok(validSave(g));
  tick(g,16); assert.ok(g.ball.y < snapshot.ball.y);
  pause(g); const frozen=clone(g); tick(g,64); assert.deepEqual(g,frozen);
  pause(g,false); assert.ok(validSave(g));
});
test('fixed steps are partition-independent and bounded against large/invalid frames', () => {
  const a=active(), b=active(); tick(a,60,1); for(let i=0;i<6;i++) tick(b,10,1);
  for(const k of ['x','y','vx','vy']) assert.ok(Math.abs(a.ball[k]-b.ball[k])<1e-8);
  assert.ok(Math.abs(a.paddle.x-b.paddle.x)<1e-8);
  const c=active(),d=active(); tick(c,100000); tick(d,64); assert.deepEqual(c,d);
  const snapshot=clone(c); for(const dt of [NaN,Infinity,-1,0]) tick(c,dt); assert.deepEqual(c,snapshot);
  const e=active(); tick(e,STEP/2); assert.equal(e.ball.y,newGame().ball.y); tick(e,STEP/2); assert.ok(e.ball.y<newGame().ball.y);
});
test('wall and ceiling collisions reflect without leaving legal bounds', () => {
  for(const side of [-1,1]) {
    const g=active(); g.ball.x=side<0 ? RADIUS+0.1 : WIDTH-RADIUS-0.1; g.ball.y=210; velocity(g,side*150,-1);
    tick(g,STEP); assert.equal(Math.sign(g.ball.vx),-side); assert.ok(validSave(g));
  }
  const g=active(); g.ball.y=RADIUS+0.1; velocity(g,100,-1); tick(g,STEP); assert.ok(g.ball.vy>0); assert.ok(validSave(g));
});
test('brick top, bottom and both side impacts destroy once and award row score', () => {
  for(const side of ['top','bottom','left','right']) {
    const g=active(), brick=g.bricks[0];
    g.bricks.forEach(b => b.alive = b.id === 0 || b.id === 39);
    if(side==='top'||side==='bottom') {
      g.ball.x=brick.x+brick.w/2; g.ball.y=side==='top'?brick.y-RADIUS-0.1:brick.y+brick.h+RADIUS+0.1;
      velocity(g,0,side==='top'?1:-1);
    } else {
      g.ball.x=side==='left'?brick.x-RADIUS-0.1:brick.x+brick.w+RADIUS+0.1; g.ball.y=brick.y+brick.h/2;
      velocity(g,side==='left'?150:-150,1);
    }
    tick(g,STEP); assert.equal(brick.alive,false,side); assert.equal(g.score,50,side); assert.ok(validSave(g),side);
    const component = side==='top'||side==='bottom'?'vy':'vx';
    assert.equal(Math.sign(g.ball[component]),side==='top'||side==='left'?-1:1,side);
    tick(g,STEP); assert.equal(g.score,50,side);
  }
});
test('paddle top uses aim, and paddle side reflects horizontally', () => {
  for(const offset of [-30,0,30]) {
    const g=active(); g.ball.x=g.paddle.x+PADDLE_WIDTH/2+offset; g.ball.y=PADDLE_Y-RADIUS-0.1; velocity(g,0);
    tick(g,STEP); assert.ok(g.ball.vy<0); assert.ok(Math.abs(g.ball.vx)>0); assert.ok(validSave(g));
    if(offset) assert.equal(Math.sign(g.ball.vx),Math.sign(offset));
  }
  const g=active(); g.ball.x=g.paddle.x-RADIUS-0.1; g.ball.y=PADDLE_Y+6; velocity(g,150); tick(g,STEP); assert.ok(g.ball.vx<0);
});
test('paddle/wall squeeze resolves to a legal face, never outside the arena', () => {
  for (const side of [-1,1]) {
    const g=active(); g.paddle.x=side<0?0:WIDTH-PADDLE_WIDTH;
    g.ball.x=side<0?RADIUS:WIDTH-RADIUS; g.ball.y=PADDLE_Y+2; velocity(g,side*150);
    tick(g,STEP); assert.ok(validSave(g)); assert.ok(g.ball.vy<0); assert.ok(g.ball.y<=PADDLE_Y-RADIUS);
  }
});
test('maximum-speed frames still hit thin bricks and the paddle; level cap remains legal', () => {
  const g=newGame(); g.level=9999; launch(g); g.bricks.forEach(b=>b.alive=b.id===0); g.ball.x=45; g.ball.y=30; velocity(g,0);
  tick(g,64); assert.equal(g.level,9999); assert.equal(g.ready,true); assert.ok(validSave(g));
  launch(g); g.ball.x=g.paddle.x+44; g.ball.y=PADDLE_Y-RADIUS-20; velocity(g,0); tick(g,64); assert.ok(g.ball.vy<0); assert.ok(validSave(g));
});
test('lives dock for a new launch; zero lives is terminal; clearing advances level', () => {
  const g=active();
  for(let lives=2;lives>=0;lives--) {
    g.ball.x=30; g.ball.y=HEIGHT-RADIUS-0.1; velocity(g,0); tick(g,STEP);
    assert.equal(g.lives,lives); assert.ok(validSave(g));
    if(lives) { assert.equal(g.ready,true); launch(g); }
  }
  assert.equal(g.gameOver,true); const frozen=clone(g); launch(g); tick(g,100); assert.deepEqual(g,frozen);
  const next=active(); next.bricks.forEach((b,i)=>b.alive=i===0); next.ball.x=45; next.ball.y=36.9; velocity(next,0);
  tick(next,STEP); assert.equal(next.level,2); assert.equal(next.bricks.filter(b=>b.alive).length,40); assert.equal(next.ready,true); assert.equal(next.score,50); assert.ok(validSave(next));
  assert.equal(speed(9999),520);
});
test('ready paddle tracks held motion, clamps to bounds and docks ball', () => {
  const g=newGame(); pause(g,false); const x=g.paddle.x; tick(g,64,1); assert.ok(g.paddle.x>x+20);
  for(let i=0;i<100;i++) tick(g,64,1); assert.equal(g.paddle.x,WIDTH-PADDLE_WIDTH); assert.ok(validSave(g));
  for(let i=0;i<100;i++) tick(g,64,-1); assert.equal(g.paddle.x,0); assert.ok(validSave(g));
});
test('validators reject malformed numbers, flags, geometry, entities and inconsistent state', () => {
  const changes = [g=>g.version=2,g=>g.level=Infinity,g=>g.level=0,g=>g.level=1.5,g=>g.score=-1,g=>g.score=1e13,g=>g.lives=4,g=>g.lives=0,
    g=>g.paused='true',g=>g.ready=null,g=>g.gameOver=1,g=>g.accumulator=100,g=>g.accumulator=NaN,g=>g.paddle.x=-1,g=>g.paddle=null,
    g=>g.ball.vx=NaN,g=>g.ball.vy=Infinity,g=>g.ball.x=WIDTH,g=>g.ball.y=-5,g=>g.ball.vx=1,g=>g.ball.y=200,g=>g.bricks=[],
    g=>g.bricks[0]=null,g=>delete g.bricks[0],g=>g.bricks[0].alive=1,g=>g.bricks[0].w=999,g=>g.bricks[0].id=1,g=>g.bricks.reverse(),g=>g.bricks.forEach(b=>b.alive=false)];
  for(const change of changes) { const g=newGame(); change(g); assert.equal(validSave(g),false,String(change)); }
  for(const g of [null,undefined,false,{},[]]) assert.equal(validSave(g),false);
  const g=active(); g.ball.vx=520; assert.equal(validSave(g),false);
  const overlap=active(); overlap.ball.x=40; overlap.ball.y=50; assert.equal(validSave(overlap),false);
  const paddleOverlap=active(); paddleOverlap.ball.y=PADDLE_Y+1; assert.equal(validSave(paddleOverlap),false);
  for (const key of ['x','y','vx','vy']) for (const bad of [NaN,Infinity,-Infinity,'1',null]) {
    const g=active(); g.ball[key]=bad; assert.equal(validSave(g),false,`${key}=${bad}`);
  }
});
test('long deterministic play remains finite, bounded and serializable', () => {
  const g=newGame();
  for(let i=0;i<12000&&!g.gameOver;i++) {
    if(g.ready) launch(g);
    tick(g,16,g.ball.x>g.paddle.x+PADDLE_WIDTH/2?1:-1);
    assert.ok(validSave(g),`frame ${i}: ${JSON.stringify(g.ball)}`);
  }
  assert.ok(validSave(clone(g)));
});
