import { shared, setShared, props, focused, panes, openOverlay, closeOverlay } from "herdr";

// Overlay lifetimes are explicit: focused() still describes the pane underneath.
export function reportContext(view, name, cx) {
  const overlay = props()?.overlay;
  const previousClose = view.close?.bind(view);
  if (overlay) {
    setShared("help.contexts", [...(shared("help.contexts") || []).filter(x => x.overlay !== overlay), { name, overlay }]);
    view.close = (...args) => {
      setShared("help.contexts", (shared("help.contexts") || []).filter(x => x.overlay !== overlay));
      return previousClose?.(...args);
    };
    return;
  }
  const subscribed = new Set(), focusedInputs = new Set();
  const subscribe = () => {
    // File previews create an EditorState asynchronously; watch its identity too.
    for (const input of [view.input, view.searchInput, view.code].filter(Boolean)) {
      if (subscribed.has(input)) continue;
      subscribed.add(input);
      input.on("focus", () => { focusedInputs.add(input); setShared("help.panel", name); });
      input.on("blur", () => { focusedInputs.delete(input); });
    }
    for (const input of focusedInputs) if (![view.input, view.searchInput, view.code].includes(input)) focusedInputs.delete(input);
  };
  cx.timer.after(0, subscribe);
  cx.timer.every(80, () => {
    subscribe();
    if (view.handle?.is_focused() || focusedInputs.size) {
      if (shared("help.panel") !== name) setShared("help.panel", name);
    } else if (shared("help.panel") === name) setShared("help.panel", null);
  });
}

export function origin() {
  const stack = shared("help.contexts") || [];
  if (stack.length) return stack[stack.length - 1].name;
  const f = focused();
  if (shared("quick.window")) return "quick-terminal";
  if (shared("help.panel")) return shared("help.panel");
  const pane = panes().find(p => p.id === f?.pane);
  return pane?.mod || (f?.terminal ? "terminal" : "general");
}

export function openHelp() {
  const active = shared("help.overlay");
  if (active) { closeOverlay(active); setShared("help.overlay", null); return; }
  const context = origin();
  const id = openOverlay({ mod: "tty-help", frame: "none", kind: "dialog", width: 0.82, height: 0.8, props: { context } });
  setShared("help.overlay", id);
}
