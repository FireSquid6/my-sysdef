import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, shared, setShared, closeOverlay, openOverlay, nextCommand } from "herdr";
import { newGame, cells, ghostY, act, tick } from "./engine.js";
import { DEFAULT_BINDINGS, ACTIONS, LABELS, bindings, actionFor, chord, rebind } from "./controls.js";

const PALETTE = { background: '#10142b', foreground: '#fff1c1', accent: '#57e8ff', border: '#394574', chrome: '#191f3d', hover: '#293960', selected: '#334273', dim: '#9ca9cf' };
const COLORS = { I: "#35ddf4", J: "#5576ff", L: "#ff9a3d", O: "#ffe052", S: "#79ef68", Z: "#ff597e", T: "#c87bff" };

// All artwork is made of square GPUI blocks, including the 16px HUD sprites.
// Light top/left edges and dark bottom/right edges form a chunky pixel bevel.
function tile(type, size, ghost = false) {
  const color = type ? COLORS[type] : PALETTE.chrome;
  const frame = v_flex().flex_none().w(size).h(size).p(1).gap(0)
    .bg(PALETTE.background).border_1().border_color(ghost ? PALETTE.accent : PALETTE.border);
  if (!type) return frame.child(div().size_full().bg(ghost ? PALETTE.selected : PALETTE.chrome));
  return frame
    .child(div().flex_none().h(2).bg(PALETTE.foreground))
    .child(h_flex().flex_1().min_h(0).gap(0)
      .child(div().flex_none().w(2).h_full().bg(PALETTE.foreground))
      .child(v_flex().flex_1().min_h(0).p(2).bg(color)
        .child(div().w(3).h(3).bg(PALETTE.foreground)))
      .child(div().flex_none().w(2).h_full().bg(PALETTE.selected)))
    .child(div().flex_none().h(2).bg(PALETTE.background));
}

function arcadeMark() {
  return v_flex().flex_none().gap(1).children(["010", "111", "010"].map(row =>
    h_flex().gap(1).children([...row].map(pixel => div().w(5).h(5).bg(pixel === "1" ? PALETTE.accent : PALETTE.background)))));
}
const clone = value => JSON.parse(JSON.stringify(value));
export function validSave(game) {
  return game?.version === 1 && Array.isArray(game.board) && game.board.length === 40 &&
    game.board.every(row => Array.isArray(row) && row.length === 10 && row.every(cell => !cell || Boolean(COLORS[cell]))) &&
    game.piece && COLORS[game.piece.type] && Number.isFinite(game.piece.x) && Number.isFinite(game.piece.y) &&
    Number.isInteger(game.piece.rotation) && game.piece.rotation >= 0 && game.piece.rotation < 4 &&
    Array.isArray(game.queue) && game.queue.length >= 5 && game.queue.every(p => COLORS[p]) &&
    [game.score, game.lines, game.level, game.startLevel, game.lockElapsed, game.lockResets, game.gravityElapsed].every(n => Number.isFinite(n) && n >= 0) &&
    game.level >= 1 && game.startLevel >= 1 && Number.isFinite(game.combo) &&
    (game.hold === null || Boolean(COLORS[game.hold])) &&
    cells(game.piece).every(p => p.x >= 0 && p.x < 10 && p.y >= 0 && p.y < 40);
}

