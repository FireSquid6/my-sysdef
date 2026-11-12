import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { commands, keys, run, theme, props, closeOverlay, shared, setShared } from "herdr";
import { paletteRows } from "./model.js";

export default class CommandPalette extends View {
  init(_props, cx) {
    this.query = "";
    this.at = 0;
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Search commands…" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value(); this.at = 0;
      this.scroll.scroll_to_item(0); cx.notify();
    });
    this.input.on("submit", () => this.choose(this.rows()[this.at]));
    this.input.focus();
  }
  rows() { return paletteRows(commands(), keys(), shared("agents.sort"), this.query); }
  close() { closeOverlay(props()?.overlay); }
  choose(row) {
    if (!row) return;
    this.close();
    if (row.sort) setShared("agents.sort", row.sort);
    else if (row.command === "app.settings") run("mod.open", { name: "tty-settings" });
    else run(row.command); // Native commands retain native argument prompts/confirmation.
  }
  navigate(e, cx) {
    if (e.key === "escape") { this.close(); cx.stop_propagation(); return; }
    if (e.key !== "up" && e.key !== "down") return;
    const count = this.rows().length;
    this.at = count ? (this.at + (e.key === "down" ? 1 : count - 1)) % count : 0;
    this.scroll.scroll_to_item(this.at);
    cx.stop_propagation(); cx.notify();
  }
  render() {
    const t = theme(), rows = this.rows();
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    return v_flex().id("command-palette").size_full().min_h(0).p(16).gap(10)
      .bg(t.popover).text_color(t.foreground).text_size(13).border_1().border_color(t.border)
      .track_focus(this.handle).on_key_down((e, cx) => this.navigate(e, cx))
      .child(div().font_semibold().text_size(15).child("Commands"))
      .child(Input.new(this.input).h(36).flex_none().text_size(13))
      .child(v_flex().id("command-results").flex_1().min_h(0).overflow_y_scroll().track_scroll(this.scroll)
        .children(rows.map((row, i) => h_flex().id(`command-${row.id}`).h(42).flex_none().px(10).gap(10).items_center()
          .when(i === this.at, el => el.bg(t.selected)).hover(el => el.bg(t.hover)).cursor_pointer()
          .tooltip(row.detail).on_click(() => this.choose(row))
          .child(div().w(14).text_color(t.accent).child(row.selected ? "✓" : ""))
          .child(div().flex_1().min_w(0).truncate().child(row.title))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(row.shortcut ?? ""))))
        .when(!rows.length, el => el.child(div().p(10).text_color(t.dim).child("No matching commands"))));
  }
}
