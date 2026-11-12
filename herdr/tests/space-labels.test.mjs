import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../mods/tty-spaces/main.js", import.meta.url), "utf8");
function harness() {
  let live = [];
  function element() {
    const node = { children: [], attrs: {} };
    let proxy;
    proxy = new Proxy(node, { get(target, name) {
      if (name in target) return target[name];
      return (...args) => {
        if (name === "child") node.children.push(args[0]);
        else if (name === "when" && args[0]) args[1](proxy);
        else node.attrs[name] = args;
        return proxy;
      };
    } });
    return proxy;
  }
  const dependencies = { View: class {}, div: element, svg: element, h_flex: element, v_flex: element,
    agents: () => live, spaces: () => [], shared: () => ({}) };
  const Spaces = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace(/^export function /gm, "function ").replace("export default class", "return class"))(...Object.values(dependencies));
  const view = new Spaces(); view.pressed = null; view.over = null;
  return { setAgents(value) { live = value; }, row(id, options = {}) { return view.row({ w: { id, name: "same name", active: false }, i: 0, ...options }, {}); } };
}
function find(node, id) {
  if (node?.attrs?.id?.[0] === id) return node;
  for (const child of node?.children ?? []) { const found = find(child, id); if (found) return found; }
}

test("space labels show live agent counts by exact space ID, then a Nerd Font robot", () => {
  const h = harness();
  h.setAgents(["working", "idle", "blocked", "done"].map((status, index) => ({ address: `t${index}`, space: "local", status }))
    .concat([{ address: "remote/t1", space: "remote/local", status: "working" }]));
  for (const [id, count] of [["local", "4"], ["remote/local", "1"], ["empty", "0"]]) {
    const row = h.row(id), badge = find(row, `space-agents-${id}`);
    assert.equal(badge.children[0], count);
    assert.deepEqual(badge.attrs.text_color, [count === "0" ? "#565f89" : count === "1" ? "#bb9af7" : "#e0af68"]);
    assert.equal(badge.children[1].children[0], "󰚩");
    assert.deepEqual(badge.children[1].attrs.font_family, ["JetBrainsMono Nerd Font"]);
    assert.ok(badge.attrs.flex_none);
    assert.equal(row.children[0].children.at(-1), badge, "badge belongs at the right edge");
  }
  h.setAgents([{ space: "local" }, { space: "local" }]);
  assert.deepEqual(find(h.row("local"), "space-agents-local").attrs.text_color, ["#e0af68"], "two agents use yellow");
  h.setAgents([]);
  const empty = find(h.row("local", { tree: true }), "space-agents-local");
  assert.equal(empty.children[0], "0", "agent exits update worktree rows too");
  assert.deepEqual(empty.attrs.text_color, ["#565f89"], "exited agents restore gray");
});

test("Repo and Changes omit footer hints without removing sync controls or error notes", async () => {
  const repo = await readFile(new URL("../mods/tty-repo/main.js", import.meta.url), "utf8");
  const changes = await readFile(new URL("../mods/tty-changes/main.js", import.meta.url), "utf8");
  assert.ok(!repo.includes("Read-only · browser opens locally"));
  assert.ok(!repo.includes("Read-only GitHub panel"));
  assert.ok(!changes.includes("· p Pull · Shift+P Push · Shift+D Diff"));
  assert.ok(changes.includes('["push", "pull", "diff"]'));
  assert.ok(changes.includes('id("commit-message")'));
  assert.ok(repo.includes("Boolean(this.note)"));
  assert.ok(changes.includes("Boolean(this.note)"));
});
