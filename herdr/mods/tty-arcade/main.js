import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay } from "herdr";

// Deliberately independent of Herdr/TTY colors: this is a tiny arcade cabinet.
const PALETTE = { background: "#10142b", foreground: "#fff1c1", accent: "#57e8ff", border: "#394574", chrome: "#191f3d", hover: "#293960", selected: "#334273", dim: "#9ca9cf" };
const INK = { c: "#57e8ff", p: "#e887ff", y: "#ffe477", r: "#ff628b", w: "#fff1c1", b: "#6479ba", g: "#78efac" };
const GLYPHS = {
  A: ["01110", "11011", "11011", "11111", "11011", "11011", "11011"],
  R: ["11110", "11011", "11011", "11110", "11100", "11010", "11011"],
  C: ["01111", "11000", "11000", "11000", "11000", "11000", "01111"],
  D: ["11110", "11011", "11011", "11011", "11011", "11011", "11110"],
  E: ["11111", "11000", "11000", "11110", "11000", "11000", "11111"],
};
const SPRITES = {
  blocks: ["............", "....cccc....", "....cwwc....", "....cccc....", "ppppyyyy....", "pwwpywwy....", "ppppyyyy....", "....rrrrgggg", "....rwwrgwwg", "....rrrrgggg", "............", "............"],
  mine: [".....ww.....", "..w..bb..w..", "...bbbbbb...", "..bbbbbbbb..", "..bbwbbbbb..", "wbbbbbbbbbbw", "wbbbbbbbbbbw", "..bbbbbbbb..", "..bbbbbbbb..", "...bbbbbb...", "..w..bb..w..", ".....ww....."],
  cards: ["..cccccccc..", "..cpccpccw..", "..ccppcccw..", "wwwwwwwwcw..", "wrrrrrrwcw..", "wrwrrwrwcw..", "wrrrrrrwcw..", "wrrwrrrwcw..", "wrrrrrrwcw..", "wrrrrrrwww..", "wwwwwwww....", "............"],
};
const GAMES = [
  { name: "TETRIS", sprite: "blocks", mod: "tty-tetris", detail: "STACK BLOCKS / CHASE THE HIGH SCORE", width: 620, height: 600 },
  { name: "MINESWEEPER", sprite: "mine", mod: "tty-minesweeper", detail: "TEN MINES / ONE SAFE FIRST MOVE", width: 480, height: 520 },
  { name: "SOLITAIRE", sprite: "cards", mod: "tty-solitaire", detail: "DRAW ONE / BUILD FOUR FOUNDATIONS", width: 900, height: 720 },
];

function pixels(rows, scale, colors = INK) {
  return v_flex().flex_none().gap(0).children(rows.map(row => h_flex().flex_none().gap(0)
    .children([...row].map(pixel => div().w(scale).h(scale).flex_none().when(Boolean(colors[pixel]), el => el.bg(colors[pixel]))))));
}
function marquee() {
  const rows = Array.from({ length: 7 }, (_, y) => [..."ARCADE"].map(letter => GLYPHS[letter][y]).join("0"));
  return pixels(rows, 3, { 1: INK.y });
}

export default class Arcade extends View {
  init(_props, cx) {
    this.selected = 0;
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus());
  }

  launch(index) {
    const game = GAMES[index];
    if (!game) return;
    closeOverlay(props().overlay);
    openOverlay({ mod: game.mod, frame: "none", kind: "dialog", modal: true, width: game.width, height: game.height });
  }

  press(e, cx) {
    if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt || e.is_held) return;
    if (e.key === "escape") closeOverlay(props().overlay);
    else if (["j", "down", "k", "up"].includes(e.key)) {
      this.selected = (this.selected + (["k", "up"].includes(e.key) ? 2 : 1)) % GAMES.length;
    } else if (["enter", "space"].includes(e.key)) this.launch(this.selected);
    else if (/^[1-3]$/.test(e.key)) this.launch(Number(e.key) - 1);
    else return;
    cx.stop_propagation(); cx.notify();
  }

  render(cx) {
    const t = PALETTE;
    return v_flex().id("arcade").size_full().p(8).bg(t.border).font_family("monospace").text_color(t.foreground).text_size(12)
      .border_2().border_color(INK.p).track_focus(this.handle)
      .on_key_down((e, cx) => this.press(e, cx))
      .child(v_flex().size_full().p(10).gap(8).bg(t.background).border_2().border_color(t.accent)
        .child(h_flex().flex_none().h(28).items_center().justify_between()
          .child(marquee())
          .child(div().id("arcade-close").cursor_pointer().px(6).py(4).bg(t.chrome).border_2().border_color(t.border).hover(s => s.bg(t.hover))
            .on_click(() => closeOverlay(props().overlay)).child("ESC [X]")))
        .child(div().text_color(INK.p).text_size(11).child("* SELECT YOUR GAME *   NO COINS REQUIRED"))
        .children(GAMES.map((game, index) => h_flex().id(`arcade-${game.mod}`).h(61).flex_none().px(8).gap(12).items_center().cursor_pointer()
          .border_2().border_color(index === this.selected ? INK.y : t.border)
          .bg(index === this.selected ? t.selected : t.chrome).hover(s => s.bg(t.hover))
          .on_click(() => this.launch(index))
          .child(pixels(SPRITES[game.sprite], 3))
          .child(v_flex().gap(5)
            .child(div().font_semibold().text_color(index === this.selected ? INK.y : t.foreground).child(`${index === this.selected ? ">" : " "} ${index + 1}  ${game.name}`))
            .child(div().text_color(t.dim).text_size(10).child(game.detail)))))
        .child(div().text_color(t.accent).text_size(10).child("J/K OR ARROWS: SELECT   ENTER: PLAY   1-3: START")));
  }
}
