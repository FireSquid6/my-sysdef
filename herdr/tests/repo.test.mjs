import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../mods/tty-repo/main.js", import.meta.url), "utf8");
const event = (key, modifiers = {}) => ({ key, modifiers });
const ok = value => ({ code: 0, stdout: typeof value === "string" ? value : JSON.stringify(value), stderr: "" });
const repo = { nameWithOwner: "owner/project", description: "Example", url: "https://github.com/owner/project", defaultBranchRef: { name: "main" } };
function harness(execOverride) {
  let cwd = "/project", request = null;
  const calls = [], tasks = [], commands = [], timers = [];
  let stops = 0, focus = 0;
  const element = new Proxy({}, { get: (_target, name) => (...args) => {
    if (name === "when" && args[0]) args[1](element);
    return element;
  } });
  const input = { text: "", handlers: {}, on(name, cb) { this.handlers[name] = cb; }, value() { return this.text; }, set_value(s) { this.text = s; }, focus() {} };
  const cx = { notify() {}, stop_propagation() { stops++; }, focus_handle() { return { focus() { focus++; }, is_focused: () => false }; },
    spawn(fn) { tasks.push(fn(cx)); }, timer: { after(_ms, fn) { timers.push(() => fn(cx)); } } };
  const dependencies = {
    reportContext() {}, View: class {}, div: () => element, v_flex: () => element, h_flex: () => element,
    InputState: { new: () => input }, Input: { new: () => element }, TextView: { markdown: () => element }, ScrollHandle: { new: () => ({ scroll_to_item() {} }) },
    spaces: () => [{ active: true, folder: cwd, machine: "remote", tabs: [{ id: "tab" }] }],
    panes: () => [{ terminal: "remote/t1", cwd, tab: "tab" }], focused: () => null,
    shared: () => request, theme: () => ({}), nextCommand: () => commands.length ? Promise.resolve(commands.shift()) : new Promise(() => {}),
    exec: async (cmd, args, options) => {
      calls.push({ cmd, args, options });
      if (execOverride) return execOverride(cmd, args, options);
      if (cmd === "git") return ok(cwd);
      if (cmd === "xdg-open") return ok("");
      if (args[0] === "repo") return ok(repo);
      if (args[1] === "view") return ok({ title: "Detail", body: "Markdown **body**", url: repo.url });
      return ok(Array.from({ length: 20 }, (_, i) => ({ number: i + 1, title: `Item ${i}`, url: `${repo.url}/issues/${i + 1}`, labels: [] })));
    },
  };
  const Repo = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(dependencies));
  const view = new Repo(); view.init({}, cx);
  // init's command listener intentionally never finishes; all other tasks settle.
  let drained = 1;
  return { view, cx, calls, input, commands, timers, get stops() { return stops; }, get focus() { return focus; },
    setCwd(value) { cwd = value; }, request(value) { request = value; },
    async drain() { while (drained < tasks.length) await tasks[drained++]; },
  };
}

test("loads read-only GitHub data with exact fields on workspace machine; render and section changes are cached", async () => {
  const h = harness(); await h.drain();
  assert.deepEqual(h.calls.map(c => [c.cmd, c.args]), [
    ["git", ["rev-parse", "--show-toplevel"]],
    ["gh", ["repo", "view", "--json", "nameWithOwner,description,url,defaultBranchRef"]],
    ["gh", ["pr", "list", "--limit", "50", "--json", "number,title,state,isDraft,reviewDecision,url,headRefName"]],
    ["gh", ["issue", "list", "--limit", "50", "--json", "number,title,url,labels"]],
    ["gh", ["run", "list", "--limit", "30", "--json", "databaseId,displayTitle,status,conclusion,url"]],
  ]);
  assert.ok(h.calls.every(c => c.options.cwd === "/project" && c.options.on === "remote"));
  h.view.render(h.cx); h.view.cycle(1, h.cx); h.view.render(h.cx); await h.drain();
  assert.equal(h.calls.length, 5);
  h.setCwd("/other"); h.view.render(h.cx); await h.drain(); assert.equal(h.calls.length, 10);
  h.setCwd("/project"); h.view.render(h.cx); await h.drain(); assert.equal(h.calls.length, 10);
  h.view.navigate(event("r"), h.cx); await h.drain(); assert.equal(h.calls.length, 15);
});

test("Ctrl+Tab and cycle command change sections; Shift+Tab and modified keys are untouched", async () => {
  const h = harness(); await h.drain();
  for (const modifiers of [{ shift: true }, {}, { control: true, shift: true }]) h.view.navigate(event("tab", modifiers), h.cx);
  assert.equal(h.view.section, 0); assert.equal(h.stops, 0);
  h.view.navigate(event("tab", { control: true }), h.cx); assert.equal(h.view.section, 1);
  h.view.command("cycle", h.cx); assert.equal(h.view.section, 2);
  h.view.navigate(event("h"), h.cx); assert.equal(h.view.section, 1);
  h.view.navigate(event("l"), h.cx); assert.equal(h.view.section, 2);
  h.view.navigate(event("j", { alt: true }), h.cx); assert.equal(h.view.at, 0);
  h.view.command("focus", h.cx); assert.ok(h.focus > 0);
  h.request({ id: "repo", token: 1 }); h.view.render(h.cx); assert.equal(h.timers.length, 1);
  h.view.render(h.cx); assert.equal(h.timers.length, 1); h.timers[0]();
});

