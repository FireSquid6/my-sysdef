import { reportContext } from "./help-context.js";
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list, ScrollHandle, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, shared, nextCommand } from "herdr";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Text draws a tab as nothing: pad each to the next 4-column stop.
const untab = (text) => text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: untab(line.slice(1)) || " " };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: untab(line.slice(1)) || " " }; }
    return { kind: "", text: line };
  });
}

export default class Changes extends View {
  init(_props, cx) {
    reportContext(this, "tty-changes", cx);
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.diffScroll = VirtualListScrollHandle.new();
    this.selected = null; this.diffAt = 0; this.inDiff = false;
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") { this.handle.focus(); cx.notify(); }
        else if (command === "cycle") this.cycleFocus(false, cx);
      }
    });
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; this.focusArea = "message"; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null; this.branch = null; this.upstream = null; this.divergence = ""; this.remoteDiff = false;
      this.ahead = 0; this.behind = 0; this.hasConflicts = false;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const branch = await git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
        const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
        const counts = upstream.code === 0 ? await git(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]) : null;
        const [ahead, behind] = counts?.code === 0 ? counts.stdout.trim().split(/\s+/) : [];
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.branch = branch.code === 0 ? branch.stdout.trim() : `detached ${head.stdout.trim().slice(0, 7)}`;
        this.upstream = upstream.code === 0 ? upstream.stdout.trim() : null;
        this.divergence = ahead !== undefined ? `↑${ahead} ↓${behind}` : "";
        this.ahead = Number(ahead) || 0; this.behind = Number(behind) || 0;
        // Check all entries, including files beyond the display limit.
        this.hasConflicts = entries.some(entry => {
          const xy = entry.slice(0, 2);
          return xy.includes("U") || xy === "AA" || xy === "DD";
        });
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; if (!this.remoteDiff) this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open && !this.remoteDiff) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffAt = Math.min(this.diffAt, Math.max(0, this.rows.length - 1));
    this.diffWidth = Math.max(300, ...this.rows.map(row => (row.text.length + 1) * 7 + 50));
  }

  pick(path, cx) {
    this.selected = path;
    this.remoteDiff = false;
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  sync(action, cx) {
    if (!["push", "pull", "diff"].includes(action) || !this.root || !this.upstream || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context;
    this.busy = true; this.syncAction = action; this.note = null;
    cx.spawn(async cx => {
      try {
        const git = async args => {
          const r = await exec("git", args, { cwd: root, on, timeout: 120000 });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
          return r.stdout;
        };
        if (action === "diff") {
          await git(["fetch"]);
          if (key() !== context) return;
          const text = await git([...READ, "diff", "--no-ext-diff", "--no-textconv", "--no-color", "@{upstream}", "--"]);
          if (key() !== context) return;
          this.remoteDiff = true;
          const lines = text.trimEnd().split("\n");
          this.setLines(text ? lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "…" : line) : ["No differences from upstream"]);
          this.note = lines.length > 1500 ? "Upstream diff truncated to 1,500 lines" : null;
          this.focusArea = "preview"; this.diffAt = 0; this.inDiff = true; this.diffScroll.scroll_to_item(0); this.handle.focus();
        } else {
          await git(action === "pull" ? ["pull", "--ff-only"] : ["push"]);
          if (key() === context) { this.remoteDiff = false; this.note = `${action === "pull" ? "Pull" : "Push"} complete`; }
        }
      } catch (e) { if (key() === context) this.note = `${action} failed: ${e}`; }
      finally { this.busy = false; this.syncAction = null; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  cycleFocus(backwards, cx) {
    const areas = ["files", "preview", "message", "commit", "push", "pull", "diff", ...(this.remoteDiff ? ["close-diff"] : [])];
    const current = this.typing ? "message" : this.focusArea || "files";
    this.focusArea = areas[(areas.indexOf(current) + (backwards ? areas.length - 1 : 1)) % areas.length];
    this.count = "";
    this.typing = this.focusArea === "message";
    this.inDiff = this.focusArea === "preview";
    if (this.typing) this.input.focus(); else this.handle.focus();
    cx.notify();
  }

  closeRemoteDiff(cx) {
    this.remoteDiff = false; this.focusArea = "files"; this.inDiff = false;
    this.setLines([]); this.refresh(cx); this.handle.focus(); cx.notify();
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const request = shared("keyboard.panel");
    if (request?.id === "changes" && request.token !== this.focusRequest) {
      this.focusRequest = request.token;
      cx.timer.after(0, cx => { this.typing = false; this.focusArea = "files"; this.handle.focus(); cx.notify(); });
    }
    if (!this.files.some(f => f.path === this.selected)) this.selected = this.files[0]?.path ?? null;
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    return v_flex().id("changes").size_full().min_h(0).rounded(0).overflow_hidden().bg(t.background).border_1().border_color(this.handle.is_focused() || this.typing ? t.accent : t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "tab" && e.modifiers.control && !e.modifiers.shift && !e.modifiers.alt && !e.modifiers.platform) { this.cycleFocus(false, cx); cx.stop_propagation(); }
        else if (e.key === "escape" && this.typing) { this.typing = false; this.focusArea = "files"; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
        else if (!this.typing) this.navigate(e, cx);
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Changes"))
        .child(div().px(5).py(1).rounded(0).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${this.files.length} files`))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
      // overflow_y_scrollbar() wraps the list, so its flex sizing never reached the panel's layout.
      .child(div().flex_1().min_h(44).max_h(this.files.length * 28 + 12).relative().border_b(1).border_color(t.border)
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().track_scroll(this.scroll).p(6).children(this.files.map((f) => {
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(28).flex_none().px(8).gap(8).items_center().rounded(0).cursor_pointer().when(this.selected === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.focusArea = "files"; this.inDiff = false; this.handle.focus(); this.pick(f.path, cx); })
          .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().child(name)))
          .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .when(this.remoteDiff, e => e.child(h_flex().flex_none().px(10).py(4).gap(8)
        .child(div().flex_1().truncate().child(`Diff vs ${this.upstream} · includes local changes`))
        .child(div().id("close-upstream-diff").cursor_pointer().text_color(this.focusArea === "close-diff" ? t.accent : t.muted).child("Close").on_click((_e, cx) => this.closeRemoteDiff(cx)))))
      .child(div().flex_1().min_h(0).relative().border_1().border_color(this.focusArea === "preview" ? t.accent : t.border).font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
             (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).track_scroll(this.diffScroll).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.remoteDiff && !this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a file to view its changes"))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)))
      .child(h_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(div().id("commit-message").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(0).border_1().border_color(this.typing ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("commit").h(32).px(14).flex().items_center().rounded(0).border_1().border_color(this.focusArea === "commit" ? t.accent : t.border).bg(enabled ? t.solid : t.raised).text_color(enabled ? t.solid_foreground : t.dim).text_size(12).when(enabled, (e) => e.cursor_pointer()).on_click((_e, cx) => this.commit(cx)).child(this.busy && !this.syncAction ? "Committing…" : "Commit")))
      .child(v_flex().flex_none().p(10).gap(6).border_t(1).border_color(t.border)
        .child(div().text_size(11).truncate().text_color(this.branchColor(t.muted)).child(this.root ? `${this.branch || "…"} · ${this.upstream || "No upstream"} ${this.divergence || ""}` : "No repository"))
        .child(h_flex().gap(8).children(["push", "pull", "diff"].map(action => {
          const available = Boolean(this.root && this.upstream && !this.busy && !this.loading && this.context === key());
          return div().id(`remote-${action}`).flex_1().h(28).flex().items_center().justify_center().border_1().border_color(this.focusArea === action ? t.accent : t.border).bg(t.raised)
            .text_color(available ? t.foreground : t.dim).when(available, e => e.cursor_pointer().hover(s => s.bg(t.hover)))
            .on_click((_e, cx) => this.sync(action, cx)).child(this.syncAction === action ? `${action}…` : action[0].toUpperCase() + action.slice(1));
        })))
        .child(div().text_size(10).text_color(t.dim).child(`${this.focusArea || "files"} · p Pull · Shift+P Push · Shift+D Diff`)));
  }

  branchColor(fallback) {
    if (!this.root) return fallback;
    if (this.hasConflicts || (this.ahead > 0 && this.behind > 0)) return "#f7768e";
    if (this.ahead > 0 || this.files.length > 0) return "#9ece6a";
    if (this.behind > 0) return "#bb9af7";
    return fallback;
  }

  navigate(e, cx) {
    if (e.key === "tab" && e.modifiers.control && !e.modifiers.shift && !e.modifiers.alt && !e.modifiers.platform) { this.cycleFocus(false, cx); cx.stop_propagation(); return; }
    if (this.typing || e.modifiers.alt || e.modifiers.control || e.modifiers.platform) return;
    const key = e.key;
    const letter = key.toLowerCase();
    const shifted = e.modifiers.shift || key !== letter;
    const action = letter === "p" ? (shifted ? "push" : "pull") : letter === "d" && shifted ? "diff" : null;
    if (action) {
      this.count = "";
      this.sync(action, cx);
      cx.stop_propagation(); cx.notify(); return;
    }
    if (key === "escape") {
      if (this.remoteDiff) this.closeRemoteDiff(cx);
      else { this.focusArea = "files"; this.inDiff = false; this.handle.focus(); }
      cx.stop_propagation(); cx.notify(); return;
    }
    const buttons = ["commit", "push", "pull", "diff", "close-diff"];
    if (buttons.includes(this.focusArea)) {
      if (["enter", "space", " "].includes(key)) {
        if (this.focusArea === "commit") this.commit(cx);
        else if (this.focusArea === "close-diff") this.closeRemoteDiff(cx);
        else this.sync(this.focusArea, cx);
      } else if (["h", "left", "k", "up", "l", "right", "j", "down"].includes(key)) {
        this.cycleFocus(["h", "left", "k", "up"].includes(key), cx);
      } else return;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (/^[0-9]$/.test(key)) {
      this.count = ((this.count ?? "") + key).slice(0, 6);
      cx.stop_propagation(); return;
    }
    const repeat = Math.max(1, Number(this.count) || 1); this.count = "";
    if (key === "i") { this.typing = true; this.focusArea = "message"; this.input.focus(); }
    else if (key === "h" || key === "left" || key === "escape") this.inDiff = false;
    else if (key === "l" || key === "right" || key === "enter") {
      if (this.selected && this.open !== this.selected) this.pick(this.selected, cx);
      if (key !== "enter") this.inDiff = true;
    } else if (["j", "down", "k", "up", "g", "G"].includes(key)) {
      const count = this.inDiff ? this.rows.length : this.files.length;
      const current = this.inDiff ? this.diffAt : Math.max(0, this.files.findIndex(f => f.path === this.selected));
      const at = Math.max(0, Math.min(count - 1, key === "g" && !e.modifiers.shift ? 0
        : key === "G" || (key === "g" && e.modifiers.shift) ? count - 1
        : current + (key === "j" || key === "down" ? repeat : -repeat)));
      if (this.inDiff) { this.diffAt = at; this.diffScroll.scroll_to_item(at, "top"); }
      else { this.selected = this.files[at]?.path ?? null; this.scroll.scroll_to_item(at); }
    } else return;
    cx.stop_propagation(); cx.notify();
  }
}
