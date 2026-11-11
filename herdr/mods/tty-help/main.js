import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { props, closeOverlay, theme, nextCommand, shared, setShared } from "herdr";
import { TABS, rowsFor } from "./catalogue.js";
import { origin } from "./context.js";

export default class Help extends View {
  init(_props, cx) {
    this.tab = Math.max(0, TABS.findIndex(t => t[0] === (props()?.context || origin())));
    if (props()?.overlay) setShared("help.overlay", props().overlay);
    this.filter = ""; this.scroll = ScrollHandle.new(); this.tabsScroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Filter this tab…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    cx.timer.after(0, () => this.input.focus());
    cx.spawn(async cx => { for (;;) {
      const command = await nextCommand();
      if (command === "prev" || command === "next") this.select(this.tab + (command === "next" ? 1 : -1), cx);
      else if (command === "close") closeOverlay(props().overlay);
    } });
  }
  close() { if (shared("help.overlay") === props().overlay) setShared("help.overlay", null); }
  select(index, cx) { this.tab = (index + TABS.length) % TABS.length; this.scroll.scroll_to_item(0); this.tabsScroll.scroll_to_item(this.tab); cx.notify(); }
  render(cx) {
    const t = theme(), query = this.filter.toLowerCase();
    const rows = rowsFor(TABS[this.tab][0]).filter(row => row.join(" ").toLowerCase().includes(query));
    return v_flex().id("help").track_focus(this.handle).size_full().min_h(0).p(18).gap(12)
      .bg(t.popover).border_1().border_color(t.border).text_color(t.foreground).text_size(12)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { cx.stop_propagation(); closeOverlay(props().overlay); }
        else if (e.key === "[" || e.key === "]") { cx.stop_propagation(); this.select(this.tab + (e.key === "]" ? 1 : -1), cx); }
      })
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(16).font_semibold().child("Keyboard help"))
        .child(div().id("help-close").cursor_pointer().on_click(() => closeOverlay(props().overlay)).child("Close")))
      .child(h_flex().id("help-tabs").flex_none().h(38).gap(6).overflow_x_scrollbar().track_scroll(this.tabsScroll)
        .on_size_change((_size, cx) => { this.tabsScroll.scroll_to_item(this.tab); cx.notify(); }).children(TABS.map(([id, label], index) =>
        div().id(`help-tab-${id}`).flex_none().px(9).py(6).cursor_pointer().bg(index === this.tab ? t.selected : t.chrome)
          .text_color(index === this.tab ? t.accent : t.muted).on_click((_e, cx) => this.select(index, cx)).child(label))))
      .child(Input.new(this.input).h(36).flex_none().px(10).border_1().border_color(t.accent).bg(t.background).text_color(t.foreground))
      .child(v_flex().id("help-rows").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).gap(4)
        .children(rows.map(([key, action], i) => h_flex().id(`help-row-${i}`).flex_none().min_h(32).px(8).py(6).gap(12)
          .child(div().w(220).flex_none().text_color(t.accent).child(key))
          .child(div().flex_1().min_w(0).child(action))))
        .when(!rows.length, el => el.child(div().p(8).text_color(t.dim).child("No matching controls"))));
  }
}
