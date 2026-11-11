import { reportContext } from './help-context.js';
import { View, div } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { shared, setShared, props, closeOverlay, openOverlay } from 'herdr';
import { newGame, move, undo, won, lost, validSave } from './engine.js';

const clone = value => JSON.parse(JSON.stringify(value));
const T = { background: '#10142b', ink: '#fff1c1', accent: '#57e8ff', chrome: '#191f3d', edge: '#394574', dim: '#9ca9cf', gold: '#ffbd69' };
const COLORS = ['#263153', '#354870', '#3e6682', '#277e8b', '#258d79', '#589750', '#9b953e', '#c8813e', '#cb5f4d', '#b84c76', '#854cb5', '#665be0'];
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];
function numberPixels(value) {
  const text = String(value), scale = Math.max(1, Math.min(6, Math.floor(64 / (4 * text.length - 1))));
  return h_flex().gap(scale).items_center().children([...text].map(digit =>
    v_flex().children(Array.from({ length: 5 }, (_, row) => h_flex().children(Array.from({ length: 3 }, (_, col) =>
      div().w(scale).h(scale).flex_none().when(DIGITS[Number(digit)][row * 3 + col] === '1', el => el.bg(T.ink))))))));
}
export default class TwentyFortyEight extends View {
  init(_props, cx) {
    this.closed = false; this.dismissed = false; this.confirmReset = false;
    reportContext(this, 'tty-2048', cx);
    this.handle = cx.focus_handle();
    const saved = shared('2048.game'), best = shared('2048.best');
    this.game = validSave(saved) ? clone(saved) : newGame();
    this.best = Math.max(Number.isSafeInteger(best) && best >= 0 && best % 4 === 0 ? best : 0, this.game.score);
    cx.timer.after(0, () => { if (!this.closed) this.handle.focus(); });
  }
  save() {
    this.best = Math.max(this.best, this.game.score);
    setShared('2048.game', clone(this.game)); setShared('2048.best', this.best);
  }
  close() { if (this.closed) return; this.save(); this.closed = true; }
  dismiss() {
    if (this.dismissed || this.closed) return false;
    this.close(); this.dismissed = true; closeOverlay(props().overlay); return true;
  }
  arcade() {
    if (this.dismiss()) openOverlay({ mod: 'tty-arcade', frame: 'none', kind: 'dialog', modal: true, width: 480, height: 340 });
  }
  act(action, cx) {
    if (this.closed) return;
    this.handle.focus();
    if (action === 'restart') this.confirmReset = true;
    else if (action === 'cancel') this.confirmReset = false;
    else if (action === 'confirm' && this.confirmReset) { this.game = newGame(); this.confirmReset = false; this.save(); }
    else if (!this.confirmReset) {
      let changed = false;
      if (action === 'undo') changed = undo(this.game);
      else if (action === 'continue' && won(this.game)) { this.game.continued = true; changed = true; }
      else changed = move(this.game, action);
      if (changed) this.save();
    }
    cx.notify();
  }
  press(e, cx) {
    if (this.closed || e.is_held || Object.values(e.modifiers || {}).some(Boolean)) return;
    const key = e.key.toLowerCase();
    const mapping = { left: 'left', h: 'left', right: 'right', l: 'right', up: 'up', k: 'up', down: 'down', j: 'down', u: 'undo', r: 'restart', c: 'continue' };
    if (key === 'escape') { cx.stop_propagation(); this.dismiss(); return; }
    if (this.confirmReset) {
      if (key === 'y' || key === 'n') { cx.stop_propagation(); this.act(key === 'y' ? 'confirm' : 'cancel', cx); }
      return;
    }
    if (mapping[key]) { cx.stop_propagation(); this.act(mapping[key], cx); }
  }
  render(cx) {
    const game = this.game;
    const button = (id, label, action) => div().id(`2048-${id}`).px(7).py(4).bg(T.chrome).text_size(11)
      .border_2().border_color(T.edge).cursor_pointer().hover(el => el.bg('#293960'))
      .on_click((_e, cx) => { if (!this.closed) { this.handle.focus(); action(cx); } }).child(label);
    const control = (action, label) => button(action, label, cx => this.act(action, cx));
    const tile = (value, index) => div().id(`2048-tile-${index}`).w(82).h(82).flex_none().p(3)
      .bg(value ? '#d9c59d' : '#202840').child(div().size_full().p(3).bg(value ? '#111a33' : T.background)
        .child(v_flex().size_full().items_center().justify_center().gap(5)
          .bg(value ? COLORS[Math.min(COLORS.length - 1, Math.log2(value) - 1)] : '#1b2341')
          .when(Boolean(value), el => el.child(numberPixels(value)))));
    const status = this.confirmReset ? 'New game? Discard this board?' : lost(game) ? 'NO MOVES LEFT · undo or try again' :
      won(game) && !game.continued ? '2048! YOU WIN · keep going?' : 'Slide · combine · reach 2048';
    return v_flex().id('2048').size_full().p(12).gap(6).bg(T.background).text_color(T.ink).text_size(12).font_family('monospace')
      .border_2().border_color(T.accent).track_focus(this.handle).on_mouse_down('left', () => { if (!this.closed) this.handle.focus(); })
      .on_key_down((e, cx) => this.press(e, cx))
      .child(h_flex().flex_none().justify_between().items_center()
        .child(div().text_size(24).font_semibold().text_color(T.accent).child('2048'))
        .child(button('arcade', 'Arcade', () => this.arcade()))
        .child(button('close', 'Save & close', () => this.dismiss())))
      .child(h_flex().flex_none().justify_between().px(8).py(4).bg(T.chrome)
        .child(div().child(`SCORE ${game.score}`)).child(div().text_color(T.gold).child(`BEST ${this.best}`)))
      .child(h_flex().flex_none().justify_center().child(v_flex().id('2048-board').flex_none().p(8).gap(6).bg(T.edge)
        .children(Array.from({ length: 4 }, (_, row) => h_flex().gap(6).flex_none().children(game.board.slice(row * 4, row * 4 + 4).map((value, col) => tile(value, row * 4 + col)))))))
      .child(h_flex().flex_none().justify_center().gap(5)
        .child(control('left', '← H')).child(control('up', '↑ K')).child(control('down', '↓ J')).child(control('right', '→ L'))
        .child(control('undo', 'Undo')).child(control('restart', 'New')))
      .child(v_flex().flex_none().gap(4).items_center()
        .child(div().text_color(T.gold).child(status))
        .when(this.confirmReset, el => el.child(h_flex().gap(8).child(control('confirm', 'Yes [Y]')).child(control('cancel', 'No [N]'))))
        .when(!this.confirmReset && won(game) && !game.continued, el => el.child(control('continue', 'Continue [C]'))))
      .child(div().text_size(10).text_color(T.dim).child('Arrows / HJKL · U undo · R new · Esc save & close'));
  }
}
