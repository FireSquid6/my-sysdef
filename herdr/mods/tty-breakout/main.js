import { reportContext } from "./help-context.js";
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, shared, setShared, closeOverlay, openOverlay, nextCommand } from "herdr";
import { newGame, launch, pause, tick, validSave, clone, WIDTH, HEIGHT, RADIUS, PADDLE_WIDTH, PADDLE_Y, PADDLE_HEIGHT } from "./engine.js";

const PALETTE = { background:'#10142b', foreground:'#fff1c1', accent:'#57e8ff', border:'#394574', chrome:'#191f3d', hover:'#293960', dim:'#9ca9cf' };
const COLORS = ['#ff597e','#ff9a3d','#ffe052','#79ef68','#c87bff'];
const modified = e => Object.values(e.modifiers || {}).some(Boolean);
const keyOf = e => String(e.key).toLowerCase();
const direction = key => ['h','left','arrowleft'].includes(key) ? -1 : ['l','right','arrowright'].includes(key) ? 1 : 0;

// Pixel bevels are GPUI children, not text glyphs, canvas, or external art.
function sprite(id, x, y, w, h, color) {
  return div().id(id).absolute().left(x).top(y).w(w).h(h).bg(color)
    .child(div().absolute().left(0).top(0).w(w).h(2).bg(PALETTE.foreground))
    .child(div().absolute().left(0).top(0).w(2).h(h).bg(PALETTE.foreground))
    .child(div().absolute().left(2).top(h-2).w(w-2).h(2).bg(PALETTE.border))
    .child(div().absolute().left(w-2).top(2).w(2).h(h-2).bg(PALETTE.background));
}
export default class Breakout extends View {
  init(_props, cx) {
    this.closed = false; this.pressed = new Map(); this.confirmReset = false;
    this.handle = cx.focus_handle();
    const saved = shared('breakout.game');
    this.game = validSave(saved) ? clone(saved) : newGame();
    pause(this.game, true);
    const best = shared('breakout.best');
    this.best = Number.isInteger(best) && best >= 0 && best <= 1e12 ? best : 0;
    this.lastTime = Date.now(); this.checkpoint = 0;
    reportContext(this, 'tty-breakout', cx);
    // The shared helper wraps close; keep even that wrapper idempotent.
    const close = this.close.bind(this);
    this.close = () => { if (!this.closed) close(); };
    this.focusTimer = cx.timer.after(0, () => { if (!this.closed) this.handle.focus(); });
    this.timer = cx.timer.every(16, cx => this.advance(cx));
    cx.spawn(async cx => { while (!this.closed) { const command = await nextCommand(); if (!this.closed) this.command(command, cx); } });
  }
  command(command, cx) {
    if (this.closed) return;
    if (command === 'focus') this.handle.focus();
    cx.notify();
  }
  clearKeys() { this.pressed.clear(); }
  save() {
    const snapshot = clone(this.game); pause(snapshot, true);
    setShared('breakout.game', snapshot);
    this.best = Math.max(this.best, this.game.score);
    setShared('breakout.best', this.best);
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.timer?.cancel(); this.focusTimer?.cancel();
    this.clearKeys(); pause(this.game, true); this.save();
  }
  dismiss() { if (this.closed) return; this.close(); closeOverlay(props().overlay); }
  suspend(cx) {
    const changed = !this.game.paused || this.pressed.size;
    pause(this.game, true); this.clearKeys();
    if (changed) { this.save(); cx.notify(); }
  }
  advance(cx) {
    if (this.closed) return;
    const now = Date.now(), elapsed = Math.max(0, Math.min(64, now-this.lastTime)); this.lastTime = now;
    if (!this.handle.is_focused()) { this.suspend(cx); return; }
    if (this.game.paused || this.game.gameOver || this.confirmReset) return;
    // Last pressed direction wins. OS repeats are ignored; fixed physics steps
    // integrate held motion, and releasing it falls back to the other held key.
    const wasReady = this.game.ready;
    tick(this.game, elapsed, [...this.pressed.values()].at(-1) || 0);
    this.best = Math.max(this.best, this.game.score);
    this.checkpoint += elapsed;
    if (this.checkpoint >= 5000 || this.game.gameOver || (!wasReady && this.game.ready)) { this.checkpoint = 0; this.save(); }
    cx.notify();
  }
  press(e, cx) {
    if (this.closed) return;
    const key = keyOf(e);
    if (modified(e)) return;
    if (key === 'escape') { cx.stop_propagation(); this.dismiss(); return; }
    if (e.is_held) { cx.stop_propagation(); return; }
    if (!this.handle.is_focused()) { this.suspend(cx); return; }
    if (this.confirmReset) {
      if (key === 'y') { this.save(); this.game = newGame(); this.confirmReset = false; this.clearKeys(); this.save(); }
      else if (key === 'n') this.confirmReset = false;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (!direction(key) && !['space',' ','p','r'].includes(key)) return;
    cx.stop_propagation();
    if (key === 'r') { pause(this.game, true); this.clearKeys(); this.confirmReset = true; this.save(); }
    else if (key === 'p') { if (!this.game.gameOver) pause(this.game); this.clearKeys(); this.lastTime = Date.now(); this.save(); }
    else if (key === 'space' || key === ' ') {
      if (this.game.ready) { launch(this.game); this.clearKeys(); this.lastTime = Date.now(); }
    } else if (!this.game.paused && !this.game.gameOver && !this.pressed.has(key)) this.pressed.set(key, direction(key));
    cx.notify();
  }
  release(e) { if (!this.closed) this.pressed.delete(keyOf(e)); }
  render(cx) {
    const t = PALETTE, g = this.game;
    const button = (id, text, fn) => div().id(id).px(8).py(4).bg(t.chrome).border_1().border_color(t.border).rounded_none().cursor_pointer().hover(s => s.bg(t.hover))
      .on_click((_e,cx) => { if (!this.closed) { this.handle.focus(); fn(cx); } }).child(text);
    const status = this.confirmReset ? 'Restart? Y = new game · N = cancel (stays paused)' : g.gameOver ? 'GAME OVER · R to restart' : g.paused ? 'PAUSED · P resume · Space launch when ready' : g.ready ? 'READY · Space to launch' : 'Keep the ball in play!';
    return v_flex().id('breakout').size_full().min_h(0).p(12).gap(8).rounded_none().font_family('monospace').text_size(12)
      .bg(t.background).text_color(t.foreground).border_1().border_color(t.accent).track_focus(this.handle)
      .on_mouse_down('left', () => { if (!this.closed) this.handle.focus(); })
      .on_key_down((e,cx) => this.press(e,cx)).on_key_up(e => this.release(e))
      .child(h_flex().flex_none().items_center().justify_between()
        .child(div().font_semibold().text_color(t.accent).child('BREAKOUT / ARCADE'))
        .child(h_flex().gap(8)
          .child(button('breakout-arcade','Arcade', () => { this.dismiss(); openOverlay({mod:'tty-arcade', frame:'none', kind:'dialog', modal:true, width:480, height:340}); }))
          .child(button('breakout-close','Pause & close', () => this.dismiss()))))
      .child(h_flex().flex_none().justify_between()
        .child(div().child(`Score ${g.score} · Best ${Math.max(this.best,g.score)}`))
        .child(div().text_color(t.accent).child(`Lives ${g.lives} · Level ${g.level}`)))
      .child(div().id('breakout-board').relative().flex_none().w(WIDTH).h(HEIGHT).overflow_hidden().bg(t.chrome)
        .children(g.bricks.filter(b => b.alive).map(b => sprite(`brick-${b.id}`,b.x,b.y,b.w,b.h,COLORS[Math.floor(b.id/8)])))
        .child(sprite('breakout-paddle',g.paddle.x,PADDLE_Y,PADDLE_WIDTH,PADDLE_HEIGHT,t.accent))
        .child(sprite('breakout-ball',g.ball.x-RADIUS,g.ball.y-RADIUS,RADIUS*2,RADIUS*2,t.foreground)))
      .child(div().flex_none().text_color(t.accent).child(status))
      .child(div().flex_none().text_color(t.dim).child('← / → or H / L move · Space launch · P pause · R restart · Esc close'));
  }
}
