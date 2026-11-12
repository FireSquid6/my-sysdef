import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SettingsKeyboard, SettingsPage } from "../mods/tty-settings/keyboard.js";

const source = await readFile(new URL("../mods/tty-settings/main.js", import.meta.url), "utf8");
function harness() {
  const calls = [], tasks = [], scrolls = [], inputs = [], closed = [];
  let activeInput = null, stopped = 0, raw = "{}", tree, rendering = false;
  function element() {
    const data = { nodes: [], attributes: {} };
    let proxy;
    proxy = new Proxy(data, { get(target, key) {
      if (key in target) return target[key];
      if (key === "element" || key === "controls") return undefined;
      return (...args) => {
        if (key === "when" && args[0]) args[1](proxy);
        else if (key === "children") data.nodes.push(...args[0]);
        else if (key === "child" || key === "content") data.nodes.push(args[0]);
        else data.attributes[key] = args;
        return proxy;
      };
    } });
    return proxy;
  }
  const handle = { focus() { assert.equal(rendering, false, "native focus cannot change during render"); activeInput?.handlers.blur?.({}, cx); activeInput = null; }, is_focused: () => !activeInput };
  const cx = { notify() { assert.equal(rendering, false, "native notify cannot run during render"); }, stop_propagation() { stopped++; }, focus_handle: () => handle,
    spawn(fn) { tasks.push(Promise.resolve(fn(cx))); }, timer: { every() {} }, write_to_clipboard(text) { calls.push(["copy", text]); } };
  const InputState = { new() {
    const input = { text: "", handlers: {}, on(event, fn) { this.handlers[event] = fn; }, value() { return this.text; },
      set_value(value) { this.text = value; this.handlers.change?.({}, cx); }, set_selected_range() {},
      focus() { activeInput?.handlers.blur?.({}, cx); activeInput = this; this.handlers.focus?.({}, cx); } };
    inputs.push(input); return input;
  } };
  const dependencies = { SettingsKeyboard, SettingsPage, View: class {}, div: element, svg: element, image: element, h_flex: element, v_flex: element,
    Scrollbar: { vertical: element }, ScrollHandle: { new: () => ({ scroll_to_item(index) { assert.equal(rendering, false, "native scrolling cannot change during render"); scrolls.push(index); } }) }, InputState, Input: { new: element }, Popup: { new: element },
    window: () => ({ platform: "linux" }), props: () => ({ overlay: "settings" }), closeOverlay: id => closed.push(id),
    theme: () => ({ accent: "#bb9af7", border: "#24283b", selected: "#292e42" }),
    settings: () => ({ zoom: 1, font_family: "JetBrains Mono", ui_font_family: "Geist", font_size: 14, theme_dark: "tokyonight-night" }),
    themes: () => [{ name: "tokyonight-night", light: false, colors: {} }, { name: "paper", light: true, colors: {} }],
    fonts: () => ["Alpha", "JetBrains Mono", "JetBrainsMono Nerd Font", "Zulu"], layouts: () => ["main", "tty"], shared: () => "tty",
    updates: () => ({ checks: true, app: { version: "1.0.0", updates: true, ready: "2.0.0" }, core: { version: "2.0.0", ready: "3.0.0" } }),
    telemetry: () => ({ setting: true, enabled: true, sends: true, queued: [], draft: { nested: { count: 1 } } }),
    readTextFile: async file => file.endsWith("settings.json") ? raw : "{}",
    writeTextFile: async (_file, value) => { raw = value; }, appHome: () => "/mock",
    playSound: sound => calls.push(["sound", sound]), run: (command, args) => calls.push([command, args]),
    hc: async args => { calls.push(["hc", args]); return { code: 0, stdout: JSON.stringify({ machines: [{ name: "remote", version: "1.0.0", state: "connected" }] }) }; },
  };
  const Settings = new Function(...Object.keys(dependencies), source.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(dependencies));
  const view = new Settings(); view.init({}, cx);
  let drained = 0;
  const render = () => { rendering = true; try { tree = view.render(cx); return tree; } finally { rendering = false; } };
  return { view, cx, calls, inputs, closed, scrolls, render, get stopped() { return stopped; }, get tree() { return tree; },
    key(key, modifiers = {}, extra = {}) { view.keyboard.key({ key, modifiers, ...extra }, cx); },
    async drain() { while (drained < tasks.length) await tasks[drained++]; },
    select(id) { const control = view.keyboard.controls.find(control => control.id === id); assert.ok(control, `Missing control ${id}`); view.keyboard.focus(control, cx); },
    async section(id) { view.selectSection(id, cx); await this.drain(); render(); },
  };
}

