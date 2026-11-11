// A fresh directory listing on every open; no recursive scan or network access.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { readdir } from "fs/promises";
import { home, theme, run, exec, props, closeOverlay } from "herdr";

export default class SourcePicker extends View {
  init(_props, cx) {
    this.folder = `${home()}/source`;
    this.directories = [];
    this.filter = "";
    this.at = 0;
    this.loading = true;
    this.error = null;
    this.opening = false;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Filter projects…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.open(this.rows()[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    cx.spawn(async (cx) => {
      try {
        const entries = await readdir(this.folder, { withFileTypes: true });
        this.directories = entries.filter((entry) => entry.isDirectory())
          .map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
      } catch (error) {
        this.error = `Could not read ~/source: ${String(error)}`;
      }
      this.loading = false;
      cx.notify();
    });
  }

  rows() {
    const query = this.filter.trim().toLowerCase();
    return this.directories.filter((name) => name.toLowerCase().includes(query));
  }

  open(name, cx) {
    if (!name || this.opening) return;
    this.opening = true;
    this.error = null;
    cx.notify();
    // run() doesn't return IDs. Use the app CLI so every new tab targets
    // the space just created, regardless of focus changes during setup.
    cx.spawn(async (cx) => {
      let created = false;
      try {
        const command = async (name, args) => {
          const result = await exec("herdr-app", ["do", name, JSON.stringify(args)]);
          if (result.code !== 0) throw new Error(result.stderr || result.stdout);
          const value = JSON.parse(result.stdout);
          if (value.error) throw new Error(value.error);
          return value;
        };
        const folder = `${this.folder}/${name}`;
        const project = await command("space.new", { name, folder, machine: "", tab: "editor" });
        created = true;
        if (!project.space || !project.tab) throw new Error("Missing new space/tab IDs");
        for (const tab of ["agent", "term1", "term2"]) {
          await command("tab.new", { name: tab, space: project.space, folder });
        }
        run("tab.select", { id: project.tab });
        closeOverlay(props().overlay);
      } catch (error) {
        this.error = `${created ? "Project created, but tab setup failed" : "Could not open project"}: ${String(error)}`;
        // Keep any successfully created tabs; don't destroy user processes.
      }
      this.opening = false;
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const message = this.error ?? (this.opening ? "Creating project tabs…" : this.loading ? "Loading directories…"
      : !rows.length ? (this.directories.length ? "No matching directories." : "No directories in ~/source.") : null);
    return v_flex().id("source-picker").track_focus(this.handle)
      .w_full().h_full().min_h(0).p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          closeOverlay(props().overlay);
        } else if ((e.key === "down" || e.key === "up") && rows.length) {
          this.at = (this.at + (e.key === "down" ? 1 : rows.length - 1)) % rows.length;
          this.scroll.scroll_to_item(this.at);
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().justify_between()
        .child(div().font_semibold().text_size(16).child("Open project"))
        .child(div().text_color(t.dim).child("Esc to cancel")))
      .child(div().text_color(t.muted).child("New local space from ~/source"))
      .child(Input.new(this.input).h(36).flex_none().px(10).rounded(0)
        .border_1().border_color(t.accent).bg(t.background).text_color(t.foreground))
      .child(v_flex().id("source-projects").flex_1().min_h(0)
        .overflow_y_scrollbar().track_scroll(this.scroll).gap(2)
        .when(Boolean(message), (el) => el.child(div().p(12).text_color(t.muted).child(message)))
        .children(rows.map((name, index) => h_flex().id(`source-${name}`)
          .h(34).flex_none().px(10).items_center().rounded(0).cursor_pointer()
          .when(index === this.at, (el) => el.bg(t.selected))
          .hover((el) => el.bg(t.hover))
          .on_click((_e, cx) => this.open(name, cx))
          .child(div().truncate().child(name)))))
      .child(div().text_color(t.dim).text_size(11)
        .child(`${rows.length} projects · ↑/↓ to choose · Enter to open`));
  }
}