test("numeric movement, filtering, applying search, and Escape are keyboard accessible", async () => {
  const h = harness(); await h.drain(); h.view.cycle(2, h.cx);
  for (const key of "10j4k") h.view.navigate(event(key), h.cx);
  assert.equal(h.view.at, 6);
  h.view.navigate(event("G"), h.cx); assert.equal(h.view.at, 19);
  h.view.navigate(event("g"), h.cx); assert.equal(h.view.at, 0);
  for (const key of "5g") h.view.navigate(event(key), h.cx); assert.equal(h.view.at, 4);
  h.view.navigate(event("/"), h.cx); assert.equal(h.view.typing, true);
  h.input.text = "ITEM 19"; h.input.handlers.change({}, h.cx); assert.equal(h.view.rows().length, 1);
  h.input.handlers.submit({}, h.cx); assert.equal(h.view.typing, false);
  h.view.navigate(event("enter"), h.cx); await h.drain(); assert.equal(h.view.detail.title, "Detail");
  h.view.navigate(event("escape"), h.cx); assert.equal(h.view.searching, false); assert.equal(h.view.query, "");
  h.view.navigate(event("h"), h.cx); assert.equal(h.view.detail, null); assert.equal(h.view.section, 2);
});

test("detail bodies can be scrolled entirely with vim keys and numeric prefixes", async () => {
  const h = harness(); await h.drain();
  const positions = []; h.view.scroll = { scroll_to_item: at => positions.push(at) };
  h.view.detail = { title: "Long issue", body: Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n") };
  for (const key of "10j4k") h.view.navigate(event(key), h.cx);
  assert.equal(h.view.detailAt, 6); assert.equal(positions.at(-1), 7);
  h.view.navigate(event("G"), h.cx); assert.equal(h.view.detailAt, 99);
  h.view.navigate(event("g"), h.cx); assert.equal(h.view.detailAt, 0);
  h.view.navigate(event("escape"), h.cx); assert.equal(h.view.detail, null);
});

test("PR and issue details cache; workflow detail performs no request", async () => {
  const h = harness(); await h.drain(); h.view.cycle(1, h.cx);
  h.view.openDetail(h.cx); await h.drain();
  assert.deepEqual(h.calls.at(-1).args, ["pr", "view", "1", "--json", "title,body,url"]);
  h.view.navigate(event("h"), h.cx); h.view.openDetail(h.cx); await h.drain(); assert.equal(h.calls.length, 6);
  h.view.cycle(1, h.cx); h.view.openDetail(h.cx); await h.drain(); assert.equal(h.calls.at(-1).args[0], "issue");
  h.view.cycle(1, h.cx); h.view.openDetail(h.cx); await h.drain(); assert.equal(h.calls.length, 7);
});

test("browser opens validated GitHub URLs locally only, and rejects unsafe URLs", async () => {
  const h = harness(); await h.drain();
  for (const url of ["http://github.com/a/b", "https://github.com.evil/a", "https://github.com@evil/a", "file:///tmp/x", "--help"]) h.view.openURL(url, h.cx);
  assert.equal(h.calls.length, 5);
  h.view.navigate(event("o"), h.cx); await h.drain();
  assert.deepEqual(h.calls.at(-1), { cmd: "xdg-open", args: [repo.url], options: undefined });
});

test("missing gh, auth failures, offline and invalid JSON produce actionable errors", async () => {
  for (const mode of ["missing", "auth", "offline", "json", "notgit"]) {
    const h = harness(async cmd => {
      if (cmd === "git") return mode === "notgit" ? { code: 1, stdout: "" } : ok("/project");
      if (mode === "missing") throw new Error("gh not found");
      if (mode === "offline") throw new Error("machine unreachable");
      if (mode === "json") return ok("not json");
      return { code: 1, stderr: "authentication required" };
    });
    await h.drain(); const entry = h.view.cache.get(h.view.key);
    assert.match(entry.error, /gh installation.*gh auth login.*connectivity/); assert.equal(entry.loading, false);
  }
});

test("stale refresh and detail responses cannot replace newer state", async () => {
  const h = harness(); await h.drain(); h.view.cycle(1, h.cx);
  let resolveOld;
  // Replace the lexical exec through a separate harness with a deferred first repo view.
  let count = 0;
  const stale = harness(async (cmd, args, options) => {
    if (cmd === "git") return ok(options.cwd);
    if (args[0] === "repo") {
      if (++count === 1) return new Promise(resolve => { resolveOld = resolve; });
      return ok({ ...repo, description: "new" });
    }
    return ok([]);
  });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  stale.view.refresh(stale.cx);
  resolveOld(ok({ ...repo, description: "old" })); await stale.drain();
  assert.equal(stale.view.cache.get(stale.view.key).repo.description, "new");
  // Detail replies after returning to the list must not reopen the detail.
  h.view.openDetail(h.cx); h.view.navigate(event("h"), h.cx); await h.drain(); assert.equal(h.view.detail, null);
});

test("section errors preserve successfully loaded sibling data", async () => {
  const h = harness(async (cmd, args) => {
    if (cmd === "git") return ok("/project");
    if (args[0] === "repo") return ok(repo);
    if (args[0] === "pr") return { code: 1, stderr: "offline" };
    return ok([{ number: 1, title: "Still visible", labels: [] }]);
  });
  await h.drain(); const entry = h.view.cache.get(h.view.key);
  assert.match(entry.errors[1], /offline/); assert.equal(entry.lists[2].length, 1);
});
