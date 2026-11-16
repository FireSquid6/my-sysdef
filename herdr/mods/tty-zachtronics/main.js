import { reportContext } from "./help-context.js";
import { View, div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { shared, setShared, props, closeOverlay, openOverlay } from "herdr";
import { GAMES } from "./registry.js";
import { Session } from "./session.js";
import { P, pixels, cardIcon, faceColor, shortLabel } from "./art.js";

export default class Zachtronics extends View {
  init(_props, cx) {
    reportContext(this, "tty-zachtronics", cx);
    this.handle = cx.focus_handle(); this.scroll = ScrollHandle.new();
    this.menuIndex = 0; this.actionIndex = 0; this.closed = false;
    this.message = "Choose a game. Each keeps its own deal.";
    cx.timer.after(0, () => { if (!this.closed) this.handle.focus(); });
  }
  save() { if (this.session) setShared(`zachtronics.${this.game.id}`, this.session.serialize()); }
  close() { if (!this.closed) { this.save(); this.closed = true; } }
  dismiss() { this.close(); closeOverlay(props().overlay); }
  arcade() {
    this.dismiss();
    openOverlay({ mod: "tty-arcade", frame: "none", kind: "dialog", modal: true, width: 480, height: 340 });
  }
  choose(index, cx) {
    if (this.closed || !GAMES[index]) return;
    this.save(); this.game = GAMES[index]; this.menuIndex = index;
    const data = shared(`zachtronics.${this.game.id}`);
    this.session = Session.restore(this.game.id, this.game.engine, data);
    this.message = this.session ? "Saved deal restored." : data ? "Invalid or incompatible save rejected; started a new deal." : "Select a card, then a highlighted destination — or choose a legal move.";
    if (!this.session) {
      try { this.session = new Session(this.game.id, this.game.engine, this.seed()); }
      catch (error) { this.message = String(error); this.clear(); cx.notify(); return; }
    }
    this.clear(); this.save(); cx.notify();
  }
  seed() {
    const seed = Date.now() % 2147483647;
    return seed === this.session?.seed ? (seed + 1) % 2147483647 : seed;
  }
  clear() { this.selected = null; this.actionIndex = 0; this.confirm = null; this.pendingDifficulty = null; this.showRules = false; }
  actions() {
    if (!this.session) return [];
    const actions = this.game.engine.legalActions(this.session.state);
    return this.selected ? actions.filter(a =>
      (a.type === "pair" && a.to === this.selected.zone) ||
      (a.from === this.selected.zone && (a.index === undefined || this.selected.index === undefined || a.index === this.selected.index))) : actions;
  }
  isDestination(action, zone) {
    return action.to === zone || (action.type === "pair" && action.from === zone && action.to === this.selected?.zone);
  }
  execute(action, cx, revision = this.session?.revision, expectedSession = this.session) {
    if (!action || this.closed || this.confirm) return;
    if (expectedSession !== this.session) { this.message = "STALE_DEAL"; cx.notify(); return; }
    const result = this.session.apply(action, revision);
    this.message = result.error || action.label;
    if (!result.error) { this.selected = null; this.actionIndex = 0; this.save(); }
    cx.notify();
  }
  select(zone, index, cx) {
    if (this.closed || this.confirm) return;
    this.handle.focus();
    if (this.selected?.zone === zone && this.selected.index === index) this.selected = null;
    else {
      const destinations = this.selected ? this.actions().filter(a => this.isDestination(a, zone)) : [];
      if (destinations.length === 1) { this.execute(destinations[0], cx); return; }
      this.selected = { zone, index };
    }
    this.actionIndex = 0; this.showRules = false; cx.notify();
  }
  history(direction, cx) {
    if (this.closed || this.confirm) return;
    const changed = direction === "undo" ? this.session.undo() : this.session.redo();
    this.message = changed ? direction === "undo" ? "Undone (including automatic consequences)." : "Redone." : `Nothing to ${direction}.`;
    this.selected = null; this.actionIndex = 0; this.save(); cx.notify();
  }
  difficulty(cx) {
    if (this.closed || this.game?.id !== "kabufuda") return;
    const choices = ["Easy", "Normal", "Hard", "Expert"];
    this.pendingDifficulty = choices[(choices.indexOf(this.session.state.difficulty) + 1) % choices.length];
    this.confirm = "difficulty"; cx.notify();
  }
  reset(cx) {
    if (this.confirm !== "restart") {
      const profile = this.game.id === "kabufuda" ? { difficulty: this.pendingDifficulty || this.session.state.difficulty } : {};
      try { this.session = new Session(this.game.id, this.game.engine, this.seed(), profile); }
      catch (error) { this.message = String(error); this.confirm = null; cx.notify(); return; }
    } else this.session.restart();
    this.clear(); this.message = "Deal ready."; this.save(); cx.notify();
  }
  press(e, cx) {
    if (this.closed || e.modifiers?.control || e.modifiers?.platform || e.modifiers?.alt) return;
    const key = e.key.toLowerCase();
    if (!["escape", "j", "k", "down", "up", "enter", "space", " ", "u", "y", "r", "n", "b", "backspace", "?", "f1", "d", "1", "2", "3", "4", "5", "6", "7", "8"].includes(key)) return;
    cx.stop_propagation();
    if (e.is_held && !["j", "k", "down", "up"].includes(key)) return;
    if (this.confirm) {
      if (key === "y") this.reset(cx);
      else if (["n", "escape"].includes(key)) { this.confirm = null; this.pendingDifficulty = null; cx.notify(); }
      return;
    }
    if (key === "escape") { this.dismiss(); return; }
    if (!this.session) {
      if (/^[1-8]$/.test(key)) this.choose(Number(key) - 1, cx);
      else if (["enter", "space", " "].includes(key)) this.choose(this.menuIndex, cx);
      else if (["j", "k", "down", "up"].includes(key)) this.menuIndex = (this.menuIndex + (["k", "up"].includes(key) ? 7 : 1)) % 8;
    } else if (["j", "k", "down", "up"].includes(key)) {
      const count = this.actions().length;
      this.actionIndex = count ? (this.actionIndex + (["k", "up"].includes(key) ? count - 1 : 1)) % count : 0;
      this.showRules = false; this.scroll.scroll_to_item(this.actionIndex);
    } else if (["enter", "space", " "].includes(key)) this.execute(this.actions()[this.actionIndex], cx);
    else if (key === "u" || key === "y") this.history(key === "u" ? "undo" : "redo", cx);
    else if (key === "r" || key === "n") { this.pendingDifficulty = null; this.confirm = key === "r" ? "restart" : "new"; }
    else if (key === "d") this.difficulty(cx);
    else if (key === "b") { this.save(); this.session = null; this.clear(); }
    else if (key === "backspace") { this.selected = null; this.actionIndex = 0; }
    else if (["?", "f1"].includes(key)) this.showRules = !this.showRules;
    cx.notify();
  }
  button(id, label, fn, active = false) {
    return div().id(`zach-${id}`).px(8).py(5).flex_none().bg(active ? P.selected : P.chrome)
      .border_2().border_color(active ? P.yellow : P.border).cursor_pointer().hover(s => s.bg(P.hover))
      .on_click((_e, cx) => { this.handle.focus(); if (!this.closed) fn(cx); }).child(label);
  }
  card(zone, card, index, compact, fallback) {
    const selected = this.selected?.zone === zone.id && (this.selected.index === undefined || this.selected.index === index);
    return div().id(`zach-card-${zone.id}-${card.id}`).w(70).h(compact ? 24 : 54).flex_none().px(4)
      .bg(card.hidden ? P.selected : P.foreground).border_2().border_color(selected ? P.yellow : P.border)
      .text_color(card.hidden ? P.accent : "#191f3d").cursor_pointer()
      .on_click((_e, cx) => this.select(zone.id, index, cx))
      .child(h_flex().items_center().gap(4)
        .child(pixels(cardIcon(card, fallback), faceColor(card), compact ? 1 : 2))
        .child(div().text_size(compact ? 10 : 11).child(shortLabel(card))));
  }
  zone(zone, actions, summary = false) {
    const selected = this.selected?.zone === zone.id, destination = this.selected && actions.some(a => this.isDestination(a, zone.id));
    return v_flex().id(`zach-zone-${zone.id}`).w(82).flex_none().p(3).gap(2).border_2()
      .border_color(selected ? P.yellow : destination ? P.green : P.border).bg(P.chrome)
      .child(div().truncate().text_size(9).text_color(destination ? P.green : P.dim).child(`${zone.label} · ${zone.cards.length}`))
      .children(zone.cards.length ? (summary ? [this.card(zone, zone.cards[zone.cards.length - 1], zone.cards.length - 1, false, this.game.icon)] :
        zone.cards.map((card, i) => this.card(zone, card, i, i !== zone.cards.length - 1, this.game.icon))) :
        [this.button(`empty-${zone.id}`, "Empty", cx => this.select(zone.id, undefined, cx))]);
  }
  garden(zones, actions) {
    const minQ = Math.min(...zones.map(z => z.q + z.r / 2)), minR = Math.min(...zones.map(z => z.r));
    return div().id("zach-garden").relative().w(680).h(510).flex_none().children(zones.map(zone => {
      const selected = this.selected?.zone === zone.id, destination = this.selected && actions.some(a => this.isDestination(a, zone.id));
      const card = zone.cards[0];
      return div().id(`zach-hex-${zone.id}`).absolute().left(8 + (zone.q + zone.r / 2 - minQ) * 55).top(8 + (zone.r - minR) * 46)
        .w(52).h(43).border_2().border_color(selected ? P.yellow : destination ? P.green : P.border)
        .bg(card ? P.foreground : P.chrome).cursor_pointer().on_click((_e, cx) => this.select(zone.id, 0, cx))
        .when(Boolean(card), el => el.child(v_flex().items_center().gap(1)
          .child(pixels(cardIcon(card, "sun"), faceColor(card), 2))
          .child(div().text_size(9).text_color("#191f3d").child(shortLabel(card)))));
    }));
  }
  render(cx) {
    const root = v_flex().id("zachtronics").size_full().p(12).gap(8).bg(P.background).text_color(P.foreground)
      .font_family("monospace").text_size(12).border_2().border_color(P.accent).track_focus(this.handle)
      .on_mouse_down("left", () => this.handle.focus()).on_key_down((e, cx) => this.press(e, cx));
    root.child(h_flex().flex_none().items_center().justify_between()
      .child(h_flex().gap(8).items_center().child(pixels(this.game?.icon || "dragon", P.yellow, 3))
        .child(div().font_semibold().text_color(P.accent).child(this.session ? this.game.engine.title : "SOLITAIRE COLLECTION")))
      .child(this.button("arcade", "Arcade", () => this.arcade()))
      .child(this.button("close", "Save & close", () => this.dismiss())));
    if (!this.session) return root.child(v_flex().id("zach-menu").flex_1().min_h(0).gap(6).overflow_y_scrollbar()
      .children(GAMES.map((game, index) => this.button(`game-${game.id}`, "", cx => this.choose(index, cx), this.menuIndex === index)
        .child(h_flex().gap(14).items_center().child(pixels(game.icon, P.pink, 3))
          .child(v_flex().gap(3).child(div().font_semibold().child(`${index + 1}  ${game.engine.title}`))
            .child(div().text_color(P.dim).text_size(10).child(game.detail)))))))
      .child(div().text_color(P.dim).child(this.message))
      .child(div().text_color(P.dim).child("Original pixel artwork · Rules reconstructions · Per-game fidelity notes inside"));
    const engine = this.game.engine, state = this.session.state, model = engine.view(state), actions = this.actions();
    const session = this.session, revision = session.revision, status = engine.status(state);
    root.child(h_flex().flex_none().gap(6)
      .child(this.button("games", "Games", () => { this.save(); this.session = null; this.clear(); cx.notify(); }))
      .child(this.button("undo", "Undo", cx => this.history("undo", cx)))
      .child(this.button("redo", "Redo", cx => this.history("redo", cx)))
      .child(this.button("restart", "Restart deal", cx => { this.pendingDifficulty = null; this.confirm = "restart"; cx.notify(); }))
      .child(this.button("new", "New deal", cx => { this.pendingDifficulty = null; this.confirm = "new"; cx.notify(); }))
      .child(this.button("rules", "Rules & fidelity", cx => { this.showRules = !this.showRules; cx.notify(); }, this.showRules))
      .when(this.game.id === "kabufuda", el => el.child(this.button("difficulty", state.difficulty, cx => this.difficulty(cx)))));
    if (this.confirm) root.child(h_flex().flex_none().gap(8).items_center()
      .child(div().text_color(P.yellow).child(this.confirm === "restart" ? "Restart the EXACT original deal?" : `Discard progress and deal ${this.pendingDifficulty || "a new game"}?`))
      .child(this.button("confirm", "Yes", cx => this.reset(cx)))
      .child(this.button("cancel", "Cancel", cx => { this.confirm = null; this.pendingDifficulty = null; cx.notify(); })));
    root.child(h_flex().flex_1().min_h(0).gap(8)
      .child(v_flex().id("zach-board-scroll").flex_1().min_w(0).min_h(0).overflow_scrollbar()
        .child(model.zones.every(z => Number.isFinite(z.q) && Number.isFinite(z.r)) ? this.garden(model.zones, actions) :
          v_flex().gap(8)
            .child(h_flex().items_start().gap(5).children(model.zones.filter(z => !/^t\d+$/.test(z.id)).map(zone => this.zone(zone, actions, true))))
            .child(h_flex().items_start().gap(5).children(model.zones.filter(z => /^t\d+$/.test(z.id)).map(zone => this.zone(zone, actions))))))
      .child(v_flex().w(268).flex_none().gap(5)
        .child(div().font_semibold().text_color(P.yellow).child(this.showRules ? "RULES & IMPLEMENTATION POLICIES" : `LEGAL MOVES · ${actions.length}`))
        .when(Boolean(this.selected) && !this.showRules, el => el.child(this.button("clear", "Show all moves", cx => { this.selected = null; this.actionIndex = 0; cx.notify(); })))
        .child(this.showRules ? v_flex().id("zach-rules-scroll").flex_1().min_h(0).overflow_y_scrollbar().gap(10)
          .children([...engine.rules, "FIDELITY / DEAL GENERATION", ...engine.policies].map(text => div().child(text))) :
          v_flex().id("zach-actions-scroll").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).gap(4)
            .children(actions.map((action, index) => this.button(`action-${index}`, action.label, cx => this.execute(action, cx, revision, session), index === this.actionIndex)))
            .when(actions.length === 0, el => el.child(div().text_color(P.dim).child(this.selected ? "No moves for this card. Clear selection to see special actions." : "No legal actions. You can undo or restart; this is not a proof the deal was unsolvable."))))));
    return root.child(v_flex().flex_none().gap(3)
      .child(div().text_color(status === "won" ? P.green : P.accent).child(`${status.toUpperCase()} · ${model.message || this.message}`))
      .child(div().text_color(P.dim).text_size(10).child(`Seed ${this.session.seed} · Move ${this.session.cursor} · ${this.message}`)));
  }
}
