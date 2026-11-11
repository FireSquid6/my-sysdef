// Dependency-free, deterministic pixel physics. Positions are ball centres and
// paddle left edges. Fixed 240Hz steps travel <= 2.17px (ball radius is 5px).
export const WIDTH = 560, HEIGHT = 420, RADIUS = 5;
export const PADDLE_WIDTH = 88, PADDLE_Y = 388, PADDLE_HEIGHT = 12;
export const STEP = 1000 / 240, MAX_FRAME = 64;
const LIMIT = 1e12;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const bounded = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
export const speed = level => Math.min(520, 260 + (level - 1) * 24);
export function bricks() {
  return Array.from({length:40}, (_, id) => ({id, x:20 + (id % 8)*65, y:42 + Math.floor(id/8)*25, w:60, h:19, alive:true}));
}
function dock(g) {
  g.ready = true; g.ball = {x:g.paddle.x + PADDLE_WIDTH/2, y:PADDLE_Y - RADIUS - 1, vx:0, vy:0};
  g.accumulator = 0;
}
export function newGame() {
  const g = {version:1, paused:true, ready:true, gameOver:false, score:0, lives:3, level:1,
    paddle:{x:(WIDTH-PADDLE_WIDTH)/2}, ball:null, bricks:bricks(), accumulator:0};
  dock(g); return g;
}
export function launch(g) {
  if (g.gameOver || !g.ready) return g;
  g.paused = false; g.ready = false; g.accumulator = 0;
  g.ball.vx = speed(g.level)*0.45; g.ball.vy = -Math.sqrt(speed(g.level)**2 - g.ball.vx**2);
  return g;
}
export function pause(g, value = !g.paused) { g.paused = value; g.accumulator = 0; return g; }
const intersects = (ball, rect) => ball.x + RADIUS > rect.x && ball.x - RADIUS < rect.x + rect.w && ball.y + RADIUS > rect.y && ball.y - RADIUS < rect.y + rect.h;
function hit(g, brick) {
  brick.alive = false;
  g.score = Math.min(LIMIT, g.score + (5 - Math.floor(brick.id/8))*10*g.level);
}
function step(g, direction) {
  const dt = STEP/1000, b = g.ball;
  g.paddle.x = clamp(g.paddle.x + direction*390*dt, 0, WIDTH-PADDLE_WIDTH);
  if (g.ready) { b.x = g.paddle.x + PADDLE_WIDTH/2; return; }
  // Resolve axes separately, keeping contact coordinates exact: no random jitter
  // or positional nudges. At most one brick per axis prevents double reflection.
  b.x += b.vx*dt;
  if (b.x < RADIUS) { b.x = RADIUS; b.vx = Math.abs(b.vx); }
  if (b.x > WIDTH-RADIUS) { b.x = WIDTH-RADIUS; b.vx = -Math.abs(b.vx); }
  for (const brick of g.bricks) if (brick.alive && intersects(b, brick)) {
    b.x = b.vx > 0 ? brick.x-RADIUS : brick.x+brick.w+RADIUS;
    b.vx = -b.vx; hit(g, brick); break;
  }
  const paddle = {x:g.paddle.x, y:PADDLE_Y, w:PADDLE_WIDTH, h:PADDLE_HEIGHT};
  if (intersects(b, paddle)) {
    const left = b.x < paddle.x+paddle.w/2;
    const contact = left ? paddle.x-RADIUS : paddle.x+paddle.w+RADIUS;
    if (contact < RADIUS || contact > WIDTH-RADIUS) {
      // A paddle at the wall cannot push the ball outside the arena. Resolve
      // the nearest vertical face instead of trapping it between two solids.
      const above = b.y < PADDLE_Y+PADDLE_HEIGHT/2;
      b.y = above ? PADDLE_Y-RADIUS : PADDLE_Y+PADDLE_HEIGHT+RADIUS;
      b.vy = above ? -Math.abs(b.vy) : Math.abs(b.vy);
    } else {
      b.x = contact; b.vx = left ? -Math.abs(b.vx) : Math.abs(b.vx);
    }
  }
  const previousY = b.y;
  b.y += b.vy*dt;
  if (b.y < RADIUS) { b.y = RADIUS; b.vy = Math.abs(b.vy); }
  for (const brick of g.bricks) if (brick.alive && intersects(b, brick)) {
    b.y = b.vy > 0 ? brick.y-RADIUS : brick.y+brick.h+RADIUS;
    b.vy = -b.vy; hit(g, brick); break;
  }
  if (b.vy > 0 && previousY+RADIUS <= PADDLE_Y && b.y+RADIUS >= PADDLE_Y &&
      b.x+RADIUS > g.paddle.x && b.x-RADIUS < g.paddle.x+PADDLE_WIDTH) {
    b.y = PADDLE_Y-RADIUS;
    const offset = clamp((b.x - (g.paddle.x+PADDLE_WIDTH/2))/(PADDLE_WIDTH/2), -1, 1);
    // Nonzero horizontal speed avoids an endless vertical lane at the centre.
    b.vx = speed(g.level) * (Math.abs(offset) < 0.12 ? (b.vx < 0 ? -0.12 : 0.12) : offset*0.82);
    b.vy = -Math.sqrt(speed(g.level)**2 - b.vx**2);
  } else if (b.vy < 0 && intersects(b,paddle)) {
    b.y = PADDLE_Y+PADDLE_HEIGHT+RADIUS; b.vy = Math.abs(b.vy);
  }
  if (!g.bricks.some(brick => brick.alive)) {
    g.level = Math.min(9999, g.level+1); g.bricks = bricks(); dock(g); return;
  }
  if (b.y >= HEIGHT-RADIUS) {
    g.lives--;
    if (g.lives === 0) {
      g.gameOver = true; g.paused = true; g.accumulator = 0;
      b.y = HEIGHT-RADIUS; b.vx = 0; b.vy = 0;
    } else dock(g);
  }
}
export function tick(g, ms, direction = 0) {
  if (g.paused || g.gameOver || !Number.isFinite(ms) || ms <= 0) return g;
  g.accumulator += Math.min(ms, MAX_FRAME);
  const input = direction === -1 || direction === 1 ? direction : 0;
  while (g.accumulator + 1e-9 >= STEP && !g.gameOver) {
    g.accumulator = Math.max(0, g.accumulator-STEP);
    const wasReady = g.ready;
    step(g, input);
    if (g.ready && !wasReady) { g.accumulator = 0; break; }
  }
  return g;
}
export function validSave(g) {
  if (!g || g.version !== 1 || ![g.paused,g.ready,g.gameOver].every(v => typeof v === 'boolean') ||
      !Number.isInteger(g.score) || !bounded(g.score,0,LIMIT) || !Number.isInteger(g.level) || !bounded(g.level,1,9999) ||
      !Number.isInteger(g.lives) || !bounded(g.lives,0,3) || g.gameOver !== (g.lives === 0) ||
      !bounded(g.accumulator,0,STEP) || !g.paddle || !bounded(g.paddle.x,0,WIDTH-PADDLE_WIDTH) ||
      !g.ball || !bounded(g.ball.x,RADIUS,WIDTH-RADIUS) || !bounded(g.ball.y,RADIUS,HEIGHT-RADIUS) ||
      !bounded(g.ball.vx,-520,520) || !bounded(g.ball.vy,-520,520)) return false;
  const layout = bricks();
  if (!Array.isArray(g.bricks) || g.bricks.length !== layout.length || !Array.from(g.bricks).every((b,i) => b &&
      ['id','x','y','w','h'].every(k => b[k] === layout[i][k]) && typeof b.alive === 'boolean') || !g.bricks.some(b => b.alive)) return false;
  const b = g.ball;
  if (g.ready) return !g.gameOver && b.vx === 0 && b.vy === 0 && b.x === g.paddle.x+PADDLE_WIDTH/2 && b.y === PADDLE_Y-RADIUS-1;
  if (g.gameOver) return g.paused && b.vx === 0 && b.vy === 0 && b.y === HEIGHT-RADIUS;
  return Math.abs(Math.hypot(b.vx,b.vy)-speed(g.level)) < 0.001 && Math.abs(b.vy) >= speed(g.level)*0.5 &&
    !intersects(b,{x:g.paddle.x,y:PADDLE_Y,w:PADDLE_WIDTH,h:PADDLE_HEIGHT}) &&
    !g.bricks.some(brick => brick.alive && intersects(b,brick));
}
export const clone = value => JSON.parse(JSON.stringify(value));