export default class Tetris extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle(); this.keys = bindings(shared("tetris.settings"));
    this.startLevel = Math.max(1, Math.min(15, Math.floor(Number(shared("tetris.startLevel"))) || 1));
    const saved = shared("tetris.game");
    this.game = validSave(saved) ? clone(saved) : newGame(undefined, this.startLevel);
    if (validSave(saved)) this.game.paused = true;
    this.game.softDropping = false;
    this.pressed = new Map(); this.selected = 0; this.checkpoint = 0; this.closed = false;
    this.best = Number(shared("tetris.best")) || 0;
    this.lastTime = Date.now();
    cx.timer.after(0, () => this.handle.focus());
    this.timer = cx.timer.every(16, cx => this.advance(cx));
    cx.spawn(async cx => { for (;;) this.command(await nextCommand(), cx); });
  }

  command(command, cx) {
    if (command === "focus") this.handle.focus();
    if (command === "cycle" && this.page && !this.capturing) this.selected = (this.selected + 1) % (ACTIONS.length + 1);
    cx.notify();
  }

  changeLevel(delta, cx) {
    this.startLevel = Math.max(1, Math.min(15, this.startLevel + delta));
    setShared("tetris.startLevel", this.startLevel); cx.notify();
  }

  save() {
    const snapshot = clone(this.game); snapshot.paused = true; snapshot.softDropping = false;
    setShared("tetris.game", snapshot);
    if (this.game.score > this.best) { this.best = this.game.score; setShared("tetris.best", this.best); }
  }

  clearKeys() { this.pressed.clear(); this.direction = null; this.game.softDropping = false; }

  // Herdr also invokes this for host-managed Escape dismissal, toggle-close,
  // hot reload, and app quit. Never keep a game timer alive after dismissal.
  close() {
    if (this.closed) return;
    this.closed = true; this.timer?.cancel(); this.clearKeys(); this.game.paused = true; this.save();
  }

  dismiss() { this.close(); closeOverlay(props().overlay); }

  advance(cx) {
    if (this.closed) return;
    const now = Date.now(), elapsed = Math.max(0, Math.min(64, now - this.lastTime)); this.lastTime = now;
    if (!this.handle.is_focused()) {
      if (!this.game.paused) { this.game.paused = true; this.clearKeys(); this.save(); cx.notify(); }
      return;
    }
    if (this.game.paused || this.game.gameOver || this.page || this.confirmReset) return;
    for (const held of this.pressed.values()) {
      if (held.action !== this.direction) continue;
      held.elapsed += elapsed;
      while (held.elapsed >= held.next) { act(this.game, held.action); held.next += 33; }
    }
    tick(this.game, elapsed);
    this.checkpoint += elapsed;
    if (this.checkpoint >= 5000 || this.game.gameOver) { this.checkpoint = 0; this.save(); }
    cx.notify();
  }

  settings(cx) {
    this.game.paused = true; this.clearKeys(); this.page = this.page ? null : "settings";
    this.capturing = false; this.message = ""; this.save(); cx.notify();
  }

  press(e, cx) {
    if (e.key === "escape") { cx.stop_propagation(); this.dismiss(); return; }
    if (e.is_held) { cx.stop_propagation(); return; }
    if (e.key === "f2" && !this.capturing) { this.settings(cx); cx.stop_propagation(); return; }
    if (this.page) {
      const key = e.key;
      if (this.selected === ACTIONS.length && ["h", "l", "enter", "backspace"].includes(key)) {
        this.changeLevel(key === "backspace" ? 1 - this.startLevel : key === "h" ? -1 : 1, cx);
      } else if (this.capturing) {
        const result = rebind(this.keys, ACTIONS[this.selected], chord(e));
        if (result.error) this.message = result.error;
        else { this.keys = result.value; setShared("tetris.settings", this.keys); this.capturing = false; this.message = "Saved."; }
      } else if (["j", "k", "h", "l"].includes(key) || (key === "tab" && e.modifiers.control && !e.modifiers.shift)) {
        const delta = key === "k" || key === "h" ? -1 : 1;
        this.selected = (this.selected + delta + ACTIONS.length + 1) % (ACTIONS.length + 1);
      } else if (key === "enter") { this.capturing = true; this.message = "Press the new key or chord. Escape closes and pauses."; }
      else if (key === "backspace") {
        const defaults = { ...this.keys, [ACTIONS[this.selected]]: DEFAULT_BINDINGS[ACTIONS[this.selected]] };
        // Restoring one row may collide with another custom row: validate before saving.
        if (JSON.stringify(bindings(defaults)) !== JSON.stringify(defaults)) this.message = "Default conflicts with another binding; use d to restore all defaults.";
        else { this.keys = defaults; setShared("tetris.settings", this.keys); this.message = "Default restored."; }
      } else if (key === "d") { this.keys = bindings(); setShared("tetris.settings", this.keys); this.changeLevel(1 - this.startLevel, cx); this.message = "All defaults restored."; }
      else if (key === "q") this.settings(cx);
      cx.stop_propagation(); cx.notify(); return;
    }
    if (this.confirmReset) {
      if (e.key === "y") { this.game = newGame(undefined, this.startLevel); this.confirmReset = false; this.clearKeys(); this.save(); }
      else if (e.key === "n") { this.confirmReset = false; }
      cx.stop_propagation(); cx.notify(); return;
    }
    const action = actionFor(e, this.keys);
    if (!action) return;
    cx.stop_propagation();
    if (action === "settings") this.settings(cx);
    else if (action === "pause") { this.game.paused = !this.game.paused; this.clearKeys(); this.save(); }
    else if (action === "restart") { this.game.paused = true; this.clearKeys(); this.confirmReset = true; }
    else if (!this.game.paused && !this.game.gameOver) {
      const key = chord(e);
      if (!this.pressed.has(key)) {
        this.pressed.set(key, { action, elapsed: 0, next: 167 });
        if (action === "left" || action === "right") this.direction = action;
        act(this.game, action);
        if (action === "softDrop") this.game.softDropping = true;
      }
    }
    cx.notify();
  }

  release(e) {
    // Releasing modifiers before a key must not leave a shift stuck down.
    for (const [key] of this.pressed) if (key.split("-").at(-1) === String(e.key).toLowerCase()) this.pressed.delete(key);
    this.game.softDropping = [...this.pressed.values()].some(p => p.action === "softDrop");
    this.direction = [...this.pressed.values()].filter(p => p.action === "left" || p.action === "right").at(-1)?.action ?? null;
  }

  preview(type) {
    const points = type ? cells({ type, x: 0, y: 0, rotation: 0 }) : [];
    return v_flex().flex_none().gap(0).p(3).bg(PALETTE.background).border_1().border_color(PALETTE.border)
      .children(Array.from({ length: 2 }, (_, y) => h_flex().gap(0).children(Array.from({ length: 4 }, (_, x) =>
        tile(points.some(p => p.x === x && p.y === y) ? type : null, 16)))));
  }

  render(cx) {
    const t = PALETTE, game = this.game;
    const clear = game.lastClear;
    const clearText = clear && clear.points ? [clear.perfectClear && "Perfect clear", clear.backToBack && "Back-to-back", clear.spin && `T-spin${clear.spin === "mini" ? " mini" : ""}`, clear.lines && `${clear.lines} line${clear.lines === 1 ? "" : "s"}`, clear.combo > 0 && `Combo ${clear.combo}`, `+${clear.points}`].filter(Boolean).join(" · ") : "";
    const label = action => this.keys[action].join(" / ");
    const button = (id, text, fn) => div().id(id).px(8).py(4).rounded_none().bg(t.chrome).cursor_pointer().border_1().border_color(t.border).hover(s => s.bg(t.hover)).on_click((_e, cx) => { this.handle.focus(); fn(cx); }).child(text);
    const active = new Map(), ghost = new Set();
    if (game.piece && !game.gameOver) {
      for (const p of cells(game.piece)) active.set(`${p.x}:${p.y}`, game.piece.type);
      for (const p of cells({ ...game.piece, y: ghostY(game) })) ghost.add(`${p.x}:${p.y}`);
    }
    return v_flex().id("tetris").size_full().min_h(0).p(12).gap(8).rounded_none().font_family("monospace").bg(t.background).text_color(t.foreground).text_size(12)
      .border_1().border_color(t.accent).track_focus(this.handle)
      .on_mouse_down("left", () => this.handle.focus())
      .on_key_down((e, cx) => this.press(e, cx)).on_key_up(e => this.release(e))
      .child(h_flex().flex_none().items_center().justify_between()
        .child(h_flex().gap(8).items_center().child(arcadeMark())
          .child(div().font_semibold().text_color(t.accent).child("TETRIS / ARCADE")))
        .child(h_flex().gap(8)
          .child(button("tetris-arcade", "Arcade", () => {
            this.dismiss();
            openOverlay({ mod: "tty-arcade", frame: "none", kind: "dialog", modal: true, width: 480, height: 340 });
          }))
          .child(button("tetris-close", "Esc · pause & close", () => this.dismiss()))))
      .when(Boolean(this.page), el => el.child(v_flex().flex_1().min_h(0).gap(5)
        .child(div().font_semibold().child("Settings · keybindings"))
        .child(div().text_color(t.dim).child("j/k or Ctrl+Tab: select · Enter: rebind · Backspace: default · d: reset all · q/F2: back"))
        .children(ACTIONS.map((action, i) => h_flex().id(`tetris-binding-${action}`).flex_none().h(30).px(8).items_center().justify_between().cursor_pointer()
          .bg(i === this.selected ? t.selected : t.background).on_click((_e, cx) => { this.selected = i; this.capturing = true; this.message = "Press a new key or chord."; cx.notify(); })
          .child(div().child(LABELS[action])).child(div().text_color(t.accent).child(i === this.selected && this.capturing ? "Press key…" : label(action)))))
        .child(h_flex().id("tetris-level").flex_none().h(30).px(8).items_center().justify_between().cursor_pointer()
          .bg(this.selected === ACTIONS.length ? t.selected : t.background)
          .on_click((_e, cx) => { this.selected = ACTIONS.length; this.capturing = false; this.changeLevel(this.startLevel === 15 ? -14 : 1, cx); })
          .child(div().child("Starting level · next game (h/l)"))
          .child(div().text_color(t.accent).child(String(this.startLevel))))
        .child(div().text_color(t.dim).child("Changes save automatically. F2 always opens settings; Escape always closes. Closing keeps the game paused."))
        .child(div().text_color(t.accent).child(this.message || ""))))
      .when(!this.page, el => el.child(h_flex().flex_1().min_h(0).gap(16).justify_center()
        .child(v_flex().w(132).gap(8).p(6).bg(t.chrome).border_1().border_color(t.border).flex_none()
          .child(div().text_color(t.dim).child("HOLD"))
          .child(this.preview(game.hold))
          .child(div().child(`${label("hold")} · hold / swap`))
          .child(div().text_color(t.dim).child("SCORE"))
          .child(div().text_size(22).text_color(t.accent).child(String(game.score)))
          .child(div().child(`Best ${Math.max(this.best, game.score)}`))
          .child(div().child(`Level ${game.level} · ${game.lines} lines`))
          .child(div().text_color(t.dim).child(clearText))
          .child(button("tetris-pause", `${label("pause")} · pause`, cx => { game.paused = !game.paused; this.clearKeys(); this.save(); cx.notify(); }))
          .child(button("tetris-settings", "F2 · settings", cx => this.settings(cx))))
        .child(v_flex().flex_none().gap(0).p(3).bg(t.selected).border_1().border_color(t.accent).children(Array.from({ length: 20 }, (_, y) => h_flex().flex_none().gap(0).children(Array.from({ length: 10 }, (_, x) => {
          const key = `${x}:${y + 20}`, type = active.get(key) || game.board[y + 20][x];
          return tile(type, 20, ghost.has(key) && !type);
        })))))
        .child(v_flex().w(96).flex_none().gap(8).p(6).bg(t.chrome).border_1().border_color(t.border)
          .child(div().text_color(t.dim).child("NEXT"))
          .children(game.queue.slice(0, 5).map(type => this.preview(type)))
          .child(div().text_color(t.dim).child("7-bag · SRS\n500ms lock\n15 resets")))))
      .when(!this.page, el => el.child(v_flex().flex_none().gap(4)
        .child(div().text_color(t.accent).font_semibold().child(this.confirmReset ? "Start a new game? y: yes · n: cancel (stays paused)" : game.gameOver ? `GAME OVER · ${label("restart")}: new game` : game.paused ? `PAUSED · ${label("pause")}: resume` : "Marathon · 10 lines per level"))
        .child(div().text_color(t.dim).child(`${label("left")} ← · ${label("right")} → · ${label("softDrop")} ↓ · ${label("rotateCW")} ↻ · ${label("rotateCCW")} ↺`))
        .child(div().text_color(t.dim).child(`${label("hardDrop")}: hard drop · ${label("hold")}: hold · ${label("restart")}: restart · ${label("settings")} / F2: settings`))));
  }
}
