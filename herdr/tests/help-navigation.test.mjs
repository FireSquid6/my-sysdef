import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("help selects origin, wraps tabs without clearing query, handles bracket and Escape", async () => {
  const source = await readFile(new URL("../mods/tty-help/main.js", import.meta.url), "utf8");
  const state = {}, closed = [], handlers = {}, scrolled = [];
  const tabs = [["general", "General"], ["terminal", "Terminal"], ["tty-files", "Files"]];
  let inputValue = "preview";
  const input = { on(event, fn) { handlers[event] = fn; }, value: () => inputValue, focus() {} };
  let keyHandler;
  const element = new Proxy({}, { get: (_t, method) => (...args) => {
    if (method === "on_key_down") keyHandler = args[0];
    if (method === "when" && args[0]) args[1](element);
    return element;
  } });
  const deps = { View: class {}, div: () => element, h_flex: () => element, v_flex: () => element,
    InputState: { new: () => input }, Input: { new: () => element }, ScrollHandle: { new: () => ({ scroll_to_item: i => scrolled.push(i) }) },
    props: () => ({ context: "tty-files", overlay: "help" }), theme: () => ({}), closeOverlay: id => closed.push(id),
    shared: k => state[k], setShared: (k,v) => state[k] = v, TABS: tabs, rowsFor: () => [["Enter", "Preview"]],
    origin: () => "terminal", nextCommand() {} };
  const Help = new Function(...Object.keys(deps), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(deps));
  const cx = { timer: { after(_ms, fn) { fn(); } }, focus_handle: () => ({}), notify() {}, spawn() {}, stop_propagation() {} };
  const help = new Help(); help.init({}, cx); assert.equal(help.tab, 2);
  handlers.change({}, cx); assert.equal(help.filter, "preview");
  help.select(3, cx); assert.equal(help.tab, 0); assert.equal(help.filter, "preview");
  help.select(-1, cx); assert.equal(help.tab, 2);
  help.render(cx); keyHandler({ key: "]" }, cx); assert.equal(help.tab, 0); assert.equal(inputValue, "preview");
  keyHandler({ key: "escape" }, cx); assert.deepEqual(closed, ["help"]);
  help.close(); assert.equal(state["help.overlay"], null); assert.ok(scrolled.length >= 3);
});
