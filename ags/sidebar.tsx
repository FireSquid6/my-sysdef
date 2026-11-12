/** @jsxImportSource ags/gtk4 */
import { createRoot, createState, onCleanup } from "ags";
import { Astal, Gdk, Gtk } from "ags/gtk4";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Pango from "gi://Pango?version=1.0";
import { confirmPower, powerArgs, type PowerAction } from "./menu-model";
import { normalizeTailnet, formatBytes, deviceIP, type TailDevice } from "./sidebar-model";
import { createResourceSampler, EMPTY_RESOURCES } from "./services/resources";

type Dependencies = { run: (argv: string[]) => Promise<string>; close: () => void; showError: (error: unknown) => void; copy?: (text: string) => void };
type DeviceRow = { button: Gtk.Button; title: Gtk.Label; summary: Gtk.Label; detail: Gtk.Label; device: TailDevice; expanded: boolean; dispose: () => void };

export function createSidebar(deps: Dependencies): { window: Astal.Window; open: (monitor?: Gdk.Monitor) => void; close: () => void; describe: () => unknown } {
  const [pending, setPending] = createState<PowerAction | null>(null);
  const [error, setError] = createState("");
  const [feedback, setFeedback] = createState("");
  const [resources, setResources] = createState(EMPTY_RESOURCES);
  const [status, setStatus] = createState("Tailscale: loading…");
  const [health, setHealth] = createState("");
  const sampler = createResourceSampler();
  const held = new Set<number>();
  const deviceRows = new Map<string, DeviceRow>();
  const baseRows: Gtk.Button[] = [];
  let deviceOrder: string[] = [];
  let deviceBox: Gtk.Box;
  let closeButton: Gtk.Button;
  let timer = 0, generation = 0, disposed = false, busy = false, polling = false;
  let cancellation: Gio.Cancellable | null = null;
  let focusIndex = 0;
  let pendingG = false;
  const allRows = () => [closeButton, ...baseRows, ...deviceOrder.map(id => deviceRows.get(id)?.button).filter((button): button is Gtk.Button => !!button)];
  function track(self: Gtk.Button) {
    if (self.has_focus) { self.add_css_class("selected"); focusIndex = allRows().indexOf(self); }
    else self.remove_css_class("selected");
  }
  function focus(index: number) {
    const rows = allRows();
    focusIndex = Math.max(0, Math.min(rows.length - 1, index));
    rows[focusIndex]?.grab_focus(); // GtkScrolledWindow scrolls its focused descendant into view.
  }
  function stop() {
    generation++;
    if (timer) { GLib.source_remove(timer); timer = 0; }
    cancellation?.cancel(); cancellation = null;
    held.clear(); pendingG = false; busy = false;
    window.keymode = Astal.Keymode.NONE;
  }
  function close() {
    const wasVisible = window.visible;
    stop();
    window.visible = false;
    setPending(null);
    if (wasVisible) deps.close(); // Notification only: never call the app's panel close path recursively.
  }
  async function power(action: PowerAction) {
    if (disposed || !window.visible || busy) return;
    const next = confirmPower(pending(), action);
    setPending(next.pending);
    if (!next.execute) return;
    busy = true; setError("");
    const token = generation;
    try {
      await deps.run(powerArgs(action));
      if (!disposed && token === generation) close();
    } catch {
      if (!disposed && token === generation) {
        const message = "Power/session action failed";
        setError(message); deps.showError(new Error(message));
      }
    } finally { if (!disposed && token === generation) busy = false; }
  }
  function renderDevice(row: DeviceRow) {
    const d = row.device;
    row.title.label = `${d.name} (${d.os}${d.self ? " · self" : ""})`;
    row.summary.label = `${d.online ? "Online" : "Offline"} · ${d.connection}${d.exitNode ? " · Exit node" : ""}\n${d.ips.join(" · ") || "No Tailscale IPs"}`;
    row.summary.set_css_classes(["sidebar-detail", d.online ? "online" : "offline"]);
    row.detail.label = `Last seen: ${d.lastSeen && !d.lastSeen.startsWith("0001-") ? d.lastSeen : "Unavailable"}\nReceived: ${formatBytes(d.rx)} · Sent: ${formatBytes(d.tx)}`;
    row.detail.visible = row.expanded;
  }
  function activateDevice(row: DeviceRow) {
    row.expanded = !row.expanded;
    renderDevice(row);
    if (row.device.self) return;
    setFeedback("");
    const ip = deviceIP(row.device);
    if (!ip) { setError("This device has no available Tailscale IP to copy"); row.summary.label += "\nNo IP available to copy"; return; }
    try {
      if (deps.copy) deps.copy(ip);
      else {
        const display = Gdk.Display.get_default();
        if (!display) throw Error("Display clipboard unavailable");
        display.get_clipboard().set(ip);
      }
      setError("");
      setFeedback(`Copied ${row.device.name}'s IP`);
      row.title.label += " · ✓ Copied";
    } catch { setError("Could not copy the device IP to the clipboard"); row.summary.label += "\nClipboard copy failed"; }
  }
  function reconcile(devices: TailDevice[]) {
    const focused = allRows()[focusIndex];
    const ids = new Set(devices.map(d => d.id));
    for (const [id, row] of deviceRows) if (!ids.has(id)) { row.dispose(); deviceBox.remove(row.button); deviceRows.delete(id); }
    let previous: Gtk.Widget | null = null;
    for (const device of devices) {
      let row = deviceRows.get(device.id);
      if (!row) {
        let title!: Gtk.Label, summary!: Gtk.Label, detail!: Gtk.Label;
        let dispose!: () => void;
        const button = createRoot(cleanup => { dispose = cleanup; return <button class="sidebar-row" hexpand onNotifyHasFocus={track}
          onClicked={() => { const current = deviceRows.get(device.id); if (current) activateDevice(current); }}>
          <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
            <label $={(self: Gtk.Label) => { title = self; }} xalign={0} wrap wrapMode={Pango.WrapMode.WORD_CHAR} maxWidthChars={38} />
            <label $={(self: Gtk.Label) => { summary = self; }} xalign={0} wrap wrapMode={Pango.WrapMode.WORD_CHAR} maxWidthChars={38} />
            <label $={(self: Gtk.Label) => { detail = self; }} class="sidebar-detail muted" xalign={0} wrap wrapMode={Pango.WrapMode.WORD_CHAR} maxWidthChars={38} visible={false} />
          </box>
        </button> as Gtk.Button; });
        row = { button, title, summary, detail, device, expanded: false, dispose };
        deviceRows.set(device.id, row); deviceBox.append(button);
      }
      row.device = device; renderDevice(row);
      deviceBox.reorder_child_after(row.button, previous); previous = row.button;
    }
    deviceOrder = devices.map(d => d.id);
    if (focused && allRows().includes(focused)) focusIndex = allRows().indexOf(focused);
    else if (window.visible) focus(focusIndex);
  }
  async function poll() {
    if (polling || disposed || !window.visible) return;
    polling = true;
    const token = generation;
    const current = () => !disposed && window.visible && token === generation;
    const cancellable = new Gio.Cancellable(); cancellation = cancellable;
    try {
      await Promise.all([
        sampler.sample(cancellable).then(value => { if (current()) setResources(value); }).catch(() => { if (current()) setResources({ ...EMPTY_RESOURCES, error: "System resources unavailable" }); }),
        (async () => {
          try {
            // The runner is argv-only. No shell and no network mutations.
            const output = await deps.run(["timeout", "4", "tailscale", "status", "--json"]);
            if (!current()) return;
            let parsed: unknown;
            try { parsed = JSON.parse(output); } catch { throw Error("Invalid JSON"); }
            const tailnet = normalizeTailnet(parsed);
            setStatus(tailnet.status); setHealth(tailnet.health.join("\n")); reconcile(tailnet.devices);
          } catch {
            if (current()) { setStatus("Tailscale unavailable: daemon stopped, login required, or invalid status response"); setHealth(""); reconcile([]); }
          }
        })(),
      ]);
    } finally {
      polling = false;
      if (cancellation === cancellable) cancellation = null;
      // Completion-based scheduling bounds requests, and never overlaps even across close/reopen.
      if (!disposed && window.visible) schedule(token === generation ? 5000 : 1);
    }
  }
  function schedule(delay: number) {
    if (timer || disposed || !window.visible) return;
    timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => { timer = 0; void poll(); return GLib.SOURCE_REMOVE; });
  }
  function key(_controller: Gtk.EventControllerKey, keyval: number, _keycode: number, state: Gdk.ModifierType) {
    if (!window.visible || disposed) return false;
    const vim = !(state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK));
    const secondG = pendingG && vim && keyval === Gdk.KEY_g;
    pendingG = false;
    if (keyval === Gdk.KEY_Escape || (vim && keyval === Gdk.KEY_q)) { close(); return true; }
    if (vim && keyval === Gdk.KEY_g) {
      if (secondG) focus(0); else pendingG = true;
      return true;
    }
    if (vim && keyval === Gdk.KEY_G) { focus(allRows().length - 1); return true; }
    if (vim && (keyval === Gdk.KEY_j || keyval === Gdk.KEY_k)) { focus(focusIndex + (keyval === Gdk.KEY_j ? 1 : -1)); return true; }
    if (vim && (keyval === Gdk.KEY_h || keyval === Gdk.KEY_l)) {
      const button = allRows()[focusIndex];
      const row = [...deviceRows.values()].find(row => row.button === button);
      if (row) { row.expanded = keyval === Gdk.KEY_l; renderDevice(row); }
      return true;
    }
    if (keyval === Gdk.KEY_Up || keyval === Gdk.KEY_Down) { focus(focusIndex + (keyval === Gdk.KEY_Down ? 1 : -1)); return true; }
    if (keyval === Gdk.KEY_Home || keyval === Gdk.KEY_End) { focus(keyval === Gdk.KEY_Home ? 0 : allRows().length - 1); return true; }
    if ([Gdk.KEY_Return, Gdk.KEY_KP_Enter, Gdk.KEY_space].includes(keyval)) {
      // Capture prevents GtkButton's default activation and held Enter from confirming twice.
      if (!held.has(keyval)) { held.add(keyval); allRows()[focusIndex]?.emit("clicked"); }
      return true;
    }
    return false; // Tab/Shift-Tab use native GTK focus traversal.
  }
  const powerRows = (["suspend", "logout", "reboot", "shutdown"] as PowerAction[]).map(action =>
    <button $={(self: Gtk.Button) => { baseRows.push(self); }} onNotifyHasFocus={track}
      class={`sidebar-row sidebar-power${action === "suspend" ? "" : " danger"}`} label={action[0]!.toUpperCase() + action.slice(1)} onClicked={() => { void power(action); }} />);
  const resourceRows = (["cpu", "memory", "load", "disk"] as const).map(field =>
    <button $={(self: Gtk.Button) => { baseRows.push(self); }} onNotifyHasFocus={track} class="sidebar-row resource">
      <label label={resources(r => r[field])} xalign={0} wrap />
    </button>);
  // Opposite anchors supply the height; GTK must accept compositor resizes.
  const window = <window name="sysdef-sidebar" namespace="sysdef-sidebar" visible={false} class="sidebar"
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT}
    marginTop={20} marginBottom={20} marginLeft={20} marginRight={20}
    layer={Astal.Layer.OVERLAY} exclusivity={Astal.Exclusivity.NORMAL} keymode={Astal.Keymode.NONE}
    defaultWidth={420} resizable
    onNotifyVisible={(self: Astal.Window) => { if (!self.visible) { stop(); setPending(null); } }}>
    <Gtk.EventControllerKey $={(self: Gtk.EventControllerKey) => self.set_name("sysdef-sidebar-keys")}
      propagationPhase={Gtk.PropagationPhase.CAPTURE} onKeyPressed={key} onKeyReleased={(_self, keyval) => { held.delete(keyval); }} />
    <box orientation={Gtk.Orientation.VERTICAL} class="sidebar-panel" spacing={12}>
      <box spacing={8}>
        <label label="System" class="sidebar-heading" hexpand xalign={0} />
        <button $={(self: Gtk.Button) => { closeButton = self; }} label="✕" tooltipText="Close (Escape)" onNotifyHasFocus={track} onClicked={close} />
      </box>
      <scrolledwindow vexpand hscrollbarPolicy={Gtk.PolicyType.NEVER}>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
          <box orientation={Gtk.Orientation.VERTICAL} class="sidebar-section" spacing={6}>
            <label label="Power & session" class="sidebar-heading" xalign={0} />
            {powerRows}
            <label class="menu-confirm" visible={pending(p => p !== null)} label={pending(p => p ? `Choose ${p} again to confirm. Escape closes.` : "")} wrap xalign={0} />
            <label class="danger" visible={error(e => !!e)} label={error} wrap xalign={0} />
          </box>
          <box orientation={Gtk.Orientation.VERTICAL} class="sidebar-section" spacing={6}>
            <label label="System resources" class="sidebar-heading" xalign={0} />
            {resourceRows}
            <label class="muted" visible={resources(r => !!r.error)} label={resources(r => r.error)} wrap xalign={0} />
          </box>
          <box orientation={Gtk.Orientation.VERTICAL} class="sidebar-section" spacing={6}>
            <label label="Tailscale · all devices" class="sidebar-heading" xalign={0} />
            <label label={status} class="sidebar-detail" wrap xalign={0} />
            <label label={feedback} visible={feedback(value => !!value)} class="online" wrap xalign={0} />
            <label label="Enter / Space: copy peer IP and toggle details" class="muted" wrap xalign={0} />
            <label label={health} visible={health(h => !!h)} class="danger" wrap xalign={0} />
            <box orientation={Gtk.Orientation.VERTICAL} spacing={6} $={(self: Gtk.Box) => { deviceBox = self; }} />
          </box>
        </box>
      </scrolledwindow>
      <label class="muted" label="j/k or ↑/↓ move · gg/G first/last · h/l collapse/expand · Enter select · q/Esc close" wrap xalign={0} />
    </box>
  </window> as Astal.Window;
  onCleanup(() => { disposed = true; stop(); for (const row of deviceRows.values()) row.dispose(); deviceRows.clear(); window.destroy(); });
  function open(monitor?: Gdk.Monitor) {
    if (disposed) return;
    stop(); sampler.reset(); setPending(null); setError(""); setFeedback("");
    if (monitor) { window.gdkmonitor = monitor; window.set_default_size(Math.min(440, Math.max(400, Math.round(monitor.get_geometry().width * 0.24))), -1); }
    window.keymode = Astal.Keymode.EXCLUSIVE; window.visible = true; focus(0);
    void poll();
  }
  return { window, open, close, describe: () => ({ visible: window.visible, sectioncount: 3, devicecount: deviceRows.size, focusindex: focusIndex, error: error() || resources().error || (status().startsWith("Tailscale unavailable") || status().startsWith("Invalid") ? "Tailscale status unavailable" : "") }) };
}
