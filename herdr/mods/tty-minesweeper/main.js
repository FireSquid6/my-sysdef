import { reportContext } from "./help-context.js";
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, props, closeOverlay, openOverlay } from "herdr";
import { SIZE, MINES, newGame, restoreGame, reveal, toggleFlag } from "./engine.js";

const PALETTE = { background:'#10142b', foreground:'#fff1c1', accent:'#57e8ff', border:'#394574', chrome:'#191f3d', hover:'#293960', selected:'#334273', dim:'#9ca9cf' };
const SPRITES = {
  mine: ['0001000', '0101010', '0011100', '1111111', '0011100', '0101010', '0001000'],
  flag: ['0111100', '0111000', '0110000', '0100000', '0100000', '1111000', '1111000'],
  wrong: ['1000001', '0100010', '0010100', '0001000', '0010100', '0100010', '1000001'],
};
const NUMBER_COLORS = ['#fff1c1', '#57e8ff', '#80efac', '#ff788e', '#b9a0ff', '#ffc16b', '#71e2d0', '#ffffff', '#9ca9cf'];
function sprite(kind, color) {
  return v_flex().id(`minesweeper-sprite-${kind}`).flex_none().children(SPRITES[kind].map(row =>
    h_flex().flex_none().children([...row].map(bit => div().w(2).h(2).flex_none().when(bit === '1', el => el.bg(color))))));
}

export default class Minesweeper extends View {
  init(_props, cx) {
    reportContext(this, "tty-minesweeper", cx);
    this.handle = cx.focus_handle();
    this.game = restoreGame(shared("minesweeper.game"));
    this.confirmReset = false; this.closed = false;
    cx.timer.after(0, () => { if (!this.closed) this.handle.focus(); });
  }

  save() { setShared("minesweeper.game", restoreGame(this.game)); }

  // Called by the host for Escape dismissal, reload, toggle-close and quit too.
  close() { if (!this.closed) { this.save(); this.closed = true; } }
  dismiss() { this.close(); closeOverlay(props().overlay); }
  back() {
    this.dismiss();
    openOverlay({ mod: "tty-arcade", frame: "none", kind: "dialog", modal: true, width: 480, height: 340 });
  }

  restart(cx) {
    if (this.closed) return;
    this.game = newGame(); this.confirmReset = false; this.save(); cx.notify();
  }

  play(index, flag, cx) {
    if (this.closed || this.confirmReset) return;
    this.handle.focus(); this.game.cursor = index;
    if (flag) toggleFlag(this.game, index); else reveal(this.game, index);
    this.save(); cx.notify();
  }

  press(e, cx) {
    if (this.closed) return;
    const key = String(e.key).toLowerCase();
    if (key === "escape") { cx.stop_propagation(); this.dismiss(); return; }
    if (e.modifiers?.control || e.modifiers?.platform || e.modifiers?.alt) return;
    if (this.confirmReset) {
      cx.stop_propagation();
      if (!e.is_held && key === "y") this.restart(cx);
      else if (key === "n") { this.confirmReset = false; cx.notify(); }
      return;
    }
    const moves = { h: [-1, 0], left: [-1, 0], l: [1, 0], right: [1, 0], k: [0, -1], up: [0, -1], j: [0, 1], down: [0, 1] };
    if (moves[key]) {
      const [dx, dy] = moves[key], i = this.game.cursor;
      this.game.cursor = Math.max(0, Math.min(SIZE - 1, Math.floor(i / SIZE) + dy)) * SIZE + Math.max(0, Math.min(SIZE - 1, i % SIZE + dx));
      this.save();
    } else if (["enter", "space", " ", "f"].includes(key)) {
      if (!e.is_held) this.play(this.game.cursor, key === "f", cx);
    } else if (key === "r") {
      if (!e.is_held) this.confirmReset = true;
    } else return;
    cx.stop_propagation(); cx.notify();
  }

  render(cx) {
    const t = PALETTE, game = this.game, ended = ["won", "lost"].includes(game.status);
    const flags = game.cells.filter(c => c.flagged).length;
    const revealed = game.cells.filter(c => c.revealed && !c.mine).length;
    const status = game.status === "won" ? "You win! All safe squares revealed." : game.status === "lost" ? "Mine hit! Game over." : game.status === "ready" ? "Reveal to begin · first reveal is safe." : "Numbers count adjacent mines.";
    const button = (id, label, action) => div().id(id).px(8).py(4).bg(t.chrome).border_2().border_color(t.border).cursor_pointer().hover(s => s.bg(t.hover))
      .on_click((_e, cx) => { if (!this.closed) { this.handle.focus(); action(cx); } }).child(label);
    return v_flex().id("minesweeper").size_full().min_h(0).p(10).gap(4).bg(t.background).text_color(t.foreground).text_size(12).font_family('monospace')
      .border_2().border_color(t.accent).track_focus(this.handle)
      .on_mouse_down("left", () => this.handle.focus()).on_key_down((e, cx) => this.press(e, cx))
      .child(h_flex().flex_none().items_center().justify_between()
        .child(div().font_semibold().text_color(t.accent).child("MINESWEEPER"))
        .child(button("minesweeper-back", "Back to arcade", () => this.back())))
      .child(div().p(4).bg(t.chrome).border_2().border_color(t.border).child(`MINES ${MINES - flags}/${MINES} · FLAGS ${flags} · SAFE ${revealed}/71`))
      .child(v_flex().flex_none().gap(0).children(Array.from({ length: SIZE }, (_, y) => h_flex().flex_none().children(Array.from({ length: SIZE }, (_, x) => {
        const index = y * SIZE + x, cell = game.cells[index], showMine = cell.mine && (ended || cell.revealed);
        const graphic = showMine ? sprite('mine', '#ff788e') : cell.flagged ? sprite(ended && !cell.mine ? 'wrong' : 'flag', ended && !cell.mine ? '#ff788e' : t.accent) : cell.revealed && cell.count ? div().id(`minesweeper-number-${cell.count}`).text_color(NUMBER_COLORS[cell.count]).font_semibold().text_size(18).child(String(cell.count)) : div();
        return div().id(`minesweeper-cell-${index}`).w(28).h(28).flex_none().flex().items_center().justify_center()
          .border_2().border_color(game.cursor === index ? t.accent : t.border)
          .bg(cell.revealed ? t.background : game.cursor === index ? t.selected : t.chrome)
          .cursor_pointer().hover(s => s.bg(t.hover))
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.play(index, false, cx); })
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.play(index, true, cx); })
          .child(v_flex().size_full().border_2().border_color(cell.revealed ? t.background : t.dim)
            .child(div().h(cell.revealed ? 0 : 2).bg(t.foreground).flex_none())
            .child(h_flex().flex_1().items_center().justify_center().child(graphic))
            .child(div().h(cell.revealed ? 0 : 2).bg(t.background).flex_none()));
      })))))
      .child(div().text_color(t.accent).font_semibold().child(status))
      .when(this.confirmReset, el => el.child(h_flex().gap(8).items_center()
        .child(div().child("Discard this game?"))
        .child(button("minesweeper-confirm", "Restart", cx => this.restart(cx)))
        .child(button("minesweeper-cancel", "Cancel", cx => { this.confirmReset = false; cx.notify(); }))))
      .when(!this.confirmReset, el => el.child(h_flex().gap(8)
        .child(button("minesweeper-restart", "Restart", cx => { this.confirmReset = true; cx.notify(); }))
        .child(button("minesweeper-close", "Save & close", () => this.dismiss()))))
      .child(div().text_color(t.dim).child("X: wrong flag"));
  }
}
