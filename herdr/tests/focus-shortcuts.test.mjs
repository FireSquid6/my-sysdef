import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const keys = JSON.parse(await readFile(new URL("../keys.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../mods/tty-workspace-chrome/main.js", import.meta.url), "utf8");

test("focus shortcuts collapse the left rail and toggle the right panel, with no hide-sidebar or old Go To binding", () => {
  assert.equal(keys["layout:tty"]["ctrl-shift-b"], "tty-workspace-chrome.toggle-sidebar");
  assert.equal(keys["layout:tty"]["ctrl-shift-h"], "layout.toggle:panel");
  assert.equal(keys["layout:tty"]["alt-shift-f"], "mod.open:tty-picker");
  assert.equal(keys.global["alt-shift-f"], "mod.open:picker");
  for (const section of Object.values(keys)) {
    assert.equal(section["alt-shift-enter"], undefined);
    assert.ok(!Object.values(section).includes("layout.toggle:sidebar"));
    assert.ok(!Object.values(section).includes("layout.hide:sidebar"));
  }
});

test("only the header handles collapse, restoring its prior width rather than hiding either sidebar", async () => {
  let footer = false, receive;
  const calls = [], state = new Map(), widths = [];
  const root = { id: "sidebar", size: { px: 268 } };
  const elements = [];
  function element() {
    let proxy;
    proxy = new Proxy({}, { get: (_target, name) => (...args) => {
      if (name === "when" && args[0]) args[1](proxy);
      if (name === "id") elements.push(args[0]);
      return proxy;
    } });
    return proxy;
  }
  const dependencies = { View: class {}, div: element, h_flex: element, v_flex: element, svg: element,
    props: () => ({ footer }), layout: () => root, window: () => ({ platform: "linux" }), updates: () => ({ app: {} }), theme: () => ({}),
    shared: key => state.get(key), setShared: (key, value) => state.set(key, value),
    nextCommand: () => new Promise(resolve => { receive = resolve; }),
    run: (name, args) => { calls.push([name, args]); if (name === "layout.resize") { root.size.px = args.px; widths.push(args.px); } },
  };
  const Chrome = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(dependencies));
  let listeners = 0;
  const cx = { spawn(fn) { listeners++; void fn(); } };
  const header = new Chrome(); header.init({}, cx);
  footer = true; new Chrome().init({}, cx);
  assert.equal(listeners, 1, "footer must not handle the same toggle a second time");
  footer = false;
  header.render();
  assert.ok(!elements.includes("search"));
  assert.ok(!elements.includes("sidebar-toggle"));
  footer = true; header.render(); footer = false;
  assert.ok(elements.includes("settings"), "Settings remains in the footer");
  assert.ok(!elements.includes("machine"), "Add machine is removed from the footer");
  receive("toggle-sidebar"); await Promise.resolve(); await Promise.resolve();
  assert.equal(root.size.px, 44);
  header.render();
  receive("toggle-sidebar"); await Promise.resolve(); await Promise.resolve();
  assert.equal(root.size.px, 268);
  assert.deepEqual(widths, [44, 268]);
  assert.ok(calls.every(([name]) => name === "layout.resize"));
});
