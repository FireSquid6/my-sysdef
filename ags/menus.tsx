/** @jsxImportSource ags/gtk4 */
import { createComputed, createState, For, type Accessor } from "ags";
import { Astal, Gdk, Gtk } from "ags/gtk4";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import type { DesktopStatus } from "./services/controller";
import { confirmPower, cycleAssignment, filterItems, focusWindowArgs, moveSelection, powerArgs, POWER_ACTIONS, POWER_LABELS, projectName, savedConnections, type PowerAction } from "./menu-model";

type Dependencies = {
  run: (argv: string[]) => Promise<string>;
  controller: (command: string, ...args: string[]) => Promise<any>;
  desktop: Accessor<DesktopStatus>;
  root: string;
  close: () => void;
  showError: (error: unknown) => void;
};
type Item = { id: string; title: string; detail?: string; icon?: Gio.Icon | null; choose: () => unknown; cycle?: (direction: number) => unknown };
const titles: Record<string, string> = { launcher: "Applications", projects: "Projects", power: "Power & session", monitors: "Monitor manager", windows: "Windows", calendar: "Calendar", network: "Network" };

export function createMenus(deps: Dependencies): { window: Astal.Window; open: (name: string, monitor?: Gdk.Monitor) => void; close: () => void; describe: () => unknown } {
  const [name, setName] = createState("launcher");
  const [query, setQuery] = createState("");
  const [items, setItems] = createState<Item[]>([]);
  const [selection, setSelection] = createState(0);
  const [tab, setTab] = createState("Primary");
  const [pending, setPending] = createState<PowerAction | null>(null);
  const [error, setError] = createState("");
  const [busy, setBusy] = createState(false);
  let generation = 0;
  const heldActivationKeys = new Set<number>();
  let entry: Gtk.SearchEntry;
  let rows: Gtk.Box;

  function fail(cause: unknown) {
    setError(cause instanceof Error ? cause.message : String(cause));
    deps.showError(cause);
  }
  function close() {
    generation++;
    window.keymode = Astal.Keymode.NONE;
    window.visible = false;
    setBusy(false);
    setPending(null);
    heldActivationKeys.clear();
    deps.close();
  }
  async function perform(action: () => unknown, dismiss = true) {
    if (busy()) return;
    setBusy(true);
    setError("");
    const token = generation;
    try {
      await action();
      if (token === generation && dismiss) close();
    } catch (cause) { if (token === generation) fail(cause); }
    finally { if (token === generation) setBusy(false); }
  }
  const mutate = (command: string, ...args: string[]) => perform(() => deps.controller(command, ...args), false);
  const available = createComputed((): Item[] => {
    const status = deps.desktop();
    if (name() === "windows") return status.clients.map(client => ({
      id: client.address, title: client.title || client.class || "Untitled window", detail: `${client.class || "Application"} · ${client.workspace.name}`,
      choose: () => perform(() => deps.run(focusWindowArgs(client.address))),
    }));
    if (name() === "monitors") {
      if (tab() === "Primary") return [null, ...status.monitors.map(monitor => monitor.name)].map(target => ({
        id: target ?? "auto", title: `${target ?? "Automatic"}${status.primaryAssignment === target ? "  ✓" : ""}`,
        detail: target === null ? `Controller policy · current primary ${status.primary}` : target === status.primary ? "Current primary output" : "Set as primary output",
        choose: () => mutate("primary", target ?? "auto"),
      }));
      return status.workspaces.map(workspace => {
        const cycle = (direction: number) => mutate("assign", workspace.name, cycleAssignment(workspace.assignment, status.monitors.map(m => m.name), direction) ?? "auto");
        return { id: workspace.name, title: `${workspace.icon}  ${workspace.name}    ${workspace.assignment ?? "Automatic"}`,
          detail: `${workspace.monitor} · ${workspace.mode} · ← / → change saved assignment`, choose: () => cycle(1), cycle };
      });
    }
    return items();
  });
  const filtered = createComputed(() => filterItems(available(), query()));
  const selectedIndex = createComputed(() => Math.min(Math.max(0, selection()), filtered().length - 1));
  function select(direction: number) {
    setSelection(moveSelection(selectedIndex(), direction, filtered().length));
    // Focusing a result scrolls it into view; keep text input available afterwards.
    let child = rows.get_first_child();
    for (let i = 0; child && i < selectedIndex(); i++) child = child.get_next_sibling();
    child?.get_first_child()?.grab_focus();
    entry.grab_focus();
  }
  function switchTab(next: string) { setTab(next); setSelection(0); }
  function key(_controller: Gtk.EventControllerKey, keyval: number) {
    if (keyval === Gdk.KEY_Escape) { close(); return true; }
    if (name() === "calendar") return false;
    if (keyval === Gdk.KEY_Up || keyval === Gdk.KEY_Down) { select(keyval === Gdk.KEY_Down ? 1 : -1); return true; }
    if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
      // A held/repeating Enter is not a second explicit power confirmation.
      if (!heldActivationKeys.has(keyval)) { heldActivationKeys.add(keyval); filtered()[selectedIndex()]?.choose(); }
      return true;
    }
    if (name() === "monitors") {
      if (keyval === Gdk.KEY_Tab || keyval === Gdk.KEY_ISO_Left_Tab) { switchTab(tab() === "Primary" ? "Workspaces" : "Primary"); return true; }
      if (tab() === "Workspaces" && (keyval === Gdk.KEY_Left || keyval === Gdk.KEY_Right)) {
        filtered()[selectedIndex()]?.cycle?.(keyval === Gdk.KEY_Right ? 1 : -1); return true;
      }
    }
    return false;
  }
  const window = <window name="sysdef-menu" namespace="sysdef-menu" visible={false}
    layer={Astal.Layer.OVERLAY} keymode={Astal.Keymode.NONE} exclusivity={Astal.Exclusivity.NORMAL}
    defaultWidth={620} resizable={false} class="sysdef-menu"
    onNotifyVisible={(self: Astal.Window) => { if (!self.visible) self.keymode = Astal.Keymode.NONE; }}>
    <Gtk.EventControllerKey $={(self: Gtk.EventControllerKey) => self.set_name("sysdef-menu-keys")} propagationPhase={Gtk.PropagationPhase.CAPTURE}
      onKeyPressed={key} onKeyReleased={(_self, keyval) => { heldActivationKeys.delete(keyval); }} />
    <box orientation={Gtk.Orientation.VERTICAL} spacing={12} class="menu-panel">
      <box spacing={12} class="menu-header">
        <label hexpand xalign={0} class="menu-title" label={name(n => titles[n] ?? n)} />
        <button class="menu-close" label="✕" tooltipText="Close (Escape)" onClicked={close} />
      </box>
      <Gtk.SearchEntry $={(self: Gtk.SearchEntry) => { entry = self; }} placeholderText="Type to search…"
        visible={name(n => n !== "calendar")} onNotifyText={(self: Gtk.SearchEntry) => { setQuery(self.text); setSelection(0); }} />
      <box class="menu-tabs" spacing={8} visible={name(n => n === "monitors")}>
        <button label="Primary" class={tab(t => `menu-tab${t === "Primary" ? " active" : ""}`)} onClicked={() => switchTab("Primary")} />
        <button label="Workspaces" class={tab(t => `menu-tab${t === "Workspaces" ? " active" : ""}`)} onClicked={() => switchTab("Workspaces")} />
      </box>
      <Gtk.Calendar visible={name(n => n === "calendar")} class="menu-calendar" />
      <scrolledwindow visible={name(n => n !== "calendar")} minContentHeight={180} maxContentHeight={480}
        propagateNaturalHeight hscrollbarPolicy={Gtk.PolicyType.NEVER}>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={6} $={(self: Gtk.Box) => { rows = self; }}>
          <For each={filtered}>{(item, index) => <box spacing={6}
            class={createComputed(() => `menu-row menu-card${index() === selectedIndex() ? " selected" : ""}`)}>
            <button class="menu-row-action" hexpand onClicked={() => { setSelection(index()); item.choose(); }}>
            <box spacing={12}>
              <image visible={!!item.icon} gicon={item.icon ?? undefined} pixelSize={32} />
              <box orientation={Gtk.Orientation.VERTICAL} hexpand spacing={4}>
                <label class="menu-row-title" label={item.title} xalign={0} ellipsize={3} maxWidthChars={58} />
                <label class="menu-row-detail" label={item.detail ?? ""} visible={!!item.detail} xalign={0} ellipsize={3} maxWidthChars={65} />
              </box>
            </box>
            </button>
              <box visible={!!item.cycle} spacing={4}>
                <button class="menu-cycle" label="‹" onClicked={() => { setSelection(index()); item.cycle?.(-1); }} />
                <button class="menu-cycle" label="›" onClicked={() => { setSelection(index()); item.cycle?.(1); }} />
              </box>
          </box>}</For>
        </box>
      </scrolledwindow>
      <label class="menu-empty" visible={createComputed(() => name() !== "calendar" && !filtered().length)} label="No matching results" />
      <label class="menu-confirm" visible={pending(p => p !== null)} wrap label={pending(p => p ? `Choose ${p} again to confirm. Escape cancels.` : "")} />
      <label class="menu-error" visible={error(e => !!e)} label={error} wrap selectable maxWidthChars={70} />
      <label class="menu-hint" xalign={0} label={createComputed(() => busy() ? "Working…" : name() === "monitors" ? "Tab: switch page  ·  ← / →: assignment  ·  Changes save immediately" : "↑ / ↓ select  ·  Enter open  ·  Esc close")} />
    </box>
  </window> as Astal.Window;

  function applications(): Item[] {
    return Gio.AppInfo.get_all().filter(info => info.should_show()).map(info => ({
      id: info.get_id() ?? info.get_name(), title: info.get_display_name(), detail: info.get_description() ?? info.get_executable() ?? "", icon: info.get_icon(),
      choose: () => perform(() => {
        if (!info.launch([], Gdk.Display.get_default()?.get_app_launch_context() ?? null)) throw new Error(`Unable to launch ${info.get_name()}`);
      }),
    })).sort((a, b) => a.title.localeCompare(b.title));
  }
  async function projects(): Promise<Item[]> {
    const directory = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), "source"]));
    const enumerator = await new Promise<Gio.FileEnumerator>((resolve, reject) => {
      directory.enumerate_children_async("standard::name,standard::type", Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null,
        (_file, result) => { try { resolve(directory.enumerate_children_finish(result)); } catch (cause) { reject(cause); } });
    });
    const result: Item[] = [];
    try {
      while (true) {
        const batch = await new Promise<Gio.FileInfo[]>((resolve, reject) => enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null,
          (_source, response) => { try { resolve(enumerator.next_files_finish(response)); } catch (cause) { reject(cause); } }));
        if (!batch.length) break;
        for (const info of batch) {
          if (info.get_file_type() !== Gio.FileType.DIRECTORY) continue;
          let project: string;
          try { project = projectName(info.get_name()); } catch { continue; }
          result.push({ id: project, title: project, detail: `~/source/${project}`, choose: () => perform(() => deps.run(["bash", `${deps.root}/scripts/proj.sh`, project, "window"])) });
        }
      }
    } finally { enumerator.close(null); }
    return result.sort((a, b) => a.title.localeCompare(b.title));
  }
  function power(): Item[] {
    return POWER_ACTIONS.map(action => ({
      id: action, title: POWER_LABELS[action], detail: action === "lock" ? "Lock this session" : action === "suspend" ? "Put this computer to sleep" : "Requires confirmation",
      choose: () => {
        const next = confirmPower(pending(), action);
        setPending(next.pending);
        if (next.execute) void perform(() => deps.run(powerArgs(action)));
      },
    }));
  }
  async function network(): Promise<Item[]> {
    const output = await deps.run(["nmcli", "--terse", "--escape", "yes", "--fields", "UUID,NAME,TYPE", "connection", "show"]);
    return [...savedConnections(output).map(connection => ({
      id: connection.uuid, title: connection.name, detail: `Saved connection · ${connection.type}`,
      choose: () => perform(() => deps.run(["nmcli", "connection", "up", "uuid", connection.uuid])),
    })), { id: "editor", title: "Network settings", detail: "Add or edit connections", choose: () => perform(() => { Gio.Subprocess.new(["nm-connection-editor"], Gio.SubprocessFlags.NONE); }) }];
  }
  function open(next: string, monitor?: Gdk.Monitor) {
    if (!(next in titles)) { fail(new Error(`Unknown menu: ${next}`)); return; }
    const token = ++generation;
    heldActivationKeys.clear();
    setName(next); setPending(null); setError(""); setBusy(false); setQuery(""); setSelection(0); setTab("Primary"); setItems([]);
    entry.set_text("");
    if (monitor) {
      window.gdkmonitor = monitor;
      const geometry = monitor.get_geometry();
      window.set_default_size(Math.min(620, Math.max(280, geometry.width - 48)), -1);
    }
    window.keymode = Astal.Keymode.EXCLUSIVE;
    window.visible = true;
    if (next !== "calendar") entry.grab_focus();
    else window.get_child()?.child_focus(Gtk.DirectionType.TAB_FORWARD);
    try {
      if (next === "launcher") setItems(applications());
      else if (next === "power") setItems(power());
      else if (next === "projects" || next === "network") {
        setBusy(true);
        void (next === "projects" ? projects() : network()).then(result => {
          if (generation === token) setItems(result);
        }).catch(cause => {
          if (generation !== token) return;
          if (next === "network") setItems([{ id: "editor", title: "Network settings", detail: "Open connection editor", choose: () => perform(() => { Gio.Subprocess.new(["nm-connection-editor"], Gio.SubprocessFlags.NONE); }) }]);
          fail(cause);
        }).finally(() => { if (generation === token) setBusy(false); });
      }
    } catch (cause) { fail(cause); }
  }
  return { window, open, close, describe: () => ({ name: name(), visible: window.visible, tab: tab(), query: query(), results: filtered().length, selection: selectedIndex(), pending: pending(), busy: busy(), error: error() }) };
}