function flatten(root) {
  if (!root || typeof root !== "object") return [];
  return [root, ...(root.nodes ?? []).flatMap(flatten)];
}

test("settings sections and every page's controls are reachable without changing values on motion", async () => {
  const h = harness(); await h.drain(); h.render();
  assert.deepEqual(h.view.keyboard.items("nav").map(c => c.id), ["st-s-look", "st-s-machines", "st-s-alerts", "st-s-updates", "st-s-privacy", "st-feedback"]);
  h.key("j"); assert.equal(h.view.keyboard.current().id, "st-s-machines"); assert.equal(h.view.section, "look");
  h.key("enter"); await h.drain(); h.render(); assert.equal(h.view.section, "machines");
  h.key("l"); assert.equal(h.view.keyboard.zone, "body");
  h.key("h"); assert.equal(h.view.keyboard.zone, "nav");
  const sections = { look: ["st-l-main", "st-l-tty", "st-ap-System", "st-t-tokyonight-night", "st-t-paper", "st-zoom-minus", "st-zoom-plus", "st-zoom-reset", "st-f-font", "st-font_size-minus", "st-font_size-plus", "st-f-ui_font"],
    machines: ["st-m-update-remote", "st-m-rename-remote", "st-m-rm-remote", "st-m-add"],
    alerts: ["st-sounds", "st-play-blocked", "st-play-done"], updates: ["st-whats-new", "st-app-update", "st-core-update"], privacy: ["st-telemetry", "st-telemetry-show"] };
  for (const [section, ids] of Object.entries(sections)) {
    await h.section(section);
    const controls = h.view.keyboard.items("body");
    for (const id of ids) assert.ok(controls.some(control => control.id === id), `${section}: ${id} must be navigable`);
    const before = h.calls.length;
    h.key("l"); h.key("G"); h.key("g"); h.key("g"); h.key("j"); h.key("k"); h.key("tab"); h.key("tab", { shift: true });
    assert.equal(h.calls.length, before, "navigation must not activate settings");
    assert.ok(controls.every(control => Number.isInteger(control.group)), "all page controls need a scroll target");
  }
  assert.ok(h.scrolls.length > 0);
});

test("l enters the newly selected section after its controls are rebuilt; Shift+g selects the last control", async () => {
  const h = harness(); await h.drain(); h.render();
  h.key("j"); h.key("l"); await h.drain(); h.render();
  assert.equal(h.view.section, "machines");
  assert.equal(h.view.keyboard.zone, "body");
  assert.equal(h.view.keyboard.current().id, "st-m-update-remote");
  h.key("g", { shift: true }); assert.equal(h.view.keyboard.current().id, "st-m-add");
});

