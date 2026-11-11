import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, theme, run, shared, setShared } from "herdr";

export default class QuickTerminalBar extends View {
  close() {
    const p = props();
    if (p?.overlay && shared("quick.window")?.id === p.overlay) setShared("quick.window", null);
  }

  render() {
    const t = theme(), p = props() ?? {};
    return h_flex().size_full().px(10).gap(10).items_center().bg(t.chrome).text_color(t.foreground).text_size(12)
      .border_b(1).border_color(t.border)
      .child(div().text_color(t.accent).child(">_"))
      .child(div().flex_1().truncate().child(`${p.machine || "This computer"} · ~`))
      .child(div().id("quick-machine").px(6).cursor_pointer().hover(s => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("tty-tabs.quick-cycle")).child("Machine"))
      .child(div().id("quick-close").px(6).cursor_pointer().hover(s => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("tty-tabs.quick")).child("×"));
  }
}
