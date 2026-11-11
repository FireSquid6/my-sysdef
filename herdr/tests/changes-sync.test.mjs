import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../mods/tty-changes/main.js", import.meta.url), "utf8");
function setup(result = () => ({ code: 0, stdout: "", stderr: "" })) {
  const calls = [], tasks = [];
  let cwd = "/repo";
  const deps = { View: class {}, spaces: () => [{ active: true, folder: cwd, machine: "remote" }], focused: () => ({}), panes: () => [],
    exec: async (cmd, args, options) => { calls.push({ cmd, args, options }); return result(args); } };
  const Changes = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const view = new Changes();
  Object.assign(view, { root: cwd, on: "remote", upstream: "origin/main", context: JSON.stringify({ cwd, on: "remote" }), rows: [], diffAt: 0,
    refresh() {}, diffScroll: { scroll_to_item() {} }, handle: { focus() {} } });
  const cx = { notify() {}, spawn(fn) { tasks.push(fn(cx)); } };
  return { view, calls, cx, finish: () => Promise.all(tasks), move: () => { cwd = "/other"; } };
}
test("push is non-forced, pull is fast-forward only, both target the repository machine", async () => {
  for (const action of ["push", "pull"]) {
    const s = setup(); s.view.sync(action, s.cx); await s.finish();
    assert.deepEqual(s.calls[0].args, action === "push" ? ["push"] : ["pull", "--ff-only"]);
    assert.deepEqual(s.calls[0].options, { cwd: "/repo", on: "remote", timeout: 120000 });
    assert.equal(s.view.busy, false); assert.match(s.view.note, /complete/);
  }
});
test("diff fetches before comparing upstream with working tree and shows preview", async () => {
  const s = setup(args => ({ code: 0, stdout: args.includes("diff") ? "diff --git a/a b/a\n@@ -1 +1 @@\n-old\n+new\n" : "" }));
  s.view.sync("diff", s.cx); await s.finish();
  assert.deepEqual(s.calls[0].args, ["fetch"]);
  assert.deepEqual(s.calls[1].args.slice(-2), ["@{upstream}", "--"]);
  assert.equal(s.view.remoteDiff, true); assert.ok(s.view.rows.some(row => row.text === "new"));
});
test("failed fetch stops diff and reports error; busy state is released", async () => {
  const s = setup(() => ({ code: 1, stderr: "authentication failed" }));
  s.view.sync("diff", s.cx); await s.finish();
  assert.equal(s.calls.length, 1); assert.match(s.view.note, /authentication failed/); assert.equal(s.view.busy, false);
});
test("disabled, busy, and stale-context actions do not run git", async () => {
  for (const state of [{ upstream: null }, { root: null }, { busy: true }, { loading: true }, { context: "stale" }]) {
    const s = setup(); Object.assign(s.view, state); s.view.sync("push", s.cx); await s.finish(); assert.equal(s.calls.length, 0);
  }
});
test("changing repository during fetch cannot install an old diff", async () => {
  const s = setup(); s.view.sync("diff", s.cx); s.move(); await s.finish();
  assert.equal(s.calls.length, 1); assert.notEqual(s.view.remoteDiff, true);
});