test("activation uses the original settings writes, respects held keys, and keyboard reading reaches report lines", async () => {
  const h = harness(); await h.drain(); await h.section("alerts");
  h.select("st-sounds"); h.key("enter"); await h.drain(); assert.equal(h.view.person.sounds.enabled, false);
  h.render(); h.select("st-play-done"); h.key("enter", {}, { is_held: true });
  assert.ok(!h.calls.some(call => call[0] === "sound"));
  h.key("space"); assert.deepEqual(h.calls.at(-1), ["sound", "done"]);
  await h.section("privacy"); h.select("st-telemetry-show"); h.key("enter"); h.render();
  assert.ok(h.view.pageBlockCount > 5, "report is flattened into scrollable keyboard reading blocks");
  for (let i = 0; i < 50; i++) h.key("d", { control: true });
  assert.equal(h.scrolls.at(-1), h.view.pageBlockCount - 1);
  h.key("pageup"); assert.equal(h.scrolls.at(-1), h.view.pageBlockCount - 2);
  const texts = flatten(h.tree).flatMap(node => node.nodes.filter(child => typeof child === "string"));
  assert.ok(!texts.some(text => /j\/k|keybind|Enter.*select|Escape.*close/i.test(text)), "no keybind guide footer");
});

test("font searching preserves typing, supports keyboard choice and keeps Escape nested", async () => {
  const h = harness(); await h.drain(); h.render(); h.select("st-f-font"); h.key("enter"); h.render();
  assert.equal(h.view.picking, "font"); assert.equal(h.view.fontSearchFocused, true);
  const stopped = h.stopped;
  for (const key of ["j", "k", "h", "l", "q", "space"]) h.key(key);
  assert.equal(h.stopped, stopped, "ordinary font-search text must not become motions");
  h.inputs[0].set_value("nerd"); h.render();
  assert.equal(h.view.keyboard.items("popup").length, 1);
  h.key("down"); assert.equal(h.view.fontSearchFocused, false);
  h.key("enter"); await h.drain(); h.render();
  assert.equal(h.view.person.font, "JetBrainsMono Nerd Font"); assert.equal(h.view.picking, null);
  h.select("st-f-ui_font"); h.key("enter"); h.render();
  h.key("escape"); assert.equal(h.view.picking, "ui_font", "first Escape leaves search editing");
  h.key("escape"); assert.equal(h.view.picking, null, "second Escape closes just the font popup");
  assert.equal(h.closed.length, 0);
  h.key("escape"); assert.deepEqual(h.closed, ["settings"]);
});

test("machine rename text remains editable and remove retains its explicit confirmation", async () => {
  const h = harness(); await h.drain(); await h.section("machines"); h.select("st-m-rename-remote"); h.key("enter"); h.render();
  assert.equal(h.view.renameFocused, true);
  const stopped = h.stopped; h.key("j"); assert.equal(h.stopped, stopped);
  h.inputs[1].set_value("renamed"); h.key("escape");
  assert.equal(h.view.machineEdit.name, "renamed"); assert.equal(h.view.renameFocused, false);
  h.select("st-m-save-remote"); h.key("enter"); await h.drain(); h.render();
  assert.ok(h.calls.some(call => call[0] === "hc" && JSON.stringify(call[1]) === JSON.stringify(["machine", "rename", "remote", "renamed"])));
  h.select("st-m-rm-remote"); h.key("enter"); h.render();
  assert.equal(h.view.machineEdit.action, "rm");
  assert.ok(!h.calls.some(call => call[0] === "hc" && call[1][1] === "rm"));
  h.select("st-m-confirm-remote"); h.key("enter", {}, { is_held: true });
  assert.ok(!h.calls.some(call => call[0] === "hc" && call[1][1] === "rm"));
  h.key("enter"); await h.drain();
  assert.ok(h.calls.some(call => call[0] === "hc" && call[1][1] === "rm"));
});

test("personal settings routing replaces only TTY entry points and leaves the native frame untouched", async () => {
  const keys = JSON.parse(await readFile(new URL("../keys.json", import.meta.url), "utf8"));
  assert.equal(keys.global["ctrl-,"], "app.settings");
  assert.equal(keys["layout:tty"]["ctrl-,"], "mod.open:tty-settings");
  const chrome = await readFile(new URL("../mods/tty-workspace-chrome/main.js", import.meta.url), "utf8");
  assert.ok(chrome.includes('run("mod.open", { name: "tty-settings" })'));
  assert.ok(source.includes('SettingsKeyboard'));
  assert.ok(!source.includes('frame/settings/'));
});
