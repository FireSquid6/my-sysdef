import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared, setShared, props, closeOverlay, openOverlay } from "herdr";
import { newGame, draw, move, won, validSave, red } from "./engine.js";

const clone = value => JSON.parse(JSON.stringify(value));
const PALETTE = { background:'#10142b', foreground:'#fff1c1', accent:'#57e8ff', border:'#394574', chrome:'#191f3d', hover:'#293960', selected:'#334273', dim:'#9ca9cf' };
const SUIT_PIXELS = {
  hearts: ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000', '0000000'],
  diamonds: ['0001000', '0011100', '0111110', '1111111', '0111110', '0011100', '0001000'],
  clubs: ['0011100', '0011100', '1101011', '1111111', '1101011', '0001000', '0011100'],
  spades: ['0001000', '0011100', '0111110', '1111111', '1111111', '0101010', '0011100'],
};
const BACK_PIXELS = ['101010101010101', '010101010101010', '101010101010101', '010101010101010', '101010101010101'];
const rankLabel = card => String(({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[card.rank] || card.rank);
function pixels(id, pattern, color, scale = 2, background = null) {
  return v_flex().id(id).flex_none().children(pattern.map(row => h_flex().flex_none().children([...row].map(bit =>
    div().w(scale).h(scale).flex_none().when(bit === '1' || Boolean(background), el => el.bg(bit === '1' ? color : background))))));
}
const samePile = (a, b) => a && b && a.area === b.area && a.index === b.index;
export default class Solitaire extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    const saved = shared("solitaire.game");
    this.game = validSave(saved) ? clone(saved) : newGame();
    this.cursor = { area: "stock", index: 0 }; this.selected = null; this.closed = false;
    this.message = "Select a face-up card, then its destination.";
    cx.timer.after(0, () => this.handle.focus());
  }
  save() { setShared("solitaire.game", clone(this.game)); }
  close() { if (!this.closed) { this.save(); this.closed = true; } }
  dismiss() { this.close(); closeOverlay(props().overlay); }
  arcade() {
    this.dismiss();
    openOverlay({ mod: "tty-arcade", frame: "none", kind: "dialog", modal: true, width: 480, height: 340 });
  }
  topLocations() {
    return [{ area: "stock", index: 0 }, { area: "waste", index: 0 }, ...Array.from({ length: 4 }, (_, index) => ({ area: "foundations", index }))];
  }
  normalize(location) {
    if (location.area !== "tableau") return { ...location };
    const pile = this.game.tableau[location.index], first = pile.findIndex(c => c.faceUp);
    return { ...location, card: Math.max(first, Math.min(location.card ?? pile.length - 1, pile.length - 1)) };
  }
  navigate(key) {
    const c = this.cursor, top = this.topLocations();
    const horizontal = ["h", "l", "left", "right"].includes(key);
    const delta = ["h", "k", "left", "up"].includes(key) ? -1 : 1;
    if (horizontal) {
      if (c.area === "tableau") this.cursor = this.normalize({ area: "tableau", index: (c.index + delta + 7) % 7 });
      else this.cursor = top[(top.findIndex(p => samePile(p, c)) + delta + 6) % 6];
    } else if (c.area === "tableau") {
      const pile = this.game.tableau[c.index], first = pile.findIndex(card => card.faceUp);
      if (delta < 0 && (c.card <= first || !pile.length)) this.cursor = top[c.index < 2 ? c.index : Math.max(2, c.index - 1)];
      else this.cursor = this.normalize({ ...c, card: (c.card ?? pile.length - 1) + delta });
    } else {
      const i = top.findIndex(p => samePile(p, c));
      this.cursor = this.normalize({ area: "tableau", index: i < 2 ? i : i + 1, card: delta > 0 ? 0 : undefined });
    }
  }
  takeDraw(cx) {
    if (this.confirmReset || this.closed) return;
    this.selected = null;
    this.message = draw(this.game) ? "Draw one · empty stock recycles the waste." : "No cards to draw.";
    this.save(); cx.notify();
  }
  activate(location, cx) {
    if (this.confirmReset || this.closed) return;
    this.handle.focus();
    if (location.area === "tableau" && location.card >= 0 && !this.game.tableau[location.index][location.card]?.faceUp) return;
    this.cursor = this.normalize(location);
    if (location.area === "stock") { this.takeDraw(cx); return; }
    if (this.selected) {
      if (samePile(this.selected, this.cursor) && (this.cursor.area !== "tableau" || this.selected.card === this.cursor.card)) {
        this.selected = null; this.message = "Selection cleared.";
      } else if (move(this.game, this.selected, this.cursor)) {
        this.selected = null; this.cursor = this.normalize(this.cursor); this.save();
        this.message = "Moved.";
      } else this.message = "Illegal move. Choose another destination, or select the source again to cancel.";
    } else {
      const pile = location.area === "waste" ? this.game.waste : this.game[location.area][location.index];
      const card = location.area === "tableau" ? this.cursor.card : pile.length - 1;
      if (pile[card]?.faceUp) { this.selected = { ...this.cursor, card }; this.message = "Selected · choose a destination."; }
      else this.message = "Choose a face-up card.";
    }
    cx.notify();
  }
  press(e, cx) {
    const key = e.key.toLowerCase();
    if (key === "escape") { cx.stop_propagation(); this.dismiss(); return; }
    if (this.closed) return;
    if (e.modifiers?.control || e.modifiers?.platform || e.modifiers?.alt) return;
    if (this.confirmReset) {
      if (key === "y") {
        this.game = newGame(); this.selected = null; this.cursor = { area: "stock", index: 0 };
        this.confirmReset = false; this.message = "New game."; this.save();
      } else if (key === "n") this.confirmReset = false;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (!["h", "j", "k", "l", "left", "right", "up", "down", "enter", "space", " ", "d", "r"].includes(key)) return;
    cx.stop_propagation();
    if (e.is_held && ["enter", "space", " ", "d", "r"].includes(key)) return;
    if (key === "r") this.confirmReset = true;
    else if (key === "d") this.takeDraw(cx);
    else if (["enter", "space", " "].includes(key)) this.activate(this.cursor, cx);
    else this.navigate(key);
    cx.notify();
  }
  render(cx) {
    const t = PALETTE, game = this.game;
    const button = (id, text, fn) => div().id(id).px(8).py(4).bg(t.chrome).border_2().border_color(t.border).cursor_pointer()
      .hover(s => s.bg(t.hover)).on_click((_e, cx) => { this.handle.focus(); fn(cx); }).child(text);
    const tile = (location, card, text, height = 52) => {
      const focused = samePile(this.cursor, location) && (location.area !== "tableau" || this.cursor.card === location.card);
      const selected = samePile(this.selected, location) && (location.area !== "tableau" || location.card >= this.selected.card);
      const faceUp = card?.faceUp, ink = faceUp && red(card) ? '#c32f50' : '#191f3d';
      const back = (card && !faceUp) || (location.area === 'stock' && game.stock.length);
      const compact = height === 20;
      const content = h_flex().size_full().items_center().gap(4)
        .when(Boolean(selected || focused), el => el.child(div().w(3).h(compact ? 12 : 32).flex_none().bg(selected ? '#ffbd69' : t.accent)));
      if (faceUp) {
        content.child(div().font_semibold().text_size(compact ? 12 : 18).child(rankLabel(card)))
          .child(pixels(`solitaire-suit-${card.suit}`, SUIT_PIXELS[card.suit], ink, compact ? 1 : 3));
      } else if (back) {
        content.child(pixels('solitaire-card-back', BACK_PIXELS, t.accent, compact ? 2 : 4, t.selected));
      } else content.child(div().text_size(10).child(text));
      return div().id(`solitaire-${location.area}-${location.index}-${location.card ?? "top"}`).h(height).w(90).flex_none().px(4)
        .border_2().border_color(selected ? '#ffbd69' : focused ? t.accent : t.border)
        .bg(faceUp ? t.foreground : selected ? t.selected : t.chrome)
        .text_color(faceUp ? ink : t.dim).cursor_pointer()
        .on_click((_e, cx) => this.activate(location, cx)).child(content);
    };
    return v_flex().id("solitaire").size_full().p(14).gap(10).bg(t.background).text_color(t.foreground).text_size(12).font_family('monospace')
      .border_2().border_color(t.accent).track_focus(this.handle).on_mouse_down("left", () => this.handle.focus())
      .on_key_down((e, cx) => this.press(e, cx))
      .child(h_flex().flex_none().justify_between().items_center()
        .child(div().font_semibold().text_color(t.accent).child("SOLITAIRE · draw one"))
        .child(button("solitaire-arcade", "Arcade", () => this.arcade()))
        .child(button("solitaire-restart", "r · restart", cx => { this.confirmReset = true; cx.notify(); }))
        .child(button("solitaire-close", "Esc · save & close", () => this.dismiss())))
      .child(h_flex().flex_none().gap(10)
        .child(v_flex().gap(4).child(div().child(`Stock · ${game.stock.length}`)).child(tile({ area: "stock", index: 0 }, null, game.stock.length ? "Draw" : "Recycle")))
        .child(v_flex().gap(4).child(div().child(`Waste · ${game.waste.length}`)).child(tile({ area: "waste", index: 0 }, game.waste.at(-1), game.waste.length ? rankLabel(game.waste.at(-1)) : "Empty")))
        .child(div().w(90).flex_none())
        .children(game.foundations.map((pile, index) => v_flex().gap(4).child(div().child(`Foundation ${index + 1}`))
          .child(tile({ area: "foundations", index }, pile.at(-1), pile.length ? rankLabel(pile.at(-1)) : "Ace → King")))))
      .child(h_flex().flex_1().min_h(0).gap(10).items_start().children(game.tableau.map((pile, index) => v_flex().w(90).gap(2)
        .child(div().text_color(t.dim).child(`Tableau ${index + 1}`))
        .children(pile.length ? pile.map((card, i) => tile({ area: "tableau", index, card: i }, card, card.faceUp ? rankLabel(card) : "", i === pile.length - 1 ? 64 : 20)) :
          [tile({ area: "tableau", index, card: -1 }, null, "King only")]))))
      .child(v_flex().flex_none().gap(5)
        .child(div().font_semibold().text_color(t.accent).child(this.confirmReset ? "Restart? y: new deal · n: keep game" : won(game) ? "YOU WIN! · r: new game" : this.message))
        .when(Boolean(this.confirmReset), el => el.child(h_flex().gap(8)
          .child(button("solitaire-confirm", "Yes · new deal", cx => this.press({ key: "y" }, cx)))
          .child(button("solitaire-cancel", "No · keep game", cx => this.press({ key: "n" }, cx)))))
        .child(div().text_color(t.dim).child(`${game.moves} moves · h/l or ←/→: pile · j/k or ↓/↑: card / row · Enter/Space: select / move`))
        .child(div().text_color(t.dim).child("d: draw / recycle · click any face-up card to select its stack · same source cancels · r: restart · Esc: save & close")));
  }
}
