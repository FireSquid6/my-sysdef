import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
const source = await readFile(new URL("../mods/tty-files/nvim.js", import.meta.url), "utf8");
const filesSource = await readFile(new URL("../mods/tty-files/main.js", import.meta.url), "utf8");
const context = { space: "workspace", on: null };
const target = { pane: "p2", tab: "tab2", terminal: "t2", program: { key: "nvim" } };

function loader(overrides = {}) {
  const calls = [], actions = [];
  const dependencies = {
    spaces: () => [{ id: "workspace", machine: null, tabs: [{ id: "tab1", active: true }, { id: "tab2" }] }],
    panes: () => [target], run: (name, args) => actions.push([name, args]),
    exec: async (command, args, options) => {
      calls.push([command, args, options]);
      return { code: 0, stdout: command === "hc" ? JSON.stringify({ state: "live", foreground: { name: "nvim", pid: 123 } })
        : command === "python3" ? '["/tmp/editor.sock"]' : "" };
    }, ...overrides,
  };
  const open = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export async function", "return async function"))(...Object.values(dependencies));
  return { open, calls, actions };
}

test("opens a text file in another Neovim tab in the same workspace", async () => {
  const { open, calls, actions } = loader();
  assert.equal(await open("/project/a.txt", context, () => true), true);
  assert.equal(calls[1][1].at(-1), "123");
  assert.deepEqual(actions, [["tab.select", { id: "tab2" }], ["pane.focus", { pane: "p2" }]]);
});
test("ignores Neovim in a different workspace or on a different machine", async () => {
  for (const ctx of [{ space: "other", on: null }, { space: "workspace", on: "remote" }]) {
    const { open, calls } = loader();
    assert.equal(await open("/file", ctx, () => true), false); assert.equal(calls.length, 0);
  }
});
test("directly launched Neovim uses its root PID when foreground is absent", async () => {
  const { open } = loader({ exec: async command => ({ code: 0, stdout: command === "hc"
    ? '{"state":"live","pid":123,"argv":["nvim","--clean"]}' : command === "python3" ? '["/tmp/editor.sock"]' : "" }) });
  assert.equal(await open("/file", context, () => true), true);
});
test("failed Neovim edit falls back without changing focus", async () => {
  const { open, actions } = loader({ exec: async command => ({ code: command === "nvim" ? 1 : 0,
    stdout: command === "hc" ? '{"state":"live","foreground":{"name":"nvim","pid":123}}' : '["/tmp/editor.sock"]' }) });
  assert.equal(await open("/file", context, () => true), false); assert.equal(actions.length, 0);
});
test("cancelled file selection does not send an edit command", async () => {
  let valid = true, edited = false;
  const { open } = loader({ exec: async command => {
    if (command === "hc") return { code: 0, stdout: '{"state":"live","foreground":{"name":"nvim","pid":123}}' };
    if (command === "python3") { valid = false; return { code: 0, stdout: '["/tmp/editor.sock"]' }; }
    edited = true; return { code: 0, stdout: "" };
  } });
  assert.equal(await open("/file", context, () => valid), false); assert.equal(edited, false);
});

async function show(text, external, routed) {
  let routedCount = 0, previewCount = 0, task;
  const dependencies = { View: class {}, readTextFile: async () => text,
    openInNvim: async () => { routedCount++; return routed; },
    theme: () => ({}), settings: () => ({}), EditorState: { new() { previewCount++; return {}; } } };
  const Files = new Function(...Object.keys(dependencies), filesSource.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(dependencies));
  const view = new Files(); Object.assign(view, { root: "/project", context, current: () => true });
  const cx = { notify() {}, spawn(fn) { task = fn(cx); } };
  view.show("file", cx, external); await task;
  return { routedCount, previewCount, view };
}
test("binary files never route; explicit text opening routes but restored previews do not", async () => {
  const binary = await show("binary\0data", true, true);
  assert.equal(binary.routedCount, 0); assert.match(binary.view.fileError, /Binary/);
  const text = await show("text", true, true); assert.equal(text.routedCount, 1); assert.equal(text.previewCount, 0);
  const restored = await show("text", false, true); assert.equal(restored.routedCount, 0); assert.equal(restored.previewCount, 1);
  const fallback = await show("text", true, false); assert.equal(fallback.previewCount, 1);
});

test("live Neovim socket discovery and RPC safely open special filenames", async () => {
  const dir = await mkdtemp("/tmp/opencode/nvim-routing-");
  const socket = `${dir}/server.sock`, file = `${dir}/a 'quote' | pipe \\ slash\nline.txt`;
  await writeFile(file, "safe text\n");
  // A real PTY exercises Neovim versions whose TUI forks an embedded server.
  const launcher = `import os, pty, signal, sys
pid, fd = pty.fork()
if pid == 0: os.execlp('nvim', 'nvim', '--clean', '--listen', sys.argv[1])
def stop(*args): raise SystemExit()
signal.signal(signal.SIGTERM, stop)
print(pid, flush=True)
try:
    while os.read(fd, 65536): pass
except OSError: pass
finally:
    try: os.kill(pid, signal.SIGTERM)
    except ProcessLookupError: pass
    os.waitpid(pid, 0)`;
  const editor = spawn("python3", ["-c", launcher, socket], { stdio: ["ignore", "pipe", "ignore"] });
  const ended = new Promise(resolve => editor.once("exit", resolve));
  try {
    const pid = await new Promise((resolve, reject) => {
      editor.once("error", reject);
      editor.once("exit", () => reject(new Error("Neovim launcher exited before startup")));
      editor.stdout.once("data", data => resolve(Number(data.toString().trim())));
    });
    // RPC becomes available shortly after spawn; retries are confined to this test.
    for (let i = 0; ; i++) {
      try { await execute("nvim", ["--server", socket, "--remote-expr", "1"]); break; }
      catch (error) { if (i === 49) throw error; await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    const { open } = loader({ exec: async (command, args) => {
      if (command === "hc") return { code: 0, stdout: JSON.stringify({ state: "live", foreground: { name: "nvim", pid } }) };
      try { const result = await execute(command, args); return { code: 0, ...result }; }
      catch (error) { return { code: error.code || 1, stdout: error.stdout, stderr: error.stderr }; }
    } });
    assert.equal(await open(file, context, () => true), true);
    const result = await execute("nvim", ["--server", socket, "--remote-expr", "json_encode(expand('%:p'))"]);
    assert.equal(JSON.parse(result.stdout), file);
  } finally {
    editor.kill("SIGTERM"); await ended;
    await rm(dir, { recursive: true, force: true });
  }
});
