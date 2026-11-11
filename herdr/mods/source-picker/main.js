// A fresh directory listing on the selected machine; never a recursive scan.
import { reportContext } from "./help-context.js";
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { readdir } from "fs/promises";
import { home, machines, spaces, theme, run, exec, props, closeOverlay, nextCommand } from "herdr";
import { parsePath, resolvePath, matchingDirectories } from "./paths.js";
import { launchProject } from "./project-launch.js";

export default class SourcePicker extends View {
  init(_props, cx) {
    reportContext(this, "source-picker", cx);
    this.machine = spaces().find(space => space.active)?.machine ?? "";
    this.homes = new Map([["", home()]]);
    this.homeRoot = this.homes.get(this.machine);
    this.folder = null;
    this.directories = [];
    this.filter = "";
    this.at = 0;
    this.loading = true;
    this.error = null;
    this.opening = false;
    this.request = 0;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "~/path/to/project", value: "~/source/" });
    this.input.on("change", (_e, cx) => {
      this.updatePath(cx);
    });
    this.input.on("submit", (_e, cx) => {
      this.open(this.input.value(), cx);
    });
    this.input.focus();

    this.updatePath(cx);
    // The local machine is represented by an empty name in Herdr's model.
    cx.spawn(async cx => {
      try {
        const result = await exec("sh", ["-c", "hostname"]);
        if (result.code === 0) this.localHostname = result.stdout.trim();
      } catch { /* Keep the theme border if hostname lookup is unavailable. */ }
      cx.notify();
    });
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "cycle-machine") this.cycleMachine(cx);
        else if (command === "complete") this.complete(this.rows()[0], cx);
      }
    });
  }

  async machineHome(machine) {
    let root = this.homes.get(machine);
    if (!root) {
      const result = await exec("sh", ["-c", 'printf "%s" "$HOME"'], { on: machine });
      if (result.code !== 0 || !result.stdout.startsWith("/")) throw new Error(result.stderr || "Could not determine this machine's home directory");
      root = result.stdout;
      this.homes.set(machine, root);
    }
    return root;
  }

  updatePath(cx) {
    if (this.opening) return;
    this.at = 0;
    this.scroll.scroll_to_item(0);
    this.error = null;
    this.pathError = false;
    const request = ++this.request;
    const machine = this.machine, value = this.input.value();
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const root = await this.machineHome(machine);
        if (request !== this.request) return;
        this.homeRoot = root;
        const path = parsePath(value, root);
        const loadedKey = JSON.stringify([machine, path.folder]);
        this.folder = path.folder;
        this.filter = path.filter;
        if (this.loadedKey === loadedKey) return;
        this.loadedKey = null;
        this.directories = [];
        let directories;
        if (machine) {
          const script = '[ -d "$1" ] || exit 1; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -d "$p" ] || continue; printf "%s\\0" "${p##*/}"; done; exit 0';
          const result = await exec("sh", ["-c", script, "source-picker", path.folder], { on: machine });
          if (result.code !== 0) throw new Error(result.stderr || "Cannot list this directory");
          directories = result.stdout.split("\0").filter(Boolean);
        } else {
          const entries = await readdir(path.folder, { withFileTypes: true });
          directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
        }
        if (request !== this.request) return;
        this.directories = directories.sort((a, b) => a.localeCompare(b));
        this.loadedKey = loadedKey;
      } catch (error) {
        if (request !== this.request) return;
        this.loadedKey = null;
        this.directories = [];
        this.pathError = true;
        this.error = `Could not read directory: ${String(error)}`;
      } finally {
        if (request === this.request) { this.loading = false; cx.notify(); }
      }
    });
  }

  cycleMachine(cx) {
    if (this.opening) return;
    const names = [...new Set(["", ...machines().filter(machine => !machine.temporary).map(machine => machine.name ?? ""), this.machine])];
    const machine = names[(names.indexOf(this.machine) + 1) % names.length];
    if (machine === this.machine) return;
    this.machine = machine;
    this.homeRoot = this.homes.get(machine);
    this.loadedKey = null;
    this.directories = [];
    this.input.set_value("~/source/");
    this.updatePath(cx);
    this.input.focus();
  }

  rows() {
    return matchingDirectories(this.directories, this.filter);
  }

  complete(name, cx) {
    if (!name || this.opening || this.loading || this.pathError) return;
    const folder = resolvePath(`${this.folder}/${name}`, this.homeRoot);
    const root = this.homeRoot;
    const value = folder === root ? "~" : folder.startsWith(root + "/") ? "~" + folder.slice(root.length) : folder;
    this.input.set_value(value + "/");
    this.updatePath(cx);
    this.input.focus();
  }

  open(value, cx) {
    if (this.opening) return;
    const machine = this.machine;
    this.opening = true;
    this.error = null;
    cx.notify();
    // run() doesn't return IDs. Use the app CLI so every new tab targets
    // the space just created, regardless of focus changes during setup.
    cx.spawn(async (cx) => {
      try {
        const root = await this.machineHome(machine);
        const folder = resolvePath(value, root);
        const directory = await exec("sh", ["-c", '[ -d "$1" ]', "source-picker", folder], machine ? { on: machine } : {});
        if (directory.code !== 0) throw new Error(`Not an accessible directory: ${folder}`);
        const existing = spaces().find(space => (space.machine ?? "") === machine && space.folder && space.folder.replace(/\/+$/, "") === folder);
        if (existing) {
          run("space.select", { id: existing.id });
          closeOverlay(props().overlay);
          return;
        }
        const projectName = folder.split("/").pop() || "/";
        await launchProject({ name: projectName, folder, machine, agentArgv: ["pi"] }, {
          exec,
          selectTab: id => run("tab.select", { id }),
        });
        closeOverlay(props().overlay);
      } catch (error) {
        this.error = `Could not open project: ${String(error)}`;
        // The shared launcher retains partial resources and reports their IDs.
      } finally {
        this.opening = false;
        // Edits made during creation must become active before a retry.
        if (this.error) {
          const failure = this.error;
          this.updatePath(cx);
          this.error = failure;
        }
        cx.notify();
      }
    });
  }

  machineColor(fallback) {
    const host = (this.machine || this.localHostname || "").split(".")[0];
    return ({ deisslaptop: "#bb9af7", "minibox-one": "#9ece6a", desktop: "#f7768e" })[host] ?? fallback;
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const message = this.error ?? (this.opening ? "Creating project tabs…" : this.loading ? "Loading directories…"
      : !rows.length ? "No matching directories." : null);
    return v_flex().id("source-picker").track_focus(this.handle)
      .w_full().h_full().min_h(0).p(18).gap(12).bg(t.popover).border_1().border_color(this.machineColor(t.border)).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          closeOverlay(props().overlay);
        } else if (e.key === "tab" && e.modifiers.control) {
          this.cycleMachine(cx);
        } else if ((e.key === "down" || e.key === "up") && rows.length) {
          this.at = (this.at + (e.key === "down" ? 1 : rows.length - 1)) % rows.length;
          this.scroll.scroll_to_item(this.at);
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().justify_between()
        .child(div().font_semibold().text_size(16).child("Open project"))
        .child(div().text_color(t.dim).child("")))
      .child(div().text_color(t.muted).child(`${this.machine || "This computer"} · ~/source`))
      .child(Input.new(this.input).h(36).flex_none().px(10).rounded(0)
        .border_1().border_color(t.accent).bg(t.background).text_color(t.foreground))
      .child(v_flex().id("source-projects").flex_1().min_h(0)
        .overflow_y_scrollbar().track_scroll(this.scroll).gap(2)
        .when(Boolean(message), (el) => el.child(div().p(12).text_color(t.muted).child(message)))
        .children(rows.map((name, index) => h_flex().id(`source-${name}`)
          .h(34).flex_none().px(10).items_center().rounded(0).cursor_pointer()
          .when(index === this.at, (el) => el.bg(t.selected))
          .hover((el) => el.bg(t.hover))
          .on_click((_e, cx) => this.complete(name, cx))
          .child(div().truncate().child(name)))))
      .child(div().text_color(t.dim).text_size(11)
        .child(`${rows.length} directories · Tab Complete · Enter Open path · Ctrl+Tab Machine`));
  }
}
