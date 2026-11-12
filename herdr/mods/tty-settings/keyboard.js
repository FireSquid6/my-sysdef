// Keyboard selection is separate from activation: moving never changes a setting.
export class SettingsKeyboard {
  constructor(owner) {
    this.owner = owner;
    this.zone = "nav";
    this.selected = { nav: `st-s-${owner.section}`, body: null, popup: null };
    this.controls = [];
    this.building = "nav";
    this.pendingG = false;
  }
  begin() { this.controls = []; this.building = "nav"; }
  action(id, activate) {
    const control = { id, activate, zone: this.building, group: null };
    this.controls.push(control);
    return (event, cx) => {
      this.zone = control.zone;
      this.selected[control.zone] = id;
      activate(event, cx);
      cx.notify();
    };
  }
  finish() {
    let changed = false;
    if (this.enterBody) {
      this.enterBody = false;
      this.zone = "body";
      this.selected.body = this.items("body")[0]?.id ?? null;
      changed = true;
    }
    const zone = this.currentZone();
    if (!this.items().some(control => control.id === this.selected[zone])) {
      const next = this.items()[0]?.id ?? null;
      if (this.selected[zone] !== next) { this.selected[zone] = next; changed = true; }
    }
    return changed;
  }
  marked(id) { return this.selected[this.currentZone()] === id; }
  currentZone() { return this.owner.picking ? "popup" : this.zone; }
  items(zone = this.currentZone()) { return this.controls.filter(control => control.zone === zone); }
  current() { return this.items().find(control => control.id === this.selected[this.currentZone()]) ?? this.items()[0]; }
  focus(control, cx) {
    if (!control) return;
    this.zone = control.zone;
    this.selected[control.zone] = control.id;
    this.owner.handle.focus();
    if (control.group !== null) { this.readingGroup = control.group; this.owner.bodyScroll.scroll_to_item(control.group); }
    if (control.zone === "popup") this.owner.fontScroll.scroll_to_item(this.items("popup").indexOf(control));
    cx.notify();
  }
  key(e, cx) {
    const view = this.owner, mods = e.modifiers ?? {};
    const k = e.key === "g" && mods.shift ? "G" : e.key;
    const editing = view.renameFocused || view.fontSearchFocused;
    if (!editing && !view.picking && (["pagedown", "pageup"].includes(k) || (mods.control && ["d", "u"].includes(k)))) {
      const direction = k === "pagedown" || k === "d" ? 1 : -1;
      this.readingGroup = Math.max(0, Math.min((view.pageBlockCount ?? 1) - 1, (this.readingGroup ?? 0) + direction));
      view.bodyScroll.scroll_to_item(this.readingGroup);
      cx.stop_propagation(); cx.notify(); return;
    }
    if (mods.control || mods.alt || mods.platform || mods.super || mods.command) return;
    if (editing) {
      if (k === "escape") {
        view.renameFocused = false; view.fontSearchFocused = false;
        view.handle.focus(); cx.stop_propagation(); cx.notify();
      } else if (view.picking && (k === "down" || k === "up")) {
        view.fontSearchFocused = false; view.handle.focus();
        this.focus(this.items("popup")[k === "down" ? 0 : this.items("popup").length - 1], cx);
        cx.stop_propagation();
      }
      return; // j/k/h/l, q, spaces, etc. must remain ordinary input text.
    }
    if (k === "escape" || k === "q") {
      if (view.picking) { view.picking = null; this.zone = "body"; }
      else if (view.machineEdit) view.machineEdit = null;
      else view.close();
      view.handle.focus(); cx.stop_propagation(); cx.notify(); return;
    }
    const zone = this.currentZone();
    const items = this.items();
    const at = Math.max(0, items.findIndex(control => control.id === this.selected[zone]));
    const secondG = this.pendingG && k === "g";
    this.pendingG = false;
    if (k === "g" && !secondG) { this.pendingG = true; cx.stop_propagation(); return; }
    if (["j", "down", "k", "up"].includes(k)) {
      const direction = k === "j" || k === "down" ? 1 : -1;
      this.focus(items[Math.max(0, Math.min(items.length - 1, at + direction))], cx);
    } else if (["G", "end", "home"].includes(k) || secondG) {
      this.focus(items[k === "G" || k === "end" ? items.length - 1 : 0], cx);
    } else if (k === "tab") {
      const all = view.picking ? items : this.controls.filter(control => control.zone !== "popup");
      const current = all.findIndex(control => control.id === this.current()?.id);
      const next = (Math.max(0, current) + (mods.shift ? all.length - 1 : 1)) % Math.max(1, all.length);
      this.focus(all[next], cx);
    } else if (k === "h" || k === "left") {
      if (view.picking) { view.picking = null; this.zone = "body"; view.handle.focus(); cx.notify(); }
      else this.focus(this.items("nav").find(control => control.id === `st-s-${view.section}`) ?? this.items("nav")[0], cx);
    } else if (k === "l" || k === "right") {
      if (zone === "nav") {
        const section = this.current();
        if (section?.id.startsWith("st-s-") && section.id !== `st-s-${view.section}`) {
          section.activate(e, cx);
          this.enterBody = true; // Wait for this section's controls, not the old page's.
        } else this.focus(this.items("body")[0], cx);
      }
    } else if (k === "/" && view.picking) {
      view.fontSearchFocused = true; view.fontInput.focus(); cx.notify();
    } else if (k === "enter" || k === "space" || k === " ") {
      if (!e.is_held) this.current()?.activate(e, cx);
      cx.notify();
    } else return;
    cx.stop_propagation();
  }
}

// Make each page block a direct scroll child, so offscreen selections are revealed.
export class SettingsPage {
  constructor(keyboard) { this.keyboard = keyboard; this.blocks = []; }
  w_full() { return this; }
  child(value) {
    if (value instanceof SettingsPage) return this.children(value.blocks);
    const bundle = value?.element ? value : null;
    const controls = bundle?.controls ?? this.keyboard.controls.filter(control => control.zone === "body" && control.group === null);
    for (const control of controls) control.group = this.blocks.length;
    this.blocks.push(bundle?.element ?? value);
    return this;
  }
  children(values) { for (const value of values) this.child(value); return this; }
  when(condition, fn) { if (condition) fn(this); return this; }
}
