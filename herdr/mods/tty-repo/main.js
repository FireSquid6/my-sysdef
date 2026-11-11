import { reportContext } from "./help-context.js";
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { spaces, panes, focused, exec, theme, shared, nextCommand } from "herdr";

// Use the workspace's first terminal: focusing this panel must not change its repo.
function location() {
  const space = spaces().find(s => s.active), f = focused();
  const tabs = space?.tabs ?? [];
  const pane = panes().find(p => p.terminal && tabs.some(t => t.id === p.tab));
  return { cwd: pane?.cwd || space?.folder || f?.cwd || null, on: space?.machine ?? null };
}
const sections = ["Overview", "PRs", "Issues", "Workflow runs"];
const githubURL = url => typeof url === "string" && /^https:\/\/github\.com\/[A-Za-z0-9_.~%/-]+(?:[?#][^\s]*)?$/.test(url);
function failure(error) {
  return `GitHub unavailable: ${String(error)}. Check gh installation, gh auth login, and machine/network connectivity; press r to retry.`;
}
async function json(args, options) {
  const result = await exec("gh", args, options);
  if (result.code !== 0) throw new Error((result.stderr || result.stdout || "gh failed").trim());
  return JSON.parse(result.stdout);
}

export default class Repo extends View {
  init(_props, cx) {
    reportContext(this, "tty-repo", cx);
    this.handle = cx.focus_handle(); this.scroll = ScrollHandle.new();
    this.cache = new Map(); this.section = 0; this.at = 0; this.query = ""; this.count = "";
    this.input = InputState.new({ placeholder: "Filter current section" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.command("focus", cx));
    cx.spawn(async cx => {
      for (;;) this.command(await nextCommand(), cx);
    });
    this.context(cx);
  }

  command(command, cx) {
    if (command === "focus") { this.typing = false; this.handle.focus(); cx.notify(); }
    if (command === "cycle") this.cycle(1, cx);
  }

  context(cx) {
    const loc = location(), key = JSON.stringify(loc);
    if (key === this.key) return;
    this.key = key; this.loc = loc; this.detail = null; this.detailToken = (this.detailToken || 0) + 1;
    this.at = 0; this.note = null; this.count = "";
    if (!this.cache.has(key)) {
      this.cache.set(key, { loading: false, repo: null, lists: [[], [], [], []], details: new Map() });
      this.refresh(cx);
    }
  }

  refresh(cx) {
    const key = this.key, entry = this.cache.get(key), loc = this.loc;
    // A new generation supersedes even an outstanding refresh or detail request.
    const generation = (entry.generation || 0) + 1; entry.generation = generation;
    this.detail = null; this.detailToken = (this.detailToken || 0) + 1; this.note = null;
    entry.details.clear(); entry.error = null;
    if (!loc.cwd) { entry.error = "No workspace folder"; return; }
    entry.loading = true;
    cx.spawn(async cx => {
      const current = () => entry.generation === generation;
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], loc);
        if (!current()) return;
        if (top.code !== 0) throw new Error("Not a git repository");
        const options = { cwd: top.stdout.trim(), on: loc.on };
        const repo = await json(["repo", "view", "--json", "nameWithOwner,description,url,defaultBranchRef"], options);
        if (!current()) return;
        if (!githubURL(repo.url)) throw new Error("Only github.com repositories are supported");
        entry.repo = repo; entry.options = options;
        const requests = [
          ["pr", "list", "--limit", "50", "--json", "number,title,state,isDraft,reviewDecision,url,headRefName"],
          ["issue", "list", "--limit", "50", "--json", "number,title,url,labels"],
          ["run", "list", "--limit", "30", "--json", "databaseId,displayTitle,status,conclusion,url"],
        ];
        entry.errors = {};
        await Promise.all(requests.map(async (args, i) => {
          try {
            const rows = await json(args, options);
            if (current()) entry.lists[i + 1] = rows;
          } catch (e) { if (current()) entry.errors[i + 1] = failure(e); }
        }));
      } catch (e) { if (current()) entry.error = failure(e); }
      finally { if (current()) entry.loading = false; cx.notify(); }
    });
    cx.notify();
  }

  rows() {
    const rows = this.cache.get(this.key)?.lists[this.section] || [];
    const query = this.query.toLowerCase();
    return rows.filter(row => this.label(row).toLowerCase().includes(query));
  }

  label(row) {
    if (this.section === 1) return `#${row.number} ${row.title} · ${row.isDraft ? "Draft" : row.state} · ${row.reviewDecision || "No review"} · ${row.headRefName}`;
    if (this.section === 2) return `#${row.number} ${row.title} · ${(row.labels || []).map(l => l.name).join(", ")}`;
    return `${row.displayTitle} · ${row.status} · ${row.conclusion || "pending"}`;
  }

  cycle(delta, cx) {
    this.section = (this.section + delta + sections.length) % sections.length;
    this.at = 0; this.detail = null; this.detailToken = (this.detailToken || 0) + 1; this.count = "";
    this.typing = false; this.handle.focus(); cx.notify();
  }

  openDetail(cx) {
    const row = this.rows()[this.at], entry = this.cache.get(this.key);
    if (!row || !entry.options) return;
    const key = this.key, section = this.section, id = `${section}:${row.number ?? row.databaseId}`;
    const token = ++this.detailToken, generation = entry.generation;
    this.detailAt = 0; this.scroll.scroll_to_item(0);
    this.detail = { title: row.title || row.displayTitle, body: "Loading…", url: row.url };
    if (section === 3) { this.detail.body = `${row.status} · ${row.conclusion || "pending"}\n\n${row.url}`; cx.notify(); return; }
    if (entry.details.has(id)) { this.detail = entry.details.get(id); cx.notify(); return; }
    cx.spawn(async cx => {
      const current = () => this.key === key && this.detailToken === token && entry.generation === generation;
      try {
        const detail = await json([section === 1 ? "pr" : "issue", "view", String(row.number), "--json", "title,body,url"], entry.options);
        if (entry.generation === generation) entry.details.set(id, detail);
        if (current()) this.detail = detail;
      } catch (e) { if (current()) this.detail.body = failure(e); }
      cx.notify();
    });
    cx.notify();
  }

  openURL(url, cx) {
    if (!githubURL(url)) { this.note = "Refusing to open a non-HTTPS github.com URL"; cx.notify(); return; }
    const key = this.key;
    // Always local, including for remote workspaces. Desktop handoff is best effort.
    cx.spawn(async cx => {
      try {
        const result = await exec("xdg-open", [url]);
        if (result.code !== 0) throw new Error(result.stderr || "xdg-open failed");
        if (this.key === key) this.note = "Browser handoff requested (best effort, local desktop)";
      } catch (e) { if (this.key === key) this.note = `Cannot open local browser (best effort): ${e}`; }
      cx.notify();
    });
  }

  navigate(e, cx) {
    const m = e.modifiers, key = e.key;
    if (key === "tab" && m.control && !m.shift && !m.alt && !m.platform) {
      this.cycle(1, cx); cx.stop_propagation(); return;
    }
    if (m.control || m.alt || m.platform || key === "tab") return;
    if (key === "escape" && this.searching) {
      this.searching = false; this.typing = false; this.query = ""; this.input.set_value(""); this.handle.focus();
    } else if (this.typing) return;
    else if (/^[0-9]$/.test(key)) { this.count = (this.count + key).slice(0, 6); cx.stop_propagation(); return; }
    else {
      const prefix = this.count, count = Math.max(1, Number(prefix) || 1); this.count = "";
      if ((key === "h" || key === "escape") && this.detail) { this.detail = null; ++this.detailToken; }
      else if (key === "h") this.cycle(-1, cx);
      else if (key === "l") this.cycle(1, cx);
      else if (key === "/") { this.searching = true; this.typing = true; this.input.focus(); }
      else if (key === "r") this.refresh(cx);
      else if (key === "enter") { if (!this.detail) this.openDetail(cx); }
      else if (key === "o") this.openURL(this.detail?.url || this.rows()[this.at]?.url || this.cache.get(this.key)?.repo?.url, cx);
      else if (["j", "k", "g", "G"].includes(key)) {
        const last = Math.max(0, this.detail ? (this.detail.body || "").split("\n").length - 1 : this.rows().length - 1);
        const current = this.detail ? this.detailAt || 0 : this.at;
        const at = Math.max(0, Math.min(last, key === "G" || (key === "g" && m.shift) ? (prefix ? count - 1 : last) : key === "g" ? (prefix ? count - 1 : 0) : current + (key === "j" ? count : -count)));
        if (this.detail) this.detailAt = at; else this.at = at;
        this.scroll.scroll_to_item(this.detail ? at + 1 : at);
      } else return;
    }
    cx.stop_propagation(); cx.notify();
  }

  render(cx) {
    this.context(cx);
    const request = shared("keyboard.panel");
    if (request?.id === "repo" && request.token !== this.focusRequest) {
      this.focusRequest = request.token;
      cx.timer.after(0, cx => this.command("focus", cx));
    }
    const t = theme(), entry = this.cache.get(this.key), rows = this.rows();
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    const repo = entry.repo;
    return v_flex().id("repo").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13)
      .border_1().border_color(this.handle.is_focused() || this.typing ? t.accent : t.border).track_focus(this.handle)
      .on_key_down((e, cx) => this.navigate(e, cx))
      .child(div().px(12).py(10).font_semibold().child(`Repo · ${repo?.nameWithOwner || "GitHub"}${entry.loading ? " · Loading…" : ""}`))
      .child(h_flex().flex_none().gap(8).px(10).py(6).children(sections.map((name, i) => div().id(`repo-section-${i}`).cursor_pointer().text_color(this.section === i ? t.accent : t.muted).child(name).on_click((_e, cx) => this.cycle(i - this.section, cx)))))
      .when(this.searching, el => el.child(Input.new(this.input).h(32).text_size(12)))
      .child(v_flex().id("repo-content").flex_1().min_h(0).overflow_y_scroll().track_scroll(this.scroll).p(10).gap(6)
        .when(Boolean(entry.error || entry.errors?.[this.section]), el => el.child(div().text_color(t.ansi1).child(entry.error || entry.errors[this.section])))
        .when(Boolean(this.detail), el => el.child(div().flex_none().font_semibold().child(this.detail.title))
          .children((this.detail.body || "No description").split("\n").map((line, i) => div().id(`repo-detail-line-${i}`).flex_none().min_h(20).text_color(i === this.detailAt ? t.foreground : t.muted).child(line || " "))))
        .when(!this.detail && this.section === 0, el => el
          .child(div().child(repo?.description || "No repository description"))
          .child(div().text_color(t.dim).child(`Default branch: ${repo?.defaultBranchRef?.name || "—"}`))
          .child(div().id("repo-url").cursor_pointer().text_color(t.accent).child(repo?.url || "").on_click((_e, cx) => this.openURL(repo?.url, cx)))
          .child(div().text_color(t.dim).child("Read-only GitHub panel · PRs/issues: up to 50 open items; runs: up to 30.")))
        .when(!this.detail && this.section !== 0, el => el.children(rows.map((row, i) => div().id(`repo-row-${i}`).flex_none().px(8).py(8).cursor_pointer().when(i === this.at, el => el.bg(t.selected)).hover(s => s.bg(t.hover)).child(this.label(row)).on_click((_e, cx) => { this.at = i; this.handle.focus(); this.openDetail(cx); })))
          .when(!rows.length, el => el.child(div().text_color(t.dim).child(entry.loading ? "Loading…" : "No matching items")))))
      .when(Boolean(this.note), el => el.child(div().p(8).text_color(t.muted).child(this.note)))
      .child(div().flex_none().p(10).border_t(1).border_color(t.border).text_size(10).text_color(t.dim).child("Read-only · browser opens locally (best effort)"));
  }
}
